import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../auth/supabase.ts';

/** Exibida quando o usuário volta pelo link "Esqueci a senha". */
export const NewPassword = ({ onDone }: { onDone: () => void }) => {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.');
    setBusy(true);
    const { error } = (await supabase?.auth.updateUser({ password })) ?? { error: null };
    setBusy(false);
    if (error) return setError(error.message);
    onDone();
  };
  return (
    <div className="center-state">
      <form className="login-form card" onSubmit={submit}>
        <h2 className="display">
          Nova <em>senha</em>
        </h2>
        <label className="field">
          <span>Nova senha</span>
          <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </label>
        {error && <p className="note error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy && <Loader2 size={16} className="spin" />} Salvar senha
        </button>
      </form>
    </div>
  );
};
