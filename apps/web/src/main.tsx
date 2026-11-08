import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import { Dashboard } from './pages/Dashboard.tsx';
import { Editor } from './editor/Editor.tsx';
import { initTheme } from './ui/ThemeToggle.tsx';

initTheme();

/** Roteamento por hash: #/ (dashboard) e #/p/:id (editor). */
const parse = () => {
  const m = /^#\/p\/([^/?#]+)/.exec(location.hash);
  return m ? { page: 'editor' as const, id: decodeURIComponent(m[1]) } : { page: 'dashboard' as const };
};

const App = () => {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route.page === 'editor' ? <Editor key={route.id} projectId={route.id} /> : <Dashboard />;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
