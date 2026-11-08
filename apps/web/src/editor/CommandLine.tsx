import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useEditor } from './store.ts';
import { controller } from './controller.ts';
import { saveNow } from './autosave.ts';

const isTypingTarget = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

/**
 * Linha de comando no estilo CAD. Qualquer tecla digitada com o foco no
 * desenho vem para cá; Enter confirma, Esc cancela.
 */
export const CommandLine = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const prompt = useSyncExternalStore(
    (cb) => controller.subscribe(cb),
    () => controller.prompt,
  );
  const messages = useEditor((s) => s.messages);
  const last = messages.at(-1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      if (!st.project) return;
      const mod = e.ctrlKey || e.metaKey;
      const inCmd = e.target === inputRef.current;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (isTypingTarget(e.target) && !inCmd) return;
        e.preventDefault();
        return st.undo();
      }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        if (isTypingTarget(e.target) && !inCmd) return;
        e.preventDefault();
        return st.redo();
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveNow();
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        st.setSnap({ enabled: !st.snap.enabled });
        return st.message(`Snap ${!st.snap.enabled ? 'ligado' : 'desligado'}.`);
      }
      if (e.key === 'F7') {
        e.preventDefault();
        return st.toggleGrid();
      }
      if (e.key === 'F8') {
        e.preventDefault();
        st.toggleOrtho();
        return st.message(`Ortogonal ${!st.ortho ? 'ligado' : 'desligado'}.`);
      }
      if (e.key === 'F9') {
        e.preventDefault();
        return st.setSnap({ grid: !st.snap.grid });
      }
      if (isTypingTarget(e.target) && !inCmd) return;
      if (e.key === ' ' && !inCmd) {
        controller.spaceDown = true;
        e.preventDefault();
        return;
      }
      if (inCmd) return; // o próprio input trata Enter/Esc
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        return controller.selectAll();
      }
      if (e.key === 'Escape') return controller.escape();
      if (e.key === 'Enter') return controller.enter();
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        return controller.erase();
      }
      if (e.key.length === 1 && !mod && !e.altKey) {
        // redireciona a digitação para a linha de comando sem perder a primeira tecla
        e.preventDefault();
        inputRef.current?.focus();
        setText((t) => t + e.key);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') controller.spaceDown = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return (
    <div className="cmdline">
      <div className={`cmd-msg kind-${last?.kind ?? 'info'}`} aria-live="polite">
        {last?.text ?? 'Pronto.'}
      </div>
      <label className="cmd-row">
        <span className="cmd-prompt">{prompt}</span>
        <input
          ref={inputRef}
          value={text}
          spellCheck={false}
          autoComplete="off"
          aria-label="Linha de comando"
          placeholder="digite aqui…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const t = text;
              setText('');
              controller.input(t);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              if (text) setText('');
              else {
                controller.escape();
                inputRef.current?.blur();
              }
            }
          }}
        />
      </label>
    </div>
  );
};
