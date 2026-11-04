import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Loader2, WifiOff } from 'lucide-react';
import { W, H } from '@/lib/coupe/engine';
import { createRenderer } from '@/lib/coupe/renderer';
import { createSound } from '@/lib/coupe/sound';
import { CHEERS, watchPawnText } from '@/lib/coupe/watch';
import GameStyles from '../game/GameStyles';
import StadiumStage from '../game/StadiumStage';
import { RulesBanner } from '../game/RulesHud';
import { useSecondsLeft } from '../game/hooks';
import { soGoals } from '../game/tournament';
import WatchStyles from './WatchStyles';
import { spectatorWho, useWatchBanners } from './banners';

/*
 * Match regardé (contrat docs/fonctions/coupe-spectateurs-contrat.md, section 4.1 ; planche
 * validée, écrans 13 et 14) : bande des scores, puis le stade et le terrain dessiné (renderer.js,
 * effets du règlement v2, bandeaux, réactions des spectateurs). Sert la page « Regarder un match »
 * (`variant="phone"`) et l'écran du salon (`variant="screen"` : muet, sans bouton, en grand).
 *
 *   <WatchStage match={sm} ui={ui} variant="phone" | "screen" className="…"
 *     scale={1} fallback={{ names, roles, sc, tour }} soundOn={bool} sound={bool} />
 *
 * `match` : un SpectatorMatch (src/lib/coupe/spectatorMatch.js), `ui` : son dernier `ui` (onChange).
 * `scale` (écran du salon, 1 par défaut) : échelle de la scène, posée en variable CSS (--cdgw-k) qui
 * multiplie les tailles de la variante écran (bande, pions, score, bandeaux, pause, pastilles,
 * bulles ; décision A4). `fallback` : noms, rôles, score (et tour) montrés tant que `ui.names` est
 * vide (ligne `live` de l'écran, avant le `wstart` ; décision A5). `soundOn` (page « Regarder ») : le
 * bouton Son de la page, appliqué aux bruitages.
 * Le parent donne la taille : WatchStage remplit son cadre (bande en haut, terrain dessous qui
 * garde ses proportions au milieu du stade). Repère du serveur : joueur 0 en bas en rouge, joueur 1
 * en haut en blanc ; pions aux initiales (`watchPawnText`), jamais une photo. Dans la bande, le
 * joueur du haut à gauche, celui du bas à droite (planche). Le canvas ne pose que les joueurs, le
 * ballon et les effets : noms et score sont dans la bande, la bannière du but est en HTML (celle
 * du dessin dit « TU MARQUES » au joueur du bas). `sound` (téléphone par défaut, jamais l'écran) :
 * bruitages du but et du sifflet selon le réglage du son de la Coupe, ni musique ni tribune.
 * Connexion perdue après un direct (`offline`, ou `connecting` d'un match déjà vu) : le dernier
 * score reste, pastille « Connexion perdue, on réessaie… » sur le terrain.
 */

const BUBBLE_MS = 1500;
const BUBBLE_LANES = 3;
const BUBBLE_MAX = BUBBLE_LANES * 2;
const ACTIVE = new Set(['live', 'paused']);
// Connexion perdue sur le réseau (pas un refus : session, autre appareil, mise à jour)
const NETWORK_ERRORS = new Set([null, undefined, 'lost', 'unreachable']);

/**
 * Bulle d'une réaction posée sur la première rangée libre de son côté (trois par côté, espacées :
 * deux bulles ne se recouvrent jamais) ; toutes prises : la plus ancienne de ce côté laisse sa place.
 */
export function placeBubble(list, item) {
  const side = list.filter((b) => b.at === item.at);
  const used = new Set(side.map((b) => b.lane));
  let lane = 0;
  while (lane < BUBBLE_LANES && used.has(lane)) lane += 1;
  let rest = list;
  if (lane >= BUBBLE_LANES) {
    const oldest = side[0];
    rest = list.filter((b) => b !== oldest);
    lane = oldest.lane;
  }
  return [...rest.slice(-(BUBBLE_MAX - 1)), { ...item, lane }];
}

/**
 * `ui` montré : celui du SpectatorMatch, et tant qu'il n'a pas de noms (avant `wstart`) ceux du
 * `fallback` (ligne `live` de l'écran du salon).
 */
export function shownUi(ui, fallback) {
  const u = ui || {};
  const has = Array.isArray(u.names) && (u.names[0] || u.names[1]);
  if (has || !fallback || !Array.isArray(fallback.names) || !(fallback.names[0] || fallback.names[1])) return u;
  return {
    ...u,
    names: fallback.names,
    roles: Array.isArray(fallback.roles) ? fallback.roles : [],
    sc: Array.isArray(fallback.sc) && fallback.sc.length === 2 ? fallback.sc : (u.sc || [0, 0]),
    tour: u.tour || (fallback.tour && typeof fallback.tour === 'object' ? fallback.tour : null),
  };
}

/** Titre du match de tournoi (« Quart 1 ») : `title` du serveur, sinon `label` (serveur plus ancien). */
export const tourTitleOf = (tour) => (tour ? String(tour.title || tour.label || '').trim() : '');

/** Pion d'un joueur : initiales (« DHB » pour le salon), rouge pour le joueur 0, blanc pour le joueur 1. */
export function WatchPawn({ name, role, side, className = '' }) {
  return (
    <span className={`cdgw-pawn ${className}`} data-side={side === 1 ? '1' : '0'} aria-hidden="true">
      {watchPawnText(name, role)}
    </span>
  );
}

function WarnDots({ n }) {
  const k = Math.max(0, Math.min(3, Number(n) || 0));
  if (!k) return null;
  return (
    <span className="cdgw-warn" aria-hidden="true">
      {Array.from({ length: k }, (_, i) => <i key={i} />)}
    </span>
  );
}

/**
 * Ligne sous le score : règle du match (« Quart 1 · Premier à 5 » pour un tournoi), penalty, but en
 * or, tirs au but, pause. Avant le premier `wstart` du match (`kind` vide), seulement le titre du
 * match de tournoi s'il est connu : la règle (« Premier à … ») n'est pas encore sûre.
 */
export function watchStatusLine(ui) {
  const names = ui?.names || [];
  if (!ui) return { text: '' };
  const title = tourTitleOf(ui.tour);
  const withTitle = (text) => (title ? `${title} · ${text}` : text);
  if (ui.status === 'unavailable' && ui.missed) return { text: 'Dernier score vu' };
  if (!ui.kind) return { text: title };
  if (ui.status === 'paused') return { text: 'Pause', tone: 'or' };
  if (ui.status === 'ended') return { text: 'Fin du match' };
  if (ui.so) return { text: `Tirs au but · ${soGoals(ui.so.shots?.[1])} – ${soGoals(ui.so.shots?.[0])}`, tone: 'or' };
  if (ui.mode === 'pen') return { text: `Penalty · ${names[ui.penS === 1 ? 1 : 0] || 'tir'}`, tone: 'or' };
  if (ui.mode === 'gold') return { text: 'But en or', tone: 'or' };
  if (ui.timeWarn) return { text: 'Dernières 30 s', tone: 'or' };
  if (ui.ph === 'goal') return { text: 'But !', tone: 'or' };
  if (ui.ph === 'count') return { text: withTitle('Coup d’envoi') };
  return { text: withTitle(`Premier à ${ui.gw || 3}`) };
}

/** Bande des scores : [joueur 1 (haut, blanc)] score [joueur 0 (bas, rouge)]. */
export function ScoreBand({ ui, warn = [0, 0] }) {
  const names = ui.names || [];
  const roles = ui.roles || [];
  const sc = Array.isArray(ui.sc) ? ui.sc : [0, 0];
  const line = watchStatusLine(ui);
  const top = names[1] || 'Joueur du haut';
  const bottom = names[0] || 'Joueur du bas';
  return (
    <div className="cdgw-band" role="group" aria-label="Score du match">
      <span className="cdgw-side">
        <WatchPawn name={names[1]} role={roles[1]} side={1} />
        <span className="cdgw-name">{top}</span>
        <WarnDots n={warn[1]} />
      </span>
      <span key={`${sc[0]}-${sc[1]}`} className="cdgw-score" data-pop={sc[0] + sc[1] > 0 ? '' : undefined} aria-hidden="true">
        {sc[1]} – {sc[0]}
      </span>
      <span className="cdgw-line" data-tone={line.tone || undefined}>{line.text}</span>
      <span className="cdgw-side cdgw-right">
        <WarnDots n={warn[0]} />
        <span className="cdgw-name">{bottom}</span>
        <WatchPawn name={names[0]} role={roles[0]} side={0} />
      </span>
      <p className="sr-only" aria-live="polite">{`Score : ${top} ${sc[1]}, ${bottom} ${sc[0]}`}</p>
    </div>
  );
}

/** Pause : un joueur s'est déconnecté, il a quelques secondes pour revenir. */
function PauseNotice({ name, until }) {
  const left = useSecondsLeft(until);
  return (
    <div className="cdg-float" role="status">
      <strong>Un joueur s&apos;est déconnecté</strong>
      <span>{until ? `${name || 'Il'} a ${left} s pour revenir` : 'Le match reprend à son retour'}</span>
    </div>
  );
}

export default function WatchStage({
  match, ui: rawUi, variant = 'phone', className = '', sound: soundProp, soundOn, scale = 1, fallback = null,
}) {
  const screen = variant === 'screen';
  const withSound = soundProp ?? !screen;
  const ui = shownUi(rawUi, fallback);
  const k = Number.isFinite(Number(scale)) && Number(scale) > 0 ? Math.min(8, Math.max(0.25, Number(scale))) : 1;
  const reduceMotion = useReducedMotion();
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const soundRef = useRef(null);
  const matchRef = useRef(match);
  matchRef.current = match;
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const loopRef = useRef({ raf: 0, last: 0, step: null });
  const bubbleSeq = useRef({ n: 0, side: 0 });
  const [stadium, setStadium] = useState('loading');
  const [bubbles, setBubbles] = useState([]);
  const [warn, setWarn] = useState([0, 0]);
  const warnRef = useRef([0, 0]);
  const { banner, onMatchEvent, clear } = useWatchBanners();
  const reduceRef = useRef(!!reduceMotion);
  reduceRef.current = !!reduceMotion;

  // ─── Dessin et boucle (une image par frame, seulement quand le match bouge) ───
  useEffect(() => {
    let r = null;
    try {
      r = createRenderer(canvasRef.current, { reducedMotion: !!reduceRef.current });
    } catch {
      r = null; // canvas indisponible : la bande et les bandeaux restent
    }
    rendererRef.current = r;
    const L = loopRef.current;
    L.step = () => {
      L.raf = 0;
      const m = matchRef.current;
      const rd = rendererRef.current;
      if (!m || !rd) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0, (now - L.last) / 1000));
      L.last = now;
      let f = null;
      try { f = m.getFrame(); } catch { f = null; }
      try { rd.render(f, dt); } catch { /* image ratée : la suivante */ }
      // Avertissements (règlement v2) : la bande suit l'image, rendu seulement quand ils changent
      if (f && f.rules === 2 && Array.isArray(f.warn)) {
        const w = warnRef.current;
        if (w[0] !== f.warn[0] || w[1] !== f.warn[1]) {
          warnRef.current = [f.warn[0], f.warn[1]];
          setWarn(warnRef.current);
        }
      }
      const st = m.ui?.status;
      let busy = false;
      try { busy = rd.busy(); } catch { busy = false; }
      if (ACTIVE.has(st) || (st === 'connecting' && f) || busy) L.raf = requestAnimationFrame(L.step);
    };
    return () => {
      cancelAnimationFrame(L.raf);
      L.raf = 0;
      L.step = null;
      try { r?.destroy(); } catch { /* déjà détruit */ }
      rendererRef.current = null;
    };
  }, []);

  const kick = useCallback(() => {
    const L = loopRef.current;
    if (L.raf || !L.step) return;
    L.last = performance.now();
    L.raf = requestAnimationFrame(L.step);
  }, []);

  useEffect(() => { kick(); }, [kick, ui?.status, ui?.reconnecting, match]);

  useEffect(() => {
    try { rendererRef.current?.setReducedMotion(!!reduceMotion); } catch { /* sans effet */ }
  }, [reduceMotion]);

  useEffect(() => {
    try { rendererRef.current?.setStadium(stadium === 'on'); } catch { /* sans effet */ }
    kick();
  }, [stadium, kick]);

  // Pions aux initiales, jamais de photo ; noms et cadre du score retirés du canvas (dans la bande)
  const n0 = ui?.names?.[0] || '';
  const n1 = ui?.names?.[1] || '';
  const r0 = ui?.roles?.[0] || 'user';
  const r1 = ui?.roles?.[1] || 'user';
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    try {
      r.setPlayers([
        { name: n0, role: r0, tag: watchPawnText(n0, r0), photo: null },
        { name: n1, role: r1, tag: watchPawnText(n1, r1), photo: null },
      ]);
      r.clearPlayers();
    } catch { /* sans effet */ }
    kick();
  }, [n0, n1, r0, r1, kick]);

  // ─── Sons (téléphone) : but et sifflet, débloqués par un geste sur la page ───
  useEffect(() => {
    if (!withSound) return undefined;
    let s = null;
    try { s = createSound(); } catch { s = null; }
    soundRef.current = s;
    const prime = () => { try { s?.unlock(); } catch { /* son indisponible */ } };
    const opts = { capture: true, passive: true };
    document.addEventListener('click', prime, opts);
    document.addEventListener('touchend', prime, opts);
    document.addEventListener('keydown', prime, opts);
    return () => {
      document.removeEventListener('click', prime, opts);
      document.removeEventListener('touchend', prime, opts);
      document.removeEventListener('keydown', prime, opts);
      try { s?.close(); } catch { /* déjà fermé */ }
      soundRef.current = null;
    };
  }, [withSound]);

  // Bouton Son de la page (réglage du son de la Coupe, `cdg-sound`) : appliqué aux bruitages
  useEffect(() => {
    if (soundOn === undefined || soundOn === null) return;
    try { soundRef.current?.setEnabled(!!soundOn); } catch { /* son indisponible */ }
  }, [soundOn, withSound]);

  // ─── Événements du match : bandeaux, étincelles, sons, bulles des réactions ───
  useEffect(() => {
    if (!match || typeof match.subscribe !== 'function') return undefined;
    const sfx = (name) => { try { soundRef.current?.fx(name); } catch { /* silence */ } };
    const removeLater = (id) => setTimeout(() => setBubbles((list) => list.filter((b) => b.id !== id)), BUBBLE_MS);
    const timers = new Set();
    const off = match.subscribe((type, data) => {
      const u = uiRef.current || match.ui;
      const who = spectatorWho(u?.names);
      onMatchEvent(type, data, who, !!u?.so);
      const r = rendererRef.current;
      switch (type) {
        case 'start':
          try { r?.reset(); } catch { /* sans effet */ }
          warnRef.current = [0, 0];
          setWarn(warnRef.current);
          kick();
          break;
        case 'resumed':
          kick();
          break;
        case 'kickoff':
        case 'penalty':
          try { r?.resetTrail(); } catch { /* sans effet */ }
          if (type === 'penalty') sfx('penalty');
          break;
        case 'goal': {
          // Étincelles au fond de la cage (comme la bannière du dessin, sans son texte)
          const scorer = data?.scorer === 1 ? 1 : 0;
          try { r?.burst(W / 2, scorer === 0 ? 0 : H, reduceRef.current ? 10 : 26, true); } catch { /* sans effet */ }
          try { soundRef.current?.goal(); } catch { /* silence */ }
          if (Number(data?.value) === 2) sfx('goal2');
          kick();
          break;
        }
        case 'pen_end':
          if (data?.r === 'goal' && u?.so) {
            try { soundRef.current?.goal(); } catch { /* silence */ }
          }
          break;
        case 'foul':
          // Faute avec penalty : le son du penalty siffle déjà
          if (!data?.pen) sfx('whistle');
          break;
        case 'shootout':
        case 'end':
          sfx('whistle');
          break;
        case 'cheer': {
          const rr = Number(data?.r);
          if (!Number.isInteger(rr) || !CHEERS[rr]) break;
          const S = bubbleSeq.current;
          S.n += 1;
          const mine = !!data?.mine;
          // Les autres en alternance à gauche et à droite, la sienne à droite ; trois rangées par côté
          let at = 'right';
          if (!mine) {
            S.side = 1 - S.side;
            at = S.side ? 'left' : 'right';
          }
          const item = { id: S.n, text: CHEERS[rr], mine, at, lane: 0 };
          setBubbles((list) => placeBubble(list, item));
          const id = removeLater(item.id);
          timers.add(id);
          break;
        }
        default:
          break;
      }
    });
    return () => {
      off();
      timers.forEach((id) => clearTimeout(id));
      clear();
    };
  }, [match, onMatchEvent, clear, kick]);

  const status = ui?.status;
  const active = ACTIVE.has(status) || status === 'ended';
  const away = status === 'paused' ? ui?.away : null;
  const label = `Le match en direct, vu d’en haut : ${n1 || 'un joueur'} en haut, ${n0 || 'un joueur'} en bas`;
  // Connexion perdue après un direct : le dernier score reste à l'écran (décision A5). L'écran du
  // salon réessaie seul ; la page « Regarder » réessaie pendant `connecting`, propose « Réessayer » après
  let lostText = null;
  if (!(ui?.reconnecting && active)) {
    if (status === 'offline' && NETWORK_ERRORS.has(ui?.error) && (ui?.kind || ui?.names?.[0] || ui?.names?.[1])) {
      lostText = screen ? 'Connexion perdue, on réessaie…' : 'Connexion perdue';
    } else if (status === 'connecting' && ui?.kind) lostText = 'Connexion perdue, on réessaie…';
  }

  return (
    <div
      className={`cdg-root cdgw-root ${className}`}
      data-variant={screen ? 'screen' : 'phone'}
      data-cam="pitch"
      data-play="1"
      data-stadium={stadium}
      style={screen ? { '--cdgw-k': k } : undefined}
    >
      <GameStyles />
      <WatchStyles />
      <ScoreBand ui={ui} warn={warn} />
      <div className="cdg-stage">
        <StadiumStage onReady={() => setStadium('on')} onFail={() => setStadium('off')} />
        <canvas ref={canvasRef} className="cdg-canvas" role="img" aria-label={label} />
        {active && <RulesBanner banner={banner} />}
        <div className="cdgw-bubbles" aria-hidden="true">
          {bubbles.map((b) => (
            <span key={b.id} className="cdgw-bubble" data-at={b.at} data-lane={b.lane} data-mine={b.mine ? '' : undefined}>
              {b.text}
            </span>
          ))}
        </div>
        {away && <PauseNotice name={ui?.names?.[away.side]} until={away.until} />}
        {status === 'paused' && !away && <PauseNotice name={null} until={null} />}
        {ui?.reconnecting && active && (
          <div className="cdgw-chip" role="status">
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Reconnexion…
          </div>
        )}
        {lostText && (
          <div className="cdgw-chip" role="status" data-lost="">
            {lostText.endsWith('…')
              ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              : <WifiOff aria-hidden="true" />}
            {lostText}
          </div>
        )}
      </div>
    </div>
  );
}
