import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Project } from '@traco/core';
import type { ProjectRepository, ProjectSummary, RequestContext, RevisionSummary, SaveResult } from './repository.js';


/** Quantas revisões completas manter por projeto (as mais antigas são podadas). */
const MAX_REVISIONS = 200;

/**
 * Repositório SQLite (node:sqlite, sem dependência nativa) para desenvolvimento
 * local: usuário único, sem login. Em produção usa-se SupabaseRepository.
 * O contexto da requisição é ignorado aqui (não há multiusuário).
 */
export class SqliteRepository implements ProjectRepository {
  readonly kind = 'sqlite' as const;
  readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL DEFAULT '',
        client TEXT NOT NULL DEFAULT '',
        project_type TEXT NOT NULL,
        is_demo INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL,
        entity_count INTEGER NOT NULL DEFAULT 0,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE TABLE IF NOT EXISTS revisions (
        project_id TEXT NOT NULL REFERENCES projects(id),
        revision INTEGER NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        entity_count INTEGER NOT NULL DEFAULT 0,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (project_id, revision)
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT,
        action TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        at TEXT NOT NULL
      );
    `);
  }

  private audit(projectId: string | null, action: string, detail = ''): void {
    this.db.prepare('INSERT INTO audit_log (project_id, action, detail, at) VALUES (?, ?, ?, ?)').run(projectId, action, detail, new Date().toISOString());
  }

  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  async list(_ctx?: RequestContext): Promise<ProjectSummary[]> {
    const rows = this.db
      .prepare(
        `SELECT id, name, code, client, project_type, is_demo, revision, entity_count, created_at, updated_at
         FROM projects WHERE deleted_at IS NULL ORDER BY updated_at DESC`,
      )
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      code: String(r.code),
      client: String(r.client),
      projectType: String(r.project_type),
      isDemo: Number(r.is_demo) === 1,
      revision: Number(r.revision),
      entityCount: Number(r.entity_count),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async get(_ctx: RequestContext, id: string): Promise<Project | null> {
    const row = this.db.prepare('SELECT data FROM projects WHERE id = ? AND deleted_at IS NULL').get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Project) : null;
  }

  async insert(_ctx: RequestContext, p: Project): Promise<Project> {
    const now = new Date().toISOString();
    const stored: Project = { ...p, revision: 1, createdAt: now, updatedAt: now };
    const data = JSON.stringify(stored);
    const count = Object.keys(stored.entities).length;
    this.tx(() => {
      this.db
        .prepare(
          `INSERT INTO projects (id, name, code, client, project_type, is_demo, revision, entity_count, data, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(stored.id, stored.meta.name, stored.meta.code, stored.meta.client, stored.meta.projectType, stored.meta.isDemo ? 1 : 0, 1, count, data, now, now);
      this.db
        .prepare('INSERT INTO revisions (project_id, revision, label, entity_count, data, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(stored.id, 1, 'Projeto criado', count, data, now);
      this.audit(stored.id, 'project.create', stored.meta.name);
    });
    return stored;
  }

  /**
   * Salva com concorrência otimista: só aceita se `baseRevision` for a
   * revisão atual. Caso contrário retorna o conflito sem sobrescrever nada.
   */
  async save(_ctx: RequestContext, p: Project, baseRevision: number, label: string): Promise<SaveResult> {
    return this.tx(() => {
      const row = this.db.prepare('SELECT revision, created_at FROM projects WHERE id = ? AND deleted_at IS NULL').get(p.id) as
        | { revision: number; created_at: string }
        | undefined;
      if (!row) return { ok: false as const, reason: 'not_found' as const };
      if (Number(row.revision) !== baseRevision) return { ok: false as const, reason: 'conflict' as const, current: Number(row.revision) };
      const now = new Date().toISOString();
      const revision = baseRevision + 1;
      const stored: Project = { ...p, revision, createdAt: String(row.created_at), updatedAt: now };
      const data = JSON.stringify(stored);
      const count = Object.keys(stored.entities).length;
      this.db
        .prepare(
          `UPDATE projects SET name = ?, code = ?, client = ?, project_type = ?, is_demo = ?, revision = ?, entity_count = ?, data = ?, updated_at = ? WHERE id = ?`,
        )
        .run(stored.meta.name, stored.meta.code, stored.meta.client, stored.meta.projectType, stored.meta.isDemo ? 1 : 0, revision, count, data, now, p.id);
      this.db
        .prepare('INSERT INTO revisions (project_id, revision, label, entity_count, data, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(p.id, revision, label, count, data, now);
      this.db.prepare('DELETE FROM revisions WHERE project_id = ? AND revision <= ?').run(p.id, revision - MAX_REVISIONS);
      this.audit(p.id, 'project.save', `rev ${revision}: ${label}`);
      return { ok: true as const, project: stored };
    });
  }

  async softDelete(_ctx: RequestContext, id: string): Promise<boolean> {
    const r = this.db.prepare('UPDATE projects SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(new Date().toISOString(), id);
    if (Number(r.changes) > 0) this.audit(id, 'project.delete');
    return Number(r.changes) > 0;
  }

  async revisions(_ctx: RequestContext, id: string): Promise<RevisionSummary[]> {
    const rows = this.db
      .prepare('SELECT revision, label, entity_count, created_at FROM revisions WHERE project_id = ? ORDER BY revision DESC')
      .all(id) as Record<string, unknown>[];
    return rows.map((r) => ({ revision: Number(r.revision), label: String(r.label), entityCount: Number(r.entity_count), createdAt: String(r.created_at) }));
  }

  async revision(_ctx: RequestContext, id: string, revision: number): Promise<Project | null> {
    const row = this.db.prepare('SELECT data FROM revisions WHERE project_id = ? AND revision = ?').get(id, revision) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Project) : null;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
