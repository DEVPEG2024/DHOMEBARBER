import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useAndroidBack } from '@/lib/useAndroidBack';
import { createRenderer } from '@/lib/coupe/renderer';
import { createSound, buzz } from '@/lib/coupe/sound';
import { OnlineMatch } from '@/lib/coupe/onlineMatch';

/*
 * Prototype réseau de La Coupe du Gang (docs/fonctions/coupe-du-gang.md, « Prototype réseau ») :
 * écran caché /coupe-test, réservé à l'admin, aux barbers et aux comptes testeurs (garde dans
 * App.jsx, le serveur vérifie aussi). Deux téléphones, un match en temps réel, sans points.
 *
 * Plein écran, sombre quel que soit le thème, aucun défilement. Le dessin (renderer), les sons et
 * le code réseau (onlineMatch) vivent dans src/lib/coupe/ ; cette page ne fait que les relier.
 * Aucun WebSocket n'est ouvert avant « Créer un match » ou « Rejoindre ».
 */

const REACTIONS = [
  { r: 0, emoji: '👏', label: 'Bravo' },
  { r: 1, emoji: '🔥', label: 'En feu' },
  { r: 2, emoji: '😂', label: 'Mort de rire' },
];

const INITIAL_UI = { status: 'idle', code: null, side: null, names: [], roles: [], result: null, rematchAsked: false, error: null };

// Styles du prototype validé (docs/prototypes/coupe-du-gang.html), préfixés « cdg- »
const PAGE_CSS = `
.cdg-root { --cdg-display: 'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif; --cdg-body: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-family: var(--cdg-body); color: #eef3ef; background: #05080a; color-scheme: dark;
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
.cdg-overlay { position: absolute; inset: 0; bottom: var(--keyboard-overlap, 0px); z-index: 20; display: flex; align-items: center; justify-content: center;
  padding: 12px 0; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; background: rgba(5, 8, 10, .62); }
.cdg-overlay.cdg-soft { background: rgba(5, 8, 10, .34); }
.cdg-panel { position: relative; width: 100%; max-width: 372px; margin: auto; box-sizing: border-box; background: #0b1210;
  border: 1px solid rgba(255, 255, 255, .1); border-radius: 24px; padding: 22px 20px 16px; display: flex; flex-direction: column;
  gap: 16px; box-shadow: 0 30px 80px rgba(0, 0, 0, .55); }
.cdg-eyebrow { margin: 0; padding-right: 48px; font: 600 11px/1.2 var(--cdg-body); letter-spacing: .14em; text-transform: uppercase; color: #9db0a6; }
.cdg-title { margin: 0; font: 800 clamp(48px, 15vw, 66px)/.84 var(--cdg-display); text-transform: uppercase; }
.cdg-title span { color: #ebc15e; }
.cdg-lead { margin: 0; color: #9db0a6; font-size: 14px; line-height: 1.5; }
.cdg-label { margin: 0; font: 700 14px/1 var(--cdg-display); letter-spacing: .12em; text-transform: uppercase; }
.cdg-btn { min-height: 52px; border-radius: 14px; border: 1px solid transparent; padding: 8px 14px; cursor: pointer;
  font: 800 19px/1.1 var(--cdg-display); letter-spacing: .06em; text-transform: uppercase;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; }
.cdg-btn:disabled { opacity: .5; cursor: default; }
.cdg-primary { background: #ebc15e; color: #1a1205; }
.cdg-ghost { background: transparent; color: #eef3ef; border-color: rgba(255, 255, 255, .22); }
.cdg-btn small { font: 500 12px/1.2 var(--cdg-body); letter-spacing: 0; text-transform: none; color: #9db0a6; }
.cdg-primary small { color: rgba(26, 18, 5, .72); }
.cdg-input { flex: 1; min-width: 0; min-height: 52px; box-sizing: border-box; border-radius: 14px; border: 1px solid rgba(255, 255, 255, .22);
  background: rgba(255, 255, 255, .05); color: #eef3ef; padding: 0 12px; text-align: center;
  font: 800 26px/1 var(--cdg-display); letter-spacing: .3em; font-variant-numeric: tabular-nums;
  -webkit-user-select: text; user-select: text; }
.cdg-input::placeholder { font: 500 14px/1 var(--cdg-body); letter-spacing: 0; color: #9db0a6; }
.cdg-input:focus { outline: none; border-color: #ebc15e; }
.cdg-rules { margin: 0; padding: 0; list-style: none; display: grid; gap: 7px; font-size: 13px; line-height: 1.4; color: #9db0a6; }
.cdg-rules li { display: flex; gap: 9px; align-items: baseline; }
.cdg-rules li::before { content: ""; flex: none; width: 6px; height: 6px; border-radius: 50%; background: #33b574; transform: translateY(-1px); }
.cdg-foot { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 4px 10px;
  border-top: 1px solid rgba(255, 255, 255, .1); padding-top: 4px; font-size: 11.5px; line-height: 1.4; color: #9db0a6; }
.cdg-link { background: none; border: 0; color: #eef3ef; font: 600 12.5px var(--cdg-body); padding: 0; min-height: 44px; cursor: pointer; }
.cdg-result { margin: 0; font: 800 68px/.88 var(--cdg-display); text-transform: uppercase; }
.cdg-result.cdg-win { color: #ebc15e; }
.cdg-message { margin: 0; font: 800 34px/1 var(--cdg-display); text-transform: uppercase; text-wrap: balance; }
.cdg-final { margin: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 12px; font: 800 34px/1 var(--cdg-display); font-variant-numeric: tabular-nums; }
.cdg-final .cdg-who { font: 600 13px/1.2 var(--cdg-body); color: #9db0a6; }
.cdg-code { margin: 0; text-align: center; font: 800 104px/.9 var(--cdg-display); letter-spacing: .12em; color: #ebc15e; font-variant-numeric: tabular-nums; }
.cdg-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.cdg-row.cdg-single { grid-template-columns: minmax(0, 1fr); }
.cdg-wait { margin: 0; display: flex; align-items: center; justify-content: center; gap: 10px; font: 700 17px/1.2 var(--cdg-display); letter-spacing: .08em; text-transform: uppercase; }
.cdg-dot { width: 9px; height: 9px; border-radius: 50%; background: #33b574; flex: none; }
.cdg-close { position: absolute; z-index: 1; top: 10px; right: 10px; width: 44px; height: 44px; border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, .14); background: rgba(5, 9, 7, .62); color: #eef3ef; display: grid; place-items: center; cursor: pointer; }
.cdg-icon { width: 44px; height: 44px; flex: none; border-radius: 12px; border: 1px solid rgba(255, 255, 255, .14);
  background: rgba(5, 9, 7, .62); color: #eef3ef; display: grid; place-items: center; cursor: pointer; }
.cdg-react { width: 38px; height: 38px; flex: none; border-radius: 12px; border: 1px solid rgba(255, 255, 255, .14);
  background: rgba(5, 9, 7, .62); font-size: 19px; line-height: 1; display: grid; place-items: center; cursor: pointer; }
.cdg-react:disabled { opacity: .45; cursor: default; }
.cdg-diag { margin: 0; flex: 1; min-width: 0; text-align: center;
  font: 600 11.5px/1.25 var(--cdg-body); color: #9db0a6; font-variant-numeric: tabular-nums; }
.cdg-diag span { display: inline-block; white-space: nowrap; }
.cdg-hint { position: absolute; z-index: 15; left: 50%; top: 12px; transform: translateX(-50%); width: max-content; max-width: calc(100% - 24px);
  box-sizing: border-box; padding: 10px 14px; border-radius: 999px; pointer-events: none; text-align: center;
  background: rgba(5, 9, 7, .92); border: 1px solid rgba(255, 157, 77, .55); font: 600 13px/1.3 var(--cdg-body); color: #eef3ef; }
.cdg-bubble { position: absolute; z-index: 14; left: 18px; font-size: 34px; line-height: 1; pointer-events: none; }
.cdg-bubble.cdg-mine { bottom: 22px; }
.cdg-bubble.cdg-theirs { top: 22px; }
.cdg-root button:focus-visible { outline: 2px solid #ebc15e; outline-offset: 2px; }
@keyframes cdg-rise { from { transform: translateY(14px) scale(.98); opacity: .5; } to { transform: none; opacity: 1; } }
@keyframes cdg-float { 0% { transform: translateY(10px) scale(.6); opacity: 0; } 15% { transform: translateY(0) scale(1.1); opacity: 1; }
  80% { opacity: 1; } 100% { transform: translateY(-40px) scale(1); opacity: 0; } }
@keyframes cdg-pulse { 0%, 100% { opacity: .3; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: no-preference) {
  .cdg-panel { animation: cdg-rise .35s cubic-bezier(.2, .9, .3, 1.15); }
  .cdg-bubble { animation: cdg-float 1.6s ease-out forwards; }
  .cdg-dot { animation: cdg-pulse 1.4s ease-in-out infinite; }
}
`;

/** Page d'arrivée du rôle (croix de l'accueil quand on est arrivé ici directement). */
function homeFor(user) {
  if (user?.role === 'admin') return '/admin';
  if (user?.role === 'barber') return '/admin/me';
  return '/';
}

function Panel({ labelledBy, onClose, closeLabel, soft = false, children }) {
  return (
    <section className={`cdg-overlay${soft ? ' cdg-soft' : ''}`} aria-labelledby={labelledBy}>
      <div className="cdg-panel">
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

export default function CoupeTest() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();

  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const matchRef = useRef(null);
  const soundRef = useRef(null);
  const pointerRef = useRef(null);
  // Doigts posés, du plus ancien au plus récent : quand le doigt suivi se lève, on suit le dernier
  // qui reste (téléphone tenu à deux mains)
  const activePointersRef = useRef([]);
  const wakeRef = useRef(null);
  const wakeWantedRef = useRef(false);
  const timersRef = useRef(new Set());
  const taughtFingerRef = useRef(false);

  const [ui, setUi] = useState(INITIAL_UI);
  const [diag, setDiag] = useState({ ping: null, recalages: 0 });
  const [code, setCode] = useState('');
  const [soundOn, setSoundOn] = useState(true);
  const [hint, setHint] = useState(null);
  const [bubbles, setBubbles] = useState([]);
  const [endShown, setEndShown] = useState(false);
  const [reactLocked, setReactLocked] = useState(false);

  const later = (fn, ms) => {
    const id = setTimeout(() => { timersRef.current.delete(id); fn(); }, ms);
    timersRef.current.add(id);
    return id;
  };

  // Verrou d'écran pendant un match (essai silencieux : refusé ou absent, on joue quand même)
  const releaseWake = () => {
    wakeWantedRef.current = false;
    const lock = wakeRef.current;
    wakeRef.current = null;
    try { lock?.release?.()?.catch?.(() => {}); } catch { /* déjà relâché */ }
  };
  const requestWake = async () => {
    wakeWantedRef.current = true;
    if (wakeRef.current || typeof navigator === 'undefined' || !navigator.wakeLock || document.hidden) return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!wakeWantedRef.current) { lock.release().catch(() => {}); return; }
      wakeRef.current = lock;
      lock.addEventListener?.('release', () => { if (wakeRef.current === lock) wakeRef.current = null; });
    } catch {
      wakeRef.current = null;
    }
  };

  const showHint = (msg) => {
    const id = Date.now() + Math.random();
    setHint({ id, msg });
    later(() => setHint((h) => (h?.id === id ? null : h)), 2400);
  };

  const addBubble = ({ r, mine }) => {
    const id = Date.now() + Math.random();
    setBubbles((list) => [...list.slice(-5), { id, r, mine }]);
    later(() => setBubbles((list) => list.filter((b) => b.id !== id)), 1600);
  };

  // Dessin, sons, réseau et boucle d'animation : une fois, au montage
  useEffect(() => {
    const sound = createSound();
    soundRef.current = sound;
    setSoundOn(sound.isEnabled());
    const renderer = createRenderer(canvasRef.current, { reducedMotion: !!reduceMotion });
    rendererRef.current = renderer;

    const onEvent = (type, data) => {
      switch (type) {
        case 'start':
          renderer.setPlayers(data.names.map((name, i) => ({ name, role: data.roles[i] })));
          renderer.reset();
          sound.blip();
          setEndShown(false);
          if (!taughtFingerRef.current) {
            taughtFingerRef.current = true;
            showHint('Ton joueur suit ton doigt, juste au-dessus');
          }
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
          break;
        case 'end':
          if (data.won) {
            renderer.victory();
            sound.win();
            buzz('win');
          } else sound.lose();
          later(() => setEndShown(true), 450);
          break;
        case 'react':
          addBubble(data);
          break;
        case 'toast':
          showHint(data);
          break;
        default:
          break;
      }
    };

    const match = new OnlineMatch({ onChange: (next) => setUi(next), onEvent });
    matchRef.current = match;

    let raf = 0;
    let last = performance.now();
    let diagT = 0;
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      match.update(dt);
      renderer.render(match.getFrame(), dt);
      diagT += dt;
      if (diagT >= 0.25) {
        diagT = 0;
        const s = match.stats();
        setDiag((d) => (d.ping === s.ping && d.recalages === s.recalages ? d : s));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const timers = timersRef.current;
    return () => {
      cancelAnimationFrame(raf);
      match.destroy();
      renderer.destroy();
      sound.close();
      releaseWake();
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    };
    // Montage seulement : le mouvement réduit suit par l'effet ci-dessous
  }, []);

  useEffect(() => {
    rendererRef.current?.setReducedMotion(!!reduceMotion);
  }, [reduceMotion]);

  // Verrou d'écran : pris pendant le match, repris au retour au premier plan
  useEffect(() => {
    if (ui.status !== 'match') {
      releaseWake();
      return undefined;
    }
    requestWake();
    const onVisible = () => { if (!document.hidden) requestWake(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [ui.status]);

  // ─── Actions ───────────────────────────────────────────────────────

  const unlockSound = () => soundRef.current?.unlock();

  const backHome = () => {
    matchRef.current?.leave();
    rendererRef.current?.reset();
    pointerRef.current = null;
    activePointersRef.current = [];
    setEndShown(false);
    setBubbles([]);
  };

  const exitPage = () => {
    matchRef.current?.leave();
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(homeFor(user), { replace: true });
  };

  // Retour d'Android : quitte la salle ou le match (sur l'accueil, il quitte la page)
  useAndroidBack(ui.status !== 'idle', backHome);

  const create = () => {
    unlockSound();
    matchRef.current?.create();
  };

  const join = (e) => {
    e.preventDefault();
    unlockSound();
    if (code.length === 4) matchRef.current?.join(code);
  };

  const react = (r) => {
    if (!matchRef.current?.react(r)) return;
    setReactLocked(true);
    later(() => setReactLocked(false), 1000);
  };

  const toggleSound = () => {
    const s = soundRef.current;
    if (!s) return;
    s.setEnabled(!s.isEnabled());
    setSoundOn(s.isEnabled());
  };

  // ─── Doigt ─────────────────────────────────────────────────────────

  const aim = (e) => {
    const t = rendererRef.current?.fingerTarget(e.clientX, e.clientY, e.pointerType);
    if (t) matchRef.current?.setTarget(t.x, t.y);
  };
  const onPointerDown = (e) => {
    const m = matchRef.current;
    if (!m || m.ui.status !== 'match') return;
    e.preventDefault();
    activePointersRef.current = [...activePointersRef.current.filter((id) => id !== e.pointerId), e.pointerId];
    pointerRef.current = e.pointerId;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture impossible : on suit quand même */ }
    m.setFingerDown(true);
    aim(e);
  };
  const onPointerMove = (e) => {
    const m = matchRef.current;
    if (!m || m.ui.status !== 'match') return;
    // Souris : le joueur suit le pointeur même sans clic (essai sur ordinateur)
    if (pointerRef.current === e.pointerId || (pointerRef.current === null && e.pointerType === 'mouse')) aim(e);
  };
  const onPointerEnd = (e) => {
    activePointersRef.current = activePointersRef.current.filter((id) => id !== e.pointerId);
    if (pointerRef.current !== e.pointerId) return;
    const remaining = activePointersRef.current[activePointersRef.current.length - 1];
    if (remaining !== undefined) { pointerRef.current = remaining; return; }
    pointerRef.current = null;
    matchRef.current?.setFingerDown(false);
  };

  // ─── Écrans ────────────────────────────────────────────────────────

  const inMatch = ui.status === 'match' || ui.status === 'over';
  const opponent = ui.names[1] || "l'autre joueur";

  let screen = null;
  if (ui.status === 'idle') {
    screen = (
      <Panel labelledBy="cdg-title" onClose={exitPage} closeLabel="Fermer La Coupe du Gang">
        <p className="cdg-eyebrow">D&apos;Home Barber · essai en ligne</p>
        <h1 className="cdg-title" id="cdg-title">La <span>Coupe</span> <br />du Gang</h1>
        <p className="cdg-lead">Chacun sur son téléphone, en temps réel. Ton joueur suit ton doigt, le premier à 3 buts gagne.</p>
        <button type="button" className="cdg-btn cdg-primary" onClick={create}>
          Créer un match
          <small>Tu reçois un code à donner à l&apos;autre joueur</small>
        </button>
        <form className="flex flex-col gap-2.5" onSubmit={join}>
          <label className="cdg-label" htmlFor="cdg-code">Rejoindre un match</label>
          <div className="flex gap-2.5">
            <input
              id="cdg-code"
              className="cdg-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              enterKeyHint="go"
              maxLength={4}
              placeholder="Code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            <button type="submit" className="cdg-btn cdg-ghost" disabled={code.length !== 4}>Rejoindre</button>
          </div>
        </form>
        <ul className="cdg-rules">
          <li>Ton joueur reste dans ta moitié de terrain.</li>
          <li>Interdit d&apos;entrer dans ta petite surface.</li>
          <li>Ballon gardé 5 s dans une moitié : il change de camp.</li>
        </ul>
        <div className="cdg-foot">
          <button type="button" className="cdg-link" aria-pressed={soundOn} onClick={toggleSound}>
            Son : {soundOn ? 'activé' : 'coupé'}
          </button>
          <span>Essai réseau, sans points.</span>
        </div>
      </Panel>
    );
  } else if (ui.status === 'connecting') {
    screen = (
      <Panel labelledBy="cdg-connecting" onClose={backHome} closeLabel="Annuler">
        <p className="cdg-eyebrow">La Coupe du Gang</p>
        <h2 className="cdg-message" id="cdg-connecting">Connexion au serveur de jeu</h2>
        <Loader2 className="h-7 w-7 self-center text-[#ebc15e] motion-safe:animate-spin" aria-hidden="true" />
        <button type="button" className="cdg-btn cdg-ghost" onClick={backHome}>Annuler</button>
      </Panel>
    );
  } else if (ui.status === 'room') {
    screen = ui.side === 1 ? (
      <Panel labelledBy="cdg-found" onClose={backHome} closeLabel="Quitter le match">
        <p className="cdg-eyebrow">Match {ui.code}</p>
        <h2 className="cdg-message" id="cdg-found">Match trouvé</h2>
        <p className="cdg-wait" role="status"><span className="cdg-dot" aria-hidden="true" />Coup d&apos;envoi…</p>
      </Panel>
    ) : (
      <Panel labelledBy="cdg-room" onClose={backHome} closeLabel="Annuler le match">
        <p className="cdg-eyebrow" id="cdg-room">Code du match</p>
        <p className="cdg-code">{ui.code}</p>
        <p className="cdg-wait" role="status"><span className="cdg-dot" aria-hidden="true" />En attente de l&apos;autre joueur</p>
        <p className="cdg-lead">Sur l&apos;autre téléphone : La Coupe du Gang, puis « Rejoindre » avec ce code.</p>
        <button type="button" className="cdg-btn cdg-ghost" onClick={backHome}>Annuler</button>
      </Panel>
    );
  } else if (ui.status === 'over' && endShown && ui.result) {
    const [a, b] = ui.result.score;
    screen = (
      <Panel labelledBy="cdg-end" soft>
        <p className="cdg-eyebrow">Fin du match · essai sans points</p>
        <h2 className={`cdg-result${ui.result.won ? ' cdg-win' : ''}`} id="cdg-end">{ui.result.won ? 'Victoire' : 'Défaite'}</h2>
        <p className="cdg-final"><span>{a} – {b}</span><span className="cdg-who">Toi contre {opponent}</span></p>
        {ui.rematchAsked && (
          <p className="cdg-wait" role="status"><span className="cdg-dot" aria-hidden="true" />En attente de l&apos;autre joueur</p>
        )}
        <div className="cdg-row">
          <button type="button" className="cdg-btn cdg-primary" onClick={() => matchRef.current?.rematch()} disabled={ui.rematchAsked}>
            Revanche
          </button>
          <button type="button" className="cdg-btn cdg-ghost" onClick={backHome}>Quitter</button>
        </div>
      </Panel>
    );
  } else if (ui.status === 'error' && ui.error) {
    screen = (
      <Panel labelledBy="cdg-error" onClose={backHome} closeLabel="Fermer">
        <p className="cdg-eyebrow">La Coupe du Gang</p>
        <h2 className="cdg-message" id="cdg-error" role="alert">{ui.error.message}</h2>
        <div className={`cdg-row${ui.error.retry ? '' : ' cdg-single'}`}>
          {ui.error.retry && (
            <button type="button" className="cdg-btn cdg-primary" onClick={() => matchRef.current?.retry()}>Réessayer</button>
          )}
          <button type="button" className="cdg-btn cdg-ghost" onClick={backHome}>Retour</button>
        </div>
      </Panel>
    );
  }

  return (
    <div
      className="cdg-root fixed inset-0 z-50 overflow-hidden"
      style={{
        touchAction: 'none',
        overscrollBehavior: 'none',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'max(8px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(8px, env(safe-area-inset-right, 0px))',
      }}
      onPointerDownCapture={unlockSound}
    >
      <style>{PAGE_CSS}</style>
      <div className="mx-auto flex h-full w-full max-w-[540px] flex-col">
        <header className="flex h-[52px] shrink-0 items-center gap-2">
          {inMatch && (
            <>
              <button type="button" className="cdg-icon" onClick={backHome} aria-label="Quitter le match">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
              <p className="cdg-diag"><span>Ping {diag.ping ?? '…'} ms</span>{' '}<span>· recalages {diag.recalages}</span></p>
              <div className="flex gap-1" role="group" aria-label="Réactions">
                {REACTIONS.map(({ r, emoji, label }) => (
                  <button
                    key={r}
                    type="button"
                    className="cdg-react"
                    onClick={() => react(r)}
                    disabled={reactLocked}
                    aria-label={`Réagir : ${label}`}
                  >
                    <span aria-hidden="true">{emoji}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </header>
        <div className="relative min-h-0 flex-1">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 block h-full w-full"
            style={{ touchAction: 'none' }}
            role="img"
            aria-label="Terrain de foot vu du dessus, deux joueurs et un ballon"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          />
          {hint && <div className="cdg-hint" role="status">{hint.msg}</div>}
          {bubbles.map((b) => (
            <span key={b.id} className={`cdg-bubble ${b.mine ? 'cdg-mine' : 'cdg-theirs'}`} aria-hidden="true">
              {REACTIONS[b.r]?.emoji}
            </span>
          ))}
          {screen}
        </div>
      </div>
    </div>
  );
}
