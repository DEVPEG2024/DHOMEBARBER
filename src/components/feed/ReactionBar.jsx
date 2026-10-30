import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { SmilePlus } from 'lucide-react';
import { hapticFeedback } from '@/lib/capacitor';
import { REACTIONS, REACTION_LABELS, sortedReactions } from '@/lib/feed/rules';
import { openLayerCount } from '@/lib/feed/escapeStack';

// Appui long sur une pastille ou sur « Autre réaction » : ouvre le choix des 6 réactions
const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE = 10;

/** Explosion d'emojis au moment de réagir : particules en transform / opacity uniquement. */
function EmojiBurst({ emoji, onDone }) {
  const parts = useMemo(() => Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i - 4.5) * 0.26 + (Math.random() - 0.5) * 0.2;
    const dist = 44 + Math.random() * 44;
    return {
      id: i,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      scale: 0.7 + Math.random() * 0.7,
      rotate: (Math.random() - 0.5) * 70,
      delay: Math.random() * 0.08,
    };
  }), []);

  return (
    <span className="absolute left-8 bottom-5 pointer-events-none z-10" aria-hidden="true">
      {parts.map((p) => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: p.y, scale: p.scale, opacity: 0, rotate: p.rotate }}
          transition={{ duration: 0.9, delay: p.delay, ease: [0.16, 1, 0.3, 1], opacity: { duration: 0.45, delay: p.delay + 0.45 } }}
          onAnimationComplete={p.id === 0 ? onDone : undefined}
          className="absolute text-lg leading-none"
        >
          {emoji}
        </motion.span>
      ))}
    </span>
  );
}

/**
 * Appui long (doigt ou souris) et clic droit / menu contextuel du système (appui long sur Android)
 * → `onLong`. `consumed()` dit si le clic qui suit vient d'un appui long (il ne doit rien faire).
 */
function useLongPress(onLong, enabled) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);
  const longRef = useRef(onLong);
  longRef.current = onLong;
  const cancel = () => { clearTimeout(timer.current); timer.current = null; };
  useEffect(() => () => clearTimeout(timer.current), []);
  const bind = {
    onPointerDown: (e) => {
      if (!enabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      cancel();
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        hapticFeedback();
        longRef.current();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e) => {
      const s = start.current;
      if (!timer.current || !s) return;
      // Le doigt glisse : c'est un défilement, pas un appui long
      if (Math.abs(e.clientX - s.x) > LONG_PRESS_MOVE || Math.abs(e.clientY - s.y) > LONG_PRESS_MOVE) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e) => {
      e.preventDefault();
      if (!enabled) return;
      cancel();
      fired.current = true;
      longRef.current();
    },
  };
  const consumed = () => {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  };
  return [bind, consumed];
}

/**
 * Barre de réactions d'une publication (fil v2) : une pastille par emoji avec son nombre (la plus
 * fréquente d'abord, `sortedReactions`), la mienne en vert (`aria-pressed`), puis « Autre réaction »
 * qui ouvre le choix des 6. Tap sur une pastille = poser / retirer cette réaction ; appui long =
 * choix des 6 ; explosion d'emojis quand je réagis.
 *
 * @param {object} props
 * @param {object} props.item                 publication (`reactions`, `my_reaction`)
 * @param {(emoji: string|null) => void} props.onReact  emoji à poser, `null` pour retirer
 * @param {boolean} [props.disabled]          pas de compte, ou réactions pas encore lues
 * @param {boolean} [props.unavailable]       ancien fil : réactions en échec (« Réessayer »)
 * @param {() => void} [props.onRetry]
 * @param {boolean} [props.retrying]
 */
export default function ReactionBar({ item, onReact, disabled = false, unavailable = false, onRetry, retrying = false }) {
  const reduce = useReducedMotion();
  const [picker, setPicker] = useState(false);
  const [burst, setBurst] = useState(null);
  const barRef = useRef(null);
  const mine = item.my_reaction || null;
  const list = sortedReactions(item);
  const [press, consumed] = useLongPress(() => setPicker(true), !disabled && !unavailable);

  // Choix ouvert : Échap ou un tap ailleurs le referme. Échap seulement quand aucune fenêtre du fil
  // n'est ouverte par-dessus (elle seule doit se fermer, src/lib/feed/escapeStack.js)
  useEffect(() => {
    if (!picker) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && openLayerCount() === 0) setPicker(false); };
    const onDown = (e) => { if (barRef.current && !barRef.current.contains(e.target)) setPicker(false); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [picker]);

  // Même emoji que le mien = retirer ; autre emoji = poser (ou changer)
  const send = (emoji) => {
    const next = mine === emoji ? null : emoji;
    if (next && !reduce) setBurst({ emoji: next, key: Date.now() });
    hapticFeedback();
    onReact?.(next);
  };

  if (unavailable) {
    // En échec : jamais « aucune réaction », on propose de recharger
    return (
      <div className="flex flex-wrap items-center gap-x-1.5 px-4 pt-3 pb-1 text-xs text-muted-foreground">
        <span>Réactions indisponibles</span>
        <span aria-hidden="true">·</span>
        <button type="button" onClick={() => onRetry?.()} disabled={retrying} className="relative font-semibold text-primary disabled:opacity-60 after:absolute after:-inset-x-2 after:-inset-y-3">
          {retrying ? 'Chargement…' : 'Réessayer'}
        </button>
      </div>
    );
  }

  return (
    <div ref={barRef} role="group" aria-label="Réactions" className="relative flex flex-wrap items-center gap-1.5 px-4 pt-3 pb-1">
      {/* Choix des 6 borné à la carte (`overflow-hidden`) : à 320 px les emojis se resserrent au lieu d'être rognés */}
      <AnimatePresence>
        {picker && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.92 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.92 }}
            transition={{ duration: 0.16 }}
            className="absolute bottom-full left-3 mb-1 z-20 flex gap-0.5 max-w-[calc(100%-1.5rem)] bg-card border border-border rounded-2xl px-1.5 py-1.5 shadow-xl shadow-black/40"
          >
            {REACTIONS.map((emoji) => (
              <motion.button
                key={emoji}
                type="button"
                whileHover={reduce ? undefined : { scale: 1.25 }}
                whileTap={reduce ? undefined : { scale: 0.85 }}
                aria-label={REACTION_LABELS[emoji]}
                aria-pressed={mine === emoji}
                onClick={() => { setPicker(false); send(emoji); }}
                className={`text-xl w-10 min-w-[32px] h-10 shrink flex items-center justify-center rounded-full hover:bg-secondary transition-colors ${mine === emoji ? 'bg-primary/20' : ''}`}
              >
                {emoji}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {burst && <EmojiBurst key={burst.key} emoji={burst.emoji} onDone={() => setBurst(null)} />}
      </AnimatePresence>

      {list.map(([emoji, n]) => {
        const isMine = mine === emoji;
        return (
          <motion.button
            key={emoji}
            type="button"
            disabled={disabled}
            whileTap={reduce || disabled ? undefined : { scale: 0.9 }}
            aria-pressed={isMine}
            aria-label={`${isMine ? 'Ma réaction : ' : ''}${REACTION_LABELS[emoji] || emoji}, ${n}`}
            {...press}
            onClick={() => {
              if (consumed()) return;
              if (picker) { setPicker(false); return; }
              send(emoji);
            }}
            className={`h-[34px] px-2.5 rounded-full border inline-flex items-center gap-1 text-[13px] select-none [-webkit-touch-callout:none] transition-colors disabled:opacity-60 ${
              isMine
                ? 'border-primary bg-primary/20 text-foreground font-bold'
                : 'border-border bg-secondary/60 text-foreground/85 font-semibold hover:bg-secondary'
            }`}
          >
            <span aria-hidden="true">{emoji}</span>
            <span aria-hidden="true" className="tabular-nums">{n}</span>
          </motion.button>
        );
      })}

      <motion.button
        type="button"
        disabled={disabled}
        whileTap={reduce || disabled ? undefined : { scale: 0.9 }}
        aria-label="Autre réaction"
        aria-expanded={picker}
        {...press}
        onClick={() => {
          if (consumed()) return;
          setPicker((v) => !v);
        }}
        className={`h-[34px] rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 select-none [-webkit-touch-callout:none] transition-colors disabled:opacity-60 ${
          list.length ? 'w-[34px]' : 'px-3'
        }`}
      >
        <SmilePlus className="w-4 h-4" aria-hidden="true" />
        {/* Aucune réaction encore : le bouton se lit « Réagir » (le nom accessible reste « Autre réaction ») */}
        {!list.length && <span aria-hidden="true" className="text-xs font-semibold">Réagir</span>}
      </motion.button>
    </div>
  );
}
