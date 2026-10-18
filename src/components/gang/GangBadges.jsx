import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Lock, X, Check } from 'lucide-react';
import { hapticFeedback } from '@/lib/capacitor';
import { cn } from '@/lib/utils';
import { GANG_SHIELD_PATH, GANG_INNER_SCALE } from './gangTheme';
import { useAndroidBack } from '@/lib/useAndroidBack';

/**
 * Écussons de la carte Gang (calculés par le serveur, `card.badges` : liste complète, verrouillés
 * compris, ordre fixe). Chaque écusson : { key, emoji, label, description, unlocked, progress }.
 *
 * - `GangBadgeGrid` : la grille des écussons (débloqués en couleur, verrouillés grisés avec un
 *   cadenas et, pour les 10 dégradés / fidèle d'un barber, la progression).
 * - `GangBadgeUnlock` : la révélation plein écran des écussons nouvellement débloqués, un par un.
 * - `GangBadgeShield` : le petit écusson seul (même forme que la carte).
 */

const DEFAULT_ACCENT = '#f0c85a';
const EMOJI_FONT = 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const safeAccent = (c) => (isHex(c) ? c : DEFAULT_ACCENT);

/** Assombrit une couleur #rrggbb (0 → identique, 1 → noir). */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * (1 - amount)).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/** Progression bornée { current, target, pct } ou null. */
function badgeProgress(b) {
  const target = Number(b?.progress?.target);
  const current = Number(b?.progress?.current);
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(current)) return null;
  const c = Math.max(0, Math.min(target, Math.round(current)));
  return { current: c, target, pct: (c / target) * 100 };
}

// Fond intérieur : l'écusson réduit, comme sur la carte (liseré visible tout autour)
const INNER_TRANSFORM = (() => {
  const ox = 300 * GANG_INNER_SCALE.originX;
  const oy = 440 * GANG_INNER_SCALE.originY;
  // Liseré plus épais qu'à l'échelle de la carte : l'écusson est petit
  const sx = 0.86;
  const sy = 0.9;
  return `translate(${ox} ${oy}) scale(${sx} ${sy}) translate(${-ox} ${-oy})`;
})();

/** Petit écusson (forme de la carte) avec l'emoji au centre ; grisé et cadenassé si `locked`. */
export function GangBadgeShield({ emoji, accent, locked = false, width = 46, className, style }) {
  const id = `gang-badge-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const a = safeAccent(accent);
  const height = (width * 440) / 300;
  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-block shrink-0', className)}
      style={{ width, height, ...style }}
    >
      <svg viewBox="0 0 300 440" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
        <defs>
          <linearGradient id={`${id}-b`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={locked ? '#8a9097' : a} />
            <stop offset="1" stopColor={locked ? '#4a4f55' : shade(a, 0.45)} />
          </linearGradient>
          <linearGradient id={`${id}-i`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={locked ? '#2c2f33' : shade(a, 0.72)} />
            <stop offset="1" stopColor={locked ? '#17191c' : shade(a, 0.9)} />
          </linearGradient>
        </defs>
        <path d={GANG_SHIELD_PATH} fill={`url(#${id}-b)`} />
        <path d={GANG_SHIELD_PATH} fill={`url(#${id}-i)`} transform={INNER_TRANSFORM} />
        {/* Filet en diagonale, rappel des bandes de la carte */}
        {!locked && <path d="M180 40 L250 40 L120 400 L50 400 Z" fill="rgba(255,255,255,.07)" transform={INNER_TRANSFORM} />}
      </svg>
      <span
        style={{
          position: 'absolute', left: 0, right: 0, top: '22%', textAlign: 'center', lineHeight: 1,
          fontSize: width * 0.46, fontFamily: EMOJI_FONT,
          filter: locked ? 'grayscale(1)' : undefined, opacity: locked ? 0.35 : 1,
        }}
      >
        {emoji}
      </span>
      {locked && (
        <span
          className="absolute flex items-center justify-center rounded-full bg-black/75 border border-white/20"
          style={{ width: width * 0.42, height: width * 0.42, right: -width * 0.06, bottom: width * 0.12 }}
        >
          <Lock className="text-white/85" style={{ width: width * 0.22, height: width * 0.22 }} />
        </span>
      )}
    </span>
  );
}

/** Grille des 7 écussons : 2 colonnes à 320 px, 3 dès 380 px, 4 sur grand écran. */
export function GangBadgeGrid({ badges, accent, className }) {
  const list = Array.isArray(badges) ? badges.filter(Boolean) : [];
  if (!list.length) return null;
  const a = safeAccent(accent);
  return (
    <ul className={cn('grid grid-cols-2 min-[380px]:grid-cols-3 sm:grid-cols-4 gap-2', className)}>
      {list.map((b) => {
        const locked = !b.unlocked;
        const prog = locked ? badgeProgress(b) : null;
        return (
          <li
            key={b.key}
            className={cn(
              'flex flex-col items-center text-center rounded-2xl border p-3 min-w-0',
              locked ? 'border-border bg-card/40' : 'bg-card/70',
            )}
            style={locked ? undefined : { borderColor: `${a}55` }}
          >
            <GangBadgeShield emoji={b.emoji} accent={a} locked={locked} width={44} />
            <p className={cn('mt-2 text-xs font-semibold leading-tight break-words', locked ? 'text-muted-foreground' : 'text-foreground')}>
              <span className="sr-only">{locked ? 'Verrouillé : ' : 'Débloqué : '}</span>
              {b.label}
            </p>
            {b.description && (
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{b.description}</p>
            )}
            {prog && (
              <div className="mt-2 w-full">
                <div
                  className="h-1.5 rounded-full bg-white/8 overflow-hidden"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={prog.target}
                  aria-valuenow={prog.current}
                  aria-label={`Progression : ${prog.current} sur ${prog.target}`}
                >
                  {/* Remplissage par échelle horizontale (transform), pas par largeur */}
                  <div className="h-full w-full origin-left rounded-full" style={{ background: a, opacity: 0.8, transform: `scaleX(${prog.pct / 100})` }} />
                </div>
                <p className="mt-1 text-[10px] font-semibold tabular-nums text-muted-foreground">{prog.current} / {prog.target}</p>
              </div>
            )}
            {!locked && (
              <p className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: a }} aria-hidden="true">
                <Check className="w-3 h-3" /> Débloqué
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Révélation des écussons nouvellement débloqués, un par un (plein écran, rendue dans `body`).
 * « Continuer » passe au suivant, puis appelle `onDone` ; la croix appelle `onDone` tout de suite.
 * Pas de fermeture au tap à côté (règle des fenêtres du projet) ; Échap au clavier.
 * Pas d'attribut `data-gang-overlay` : la révélation de niveau (GangLevelUp) attend donc
 * qu'elle soit refermée avant de s'ouvrir.
 */
export function GangBadgeUnlock({ badges, onDone, accent }) {
  const list = Array.isArray(badges) ? badges.filter(Boolean) : [];
  const [index, setIndex] = useState(0);
  const doneRef = useRef(false);
  const dialogRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const open = list.length > 0 && index < list.length;
  const current = open ? list[index] : null;
  const a = safeAccent(accent);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone?.();
  }, [onDone]);

  const next = useCallback(() => {
    if (index + 1 < list.length) setIndex(index + 1);
    else finish();
  }, [index, list.length, finish]);
  // Bouton retour d'Android : même fermeture que la croix et Échap
  useAndroidBack(open, finish);

  // Page figée derrière la révélation, Échap au clavier
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, finish]);

  // Haptique quand l'écusson se pose ; focus sur la fenêtre (lecteurs d'écran, Tab vers les boutons)
  useEffect(() => {
    if (!current) return undefined;
    dialogRef.current?.focus({ preventScroll: true });
    const timer = setTimeout(() => hapticFeedback(), reduceMotion ? 0 : 650);
    return () => clearTimeout(timer);
  }, [current, reduceMotion]);

  if (!current || typeof document === 'undefined') return null;

  const anim = (from, to, transition) => (reduceMotion ? { initial: false, animate: to } : { initial: from, animate: to, transition });

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gang-badge-title"
      aria-describedby="gang-badge-desc"
      data-gang-badge-overlay=""
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[85] overflow-hidden bg-[#0b0b0c] text-white outline-none"
    >
      <div aria-hidden="true" className="absolute inset-0" style={{ background: `radial-gradient(ellipse 70% 55% at 50% 42%, ${shade(a, 0.7)} 0%, #0b0b0c 72%)` }} />

      {/* Rayons qui tournent lentement */}
      {!reduceMotion && (
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingBottom: '12vh' }}>
          <motion.div
            className="shrink-0 w-[160vmax] h-[160vmax]"
            style={{ background: `repeating-conic-gradient(from 0deg, transparent 0deg 11deg, ${a}1f 11deg 14deg)` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, rotate: 360 }}
            transition={{ opacity: { duration: 1.2 }, rotate: { duration: 24, ease: 'linear', repeat: Infinity } }}
          />
        </div>
      )}

      <button
        type="button"
        onClick={finish}
        aria-label="Fermer"
        className="absolute z-10 top-[calc(env(safe-area-inset-top)+0.75rem)] right-4 w-10 h-10 rounded-full bg-white/10 border border-white/15 text-white flex items-center justify-center"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="relative h-full flex flex-col items-center justify-center px-6 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <motion.div key={current.key} className="flex flex-col items-center w-full max-w-xs">
          <motion.p
            className="text-[11px] tracking-[0.24em] uppercase font-semibold text-center mb-6"
            style={{ color: a }}
            {...anim({ opacity: 0, y: -8 }, { opacity: 1, y: 0 }, { duration: 0.4 })}
          >
            Écusson débloqué{list.length > 1 ? ` · ${index + 1} / ${list.length}` : ''}
          </motion.p>

          <div className="relative flex items-center justify-center" style={{ width: 200, height: 220 }}>
            {/* Halo : flou fixe, seules l'échelle et l'opacité bougent */}
            <motion.div
              aria-hidden="true"
              className="absolute rounded-full"
              style={{ width: 240, height: 240, background: `radial-gradient(closest-side, ${a}aa, ${a}22 60%, transparent)`, filter: 'blur(18px)' }}
              {...anim({ opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1 }, { duration: 1.1, delay: 0.25, ease: [0.2, 0.8, 0.2, 1] })}
            />
            {/* L'écusson arrive en tournant (rotation 3D + échelle) */}
            <div style={{ perspective: 700 }}>
              <motion.div
                {...anim(
                  { opacity: 0, scale: 0.2, rotateY: -540, rotate: -18 },
                  { opacity: 1, scale: 1, rotateY: 0, rotate: 0 },
                  { duration: 1.25, delay: 0.1, ease: [0.16, 1, 0.3, 1] },
                )}
              >
                <GangBadgeShield emoji={current.emoji} accent={a} width={124} />
              </motion.div>
            </div>
          </div>

          <motion.h2
            id="gang-badge-title"
            className="font-fut mt-6 text-center font-extrabold uppercase leading-none text-[32px] min-[400px]:text-[38px] break-words"
            {...anim({ opacity: 0, y: 10 }, { opacity: 1, y: 0 }, { duration: 0.5, delay: 0.7, ease: 'easeOut' })}
          >
            {current.label}
          </motion.h2>
          <motion.p
            id="gang-badge-desc"
            className="mt-2 text-sm text-white/70 text-center"
            {...anim({ opacity: 0 }, { opacity: 1 }, { duration: 0.5, delay: 0.85 })}
          >
            {current.description}
          </motion.p>
          <span className="sr-only">Écusson débloqué : {current.label}</span>

          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={next}
            className="mt-8 w-full h-12 rounded-2xl text-sm font-bold"
            style={{ background: a, color: '#14110a' }}
            {...anim({ opacity: 0, y: 12 }, { opacity: 1, y: 0 }, { duration: 0.45, delay: 1 })}
          >
            Continuer
          </motion.button>
        </motion.div>
      </div>
    </div>,
    document.body,
  );
}

export default GangBadgeGrid;
