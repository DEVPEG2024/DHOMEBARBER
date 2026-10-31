import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Smartphone, Timer } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useAndroidBack } from '@/lib/useAndroidBack';
import { H, LEVELS, GOALS_TO_WIN, GOALS_TO_WIN_V2 } from '@/lib/coupe/engine';
import { createRenderer, isSalonRole } from '@/lib/coupe/renderer';
import { createSound, buzz } from '@/lib/coupe/sound';
import { OnlineMatch, IDLE_UI, photoUrlOrNull, readPendingResume } from '@/lib/coupe/onlineMatch';
import { LocalMatch } from '@/lib/coupe/localMatch';
import { fingerOffset } from '@/lib/coupe/finger';
import {
  COUPE_ENABLED_KEY, fetchCoupeEnabled, invalidateCoupe, readCoupeRulesV2, useCoupeMusic,
} from '@/lib/coupe/coupeApi';
import { COUPE_PAUSED_TEXT } from './coupeErrors';
import GameStyles from './game/GameStyles';
import Panel from './game/Panel';
import { GameHud, Reactions, REACTIONS } from './game/Hud';
import WaitingRoom from './game/WaitingRoom';
import ChallengeReceived from './game/ChallengeReceived';
import EndScreen, { endTexts } from './game/EndScreen';
import ReportSheet from './game/ReportSheet';
import BlockSheet from './game/BlockSheet';
import { StoryFallback, useScoreStoryShare } from './game/StoryShare';
import StadiumStage, { createStadiumDirector } from './game/StadiumStage';
import MatchIntro from './game/MatchIntro';
import { offlinePlayers, onlinePlayers, seasonLabel, shownName } from './game/format';
import { useMediaQuery, useSalonMusicPaused, useSecondsLeft, useTyping, useWakeLock } from './game/hooks';
import { RulesBanner, RulesBar } from './game/RulesHud';
import {
  EVENT_NAMES, GOLD_BANNER, TIPS, eventBanner, eventsBanner, foulBanner, goalBanner, penEndBanner, penaltyBanner,
} from './game/rulesV2';

/*
 * Écran de jeu de La Coupe du Gang (contrat : docs/fonctions/coupe-du-gang-contrat.md, section 5.1).
 *
 *   <CoupeGame
 *     mode="online" | "bot" | "local"
 *     level="apprenti" | "barber" | "boss"          // mode "bot"
 *     action={{ t: 'create' } | { t: 'join', code } | { t: 'defi', link } | { t: 'challenge', employeeId }
 *             | { t: 'challenge', keyHash } | { t: 'resume' }}   // keyHash : un joueur de la liste « Défier un joueur »
 *     onExit={() => …}                              // croix, « Retour », « Annuler », abandon
 *     onFinished={(result) => …}                    // fin d'un match : relire points et classement
 *   />
 *
 * Plein écran (au-dessus de tout), sombre quel que soit le thème, sans défilement. Un seul
 * composant pour les trois modes : en ligne (connexion, salle d'attente, défi reçu, match, fin,
 * Signaler / Bloquer), contre le salon et à deux sur un téléphone (sans réseau, sans points).
 * `action` et le mode sont lus au montage : pour une autre partie, monter un nouvel écran (`key`).
 * `diagnostic` (écran d'essai /coupe-test) : ping, recalages et frappes refusées sous la barre.
 *
 * En ligne, quitter l'écran en plein match n'est pas un abandon (OnlineMatch.destroy) : un match
 * quitté il y a moins de 10 s est repris au montage suivant, quelle que soit l'action (`resume`
 * sert au bouton « Reprendre » de l'accueil de la Coupe).
 *
 * Le dessin, les sons et le code de match vivent dans src/lib/coupe/ ; cet écran les relie et ne
 * dessine que pendant un match (aucune image quand rien ne bouge). La musique du salon est en pause
 * tant qu'il est affiché.
 *
 * Thème stade (docs/fonctions/coupe-du-gang-stade.md) : l'image du stade est le terrain
 * (StadiumStage), le canvas y pose joueurs, ballon et score. La caméra (stade entier ou terrain)
 * est pilotée par les images du match (createStadiumDirector, attributs de la racine) : avant-match
 * au premier coup d'envoi (stade entier et affiche VS, zoom, puis le terrain), fin du match en trois
 * temps (« FIN DU MATCH », zoom arrière, écran de fin). Le canvas n'est jamais transformé.
 *
 * `onFinished(result)` : { mode, won, winner (0 toi / joueur du bas, 1 l'autre), draw, score
 * [bas, haut], forfeit, cancelled, reason, points (en ligne : { ranked, reason, delta, total, rank,
 * rankBefore, oppDelta } ou null = pas encore confirmés), abandoned (tu as abandonné) }.
 */

const LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 500px)';

// Fin du match (thème stade) : « FIN DU MATCH » 0,8 s sur le terrain, zoom arrière 1,1 s, puis
// l'écran de fin ; mouvement réduit : coupe nette, écran de fin à 450 ms (comme avant le thème)
const FIN_MS = 800;
const PULL_BACK_MS = 1100;
const QUICK_END_MS = 450;
// Sortie de l'affiche VS et de « FIN DU MATCH » (animations de GameStyles) avant de les démonter
const FX_OUT_MS = 400;

const later = (set, fn, ms) => {
  const id = setTimeout(() => { set.delete(id); fn(); }, ms);
  set.add(id);
  return id;
};

// Aucun doigt posé : camp de chaque doigt, écart doigt → joueur fixé quand il s'est posé, doigt qui
// mène chaque camp
const noPointers = () => ({ map: new Map(), offsets: new Map(), active: [null, null] });

// ─── Règlement v2 (docs/fonctions/coupe-du-gang-regles-v2-contrat.md, sections 6 et 8) ──────────

// Bandeaux : un à la fois, ~1,4 s ; une faute suivie d'un penalty reste 1,6 s (le temps que les
// joueurs se placent, 1,8 s : le bandeau ne cache jamais le début du tir) ; deux en attente au plus
const BANNER_MS = 1400;
const FOUL_BANNER_MS = 1600;
const BANNER_QUEUE = 2;
// Le penalty annoncé dans le bandeau de sa faute n'a pas le sien
const FOUL_THEN_PENALTY_MS = 800;
// Astuce « camper » : à partir de 1,5 s d'affilée dans sa grande surface (faute à 3 s)
const CAMP_TIP_S = 1.5;
// Hors ligne : règlement lu au lancement, attendu au plus 1,5 s (sinon la règle d'aujourd'hui)
const RULES_WAIT_MS = 1500;

const count = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** Bande du règlement v2 au coup d'envoi (avant la première image du match). */
function rulesAtStart(data) {
  if (data?.rules !== 2) return null;
  const gw = Number(data.goalsToWin) > 0 ? Math.round(Number(data.goalsToWin)) : GOALS_TO_WIN_V2;
  return { gw, warn: [0, 0], mode: null, penS: null, digit: null, shot: false, goldLeft: null, event: null, hasNext: false };
}

/**
 * Événements d'une image, lus une fois par image et sans tableau nouveau : sortes de ceux annoncés
 * ou en cours (`an` ≤ now < `until`), « storm+water » pour deux à la fois (l'arrosage avec un orage
 * ou un gel, `makeEvents`, mêmes heures), et celui qui finit le plus tard (jauge). `out` est réutilisé.
 */
function scanEvents(f, out) {
  out.kinds = null;
  out.longest = null;
  const now = Number(f?.now);
  const evs = f?.events;
  if (!Array.isArray(evs) || !Number.isFinite(now)) return out;
  for (let i = 0; i < evs.length; i += 1) {
    const e = evs[i];
    if (!e || !EVENT_NAMES[e.k] || now < Number(e.an) || now >= Number(e.until)) continue;
    out.kinds = out.kinds ? `${out.kinds}+${e.k}` : e.k;
    if (!out.longest || Number(e.until) > Number(out.longest.until)) out.longest = e;
  }
  return out;
}

/**
 * Ce que la bande du règlement v2 affiche, lu dans une image du match, écrit dans `into` (réutilisé
 * d'une image à l'autre). Seulement des valeurs qui changent quelques fois par seconde au plus : la
 * boucle ne rend React (avec une copie) que quand l'une d'elles change.
 */
function readRules(f, scan, into) {
  const mode = f.mode && typeof f.mode === 'object' ? f.mode : null;
  const pen = mode?.k === 'pen';
  const gold = mode?.k === 'gold';
  const left = Number(mode?.left);
  const next = f.nextEvent;
  into.gw = Number(f.goalsToWin) > 0 ? Math.round(Number(f.goalsToWin)) : GOALS_TO_WIN_V2;
  into.warn[0] = count(f.warn?.[0]);
  into.warn[1] = count(f.warn?.[1]);
  into.mode = pen || f.phase === 'pen' ? 'pen' : gold ? 'gold' : null;
  into.penS = pen ? (mode.s === 1 ? 1 : 0) : null;
  into.digit = pen && left > 0 ? Math.min(9, Math.ceil(left)) : null;
  into.shot = pen && left < 0;
  into.goldLeft = gold && Number.isFinite(left) ? Math.max(0, Math.ceil(left)) : null;
  into.event = pen || gold ? null : scan.kinds;
  into.hasNext = !!(next && Number(next.total) > 0);
  return into;
}

const sameRules = (a, b) => (a === b) || (!!a && !!b && a.gw === b.gw && a.warn[0] === b.warn[0] && a.warn[1] === b.warn[1]
  && a.mode === b.mode && a.penS === b.penS && a.digit === b.digit && a.shot === b.shot && a.goldLeft === b.goldLeft
  && a.event === b.event && a.hasNext === b.hasNext);

/** L'adversaire s'est déconnecté : « Kevin s'est déconnecté : 8 s ». */
function AwayNotice({ name, until }) {
  const left = useSecondsLeft(until);
  return (
    <div className="cdg-float" role="status">
      <strong>{name} s&apos;est déconnecté : {left} s</strong>
      <span>Victoire par forfait s&apos;il ne revient pas à temps.</span>
    </div>
  );
}

export default function CoupeGame({
  mode = 'online',
  level = 'barber',
  action = null,
  onExit,
  onFinished,
  diagnostic = false,
}) {
  const online = mode !== 'bot' && mode !== 'local';
  const isLocal = mode === 'local';
  const lvl = LEVELS[level] ? level : 'barber';
  const reduceMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Ta photo sur ton pion contre le salon (client seulement) ; en ligne, le serveur envoie les photos
  const myPhoto = user?.role === 'user' ? photoUrlOrNull(user?.photo_url) : null;
  const myPhotoRef = useRef(myPhoto);
  myPhotoRef.current = myPhoto;
  const landscape = useMediaQuery(LANDSCAPE_QUERY);
  // Clavier ouvert (fiche « Signaler ») : la fenêtre rétrécie n'est pas un téléphone tourné
  const typing = useTyping();
  const rotate = landscape && !typing;

  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const soundRef = useRef(null);
  // Musique de tribune : à partir du premier coup d'envoi, jusqu'à la sortie de l'écran ; permise par
  // le serveur (COUPE_MUSIC=off la coupe partout sans nouveau build)
  const musicOk = useCoupeMusic();
  const matchRef = useRef(null);
  const loopRef = useRef({ raf: 0, last: 0, statT: 0, timeLeft: null });
  const kickRef = useRef(() => {});
  // Doigts posés : id → camp ; le dernier posé de chaque camp mène son joueur
  const pointersRef = useRef(noPointers());
  const timersRef = useRef(new Set());
  const taughtRef = useRef(false);
  const propsRef = useRef({ onExit, onFinished, action });
  propsRef.current = { ...propsRef.current, onExit, onFinished };
  // Caméra du stade (StadiumStage) : pilotée par la boucle, sans état React par image
  const directorRef = useRef(null);
  // Minuteries de la fin du match (« FIN DU MATCH », zoom arrière, écran de fin) : annulées par un
  // nouveau match ou une sortie du match
  const outroRef = useRef([]);
  // Astuce du premier match, montrée quand le terrain apparaît (après l'avant-match)
  const firstHintRef = useRef(null);
  const reduceRef = useRef(!!reduceMotion);
  reduceRef.current = !!reduceMotion;

  const [ui, setUi] = useState(() => ({ ...IDLE_UI, status: 'connecting' }));
  const [off, setOff] = useState({ status: 'match', result: null, paused: false });
  const [score, setScore] = useState([0, 0]);
  const [hint, setHint] = useState(null);
  const [bubbles, setBubbles] = useState([]);
  const [endShown, setEndShown] = useState(false);
  const [reactLocked, setReactLocked] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  // Tribune lancée (premier coup d'envoi ou reprise d'un match) : elle joue jusqu'à la sortie de
  // l'écran. Avant (connexion, salle d'attente, défi reçu), le chant de l'accueil continue
  const [tribuneOn, setTribuneOn] = useState(false);
  useSalonMusicPaused(tribuneOn || !soundOn);
  const [net, setNet] = useState({ ping: null, recalages: 0, refusees: 0 });
  const [timeLeft, setTimeLeft] = useState(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [sheet, setSheet] = useState(null); // 'report' | 'block'
  const [blocked, setBlocked] = useState(false);
  const [reported, setReported] = useState(false);
  // Image du stade : 'loading', 'on' (chargée : le dessin ne pose plus son terrain), 'off' (en erreur)
  const [stadium, setStadiumStatus] = useState('loading');
  // Affiche VS ('vs', puis 'vs-out' le temps de sa sortie) ou « FIN DU MATCH » ('fin', 'fin-out')
  const [fx, setFx] = useState(null);
  // Règlement v2 : bande du match (null = règle d'aujourd'hui), bandeau affiché, jauge du prochain
  // événement (remplie par la boucle) ; règlement et tireur du match en cours ; astuces déjà vues
  const [rulesUi, setRulesUi] = useState(null);
  const rulesUiRef = useRef(null);
  const [banner, setBanner] = useState(null);
  const bannersRef = useRef({ seq: 0, queue: [], current: null, shownAt: 0, timer: 0, foulAt: -Infinity });
  const gaugeRef = useRef(null);
  const gaugeFracRef = useRef(-1);
  const matchRulesRef = useRef({ rules: 1, penS: 0 });
  const tipsRef = useRef(new Set());
  // Pause hors ligne demandée pendant que le règlement se lit (le match n'existe pas encore)
  const offPausedRef = useRef(false);

  const status = online ? ui.status : off.status;
  const opponent = online ? (ui.names[1] || 'Adversaire') : offlinePlayers(mode, lvl)[1].name;

  // `pos` : 'bottom' pose l'astuce en bas du terrain (penalty tiré vers la cage du haut)
  const showHint = useCallback((msg, pos = null) => {
    const id = Date.now() + Math.random();
    setHint({ id, msg, pos });
    later(timersRef.current, () => setHint((h) => (h?.id === id ? null : h)), 2400);
  }, []);

  /** Astuce du règlement v2, une fois par écran de jeu. */
  const tip = useCallback((key, msg, pos = null) => {
    if (!msg || tipsRef.current.has(key)) return;
    tipsRef.current.add(key);
    showHint(msg, pos);
  }, [showHint]);

  // Bandeaux : un à la fois ; `urgent` (but, but en or) passe devant tout et vide la file
  const showBannerNow = useCallback((item) => {
    const B = bannersRef.current;
    const timers = timersRef.current;
    if (B.timer) { clearTimeout(B.timer); timers.delete(B.timer); }
    B.current = item;
    B.shownAt = performance.now();
    setBanner(item);
    B.timer = later(timers, () => {
      B.timer = 0;
      B.current = null;
      const next = B.queue.shift();
      if (next) showBannerNow(next);
      else setBanner(null);
    }, item.ms);
  }, []);

  const pushBanner = useCallback((b, { ms = BANNER_MS, urgent = false } = {}) => {
    if (!b) return;
    const B = bannersRef.current;
    B.seq += 1;
    const item = { ...b, id: B.seq, ms };
    if (urgent) B.queue = [];
    if (B.current && !urgent) {
      B.queue.push(item);
      if (B.queue.length > BANNER_QUEUE) B.queue.shift();
      return;
    }
    showBannerNow(item);
  }, [showBannerNow]);

  const clearBanners = useCallback(() => {
    const B = bannersRef.current;
    if (B.timer) { clearTimeout(B.timer); timersRef.current.delete(B.timer); }
    B.timer = 0;
    B.queue = [];
    B.current = null;
    B.foulAt = -Infinity;
    setBanner(null);
  }, []);

  /** Bande du règlement v2 posée seulement quand une valeur affichée change. */
  const applyRules = useCallback((next) => {
    if (sameRules(rulesUiRef.current, next)) return;
    rulesUiRef.current = next;
    setRulesUi(next);
  }, []);

  const clearOutro = useCallback(() => {
    const timers = timersRef.current;
    outroRef.current.forEach((id) => {
      clearTimeout(id);
      timers.delete(id);
    });
    outroRef.current = [];
  }, []);

  // ─── Montage : dessin, sons, match et boucle d'animation ──────────

  useEffect(() => {
    const timers = timersRef.current;
    let unmounted = false;
    const sound = createSound();
    soundRef.current = sound;
    setSoundOn(sound.isEnabled());
    const renderer = createRenderer(canvasRef.current, { reducedMotion: !!reduceMotion });
    rendererRef.current = renderer;
    renderer.setTwoPlayers(isLocal);
    const L = loopRef.current;
    const director = createStadiumDirector(rootRef.current, {
      reducedMotion: !!reduceMotion,
      // Affiche VS : montée au début de l'avant-match, retirée (après sa sortie) au début du zoom
      onIntro: (on) => {
        if (on) { setFx('vs'); return; }
        setFx((v) => (v === 'vs' ? 'vs-out' : v));
        later(timers, () => setFx((v) => (v === 'vs-out' ? null : v)), reduceRef.current ? 0 : FX_OUT_MS);
      },
      // Le terrain apparaît : l'astuce du premier match (« Ton joueur suit ton doigt »)
      onPlay: () => {
        const msg = firstHintRef.current;
        firstHintRef.current = null;
        if (msg) showHint(msg);
      },
    });
    directorRef.current = director;

    // Règlement v2 : la bande suit l'image du match (rendu React seulement quand un chiffre affiché
    // change), la jauge du prochain événement est remplie ici, l'astuce « camper » part d'ici
    // Lecture d'une image réutilisée d'une image à l'autre (aucun objet nouveau tant que rien ne change)
    const scan = { kinds: null, longest: null };
    const scratch = rulesAtStart({ rules: 2 });
    const rulesTick = (f) => {
      if (!f) return;
      if (f.rules !== 2) { applyRules(null); return; }
      scanEvents(f, scan);
      const next = readRules(f, scan, scratch);
      const prev = rulesUiRef.current;
      // Compte du penalty (3, 2, 1) : un bip à chaque seconde du tir
      if (next.mode === 'pen' && f.phase === 'live' && next.digit != null && prev?.digit != null && next.digit !== prev.digit) sound.blip();
      if (!sameRules(prev, next)) applyRules({ ...next, warn: [next.warn[0], next.warn[1]] });
      matchRulesRef.current.rules = 2;
      if (next.penS != null) matchRulesRef.current.penS = next.penS;
      // Jauge : temps qui reste à l'événement en cours (pleine pendant son annonce ; plusieurs à la
      // fois : celui qui finit le plus tard), sinon avant l'annonce du prochain
      const el = gaugeRef.current;
      if (el) {
        let frac = null;
        const e = next.event ? scan.longest : null;
        if (e) frac = Number(f.now) < Number(e.at) ? 1 : (Number(e.until) - Number(f.now)) / Math.max(1, Number(e.until) - Number(e.at));
        else if (f.nextEvent && Number(f.nextEvent.total) > 0) frac = Number(f.nextEvent.left) / Number(f.nextEvent.total);
        if (frac != null && Number.isFinite(frac)) {
          frac = Math.max(0, Math.min(1, frac));
          if (Math.abs(frac - gaugeFracRef.current) > 0.002) {
            gaugeFracRef.current = frac;
            el.style.transform = `scaleX(${frac.toFixed(3)})`;
          }
        }
      }
      const c = f.camp;
      if (Array.isArray(c) && (Number(c[0]) >= CAMP_TIP_S || (isLocal && Number(c[1]) >= CAMP_TIP_S))) {
        tip('camp', isLocal ? TIPS.campLocal : TIPS.camp);
      }
    };

    const shouldRun = () => {
      const m = matchRef.current;
      if (!m || !rendererRef.current) return false;
      if (rendererRef.current.busy()) return true;
      if (online) return m.ui.status === 'match';
      return m.started && !m.paused && m.phase !== 'over';
    };
    const frame = () => {
      L.raf = 0;
      const m = matchRef.current;
      const r = rendererRef.current;
      if (!m || !r) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0, (now - L.last) / 1000));
      L.last = now;
      m.update(dt);
      const f = m.getFrame();
      r.render(f, dt);
      const root = rootRef.current;
      if (root && f && root.dataset.phase !== f.phase) root.dataset.phase = f.phase;
      // Caméra et canvas : attributs de la racine, posés seulement quand ils changent
      director.frame(f, now);
      rulesTick(f);
      // Temps de jeu restant (après `time_left` ; hors ligne, seulement en règlement v2, qui a les
      // 5 minutes du serveur) : un rendu par seconde affichée, pas par image
      const left = f && f.timeLeft != null ? f.timeLeft : null;
      if (left !== L.timeLeft) {
        L.timeLeft = left;
        setTimeLeft(left);
      }
      if (online) {
        L.statT += dt;
        if (L.statT >= 0.25) {
          L.statT = 0;
          const s = m.stats();
          setNet((p) => (p.ping === s.ping && p.recalages === s.recalages && p.refusees === s.refusees ? p : s));
        }
        // Score du serveur (états, reprise) : le texte lu par les lecteurs d'écran le suit
        if (f && Array.isArray(f.score)) {
          const [a, b] = f.score;
          setScore((p) => (p[0] === a && p[1] === b ? p : [a, b]));
        }
      }
      if (shouldRun()) L.raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (L.raf) return;
      L.last = performance.now();
      L.raf = requestAnimationFrame(frame);
    };
    kickRef.current = kick;

    const resetPointers = () => {
      pointersRef.current = noPointers();
    };

    // Règlement v2 : les deux joueurs pour les textes des bandeaux (repère local : [bas, haut])
    const whoNow = () => {
      if (isLocal) {
        return [{ name: 'Le joueur du bas', obj: 'le joueur du bas' }, { name: 'Le joueur du haut', obj: 'le joueur du haut' }];
      }
      // Contre le salon : le nom de son pion et de la bande (« Boss »), partout le même
      if (!online) return [{ name: 'Toi', me: true }, { name: LEVELS[lvl].name, obj: LEVELS[lvl].name }];
      const n = matchRef.current?.ui?.names?.[1] || null;
      return [{ name: 'Toi', me: true }, n ? { name: n, obj: n } : { name: 'L’adversaire', obj: 'l’adversaire' }];
    };
    // Bruitages du règlement v2 (sound.js) : jamais d'erreur, rien sur un dessin plus ancien
    const sfx = (name) => {
      try { if (typeof sound.fx === 'function') sound.fx(name); } catch { /* son indisponible */ }
    };
    const eventSound = (kind) => {
      try { if (typeof sound.event === 'function') sound.event(kind); } catch { /* son indisponible */ }
    };
    // Règlement du match qui commence (ou reprend) : la bande, ou rien (règle d'aujourd'hui)
    const setMatchRules = (data, { keep = false } = {}) => {
      const v2 = data?.rules === 2;
      matchRulesRef.current = { rules: v2 ? 2 : 1, penS: keep ? matchRulesRef.current.penS : 0 };
      if (keep && v2 && rulesUiRef.current) return;
      const next = rulesAtStart(data);
      rulesUiRef.current = next;
      gaugeFracRef.current = -1;
      setRulesUi(next);
    };

    const onEvent = (type, data) => {
      switch (type) {
        case 'start': {
          renderer.setPlayers(online ? onlinePlayers(data.names, data.roles, data.photos) : offlinePlayers(mode, lvl, myPhotoRef.current));
          renderer.reset();
          sound.blip();
          resetPointers();
          setEndShown(false);
          setScore([0, 0]);
          setConfirmQuit(false);
          setSheet(null);
          setMatchRules(data);
          clearBanners();
          if (!online) {
            setOff({ status: 'match', result: null, paused: false });
            L.timeLeft = null;
            setTimeLeft(null);
          }
          // Nouveau match (revanche comprise) : plus rien de la fin du précédent ; l'avant-match se
          // décide sur les premières images (`countS`)
          clearOutro();
          setFx(null);
          director.newMatch();
          sound.music(true);
          setTribuneOn(true);
          // L'astuce attend le terrain (après l'avant-match), sinon personne ne la verrait
          if (!taughtRef.current) {
            taughtRef.current = true;
            firstHintRef.current = isLocal ? 'Chacun pose le doigt sur son joueur' : 'Pose ton doigt sur ton joueur';
          }
          kick();
          break;
        }
        case 'resumed':
          // Reprise après une coupure, ou match repris en rouvrant l'écran : mêmes joueurs, score du
          // serveur, caméra directement sur le terrain
          renderer.setPlayers(onlinePlayers(data.names, data.roles, data.photos));
          resetPointers();
          if (Array.isArray(data.score)) setScore(data.score);
          setMatchRules(data, { keep: true });
          clearBanners();
          clearOutro();
          setFx(null);
          director.resume();
          sound.music(true);
          setTribuneOn(true);
          showHint('Connexion rétablie');
          kick();
          break;
        case 'kickoff':
          renderer.resetTrail();
          break;
        case 'hit':
          sound.hit(data.v);
          renderer.hit(data.v, data.x, data.y);
          if (data.mine) buzz(data.v > 600 ? 'medium' : 'light');
          break;
        case 'wall':
          sound.wall(data);
          break;
        case 'post':
          sound.post();
          break;
        case 'goal': {
          // Règlement v2 : valeur (1 ou 2) et effet du ballon au franchissement, pour le dessin
          renderer.goal(data.scorer, { value: data.value, fx: data.fx });
          sound.goal();
          buzz('goal');
          setScore(data.score);
          if (matchRulesRef.current.rules === 2) {
            if (Number(data.value) === 2) sfx('goal2');
            // Jamais un bandeau sous la bannière « BUT ! » du dessin : la file est vidée
            const b = goalBanner(data, whoNow());
            if (b) pushBanner(b, { urgent: true });
            else clearBanners();
          }
          break;
        }
        // ─── Règlement v2 (contrat, section 6) ───
        // Deux événements annoncés à la même heure `an` (l'arrosage avec un orage ou un gel) : un
        // seul bandeau, « Orage + Arrosage » (le second, en file, serait arrivé en plein jeu)
        case 'event': {
          const e = data?.e;
          const first = eventBanner(e);
          if (!first) break;
          const B = bannersRef.current;
          const sameTime = (it) => !!it && it.kind === 'event' && Array.isArray(it.events) && it.an === Number(e.an);
          const into = sameTime(B.current) ? B.current : B.queue.find(sameTime);
          if (into) {
            const events = [...into.events, e];
            const merged = { ...into, ...eventsBanner(events), events };
            if (into === B.current) {
              B.current = merged;
              setBanner(merged);
            } else B.queue[B.queue.indexOf(into)] = merged;
          } else {
            pushBanner({ ...first, events: [e], an: Number(e.an) });
            buzz('light');
          }
          eventSound(e.k);
          break;
        }
        case 'bolt':
          sfx('bolt');
          buzz('light');
          break;
        case 'fire':
        case 'charge':
        case 'douse':
        case 'short':
          sfx(type);
          break;
        case 'foul': {
          const pen = !!data?.pen;
          pushBanner(foulBanner(data || {}, whoNow()), { ms: pen ? FOUL_BANNER_MS : BANNER_MS });
          if (pen) bannersRef.current.foulAt = performance.now();
          // Faute avec penalty : le son du penalty siffle déjà (jamais deux sifflets de suite)
          if (!pen) {
            sfx('whistle');
            if (data?.k === 'keep') sfx('warn');
          }
          buzz(!isLocal && data?.side === 0 ? 'medium' : 'light');
          break;
        }
        case 'penalty': {
          const s = data?.s === 1 ? 1 : 0;
          matchRulesRef.current.penS = s;
          // Ballon posé sur le point de penalty sans `kickoff` : plus de traînée depuis l'ancienne place
          renderer.resetTrail();
          sfx('penalty');
          // Penalty sans faute juste avant (reprise d'un match) : son propre bandeau
          if (performance.now() - bannersRef.current.foulAt > FOUL_THEN_PENALTY_MS) {
            pushBanner(penaltyBanner(s, whoNow()), { ms: FOUL_BANNER_MS });
          }
          // Astuce loin de la cage visée (jamais sur le gardien), après le bandeau de la faute : sur
          // un petit écran, le terrain est trop court pour les deux
          const where = s === 0 ? 'bottom' : null;
          const penTip = () => {
            if (isLocal) tip('pen', TIPS.penLocal, where);
            else if (s === 0) tip('shoot', TIPS.shoot, where);
            else tip('keep', TIPS.keep, where);
          };
          const B = bannersRef.current;
          const wait = B.current ? B.current.ms - (performance.now() - B.shownAt) : 0;
          if (wait > 0) later(timers, penTip, wait);
          else penTip();
          break;
        }
        case 'pen_end': {
          const b = penEndBanner(data?.r, matchRulesRef.current.penS, whoNow());
          if (b) pushBanner(b);
          if (data?.r === 'saved') sfx('save');
          if (data?.r === 'saved' || data?.r === 'missed') buzz('light');
          break;
        }
        case 'gold':
          pushBanner(GOLD_BANNER, { urgent: true });
          sfx('gold');
          buzz('medium');
          tip('gold', isLocal ? TIPS.goldLocal : TIPS.gold);
          break;
        case 'time_left':
          // 30 s avant la fin des 5 minutes de jeu : un signal discret
          sound.blip();
          buzz('light');
          break;
        case 'invite':
          // Défi reçu pendant que le jeu est ouvert (salle d'attente, fin de match)
          sound.blip();
          buzz('medium');
          break;
        case 'end': {
          setScore(data.score);
          setHint(null);
          clearBanners();
          resetPointers();
          // La pluie de lames est dans l'écran de fin (thème stade) : plus de renderer.victory()
          // (à deux, un vainqueur ; un nul hors ligne, règlement v2 : but en or sans but)
          const won = online ? data.won && !data.cancelled : isLocal ? data.winner === 0 || data.winner === 1 : data.winner === 0;
          if (won) {
            sound.win();
            buzz('win');
          } else sound.lose();
          kick();
          let result;
          if (online) {
            result = { mode: 'online', ...data, abandoned: !!data.abandoned };
            invalidateCoupe(queryClient);
          } else {
            // Règlement v2 : `reason` ('time_limit', 'golden_goal', 'time_limit_draw') et nul possible
            const winner = data.winner === 0 || data.winner === 1 ? data.winner : null;
            result = {
              mode, level: lvl, won: winner === 0, winner, draw: winner === null, score: data.score, forfeit: false,
              cancelled: false, reason: typeof data.reason === 'string' ? data.reason : null, points: null, abandoned: false,
            };
            setOff((o) => ({ ...o, status: 'over', result, paused: false }));
          }
          // « FIN DU MATCH » sur le terrain, puis la caméra recule jusqu'au stade entier (le canvas
          // s'efface), puis l'écran de fin. Mouvement réduit : coupe nette à 450 ms
          clearOutro();
          setFx('fin');
          director.finish();
          const quick = reduceRef.current;
          outroRef.current.push(
            later(timers, () => {
              director.pullBack();
              if (quick) { setFx(null); return; }
              setFx('fin-out');
              outroRef.current.push(later(timers, () => setFx((v) => (v === 'fin-out' ? null : v)), FX_OUT_MS));
            }, quick ? QUICK_END_MS : FIN_MS),
            later(timers, () => setEndShown(true), quick ? QUICK_END_MS : FIN_MS + PULL_BACK_MS),
          );
          try { propsRef.current.onFinished?.(result); } catch { /* écran parent démonté */ }
          break;
        }
        case 'react': {
          const id = Date.now() + Math.random();
          setBubbles((list) => [...list.slice(-5), { id, r: data.r, mine: data.mine }]);
          later(timers, () => setBubbles((list) => list.filter((b) => b.id !== id)), 1600);
          break;
        }
        case 'toast':
          // Règlement v2 : le ballon gardé 5 s a son bandeau AVERTISSEMENT (faute `keep`)
          if (matchRulesRef.current.rules === 2 && /^Ballon gardé/.test(String(data))) break;
          showHint(data);
          break;
        default:
          break;
      }
    };

    if (online) {
      const match = new OnlineMatch({ onChange: (next) => setUi(next), onEvent });
      matchRef.current = match;
      const a = propsRef.current.action || { t: 'create' };
      // Match quitté il y a moins de 10 s (retour du navigateur, notification…) : on le reprend.
      // Une autre demande ne pourrait pas aboutir avant la fin de celui-ci (un match à la fois)
      const pending = readPendingResume();
      if (pending) {
        renderer.setPlayers(onlinePlayers(pending.names, pending.roles, pending.photos));
        setScore(pending.score);
        // Match repris : la caméra est déjà sur le terrain (pas d'avant-match)
        director.resume();
        match.resumeFrom(pending);
        kick();
      } else if (a.t === 'resume') match.resumeFrom(null);
      else if (a.t === 'join') match.join(a.code);
      else if (a.t === 'defi') match.peek(a.link);
      else if (a.t === 'challenge' && a.keyHash) match.challengePlayer(a.keyHash);
      else if (a.t === 'challenge') match.challenge(a.employeeId);
      else match.create();
      renderer.paint(null);
    } else {
      // Règlement du serveur (`features.coupeRulesV2`), lu dès l'accueil de la Coupe : sans
      // attente s'il est en cache, sinon attendu au plus 1,5 s (hors connexion : règle d'aujourd'hui)
      const begin = (v2) => {
        if (unmounted) return;
        const match = new LocalMatch({ mode, level: lvl, onEvent, rules: v2 ? 2 : 1 });
        matchRef.current = match;
        match.start();
        if (offPausedRef.current) match.setPaused(true);
        if (rootRef.current) rootRef.current.dataset.phase = match.phase;
      };
      const flag = readCoupeRulesV2(queryClient, { waitMs: RULES_WAIT_MS });
      if (flag.now !== null) begin(flag.now);
      else flag.later.then(begin, () => begin(false));
    }

    return () => {
      unmounted = true;
      if (L.raf) cancelAnimationFrame(L.raf);
      L.raf = 0;
      kickRef.current = () => {};
      const m = matchRef.current;
      matchRef.current = null;
      // En ligne et en plein match : pas un abandon (socket fermée sans `leave`, reprise possible 10 s)
      if (m && typeof m.destroy === 'function') m.destroy();
      renderer.destroy();
      rendererRef.current = null;
      directorRef.current = null;
      sound.close();
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      outroRef.current = [];
    };
    // Montage seulement : mode, niveau et action sont lus une fois (un nouvel écran pour une autre partie)
  }, []);

  useEffect(() => {
    rendererRef.current?.setReducedMotion(!!reduceMotion);
    directorRef.current?.setReducedMotion(!!reduceMotion);
  }, [reduceMotion]);

  // Musique permise ou non par le serveur (réponse arrivée avant ou après le coup d'envoi)
  useEffect(() => {
    soundRef.current?.allowMusic(musicOk);
  }, [musicOk]);

  // Image du stade chargée : le dessin ne pose plus son terrain (un seul terrain, celui de l'image) ;
  // en erreur, il le redessine. setStadium redessine la dernière image aussitôt
  useEffect(() => {
    const r = rendererRef.current;
    if (r && typeof r.setStadium === 'function') r.setStadium(stadium === 'on');
  }, [stadium]);

  // En ligne, hors match : terrain d'attente dessiné une fois, rien ne bouge ; la caméra montre le
  // stade entier, assombri derrière les panneaux
  useEffect(() => {
    if (!online) return;
    const r = rendererRef.current;
    // État du match lui-même, pas seulement celui du rendu : un match repris au montage
    // (readPendingResume) est déjà en cours alors que `ui` dit encore « connecting »
    const live = matchRef.current?.ui?.status;
    if (!r || ui.status === 'match' || ui.status === 'over' || live === 'match' || live === 'over') return;
    r.clearPlayers();
    r.reset();
    r.paint(null);
    if (rootRef.current) delete rootRef.current.dataset.phase;
    clearOutro();
    setFx(null);
    directorRef.current?.idle();
  }, [online, ui.status, clearOutro]);

  // Nouveau match (revanche) : plus de compte à rebours de fin de temps
  useEffect(() => {
    if (online && !ui.timeWarn) {
      loopRef.current.timeLeft = null;
      setTimeLeft(null);
    }
  }, [online, ui.timeWarn]);

  // Hors ligne : pause demandée, ou téléphone en paysage (le match attend qu'on le redresse)
  const offPaused = !online && off.status === 'match' && (off.paused || rotate);
  offPausedRef.current = offPaused;
  useEffect(() => {
    if (online) return;
    const m = matchRef.current;
    if (!m) return;
    m.setPaused(offPaused);
    if (offPaused) pointersRef.current = noPointers();
    else kickRef.current();
  }, [online, offPaused]);

  // App en arrière-plan : un match hors ligne se met en pause (en ligne, OnlineMatch ferme la
  // connexion exprès et la reprend au retour)
  useEffect(() => {
    if (online) return undefined;
    const onVisibility = () => {
      if (document.hidden) setOff((o) => (o.status === 'match' && !o.paused ? { ...o, paused: true } : o));
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [online]);

  useWakeLock(online ? ui.status === 'match' : off.status === 'match' && !offPaused);

  // Connexion impossible : le salon vient peut-être de couper le jeu (`COUPE_WS=off` refuse
  // /ws/coupe sans un mot). Le drapeau relu le dit : « La Coupe fait une pause », sans « Réessayer »
  const [gamePaused, setGamePaused] = useState(false);
  const unreachable = online && ui.status === 'error' && ui.error?.kind === 'unreachable';
  useEffect(() => {
    if (!unreachable) return undefined;
    let cancelled = false;
    queryClient.fetchQuery({ queryKey: COUPE_ENABLED_KEY, queryFn: fetchCoupeEnabled, staleTime: 0, retry: 0 })
      .then((on) => { if (!cancelled && on === false) setGamePaused(true); })
      .catch(() => { /* drapeau illisible : on garde « Connexion impossible » */ });
    return () => { cancelled = true; };
  }, [unreachable, queryClient]);

  // ─── Story du score (fin du match) ─────────────────────────────────

  const result = online ? ui.result : off.result;
  // Ton de la fin (`endTexts`) : 'victoire', 'defaite' ou 'neutre' (nul, annulé) ; une défaite met
  // le stade en gris sous l'écran de fin
  const endTone = useMemo(
    () => (result ? endTexts({ mode: online ? 'online' : mode, level: lvl, opponent, result }).tone : null),
    [result, online, mode, lvl, opponent],
  );
  const story = useMemo(() => {
    // Rien à partager pour un match annulé ou abandonné
    if (!result || result.cancelled || result.abandoned) return null;
    const t = endTexts({ mode: online ? 'online' : mode, level: lvl, opponent, result });
    const me = online ? (ui.names[0] || shownName(user)) : isLocal ? 'Joueur du bas' : shownName(user);
    const p = online && result.points?.ranked ? result.points : null;
    return {
      key: JSON.stringify([result.score, result.winner, result.draw, me, opponent, p?.delta ?? null, p?.rank ?? null, t.tone]),
      title: t.title,
      win: t.win,
      tone: t.tone,
      score: result.score,
      names: [me, opponent],
      eyebrow: t.eyebrow,
      points: p ? { delta: p.delta, total: p.total, rank: p.rank } : null,
      season: seasonLabel(),
      note: online
        ? (result.draw ? 'Temps écoulé : match nul' : result.reason === 'golden_goal' ? 'Décidé au but en or' : null)
        : isLocal ? 'Match amical à deux' : 'Entraînement contre le salon',
    };
  }, [result, online, mode, lvl, opponent, ui.names, user, isLocal]);
  const storyShare = useScoreStoryShare(endShown ? story : null);

  // ─── Actions ───────────────────────────────────────────────────────

  // Sons débloqués au premier geste : le toucher (pointerdown), le relâcher et le clic comptent,
  // WebKit n'acceptant parfois que ces derniers au doigt
  const unlockSound = () => soundRef.current?.unlock();

  const exit = useCallback(() => {
    const m = matchRef.current;
    if (online && m) m.leave();
    propsRef.current.onExit?.();
  }, [online]);

  // Abandon en plein match (après confirmation) : forfait (annulé avant 20 s de jeu). Le serveur
  // renvoie la fin du match avec les points (OnlineMatch.abandon) : l'écran de fin s'affiche, puis
  // « Retour » ramène à l'accueil
  const abandon = () => {
    setConfirmQuit(false);
    pointersRef.current = noPointers();
    matchRef.current?.abandon();
  };

  const decline = () => {
    matchRef.current?.decline();
    propsRef.current.onExit?.();
  };

  const rematch = () => {
    const m = matchRef.current;
    if (!m) return;
    unlockSound();
    if (online) { m.rematch(); return; }
    m.start();
  };

  const pause = (on) => setOff((o) => (o.status === 'match' ? { ...o, paused: on } : o));

  const leftButton = () => {
    if (!online) { pause(true); return; }
    if (ui.status === 'match') { if (!ui.abandoning) setConfirmQuit(true); }
    else exit();
  };

  const react = (r) => {
    if (!matchRef.current?.react?.(r)) return;
    setReactLocked(true);
    later(timersRef.current, () => setReactLocked(false), 1000);
  };

  const toggleSound = () => {
    const s = soundRef.current;
    if (!s) return;
    s.setEnabled(!s.isEnabled());
    setSoundOn(s.isEnabled());
  };

  // Retour d'Android : ferme la fenêtre ouverte, sinon pause / abandon (confirmé), sinon quitte
  const onAndroidBack = () => {
    if (storyShare.fallbackUrl) { storyShare.closeFallback(); return; }
    if (sheet) { setSheet(null); return; }
    if (online) {
      const m = matchRef.current;
      const st = m?.ui.status;
      if (m?.ui.incoming) { m.declineIncoming(); return; }
      if (st === 'match') { if (!m.ui.abandoning) setConfirmQuit((v) => !v); return; }
      if (st === 'invite') { decline(); return; }
      exit();
      return;
    }
    if (off.status === 'match') { pause(!off.paused); return; }
    exit();
  };
  useAndroidBack(true, onAndroidBack);

  // ─── Doigts ────────────────────────────────────────────────────────

  const canControl = () => {
    const m = matchRef.current;
    if (!m) return false;
    if (online) return m.ui.status === 'match' && !m.ui.abandoning;
    return m.started && !m.paused && m.phase !== 'over';
  };

  // Cible = doigt + l'écart fixé quand il s'est posé (finger.js : posé sur son joueur, celui-ci ne
  // bouge pas) ; souris qui survole sans clic : le pointeur lui-même
  const aim = (side, e) => {
    const r = rendererRef.current;
    const m = matchRef.current;
    if (!r || !m) return;
    const w = r.toWorld(e.clientX, e.clientY);
    const o = pointersRef.current.offsets.get(e.pointerId) || fingerOffset(null, null, e.pointerType, side);
    if (online) m.setTarget(w.x + o.dx, w.y + o.dy);
    else m.setTarget(side, w.x + o.dx, w.y + o.dy);
  };

  const hold = (side, down) => {
    const m = matchRef.current;
    if (!m) return;
    if (online) m.setFingerDown(down);
    else m.setHeld(side, down);
  };

  const onPointerDown = (e) => {
    if (!canControl()) return;
    e.preventDefault();
    const w = rendererRef.current?.toWorld(e.clientX, e.clientY) || null;
    const side = isLocal && w && w.y < H / 2 ? 1 : 0;
    const P = pointersRef.current;
    P.map.delete(e.pointerId);
    P.map.set(e.pointerId, side);
    P.offsets.set(e.pointerId, fingerOffset(w, matchRef.current?.getFrame()?.paddles?.[side], e.pointerType, side));
    P.active[side] = e.pointerId;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture impossible : on suit quand même */ }
    hold(side, true);
    aim(side, e);
  };

  const onPointerMove = (e) => {
    if (!canControl()) return;
    const P = pointersRef.current;
    const side = P.map.get(e.pointerId);
    if (side !== undefined) {
      if (P.active[side] === e.pointerId) aim(side, e);
      return;
    }
    // Souris : le joueur suit le pointeur même sans clic (ordinateur) ; jamais à deux
    if (e.pointerType === 'mouse' && !isLocal && P.active[0] === null) aim(0, e);
  };

  const onPointerEnd = (e) => {
    const P = pointersRef.current;
    const side = P.map.get(e.pointerId);
    if (side === undefined) return;
    P.map.delete(e.pointerId);
    P.offsets.delete(e.pointerId);
    if (P.active[side] !== e.pointerId) return;
    // Téléphone tenu à deux mains : le dernier doigt encore posé du même camp prend le relais
    let next = null;
    P.map.forEach((s, id) => { if (s === side) next = id; });
    P.active[side] = next;
    if (next === null) hold(side, false);
  };

  // ─── Écrans ────────────────────────────────────────────────────────

  const inMatch = status === 'match' || status === 'over';
  const endOpen = status === 'over' && endShown;
  const incoming = online && ui.incoming && (ui.status === 'room' || ui.status === 'over') ? ui.incoming : null;
  const showHud = online ? ui.status === 'match' || (ui.status === 'over' && !endShown) : !endShown;
  const L = LEVELS[lvl];
  const hudLabel = online
    ? 'En ligne'
    : isLocal ? 'À deux sur ce téléphone' : `Contre le salon · ${L.name}`;
  const names = online ? ['Toi', opponent] : offlinePlayers(mode, lvl).map((p) => p.name);
  const scoreText = `Score : ${names[0]} ${score[0]} – ${score[1]} ${names[1]}`;
  const diag = diagnostic && online
    ? `Ping ${net.ping ?? '…'} ms · recalages ${net.recalages} · refusées ${net.refusees}`
    : null;
  // Bande du règlement v2 : [bas, haut]
  const barNames = isLocal ? ['Bas', 'Haut'] : ['Toi', online ? opponent : L.name];
  const setGaugeEl = useCallback((el) => {
    gaugeRef.current = el;
    gaugeFracRef.current = -1;
  }, []);
  const oppKey = online ? ui.keys[1] : null;
  const canModerate = online && !!oppKey && !isSalonRole(ui.roles[1]);
  const waitName = ui.waitingFor?.name || 'l’autre joueur';

  let screen = null;
  if (incoming) {
    screen = (
      <ChallengeReceived
        key={incoming.link}
        invite={incoming}
        isBarber={user?.role === 'barber'}
        onAccept={() => { unlockSound(); matchRef.current?.acceptIncoming(); }}
        onDecline={() => matchRef.current?.declineIncoming()}
        onExpire={() => matchRef.current?.expireIncoming()}
      />
    );
  } else if (online) {
    if (ui.status === 'connecting') {
      screen = (
        <Panel labelledBy="cdg-connecting" onClose={exit} closeLabel="Annuler">
          <p className="cdg-eyebrow">La Coupe du Gang</p>
          <h2 className="cdg-message" id="cdg-connecting">Connexion au serveur de jeu</h2>
          <Loader2 className="h-7 w-7 self-center text-[#ff3d44] cdg-spin" aria-hidden="true" />
          <button type="button" className="cdg-btn cdg-ghost" onClick={exit}>Annuler</button>
        </Panel>
      );
    } else if (ui.status === 'invite' && ui.invite) {
      screen = (
        <ChallengeReceived
          invite={ui.invite}
          isBarber={user?.role === 'barber'}
          onAccept={() => { unlockSound(); matchRef.current?.accept(); }}
          onDecline={decline}
          onExpire={() => matchRef.current?.expireInvite()}
        />
      );
    } else if (ui.status === 'room') {
      screen = ui.side === 1 ? (
        <Panel labelledBy="cdg-found" onClose={exit} closeLabel="Quitter le match">
          <p className="cdg-eyebrow">Match {ui.code}</p>
          <h2 className="cdg-message" id="cdg-found">{ui.waitingFor ? `En attente de ${waitName}` : 'Match trouvé'}</h2>
          <p className="cdg-wait" role="status">
            <span className="cdg-dot" aria-hidden="true" />
            {ui.reconnecting ? 'Reconnexion…' : ui.waitingFor ? 'Le match commence à son retour' : 'Coup d’envoi…'}
          </p>
        </Panel>
      ) : (
        <WaitingRoom
          code={ui.code}
          link={ui.link}
          invited={ui.invited}
          roomAt={ui.roomAt}
          reconnecting={!!ui.reconnecting}
          me={{ name: ui.myName || '', role: user?.role || 'user', photo: myPhoto }}
          onCancel={exit}
        />
      );
    } else if (ui.status === 'error' && ui.error) {
      const paused = unreachable && gamePaused;
      const canRetry = ui.error.retry && !paused;
      screen = (
        <Panel labelledBy="cdg-error" onClose={exit} closeLabel="Fermer">
          <p className="cdg-eyebrow">La Coupe du Gang</p>
          <h2 className="cdg-message" id="cdg-error" role="alert">{paused ? COUPE_PAUSED_TEXT : ui.error.message}</h2>
          <div className={`cdg-row${canRetry ? '' : ' cdg-single'}`}>
            {canRetry && (
              <button type="button" className="cdg-btn cdg-primary" onClick={() => matchRef.current?.retry()}>Réessayer</button>
            )}
            <button type="button" className="cdg-btn cdg-ghost" onClick={exit}>Retour</button>
          </div>
        </Panel>
      );
    } else if (ui.status === 'match' && confirmQuit) {
      screen = (
        <Panel labelledBy="cdg-quit" onClose={() => setConfirmQuit(false)} closeLabel="Continuer le match" dialog soft>
          <h2 className="cdg-message" id="cdg-quit">Abandonner le match ?</h2>
          <p className="cdg-lead">
            Abandonner compte comme une défaite (1 Point de Coupe en moins si le match compte pour le classement).
            Avant 20 s de jeu, le match est annulé.
          </p>
          <div className="cdg-row">
            <button type="button" className="cdg-btn cdg-primary" onClick={() => setConfirmQuit(false)}>Continuer</button>
            <button type="button" className="cdg-btn cdg-ghost" onClick={abandon}>Abandonner</button>
          </div>
        </Panel>
      );
    }
  } else if (off.status === 'match' && off.paused) {
    screen = (
      <Panel labelledBy="cdg-pause" onClose={() => pause(false)} closeLabel="Reprendre" soft>
        <h2 className="cdg-result" id="cdg-pause">Pause</h2>
        <p className="cdg-lead">Match {isLocal ? 'à deux' : 'contre le salon'} : sans points.</p>
        <div className="cdg-row">
          <button type="button" className="cdg-btn cdg-primary" onClick={() => pause(false)}>Reprendre</button>
          <button type="button" className="cdg-btn cdg-ghost" onClick={exit}>Quitter</button>
        </div>
        <div className="cdg-foot">
          <button type="button" className="cdg-link" aria-pressed={soundOn} onClick={toggleSound}>
            Son : {soundOn ? 'activé' : 'coupé'}
          </button>
        </div>
      </Panel>
    );
  }

  const rematchNote = online
    ? (ui.result?.abandoned ? 'Tu as quitté le match'
      : ui.rematchAsked ? `En attente de ${opponent}`
        : ui.oppGone ? (ui.rematchNote || `${opponent} est parti`)
          : ui.offline ? 'Connexion perdue'
            : blocked ? 'Joueur bloqué' : null)
    : null;
  const canRematch = online ? !ui.rematchAsked && !ui.oppGone && !ui.offline && !blocked : true;
  const reconnectTitle = ui.reconnecting === 'cut' ? 'Connexion perdue' : 'Retour au match';

  // Affiche VS de l'avant-match : toi (ou le joueur du bas) en rouge, l'adversaire en blanc
  const introPlayers = useMemo(() => {
    if (!online) return offlinePlayers(mode, lvl, myPhoto).map((p) => ({ ...p, label: p.name }));
    return [
      { name: ui.names[0] || shownName(user), role: ui.roles[0], photo: ui.photos?.[0] || null, label: 'Toi' },
      { name: opponent, role: ui.roles[1], photo: ui.photos?.[1] || null, label: opponent },
    ];
  }, [online, mode, lvl, myPhoto, ui.names, ui.roles, ui.photos, user, opponent]);

  return (
    <div
      ref={rootRef}
      className="cdg-root fixed inset-0 z-[60] overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="La Coupe du Gang"
      data-app-overlay=""
      // Thème stade : image chargée ou non, stade assombri hors match, stade en gris après une défaite
      // (data-cam, data-play et data-outro sont posés par la boucle, voir StadiumStage)
      data-stadium={stadium}
      data-dim={inMatch ? undefined : ''}
      data-end={endOpen && endTone === 'defaite' ? 'defaite' : undefined}
      style={{
        touchAction: 'none',
        overscrollBehavior: 'none',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'max(8px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(8px, env(safe-area-inset-right, 0px))',
      }}
      onPointerDownCapture={unlockSound}
      onPointerUpCapture={unlockSound}
      onClickCapture={unlockSound}
    >
      <GameStyles />
      <div className="mx-auto flex h-full w-full max-w-[540px] flex-col">
        {showHud && (
          <GameHud
            online={online}
            label={hudLabel}
            onLeft={leftButton}
            ping={net.ping}
            soundOn={soundOn}
            onToggleSound={toggleSound}
            diag={diag}
          />
        )}
        {/* Règlement v2 seulement (posée au coup d'envoi, avant le zoom : le terrain ne change plus
            de taille pendant le match) */}
        {showHud && rulesUi && (
          <RulesBar ui={rulesUi} names={barNames} score={score} local={isLocal} fillRef={setGaugeEl} />
        )}
        <div className="cdg-stage">
          {/* Stade sous le canvas (caché tant que l'image n'est pas prête, ou si elle échoue) */}
          <StadiumStage onReady={() => setStadiumStatus('on')} onFail={() => setStadiumStatus('off')} />
          <canvas
            ref={canvasRef}
            className="cdg-canvas"
            role="img"
            aria-label="Terrain de foot vu du dessus, deux joueurs et un ballon"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          />
          {inMatch && <p className="sr-only" aria-live="polite">{scoreText}</p>}
          {(online ? ui.status === 'match' && ui.timeWarn : off.status === 'match' && timeLeft != null) && (
            <>
              <p className="sr-only" role="status">Plus que 30 secondes de jeu</p>
              {timeLeft != null && (
                <div className={`cdg-clock${timeLeft <= 10 ? ' cdg-urgent' : ''}`} aria-hidden="true">
                  <Timer className="h-4 w-4" />
                  {timeLeft} s
                </div>
              )}
            </>
          )}
          {/* L'astuce du début (« Ton joueur suit ton doigt ») ne passe jamais sur l'écran de fin */}
          {hint && inMatch && !endOpen && <div className="cdg-hint" role="status" data-pos={hint.pos || undefined}>{hint.msg}</div>}
          {rulesUi && inMatch && !endOpen && <RulesBanner banner={banner} />}
          {bubbles.map((b) => (b.mine ? (
            <span key={b.id} className="cdg-bubble cdg-mine" aria-hidden="true">{REACTIONS[b.r]?.emoji}</span>
          ) : (
            <span key={b.id} className="cdg-bubble cdg-theirs" aria-hidden="true">
              <b>{opponent}</b><span>{REACTIONS[b.r]?.emoji}</span>
            </span>
          )))}
          {online && ui.status === 'match' && ui.abandoning && (
            <div className="cdg-float" role="status">
              <Loader2 className="h-6 w-6 text-[#ff3d44] cdg-spin" aria-hidden="true" />
              <strong>Abandon</strong>
              <span>Fin du match…</span>
            </div>
          )}
          {online && ui.status === 'match' && !ui.abandoning && ui.reconnecting && (
            <div className="cdg-float" role="status">
              <Loader2 className="h-6 w-6 text-[#ff3d44] cdg-spin" aria-hidden="true" />
              <strong>{reconnectTitle}</strong>
              <span>Reconnexion…</span>
            </div>
          )}
          {online && ui.status === 'match' && !ui.abandoning && !ui.reconnecting && ui.away && (
            <AwayNotice name={opponent} until={ui.away.until} />
          )}
          {online && ui.status === 'match' && !ui.abandoning && !ui.reconnecting && !ui.away && (
            <div className="cdg-float cdg-pending" role="status">
              <strong>Fin du match</strong>
              <span>Calcul des points…</span>
            </div>
          )}
          {screen}
          {endOpen && result && !incoming && (
            <EndScreen
              mode={online ? 'online' : mode}
              level={lvl}
              opponent={opponent}
              result={result}
              rematchNote={rematchNote}
              canRematch={canRematch}
              onRematch={rematch}
              onExit={exit}
              canModerate={canModerate}
              onReport={() => setSheet('report')}
              onBlock={() => setSheet('block')}
              blocked={blocked}
              reported={reported}
              onShare={story ? storyShare.share : null}
              sharing={storyShare.busy}
            />
          )}
          {sheet === 'report' && canModerate && (
            <ReportSheet
              name={opponent}
              keyHash={oppKey}
              roomCode={ui.code}
              onClose={() => setSheet(null)}
              onDone={() => setReported(true)}
            />
          )}
          {sheet === 'block' && canModerate && (
            <BlockSheet
              name={opponent}
              keyHash={oppKey}
              onClose={() => setSheet(null)}
              onBlocked={() => {
                setBlocked(true);
                setSheet(null);
                invalidateCoupe(queryClient);
              }}
            />
          )}
          <StoryFallback url={storyShare.fallbackUrl} onClose={storyShare.closeFallback} />
        </div>
        {/* Gardées (inactives) jusqu'à l'écran de fin : sans elles le terrain grandirait d'un coup à
            « FIN DU MATCH » */}
        {online && (ui.status === 'match' || (ui.status === 'over' && !endShown)) && (
          <Reactions onReact={react} disabled={ui.status !== 'match' || reactLocked || ui.abandoning || !!ui.reconnecting} />
        )}
      </div>
      {/* Affiche VS de l'avant-match, « FIN DU MATCH » : sur tout l'écran, au-dessus du terrain */}
      <MatchIntro fx={fx} mode={online ? 'online' : mode} players={introPlayers} goals={rulesUi?.gw ?? GOALS_TO_WIN} />
      {rotate && (
        <div className="cdg-rotate" role="alert">
          <Smartphone className="h-10 w-10 text-[#ff3d44]" aria-hidden="true" />
          <strong>Tourne ton téléphone</strong>
          <span>La Coupe du Gang se joue téléphone tenu droit{!online && off.status === 'match' ? ' : le match attend.' : '.'}</span>
        </div>
      )}
    </div>
  );
}
