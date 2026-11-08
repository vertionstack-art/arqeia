import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../auth/supabase.ts';
import { Logo } from '../ui/Logo.tsx';

type Mode = 'signin' | 'signup' | 'reset';

const translate = (msg: string): string => {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (/already registered/i.test(msg)) return 'Este e-mail já tem conta. Use "Entrar".';
  if (/password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (/rate limit/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos.';
  return msg;
};

/** Tela de acesso: entrar, criar conta e redefinir senha (Supabase Auth). */
export const Login = () => {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    setInfo(null);
    if (mode !== 'reset' && password.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.');
    setBusy(true);
    try {
      const redirectTo = location.origin;
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        if (!data.session) setInfo('Conta criada. Enviamos um link de confirmação para o seu e-mail.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        setInfo('Se houver conta com este e-mail, você receberá um link para redefinir a senha.');
      }
    } catch (err) {
      setError(translate((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Mode, [string, string]> = {
    signin: ['Bem-vindo', 'de volta.'],
    signup: ['Crie sua', 'conta.'],
    reset: ['Recupere', 'o acesso.'],
  };

  return (
    <div className="login">
      <section className="login-hero hero">
        <div className="hero-grid" aria-hidden="true" />
        <Logo light />
        <div className="hero-body">
          <p className="eyebrow light">CAD · BIM · Documentação</p>
          <h1 className="display hero-title">
            Desenhe a planta.
            <br />
            <em>O resto nasce do modelo.</em>
          </h1>
        </div>
      </section>
      <section className="login-panel">
        <form onSubmit={submit} className="login-form">
          <h2 className="display">
            {titles[mode][0]} <em>{titles[mode][1]}</em>
          </h2>
          <label className="field">
            <span>E-mail</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </label>
          {mode !== 'reset' && (
            <label className="field">
              <span>Senha</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p className="note error" role="alert">
              {error}
            </p>
          )}
          {info && (
            <p className="note" role="status">
              {info}
            </p>
          )}
          <button className="btn primary" type="submit" disabled={busy}>
            {busy && <Loader2 size={16} className="spin" />}
            {mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link'}
          </button>
          <div className="login-links">
            {mode !== 'signin' && (
              <button type="button" className="text-btn" onClick={() => setMode('signin')}>
                Já tenho conta
              </button>
            )}
            {mode !== 'signup' && (
              <button type="button" className="text-btn" onClick={() => setMode('signup')}>
                Criar conta
              </button>
            )}
            {mode !== 'reset' && (
              <button type="button" className="text-btn" onClick={() => setMode('reset')}>
                Esqueci a senha
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
};
