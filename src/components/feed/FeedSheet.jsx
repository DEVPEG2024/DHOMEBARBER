import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useAndroidBack } from '@/lib/useAndroidBack';
import { useEscapeLayer } from '@/lib/feed/escapeStack';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
// Croix ignorée ce temps-là après qu'un champ a perdu la main clavier ouvert (voir `onBlurCapture`)
const KEYBOARD_TAP_MS = 700;

/**
 * Fenêtre du bas du fil (commentaires, composeur, signalement, menu) : portail dans `body` (le fil
 * est dans un parent animé), fermée par la croix seulement (le fond ne ferme rien), Échap au
 * clavier (fenêtre du dessus seulement), retour Android. À placer dans un `<AnimatePresence>` chez l'appelant.
 *
 * Étages : fenêtres du fil `z-[60]` ; ce qui s'ouvre par-dessus (menu Signaler / Bloquer depuis les
 * commentaires, confirmation) `layer="top"` → `z-[70]`.
 *
 * @param {object} props
 * @param {string} props.title           titre (lu par les lecteurs d'écran, affiché sauf `hideTitle`)
 * @param {() => void} props.onClose     croix, Échap, retour Android
 * @param {React.ReactNode} [props.footer]  zone fixe en bas (champ de commentaire, bouton Publier)
 * @param {'auto'|'tall'} [props.size]   `tall` : 92 % de la hauteur (`kb-sheet-92`), sinon ajustée
 * @param {'base'|'top'} [props.layer]
 * @param {boolean} [props.closeDisabled]  envoi en cours : croix et Échap inactifs
 * @param {React.ReactNode} [props.headerExtra]  à gauche de la croix (« Tout marquer lu »…)
 */
export default function FeedSheet({
  title, onClose, children, footer = null, size = 'auto', layer = 'base', closeDisabled = false,
  hideTitle = false, headerExtra = null,
}) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = closeDisabled ? () => {} : onClose;
  useAndroidBack(true, () => closeRef.current?.());

  // Échap : seule la fenêtre du dessus se ferme (pile partagée, src/lib/feed/escapeStack.js)
  useEscapeLayer(true, () => closeRef.current?.());

  // Apps : un toucher clavier ouvert ferme d'abord le clavier, la fenêtre redescend, et le toucher
  // arrive à l'ancien endroit du doigt, parfois sur la croix (onglet « Sondage » du composeur, iPad,
  // 30 oct. 2026 : fenêtre fermée). La croix ne réagit qu'au toucher suivant
  const keyboardBlurAt = useRef(-Infinity);
  const onBlurCapture = (e) => {
    if (document.body.classList.contains('keyboard-open') && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) {
      keyboardBlurAt.current = performance.now();
    }
  };
  const onCloseClick = () => {
    if (performance.now() - keyboardBlurAt.current < KEYBOARD_TAP_MS) return;
    closeRef.current?.();
  };

  // Focus dans la fenêtre à l'ouverture ; à la fermeture, rendu à l'élément d'origine (le bouton
  // « Signaler » d'un commentaire, la carte…) seulement si le focus était encore ici : une fenêtre
  // ouverte entre-temps par-dessus (menu → signalement) le garde, sinon il partait sous elle
  useEffect(() => {
    const previous = document.activeElement;
    const panel = panelRef.current;
    panel?.focus({ preventScroll: true });
    return () => {
      const active = document.activeElement;
      const stillOurs = !active || active === document.body || (panel && panel.contains(active));
      if (!stillOurs) return;
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

  // Tab tourne dans la fenêtre (du dernier élément au premier, et l'inverse) : il ne part jamais
  // derrière le voile, sur le fil
  const trapTab = (e) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  };

  const z = layer === 'top' ? 'z-[70]' : 'z-[60]';
  return createPortal(
    <>
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className={`fixed inset-0 ${z} bg-black/65 touch-none`}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
        onBlurCapture={onBlurCapture}
        data-app-overlay=""
        initial={reduce ? { opacity: 0 } : { y: '100%' }}
        animate={reduce ? { opacity: 1 } : { y: 0 }}
        exit={reduce ? { opacity: 0 } : { y: '100%' }}
        transition={reduce ? { duration: 0.15 } : { type: 'spring', damping: 30, stiffness: 320 }}
        className={`${size === 'tall' ? 'kb-sheet-92 h-[92vh]' : 'kb-sheet max-h-[92vh]'} fixed inset-x-0 bottom-0 ${z} mx-auto w-full max-w-lg rounded-t-3xl border-t border-border bg-card shadow-2xl shadow-black/50 flex flex-col overflow-hidden outline-none`}
      >
        <div className="shrink-0 px-5 pt-2.5">
          <div className="mx-auto w-10 h-1 rounded-full bg-muted" aria-hidden="true" />
          <div className="flex items-center gap-2 mt-3 mb-2">
            <h2 id={titleId} className={hideTitle ? 'sr-only' : 'flex-1 min-w-0 font-display text-base font-bold text-foreground truncate'}>{title}</h2>
            {hideTitle && <div className="flex-1" />}
            {headerExtra}
            <button
              type="button"
              onClick={onCloseClick}
              disabled={closeDisabled}
              aria-label="Fermer"
              className="w-11 h-11 rounded-xl border border-border bg-secondary/70 text-muted-foreground hover:text-foreground flex items-center justify-center shrink-0 disabled:opacity-50"
            >
              <X className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-border bg-card px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">{footer}</div>
        )}
      </motion.div>
    </>,
    document.body,
  );
}
