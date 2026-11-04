import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SpectatorMatch } from '@/lib/coupe/spectatorMatch';
import WatchStage from '@/components/coupe/watch/WatchStage';
import { useScreenScale } from './ScreenFrame';
import { liveKey } from './screenFormat';

/*
 * Match montré en grand sur l'écran du salon : la vue spectateur du serveur de jeu
 * (`SpectatorMatch` avec la clé d'écran, `auth {screen}` ; contrat
 * docs/fonctions/coupe-spectateurs-contrat.md, sections 1 et 4.1, décisions A2, A4 et A5 de la
 * section 6) dessinée par `WatchStage variant="screen"` (bande du score, stade, terrain, bandeaux
 * du règlement v2 ; muet, sans bouton). Noms et pions aux initiales, jamais de photo.
 *
 * - **Une seule socket pour tout l'écran** (A2) : `useScreenSpectator` crée la SpectatorMatch une
 *   fois par clé d'écran (détruite au démontage) et change de match par `watch` ; plus aucun match
 *   montré : `unwatch` (la socket reste ouverte, le serveur la ferme après 5 min sans match).
 * - `onReport(ui)` à chaque changement d'état du match demandé (useBigMatch y lit la fin,
 *   `unavailable`, `revoked`…). Un message tardif du match d'avant (réponse croisée avec le `watch`
 *   suivant) n'est jamais rapporté.
 * - Pas de bouton « Réessayer » sur un écran : connexion perdue après les essais de SpectatorMatch
 *   (un 4401 seul en est une, A1), ou attente trop longue d'un match pas commencé, nouvel essai seul
 *   15 s plus tard ; écran refusé (`full` : trop de spectateurs, serveur plein), nouvel essai 30 s
 *   plus tard, sans quitter le match. Remplacé (4409) ou quota (4429) : SpectatorMatch réessaie
 *   seule 30 s plus tard (`connecting`). Écran coupé (`revoked`, seulement après
 *   `error screen_revoked`) : jamais de nouvel essai, le 403 de `GET /coupe/screen` suit.
 * - En attendant `wstart` (début, reconnexion, refus) : noms, rôles et score de la ligne `live` du
 *   match (`fallback`, A5), jamais « ? Joueur 0 – 0 ».
 * - La bande du score suit l'échelle de la scène (`scale`, A4) : le bloc est hors de la mise à
 *   l'échelle (UnscaledBox), ses tailles sont celles de la planche multipliées par l'échelle.
 */
export const LIVE_STAGE = true;
const RETRY_MS = 15 * 1000;
const REFUSED_RETRY_MS = 30 * 1000;

const watchArg = (target) => (target.kind === 'tour' ? { m: target.id } : { w: target.id });

/** Délai avant un nouvel essai seul, d'après l'état du match demandé (0 : rien à refaire). */
export function retryDelayOf(ui) {
  const status = ui?.status;
  if (status === 'full') return REFUSED_RETRY_MS;
  if (status === 'offline') return RETRY_MS;
  if (status === 'waiting' && ui?.waitOver) return RETRY_MS;
  return 0;
}

/**
 * La vue en direct de l'écran : une SpectatorMatch par clé d'écran, qui regarde `target` (ligne de
 * `live`, ou null). Rend `{ sm, ui, key }` : `ui` est celui du match `target` (null avant sa
 * première nouvelle), `key` la clé (`liveKey`) du match demandé.
 */
export function useScreenSpectator(screenKey, target, onReport) {
  const [sm, setSm] = useState(null);
  const [view, setView] = useState({ key: null, ui: null });
  // Match demandé à la socket (`liveKey`), null quand l'écran ne regarde rien
  const wantRef = useRef(null);
  const reportRef = useRef(onReport);
  reportRef.current = onReport;

  useEffect(() => {
    if (!screenKey) return undefined;
    const match = new SpectatorMatch({
      screenKey,
      onChange: (next) => {
        const want = wantRef.current;
        if (!want || !next) return;
        // Réponse au `watch` d'avant, arrivée après le suivant : pas ce match-ci
        if (next.id && `${next.kind}:${next.id}` !== want) return;
        const copy = { ...next };
        setView({ key: want, ui: copy });
        try { reportRef.current?.(copy); } catch { /* l'écran continue */ }
      },
    });
    setSm(match);
    return () => {
      wantRef.current = null;
      match.destroy();
      setSm(null);
      setView({ key: null, ui: null });
    };
  }, [screenKey]);

  const tkey = target ? liveKey(target) : null;
  const targetRef = useRef(target);
  targetRef.current = target;
  useEffect(() => {
    if (!sm) return;
    if (!tkey) {
      if (wantRef.current) {
        wantRef.current = null;
        try { sm.unwatch(); } catch { /* socket déjà fermée */ }
      }
      return;
    }
    if (wantRef.current === tkey) return;
    // Posé avant `watch` : son premier état (`connecting`) est déjà celui de ce match
    wantRef.current = tkey;
    try { sm.watch(watchArg(targetRef.current)); } catch { /* nouvel essai plus bas */ }
  }, [sm, tkey]);

  const ui = tkey && view.key === tkey ? view.ui : null;
  const delay = retryDelayOf(ui);
  const status = ui?.status;
  const error = ui?.error;
  useEffect(() => {
    if (!sm || !tkey || !delay) return undefined;
    const t = setTimeout(() => {
      if (wantRef.current !== tkey || !targetRef.current) return;
      try { sm.watch(watchArg(targetRef.current)); } catch { /* nouvel essai au prochain état */ }
    }, delay);
    return () => clearTimeout(t);
  }, [sm, tkey, delay, status, error]);

  return { sm, ui, key: tkey };
}

/** Noms, rôles, score et tour de la ligne `live` (repli de la bande avant `wstart`). */
export function fallbackOf(row) {
  if (!row) return null;
  const pair = (arr) => (Array.isArray(arr) && arr.length === 2 ? [arr[0], arr[1]] : null);
  return {
    names: pair(row.names) ? pair(row.names).map((n) => String(n || '')) : [],
    roles: pair(row.roles) || [],
    sc: pair(row.sc) ? pair(row.sc).map((v) => Math.max(0, Math.trunc(Number(v) || 0))) : [0, 0],
    tour: row.tour && typeof row.tour === 'object' ? row.tour : null,
  };
}

/** `spectator` : `useScreenSpectator(…)` ; `row` : ligne de `live` du match montré. */
export default function MatchStage({ spectator, row }) {
  const scale = useScreenScale();
  // Comparé par valeur : la ligne est relue toutes les 5 à 15 s (nouvel objet, mêmes valeurs)
  const sig = JSON.stringify(fallbackOf(row));
  const fallback = useMemo(() => JSON.parse(sig), [sig]);
  return (
    <WatchStage
      match={spectator?.sm || null}
      ui={spectator?.ui || null}
      variant="screen"
      scale={scale}
      fallback={fallback}
      className="h-full w-full"
    />
  );
}
