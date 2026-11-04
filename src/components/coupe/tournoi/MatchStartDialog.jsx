import React, { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useReducedMotion } from 'framer-motion';
import { Play, X } from 'lucide-react';
import { useAndroidBack } from '@/lib/useAndroidBack';
import { COUPE_COLORS } from '../palette';
import { COUPE_VARS } from '../hub/theme';
import { BTN_OUTLINE, BTN_RED, PlayerLabel } from './ui';
import { matchTitle, mySide } from './tournoiFormat';

/**
 * « Ton match commence » : ton match devient jouable pendant que la page du tournoi est ouverte et
 * visible. Compte à rebours de 5 s ; « Y aller » ouvre le jeu tout de suite, à 0 il s'ouvre seul ;
 * « Pas maintenant », la croix, Échap ou le retour d'Android referment la fenêtre (le tableau garde
 * « Jouer mon match »). Une seule fois par match : jamais de nouvelle fenêtre après être sorti du
 * jeu, ni pour un match qu'on a déjà ouvert (`markMatchPrompted`, mémoire de la session).
 * « Réduire les animations » : ni anneau qui tourne ni fondu, le chiffre seul.
 */
export const MATCH_START_SECONDS = 5;

const prompted = new Set();

/** Ce match a déjà eu sa fenêtre (ou on l'a ouvert) : plus jamais de fenêtre pour lui. */
export function markMatchPrompted(matchId) {
  if (matchId) prompted.add(String(matchId));
}

export const wasMatchPrompted = (matchId) => prompted.has(String(matchId || ''));

const RING = 2 * Math.PI * 34;

export default function MatchStartDialog({ match, total, onGo, onLater }) {
  const open = !!match;
  const reduce = useReducedMotion();
  const [left, setLeft] = useState(MATCH_START_SECONDS);
  const goRef = useRef(onGo);
  goRef.current = onGo;
  const matchId = match?.id || null;

  useAndroidBack(open, onLater);

  // Compte à rebours sur l'horloge du téléphone (5 s) : à 0, le jeu s'ouvre seul, une seule fois
  useEffect(() => {
    if (!matchId) return undefined;
    const until = Date.now() + MATCH_START_SECONDS * 1000;
    let done = false;
    setLeft(MATCH_START_SECONDS);
    const tick = () => {
      const s = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0 && !done) {
        done = true;
        goRef.current?.();
      }
    };
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [matchId]);

  const side = match ? Math.max(0, mySide(match)) : 0;
  const opp = match?.p?.[1 - side] || null;
  const title = match ? matchTitle(match.round, match.slot, total) : '';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onLater(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/75" />
        <DialogPrimitive.Content
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-x-4 top-1/2 z-50 mx-auto flex max-w-[400px] -translate-y-1/2 flex-col items-center gap-3 rounded-[20px] border px-5 pb-5 pt-6 text-center font-inter text-white shadow-2xl outline-none motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:zoom-in-95"
          style={{ ...COUPE_VARS, background: COUPE_COLORS.noir2, borderColor: COUPE_COLORS.rouge }}
        >
          <DialogPrimitive.Close
            className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-xl border border-white/12 bg-white/4 text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </DialogPrimitive.Close>
          <span className="font-fut text-[13px] font-bold uppercase tracking-[0.14em] text-[color:var(--coupe-rouge-vif)]">{title}</span>
          <DialogPrimitive.Title className="font-fut text-[32px] font-extrabold uppercase leading-none tracking-[0.03em]">
            Ton match commence
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="flex items-center gap-1.5 text-sm text-[color:var(--coupe-gris-clair)]">
            {opp ? (
              <>
                Contre
                <PlayerLabel player={opp} className="font-semibold text-white" />
              </>
            ) : 'Ton adversaire arrive.'}
          </DialogPrimitive.Description>

          <div className="relative my-1 h-[84px] w-[84px]" role="timer" aria-label={`Le jeu s’ouvre dans ${left} s`}>
            <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true" className="absolute inset-0">
              <circle cx="42" cy="42" r="34" fill="none" stroke={COUPE_COLORS.noir3} strokeWidth="7" />
              <circle
                cx="42" cy="42" r="34" fill="none" stroke={COUPE_COLORS.rouge} strokeWidth="7" strokeLinecap="round"
                strokeDasharray={RING} strokeDashoffset={RING * (1 - left / MATCH_START_SECONDS)} transform="rotate(-90 42 42)"
                style={reduce ? undefined : { transition: 'stroke-dashoffset 200ms linear' }}
              />
            </svg>
            <span className="absolute inset-0 grid place-items-center font-fut text-[40px] font-extrabold leading-none tabular-nums" aria-hidden="true">{left}</span>
          </div>

          <div className="mt-1 flex w-full flex-col gap-2.5">
            <button type="button" className={BTN_RED} onClick={() => onGo()}>
              <Play className="h-5 w-5" aria-hidden="true" />
              Y aller
            </button>
            <button type="button" className={BTN_OUTLINE} onClick={() => onLater()}>Pas maintenant</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
