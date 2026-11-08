import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

/**
 * Cliente Supabase do navegador. Usa apenas a chave PUBLICÁVEL (segura para o
 * front-end); a proteção dos dados é feita por RLS no Postgres.
 * Sem as variáveis, o app roda em modo local (API SQLite sem login).
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
export const authEnabled = supabase !== null;

/** Token de acesso atual (renovado automaticamente pelo supabase-js). */
export const accessToken = async (): Promise<string | null> => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
};

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: Session; recovery?: boolean }
  | { status: 'local' };

export const useSession = (): SessionState => {
  const [state, setState] = useState<SessionState>(supabase ? { status: 'loading' } : { status: 'local' });
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setState(data.session ? { status: 'signed-in', session: data.session } : { status: 'signed-out' });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // PASSWORD_RECOVERY: o usuário voltou pelo link de redefinição e precisa escolher nova senha
      setState(session ? { status: 'signed-in', session, recovery: event === 'PASSWORD_RECOVERY' } : { status: 'signed-out' });
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return state;
};

export const signOut = async () => {
  await supabase?.auth.signOut();
  location.hash = '#/';
};
