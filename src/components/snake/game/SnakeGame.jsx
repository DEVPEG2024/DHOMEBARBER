import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useReducedMotion } from 'framer-motion';
import { App as CapApp } from '@capacitor/app';
import { UP, RIGHT, DOWN, LEFT } from '@/lib/snake/engine';
import { invalidateSnake } from '@/lib/snake/snakeApi';
import { createSnakeSound } from '@/lib/snake/sound';
import { vibrate } from '@/lib/snake/haptics';
import { isNative } from '@/lib/capacitor';
import { useSalonMusicPaused, useWakeLock } from '@/components/coupe/game/hooks';
import { createSnakeController } from './controller';
import { localTexts } from './texts';
import GameField from './GameField';
import EndScreen from './EndScreen';
import Phone from './Phone';
import Keypad, { Key, DigitArrow, DigitWord, KeyWord } from './Keypad';
import { SNAKE_COLORS as C } from '../palette';

/**
 * Snake du Gang : écran de partie de `/snake` (PRÊT ? → partie → fin), dans le téléphone rétro
 * (planches `Partie.dc.html` et `Perdu.dc.html`). Contrat : docs/fonctions/snake-du-gang-contrat.md,
 * section 6. Le déroulé est dans `controller.js` ; ici les gestes, le clavier, la pause automatique,
 * l'écran gardé allumé et ce qui s'affiche.
 *
 * Quitter l'écran (retour, Menu, page fermée par le routeur) termine la partie en cours (`quit`).
 */

// Clavier : flèches, 2 4 6 8, ZQSD et WASD
const KEY_DIRS = {
  ArrowUp: UP, ArrowRight: RIGHT, ArrowDown: DOWN, ArrowLeft: LEFT,
  2: UP, 6: RIGHT, 8: DOWN, 4: LEFT,
  z: UP, w: UP, d: RIGHT, s: DOWN, q: LEFT, a: LEFT,
};

const INITIAL_UI = { status: 'ready', score: 0, level: 5, local: null, waiting: false, seeded: false, ranked: false, result: null, finish: { state: 'idle' }, gen: 0, live: '' };

function typingIn(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/** Bandeau « partie non classée », avec la raison exacte. */
function LocalBanner({ reason }) {
  const { Icon, banner } = localTexts(reason);
  return (
    <p role="status" className="mb-1 inline-flex max-w-full items-center gap-2 rounded-2xl border px-3 py-1.5 text-left text-[13px] font-semibold" style={{ background: C.carte, borderColor: 'rgba(255, 255, 255, 0.1)', color: C.grisClair }}>
      <Icon className="h-4 w-4 shrink-0" style={{ color: C.or }} aria-hidden="true" />
      {banner}
    </p>
  );
}

export default function SnakeGame({ level, prefs, me, onMenu }) {
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();
  const [ui, setUi] = useState(() => ({ ...INITIAL_UI, level }));
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const statsRef = useRef(null);
  const rootRef = useRef(null);
  // Place au classement avant la partie : « Tu restes 6e » ou « Tu passes 4e » à la fin
  const prevRankRef = useRef(me?.data?.rank ?? null);

  const soundRef = useRef(null);
  if (!soundRef.current) soundRef.current = createSnakeSound();

  const controllerRef = useRef(null);
  if (!controllerRef.current) {
    controllerRef.current = createSnakeController({
      level,
      reducedMotion: !!reducedMotion,
      emit: (patch) => setUi((u) => ({ ...u, ...patch })),
      sfx: (name) => { if (prefsRef.current?.bips) soundRef.current.play(name); },
      buzz: (kind) => { if (prefsRef.current?.vibrations) vibrate(kind); },
      unlockSound: () => { if (prefsRef.current?.bips) soundRef.current.unlock(); },
      onFinished: () => invalidateSnake(queryClient),
      onStep: (game) => {
        const root = rootRef.current;
        if (root) root.dataset.tick = String(game ? game.tick : 0);
        const el = statsRef.current;
        if (!el) return;
        const bonus = game && game.bonus;
        el.hidden = !bonus;
        const left = el.querySelector('[data-bonus-left]');
        if (left) left.textContent = bonus ? String(bonus.left) : '';
      },
    });
  }
  const ctl = controllerRef.current;

  useEffect(() => {
    ctl.start(level);
    return () => ctl.destroy();
    // Une partie par montage de l'écran ; le niveau suivant passe par `setLevel`
  }, [ctl]);

  useEffect(() => { ctl.setLevel(level); }, [ctl, level]);
  useEffect(() => { ctl.setReducedMotion(!!reducedMotion); }, [ctl, reducedMotion]);

  // Place connue avant la partie (relue au retour de PRÊT ?)
  useEffect(() => {
    if (ui.status === 'ready' && me?.data) prevRankRef.current = me.data.rank ?? null;
  }, [ui.status, me?.data]);

  const playing = ui.status === 'play' || ui.status === 'pause' || ui.status === 'dying';
  useWakeLock(ui.status === 'play');
  useSalonMusicPaused(playing);

  // Son débloqué à chaque geste de l'écran : une touche « rapide » agit au `pointerdown`, que
  // Safari ne compte pas comme un geste pour le son (il lui faut le doigt levé ou un clic)
  useEffect(() => {
    const prime = () => { if (prefsRef.current?.bips) soundRef.current.unlock(); };
    const opts = { capture: true, passive: true };
    const events = ['pointerup', 'touchend', 'click', 'keydown'];
    for (const ev of events) document.addEventListener(ev, prime, opts);
    return () => { for (const ev of events) document.removeEventListener(ev, prime, opts); };
  }, []);

  // Pause quand l'onglet est caché, la fenêtre perd le focus (ordinateur) ou l'app passe en
  // arrière-plan ; réseau revenu : ticket redemandé sur PRÊT ? ; page fermée ou rechargée en pleine
  // partie : la fin `quit` part dans la file. Les fins en file sont relancées par la page (Snake.jsx)
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) ctl.pause(); };
    const onBlur = () => ctl.pause();
    const onOnline = () => ctl.onOnline();
    const onPageHide = () => ctl.stash();
    const onPageShow = (e) => { if (e.persisted) ctl.unstash(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('online', onOnline);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    let handle = null;
    let gone = false;
    if (isNative) {
      try {
        Promise.resolve(CapApp.addListener('appStateChange', ({ isActive }) => { if (!isActive) ctl.pause(); }))
          .then((h) => { if (gone) h?.remove?.(); else handle = h; })
          .catch(() => {});
      } catch { /* module absent */ }
    }
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      try { handle?.remove?.(); } catch { /* déjà retiré */ }
    };
  }, [ctl]);

  // Clavier (sauf à la fin : les boutons de l'écran de fin suffisent)
  const status = ui.status;
  useEffect(() => {
    if (status === 'end') return undefined;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (typingIn(e.target)) return;
      const k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (Object.prototype.hasOwnProperty.call(KEY_DIRS, k)) {
        e.preventDefault();
        ctl.turn(KEY_DIRS[k]);
        return;
      }
      if (k === 'Escape') {
        ctl.pause();
        return;
      }
      // Entrée et Espace sur un bouton ou un lien : c'est lui qui agit
      const onControl = e.target && e.target.closest && e.target.closest('button, a, [role="switch"]');
      if (k === '5' || ((k === ' ' || k === 'Enter') && !onControl)) {
        e.preventDefault();
        if (!e.repeat) ctl.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctl, status]);

  const replay = useCallback(() => ctl.newGame(), [ctl]);
  const record = me?.data?.record?.score;

  // Nom accessible = texte affiché (WCAG 2.5.3), suivi de l'action
  const okWord = status === 'play' ? 'PAUSE' : 'GO';
  const okLabel = status === 'play' ? '5 PAUSE' : status === 'pause' ? '5 GO (reprendre)' : '5 GO (lancer)';
  const turnKey = (digit, arrow, dir, label) => (
    <Key label={label} fast onPress={() => ctl.turn(dir)}>
      <DigitArrow digit={digit} arrow={arrow} />
    </Key>
  );

  const ticketState = ui.seeded ? (ui.ranked ? 'classee' : 'locale') : 'attente';

  return (
    <div
      ref={rootRef}
      data-snake-game=""
      data-statut={status}
      data-ticket={ticketState}
      className="flex w-full flex-col items-center gap-5"
    >
      {status === 'end' ? (
        <EndScreen
          result={ui.result}
          finish={ui.finish}
          local={ui.local}
          me={me}
          prevRank={prevRankRef.current}
          onReplay={replay}
          onRetry={() => ctl.retryFinish()}
        />
      ) : (
        <>
          <Phone>
            <GameField
              key={ui.gen}
              controller={ctl}
              status={status}
              score={ui.score}
              level={ui.level}
              waiting={ui.waiting}
              statsRef={statsRef}
            />
            <Keypad
              slots={[
                <Key key="menu" onPress={onMenu}><KeyWord>Menu</KeyWord></Key>,
                turnKey('2', 'up', UP, 'Haut (2)'),
                <Key key="again" onPress={() => ctl.restart()}><KeyWord>Rejouer</KeyWord></Key>,
                turnKey('4', 'left', LEFT, 'Gauche (4)'),
                <Key key="ok" label={okLabel} fast green onPress={() => ctl.toggle()} disabled={status === 'dying'}>
                  <DigitWord word={okWord} />
                </Key>,
                turnKey('6', 'right', RIGHT, 'Droite (6)'),
                null,
                turnKey('8', 'down', DOWN, 'Bas (8)'),
                null,
              ]}
            />
          </Phone>

          <div className="flex flex-col items-center gap-1.5 text-center">
            {ui.seeded && ui.local && <LocalBanner reason={ui.local} />}
            <p className="text-[15px] text-white">
              {Number.isFinite(record) ? (
                <>Record <strong className="font-pixel font-bold" style={{ color: C.or }}>{record}</strong> · niveau {ui.level}</>
              ) : (
                <>Niveau {ui.level}</>
              )}
            </p>
            <p className="text-[13px]" style={{ color: C.gris }}>Glisse sur l’écran ou touche 2 4 6 8. 5 : pause.</p>
          </div>
        </>
      )}
      <p className="sr-only" aria-live="polite">{ui.live}</p>
    </div>
  );
}
