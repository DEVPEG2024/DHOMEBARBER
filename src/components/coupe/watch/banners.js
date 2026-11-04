import { useCallback, useEffect, useRef, useState } from 'react';
import { FX_ELEC, FX_FIRE } from '@/lib/coupe/engine';
import {
  GOLD_BANNER, eventBanner, eventsBanner, foulBanner, penEndBanner, penaltyBanner, penaltyPos,
} from '../game/rulesV2';

/*
 * Bandeaux du terrain vus par un spectateur (contrat docs/fonctions/coupe-spectateurs-contrat.md,
 * section 4.1) : mêmes bandeaux que l'écran de jeu (RulesBanner, textes de rulesV2.js), jamais à la
 * deuxième personne (personne n'est « toi »), et le but en HTML : la bannière du dessin dit « TU
 * MARQUES » pour le joueur du bas. Un à la fois, ~1,4 s ; but et but en or passent devant tout.
 */
const BANNER_MS = 1400;
const LONG_MS = 1600;
const QUEUE_MAX = 2;
// Le penalty annoncé dans le bandeau de sa faute n'a pas le sien
const FOUL_THEN_PENALTY_MS = 800;

/** Les deux joueurs pour les textes des bandeaux : [joueur 0, joueur 1], nom en tête et après « pour ». */
export function spectatorWho(names) {
  const one = (n, fallback) => {
    const name = String(n || '').trim() || fallback;
    return { name, obj: name };
  };
  return [one(names?.[0], 'Le joueur du bas'), one(names?.[1], 'Le joueur du haut')];
}

/** Bandeau d'un but (« But ! » et qui marque ; feu ou électrique : « But en feu », « +2 pour … »). */
export function spectatorGoalBanner({ scorer, value, fx }, who) {
  const p = who[scorer === 1 ? 1 : 0];
  if (Number(value) === 2 || fx === FX_ELEC) return { kind: 'elec', title: 'But électrique', sub: `+2 pour ${p.obj}`, pos: 'mid' };
  if (fx === FX_FIRE) return { kind: 'fire', title: 'But en feu', sub: `${p.name} marque`, pos: 'mid' };
  return { kind: 'goal', title: 'But !', sub: `${p.name} marque`, pos: 'mid' };
}

/**
 * File des bandeaux d'un match regardé : `{ banner, onMatchEvent, clear }`. `onMatchEvent(type,
 * data, who, so)` reçoit les événements du SpectatorMatch ; `banner` est donné à RulesBanner.
 */
export function useWatchBanners() {
  const [banner, setBanner] = useState(null);
  // `penS` : tireur du dernier penalty (bandeau de sa fin)
  const ref = useRef({ seq: 0, queue: [], current: null, timer: 0, foulAt: -Infinity, penS: null });

  const showNow = useCallback((item) => {
    const B = ref.current;
    clearTimeout(B.timer);
    B.current = item;
    setBanner(item);
    B.timer = setTimeout(() => {
      B.timer = 0;
      B.current = null;
      const next = B.queue.shift();
      if (next) showNow(next);
      else setBanner(null);
    }, item.ms);
  }, []);

  const push = useCallback((b, { ms = BANNER_MS, urgent = false } = {}) => {
    if (!b) return;
    const B = ref.current;
    B.seq += 1;
    const item = { ...b, id: B.seq, ms };
    if (urgent) B.queue = [];
    if (B.current && !urgent) {
      B.queue.push(item);
      if (B.queue.length > QUEUE_MAX) B.queue.shift();
      return;
    }
    showNow(item);
  }, [showNow]);

  const clear = useCallback(() => {
    const B = ref.current;
    clearTimeout(B.timer);
    B.timer = 0;
    B.queue = [];
    B.current = null;
    B.foulAt = -Infinity;
    setBanner(null);
  }, []);

  useEffect(() => () => clearTimeout(ref.current.timer), []);

  const onMatchEvent = useCallback((type, data, who, so) => {
    const B = ref.current;
    switch (type) {
      case 'start':
      case 'resumed':
      case 'end':
        clear();
        break;
      case 'goal':
        // Tirs au but : le serveur n'envoie pas `goal` (le bandeau vient de `pen_end`)
        push(spectatorGoalBanner(data || {}, who), { urgent: true });
        break;
      case 'foul': {
        const pen = !!data?.pen;
        push(foulBanner(data || {}, who), { ms: pen ? LONG_MS : BANNER_MS });
        if (pen) B.foulAt = performance.now();
        break;
      }
      case 'penalty': {
        const s = data?.s === 1 ? 1 : 0;
        B.penS = s;
        if (performance.now() - B.foulAt <= FOUL_THEN_PENALTY_MS) break;
        const b = so
          ? { kind: 'penalty', title: 'Tir au but', sub: `${who[s].name} tire`, pos: penaltyPos(s) }
          : penaltyBanner(s, who);
        push(b, { ms: LONG_MS });
        break;
      }
      case 'pen_end': {
        const r = data?.r;
        const shooter = B.penS === 1 ? 1 : 0;
        // Tir au but réussi : le serveur n'envoie pas `goal` (phase `goal`, score du match inchangé)
        if (r === 'goal' && so) {
          push({ kind: 'so-goal', title: 'But !', sub: B.penS == null ? 'Tir au but réussi' : `${who[shooter].name} marque`, pos: 'mid' });
          break;
        }
        const b = penEndBanner(r, shooter, B.penS == null ? [{}, {}] : who);
        if (b) push(b);
        break;
      }
      case 'gold':
        push(GOLD_BANNER, { urgent: true });
        break;
      case 'shootout': {
        const first = data?.first;
        push({
          kind: 'shootout',
          title: 'Tirs au but',
          sub: '3 tirs chacun',
          sub2: first === 0 || first === 1 ? `${who[first].name} tire en premier` : null,
          pos: first === 0 || first === 1 ? penaltyPos(first) : 'mid',
        }, { ms: LONG_MS, urgent: true });
        B.foulAt = performance.now();
        break;
      }
      case 'ev': {
        // Deux événements annoncés à la même heure (l'arrosage avec un orage ou un gel) : un seul bandeau
        const e = data?.e;
        const first = eventBanner(e);
        if (!first) break;
        const same = (it) => !!it && it.kind === 'event' && Array.isArray(it.events) && it.an === Number(e.an);
        const into = same(B.current) ? B.current : B.queue.find(same);
        if (into) {
          const events = [...into.events, e];
          const merged = { ...into, ...eventsBanner(events), events };
          if (into === B.current) {
            B.current = merged;
            setBanner(merged);
          } else B.queue[B.queue.indexOf(into)] = merged;
        } else push({ ...first, events: [e], an: Number(e.an) });
        break;
      }
      default:
        break;
    }
  }, [clear, push]);

  return { banner, onMatchEvent, clear };
}
