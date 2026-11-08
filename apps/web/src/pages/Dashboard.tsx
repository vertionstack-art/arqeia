import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Plus, Trash2, Loader2, ServerCrash, FolderOpen, Box, FileText, Library, Clapperboard, Sparkles, Plug } from 'lucide-react';
import { api, type ProjectSummary } from '../api/client.ts';
import { authEnabled } from '../auth/supabase.ts';
import { NewProjectDialog } from './NewProjectDialog.tsx';
import { Logo } from '../ui/Logo.tsx';
import { ThemeToggle } from '../ui/ThemeToggle.tsx';
import { UserMenu } from '../ui/UserMenu.tsx';

const ROADMAP = [
  { icon: Box, title: 'Editor 3D', desc: 'Paredes viram volume, com vãos reais de portas e janelas.', phase: 'Fase 3' },
  { icon: FileText, title: 'Documentação', desc: 'Plantas, cortes, fachadas N/L/S/O e pranchas derivadas do modelo.', phase: 'Fase 4' },
  { icon: Library, title: 'Biblioteca e importação', desc: 'DXF, IFC, GLB/GLTF, OBJ, STL e imagens de referência.', phase: 'Fase 5' },
  { icon: Plug, title: 'Integrações desktop', desc: 'AutoCAD, Revit, SketchUp e Archicad via plugins nativos.', phase: 'Fase 6' },
  { icon: Clapperboard, title: 'Render Studio', desc: 'Tempo real no navegador e fotorrealismo em fila.', phase: 'Fase 7' },
  { icon: Sparkles, title: 'Assistente', desc: 'Comandos em linguagem natural, sempre validados antes de executar.', phase: 'Fase 8' },
];

const timeAgo = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleDateString('pt-BR');
};

export const Dashboard = () => {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.listProjects().then(setProjects, (e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const remove = async (p: ProjectSummary) => {
    if (!confirm(`Excluir "${p.name}"? O projeto sai da lista (exclusão lógica; os dados permanecem no banco).`)) return;
    try {
      await api.deleteProject(p.id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const totalObjects = projects?.reduce((s, p) => s + p.entityCount, 0) ?? 0;

  return (
    <div className="dash">
      <section className="hero">
        <div className="hero-grid" aria-hidden="true" />
        <nav className="hero-nav">
          <Logo light />
          <div className="hero-nav-links">
            <a href="#projetos">Projetos</a>
            <a href="#roteiro">Roteiro</a>
          </div>
          <div className="hero-nav-actions">
            <UserMenu light />
            <ThemeToggle withCanvas={false} />
            <button className="btn pill light" onClick={() => setDialog(true)}>
              Novo projeto
            </button>
          </div>
        </nav>
        <div className="hero-body">
          <p className="eyebrow light">CAD · BIM · Documentação</p>
          <h1 className="display hero-title">
            Desenhe a planta.
            <br />
            <em>O resto nasce do modelo.</em>
          </h1>
          <p className="hero-lead">Medidas reais, layers, snaps e histórico em um editor feito para arquitetos. Plantas, 3D e pranchas a partir de uma única fonte de verdade.</p>
          <button className="btn pill light with-arrow" onClick={() => setDialog(true)}>
            Começar um projeto <span className="arrow-dot">
              <ArrowUpRight size={14} />
            </span>
          </button>
        </div>
        <dl className="hero-stats">
          <div>
            <dt>Projetos</dt>
            <dd>{projects ? projects.length : '—'}</dd>
          </div>
          <div>
            <dt>Objetos desenhados</dt>
            <dd>{projects ? totalObjects.toLocaleString('pt-BR') : '—'}</dd>
          </div>
          <div>
            <dt>Precisão do modelo</dt>
            <dd>mm</dd>
          </div>
          <div>
            <dt>Armazenamento</dt>
            <dd>{error ? 'offline' : authEnabled ? 'nuvem' : 'local'}</dd>
          </div>
        </dl>
      </section>

      <section className="dash-section" id="projetos">
        <header className="section-head">
          <h2 className="display">
            Seus <em>projetos</em>
          </h2>
          <button className="btn primary" onClick={() => setDialog(true)}>
            <Plus size={16} /> Novo projeto
          </button>
        </header>

        {error && (
          <div className="empty error">
            <ServerCrash />
            <div>
              <strong>Não foi possível falar com a API.</strong>
              <p>
                {error} {!authEnabled && <>Rode <code>npm run dev</code> na raiz do repositório.</>}
              </p>
            </div>
            <button className="btn" onClick={load}>
              Tentar de novo
            </button>
          </div>
        )}
        {!projects && !error && (
          <div className="empty">
            <Loader2 className="spin" /> Carregando projetos…
          </div>
        )}
        {projects && projects.length === 0 && (
          <div className="empty">
            <FolderOpen />
            <div>
              <strong>Nenhum projeto ainda.</strong>
              <p>Crie um em branco ou abra a demonstração para explorar o editor.</p>
            </div>
            <button className="btn primary" onClick={() => setDialog(true)}>
              Criar primeiro projeto
            </button>
          </div>
        )}
        {projects && projects.length > 0 && (
          <ul className="project-grid">
            {projects.map((p) => (
              <li key={p.id} className="project-card">
                <a href={`#/p/${p.id}`} className="project-link">
                  <div className="project-thumb" aria-hidden="true">
                    <span className="mono">{p.code || p.projectType.toUpperCase()}</span>
                  </div>
                  <div className="project-info">
                    <strong>{p.name}</strong>
                    <span className="faint">{p.client || 'Sem cliente'}</span>
                    <div className="project-meta">
                      <span className="chip">{p.projectType}</span>
                      {p.isDemo && <span className="chip demo">demonstração</span>}
                      <span className="faint small">
                        rev. {p.revision} · {p.entityCount} objetos · {timeAgo(p.updatedAt)}
                      </span>
                    </div>
                  </div>
                </a>
                <button className="icon-btn danger card-del" onClick={() => void remove(p)} aria-label={`Excluir ${p.name}`}>
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dash-section" id="roteiro">
        <header className="section-head">
          <h2 className="display">
            O que vem <em>a seguir</em>
          </h2>
          <span className="faint">Itens abaixo ainda não estão disponíveis.</span>
        </header>
        <ul className="roadmap">
          {ROADMAP.map((r) => (
            <li key={r.title}>
              <span className="road-icon">
                <r.icon size={18} />
              </span>
              <strong>{r.title}</strong>
              <p>{r.desc}</p>
              <span className="chip soon">{r.phase}</span>
            </li>
          ))}
        </ul>
      </section>

      {dialog && (
        <NewProjectDialog
          onClose={() => setDialog(false)}
          onCreated={(id) => {
            setDialog(false);
            location.hash = `#/p/${id}`;
          }}
        />
      )}
    </div>
  );
};
