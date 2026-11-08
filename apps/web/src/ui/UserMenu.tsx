import { LogOut } from 'lucide-react';
import { authEnabled, signOut, useSession } from '../auth/supabase.ts';

/** E-mail do usuário logado + botão Sair. Em modo local (sem login) mostra o aviso. */
export const UserMenu = ({ light = false }: { light?: boolean }) => {
  const s = useSession();
  if (!authEnabled) return <span className={`user-chip${light ? ' is-light' : ''}`} data-tip="API local sem login (desenvolvimento)">modo local</span>;
  if (s.status !== 'signed-in') return null;
  return (
    <>
      <span className={`user-chip${light ? ' is-light' : ''}`} title={s.session.user.email}>
        {s.session.user.email}
      </span>
      <button className="icon-btn" onClick={() => void signOut()} aria-label="Sair" data-tip="Sair">
        <LogOut size={17} />
      </button>
    </>
  );
};
