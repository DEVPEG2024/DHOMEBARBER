import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Fenêtre de l'écran de jeu (carte sombre sur le terrain), fermée par sa croix ou Échap, jamais
 * par un tap à côté. `dialog` : fenêtre modale (Signaler, Bloquer, Abandonner), le focus y entre.
 * `top` : au-dessus de l'écran de fin.
 */
export default function Panel({ labelledBy, onClose, closeLabel = 'Fermer', soft = false, top = false, dialog = false, children }) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (dialog) panelRef.current?.focus?.({ preventScroll: true });
  }, [dialog]);

  const closable = !!onClose;
  useEffect(() => {
    if (!closable) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closeRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closable]);

  return (
    <section
      className={`cdg-overlay${soft ? ' cdg-soft' : ''}${top ? ' cdg-top' : ''}`}
      aria-labelledby={labelledBy}
      {...(dialog ? { role: 'dialog', 'aria-modal': 'true' } : {})}
    >
      <div className="cdg-panel" ref={panelRef} tabIndex={dialog ? -1 : undefined}>
        {onClose && (
          <button type="button" className="cdg-close" onClick={onClose} aria-label={closeLabel}>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        {children}
      </div>
    </section>
  );
}
