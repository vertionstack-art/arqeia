import { useState } from 'react';
import { Moon, Sun, StickyNote } from 'lucide-react';

type Theme = 'light' | 'dark';

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* preferência apenas nesta sessão */
  }
};

export const initTheme = () => {
  const t = read('traco:theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  if (read('traco:canvas') === 'paper') document.documentElement.dataset.canvas = 'paper';
};

const current = (): Theme => {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const ThemeToggle = ({ withCanvas = true }: { withCanvas?: boolean }) => {
  const [theme, setTheme] = useState<Theme>(current);
  const [paper, setPaper] = useState(document.documentElement.dataset.canvas === 'paper');
  return (
    <>
      {withCanvas && (
        <button
          className={`icon-btn${paper ? ' is-active' : ''}`}
          aria-pressed={paper}
          aria-label="Fundo do desenho claro (papel)"
          data-tip={paper ? 'Fundo do desenho: papel' : 'Fundo do desenho: escuro'}
          onClick={() => {
            const next = !paper;
            setPaper(next);
            if (next) document.documentElement.dataset.canvas = 'paper';
            else delete document.documentElement.dataset.canvas;
            write('traco:canvas', next ? 'paper' : 'dark');
          }}
        >
          <StickyNote size={18} />
        </button>
      )}
      <button
        className="icon-btn"
        aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
        data-tip={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
        onClick={() => {
          const next = theme === 'dark' ? 'light' : 'dark';
          setTheme(next);
          document.documentElement.dataset.theme = next;
          write('traco:theme', next);
        }}
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </>
  );
};
