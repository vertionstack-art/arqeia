import type { NewProjectInput, Project } from '@traco/core';
import { accessToken, authEnabled, supabase } from '../auth/supabase.ts';

export interface ProjectSummary {
  id: string;
  name: string;
  code: string;
  client: string;
  projectType: string;
  isDemo: boolean;
  revision: number;
  entityCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RevisionSummary {
  revision: number;
  label: string;
  entityCount: number;
  createdAt: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

const request = async <T>(method: string, url: string, body?: unknown): Promise<T> => {
  let res: Response;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (authEnabled) {
    const token = await accessToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Sem conexão com o servidor.', 0, 'network');
  }
  if (res.status === 204) return undefined as T;
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    if (!res.ok) throw new ApiError(`Servidor respondeu ${res.status}.`, res.status, 'http');
  }
  if (!res.ok) {
    // proxy do Vite sem API rodando responde 500/502/504
    if (res.status >= 502 || (res.status === 500 && !data.error)) throw new ApiError('Servidor indisponível. A API está rodando?', 0, 'network');
    // sessão expirada/inválida: volta para a tela de login
    if (res.status === 401 && supabase) void supabase.auth.signOut();
    throw new ApiError(String(data.message ?? `Erro ${res.status}`), res.status, String(data.error ?? 'http'), data);
  }
  return data as T;
};

export const api = {
  health: () => request<{ ok: boolean }>('GET', '/v1/health'),
  listProjects: () => request<{ projects: ProjectSummary[] }>('GET', '/v1/projects').then((r) => r.projects),
  createProject: (input: NewProjectInput | { demo: true }) => request<{ project: Project }>('POST', '/v1/projects', input).then((r) => r.project),
  getProject: (id: string) => request<{ project: Project }>('GET', `/v1/projects/${encodeURIComponent(id)}`).then((r) => r.project),
  saveProject: (project: Project, baseRevision: number, label: string) =>
    request<{ project: Project }>('PATCH', `/v1/projects/${encodeURIComponent(project.id)}`, { project, baseRevision, label }).then((r) => r.project),
  deleteProject: (id: string) => request<void>('DELETE', `/v1/projects/${encodeURIComponent(id)}`),
  listRevisions: (id: string) => request<{ revisions: RevisionSummary[] }>('GET', `/v1/projects/${encodeURIComponent(id)}/revisions`).then((r) => r.revisions),
  restoreRevision: (id: string, rev: number) =>
    request<{ project: Project }>('POST', `/v1/projects/${encodeURIComponent(id)}/revisions/${rev}/restore`).then((r) => r.project),
};
