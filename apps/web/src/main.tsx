import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Loader2 } from 'lucide-react';
import './styles/tokens.css';
import './styles/app.css';
import { Dashboard } from './pages/Dashboard.tsx';
import { Login } from './pages/Login.tsx';
import { NewPassword } from './pages/NewPassword.tsx';
import { Editor } from './editor/Editor.tsx';
import { initTheme } from './ui/ThemeToggle.tsx';
import { useSession } from './auth/supabase.ts';

initTheme();

/** Roteamento por hash: #/ (dashboard) e #/p/:id (editor). */
const parse = () => {
  const m = /^#\/p\/([^/?#]+)/.exec(location.hash);
  return m ? { page: 'editor' as const, id: decodeURIComponent(m[1]) } : { page: 'dashboard' as const };
};

const App = () => {
  const session = useSession();
  const [route, setRoute] = useState(parse);
  const [recovering, setRecovering] = useState(false);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    if (session.status === 'signed-in' && session.recovery) setRecovering(true);
  }, [session]);

  if (session.status === 'loading')
    return (
      <div className="center-state">
        <Loader2 className="spin" />
      </div>
    );
  if (session.status === 'signed-out') return <Login />;
  if (recovering) return <NewPassword onDone={() => setRecovering(false)} />;
  return route.page === 'editor' ? <Editor key={route.id} projectId={route.id} /> : <Dashboard />;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
