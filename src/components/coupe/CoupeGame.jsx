import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Smartphone, Timer } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useAndroidBack } from '@/lib/useAndroidBack';
import { H, LEVELS } from '@/lib/coupe/engine';
import { createRenderer, isSalonRole } from '@/lib/coupe/renderer';
import { createSound, buzz } from '@/lib/coupe/sound';
import { OnlineMatch, IDLE_UI, readPendingResume } from '@/lib/coupe/onlineMatch';
import { LocalMatch } from '@/lib/coupe/localMatch';
import { COUPE_ENABLED_KEY, fetchCoupeEnabled, invalidateCoupe, useCoupeMusic } from '@/lib/coupe/coupeApi';
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

/*
 * Écran de jeu de La Coupe du Gang (contrat : docs/fonctions/coupe-du-gang-contrat.md, section 5.1).
 *
 *   <CoupeGame
 *     mode="online" | "bot" | "local"
 *     level="apprenti" | "barber" | "boss"          // mode "bot"
 *     action={{ t: 'create' } | { t: 'join', code } | { t: 'defi', link } | { t: 'challenge', employeeId } | { t: 'resume' }}
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
  const landscape = useMediaQuery(LANDSCAPE_QUERY);
  // Clavier ouvert (fiche « Signaler ») : la fenêtre rétrécie n'est pas un téléphone tourné
  const typing = useTyping();
  const rotate = landscape && !typing;
  useSalonMusicPaused();

  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const soundRef = useRef(null);
  // Musique de tribune : à partir du premier coup d'envoi, jusqu'à la sortie de l'écran ; permise par
  // le serveur (COUPE_MUSIC=off la coupe partout sans nouveau build)
  const musicOk = useCoupeMusic();
  const musicOkRef = useRef(musicOk);
  musicOkRef.current = musicOk;
  const musicStartedRef = useRef(false);
  const matchRef = useRef(null);
  const loopRef = useRef({ raf: 0, last: 0, statT: 0, timeLeft: null });
  const kickRef = useRef(() => {});
  // Doigts posés : id → camp ; le dernier posé de chaque camp mène son joueur
  const pointersRef = useRef({ map: new Map(), active: [null, null] });
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

  const status = online ? ui.status : off.status;
  const opponent = online ? (ui.names[1] || 'Adversaire') : offlinePlayers(mode, lvl)[1].name;

  const showHint = useCallback((msg) => {
    const id = Date.now() + Math.random();
    setHint({ id, msg });
    later(timersRef.current, () => setHint((h) => (h?.id === id ? null : h)), 2400);
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
      if (online) {
        L.statT += dt;
        if (L.statT >= 0.25) {
          L.statT = 0;
          const s = m.stats();
          setNet((p) => (p.ping === s.ping && p.recalages === s.recalages && p.refusees === s.refusees ? p : s));
        }
        // Temps de jeu restant (après `time_left`) : un rendu par seconde affichée, pas par image
        const left = f ? f.timeLeft : null;
        if (left !== L.timeLeft) {
          L.timeLeft = left;
          setTimeLeft(left);
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
      pointersRef.current = { map: new Map(), active: [null, null] };
    };

    const onEvent = (type, data) => {
      switch (type) {
        case 'start': {
          renderer.setPlayers(online ? onlinePlayers(data.names, data.roles) : offlinePlayers(mode, lvl));
          renderer.reset();
          sound.blip();
          resetPointers();
          setEndShown(false);
          setScore([0, 0]);
          setConfirmQuit(false);
          setSheet(null);
          if (!online) setOff({ status: 'match', result: null, paused: false });
          // Nouveau match (revanche comprise) : plus rien de la fin du précédent ; l'avant-match se
          // décide sur les premières images (`countS`)
          clearOutro();
          setFx(null);
          director.newMatch();
          musicStartedRef.current = true;
          sound.music(musicOkRef.current);
          // L'astuce attend le terrain (après l'avant-match), sinon personne ne la verrait
          if (!taughtRef.current) {
            taughtRef.current = true;
            firstHintRef.current = isLocal ? 'Chacun pose le doigt dans sa moitié' : 'Ton joueur suit ton doigt, juste au-dessus';
          }
          kick();
          break;
        }
        case 'resumed':
          // Reprise après une coupure, ou match repris en rouvrant l'écran : mêmes joueurs, score du
          // serveur, caméra directement sur le terrain
          renderer.setPlayers(onlinePlayers(data.names, data.roles));
          resetPointers();
          if (Array.isArray(data.score)) setScore(data.score);
          clearOutro();
          setFx(null);
          director.resume();
          musicStartedRef.current = true;
          sound.music(musicOkRef.current);
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
        case 'goal':
          renderer.goal(data.scorer);
          sound.goal();
          buzz('goal');
          setScore(data.score);
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
          resetPointers();
          // La pluie de lames est dans l'écran de fin (thème stade) : plus de renderer.victory()
          const won = online ? data.won && !data.cancelled : isLocal || data.winner === 0;
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
            result = { mode, level: lvl, won: data.winner === 0, winner: data.winner, draw: false, score: data.score, forfeit: false, cancelled: false, reason: null, points: null, abandoned: false };
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
        renderer.setPlayers(onlinePlayers(pending.names, pending.roles));
        setScore(pending.score);
        // Match repris : la caméra est déjà sur le terrain (pas d'avant-match)
        director.resume();
        match.resumeFrom(pending);
        kick();
      } else if (a.t === 'resume') match.resumeFrom(null);
      else if (a.t === 'join') match.join(a.code);
      else if (a.t === 'defi') match.peek(a.link);
      else if (a.t === 'challenge') match.challenge(a.employeeId);
      else match.create();
      renderer.paint(null);
    } else {
      const match = new LocalMatch({ mode, level: lvl, onEvent });
      matchRef.current = match;
      match.start();
      if (rootRef.current) rootRef.current.dataset.phase = match.phase;
    }

    return () => {
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

  // Réponse du serveur arrivée après le coup d'envoi, ou musique coupée en cours de route
  useEffect(() => {
    if (musicStartedRef.current) soundRef.current?.music(musicOk);
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
  useEffect(() => {
    if (online) return;
    const m = matchRef.current;
    if (!m) return;
    m.setPaused(offPaused);
    if (offPaused) pointersRef.current = { map: new Map(), active: [null, null] };
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
      note: online ? (result.draw ? 'Temps écoulé : match nul' : null) : isLocal ? 'Match amical à deux' : 'Entraînement contre le salon',
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
    pointersRef.current = { map: new Map(), active: [null, null] };
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

  const aim = (side, e) => {
    const r = rendererRef.current;
    const m = matchRef.current;
    if (!r || !m) return;
    const t = r.fingerTarget(e.clientX, e.clientY, e.pointerType, side);
    if (online) m.setTarget(t.x, t.y);
    else m.setTarget(side, t.x, t.y);
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
    let side = 0;
    if (isLocal) {
      const w = rendererRef.current?.toWorld(e.clientX, e.clientY);
      side = w && w.y < H / 2 ? 1 : 0;
    }
    const P = pointersRef.current;
    P.map.delete(e.pointerId);
    P.map.set(e.pointerId, side);
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
    if (!online) return offlinePlayers(mode, lvl).map((p) => ({ ...p, label: p.name }));
    return [
      { name: ui.names[0] || shownName(user), role: ui.roles[0], label: 'Toi' },
      { name: opponent, role: ui.roles[1], label: opponent },
    ];
  }, [online, mode, lvl, ui.names, ui.roles, user, opponent]);

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
          {online && ui.status === 'match' && ui.timeWarn && (
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
          {hint && inMatch && !endOpen && <div className="cdg-hint" role="status">{hint.msg}</div>}
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
      <MatchIntro fx={fx} mode={online ? 'online' : mode} players={introPlayers} />
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
