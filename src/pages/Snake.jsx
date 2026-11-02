/**
 * Snake du Gang : `/snake` (contrat docs/fonctions/snake-du-gang-contrat.md, sections 5 et 6 ;
 * planche du 2 nov. 2026, `Main.dc.html`, `Partie.dc.html`, `Perdu.dc.html`).
 *
 * Une page, trois états dans le téléphone rétro : menu → partie (PRÊT ?, jeu, PAUSE) → fin.
 * Retour en haut à gauche : vers `/jeux` depuis le menu ; pendant une partie, il la termine
 * (`end: 'quit'`) et revient au menu (bouton retour d'Android aussi).
 * `/snake?jouer=1` ouvre directement l'écran de partie ; le paramètre est retiré de l'adresse.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { App as CapApp } from '@capacitor/app';
import SnakeShell from '@/components/snake/SnakeShell';
import SnakeMenu from '@/components/snake/game/SnakeMenu';
import SnakeGame from '@/components/snake/game/SnakeGame';
import { invalidateSnake, useSnakeMe } from '@/lib/snake/snakeApi';
import { flushPending, onPendingSent } from '@/lib/snake/pending';
import { useSnakePrefs } from '@/lib/snake/prefs';
import { useAndroidBack } from '@/lib/useAndroidBack';
import { isNative } from '@/lib/capacitor';

/**
 * Fins de partie restées sur l'appareil (coupure, page fermée en pleine partie) : renvoyées à
 * l'ouverture de `/snake`, au retour du réseau et au retour au premier plan ; record et classement
 * relus après chaque envoi réussi.
 */
function usePendingFlush() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const flush = () => { flushPending().catch(() => {}); };
    const off = onPendingSent(() => { invalidateSnake(queryClient); });
    const onVisible = () => { if (!document.hidden) flush(); };
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', onVisible);
    let handle = null;
    let gone = false;
    if (isNative) {
      try {
        Promise.resolve(CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive) flush(); }))
          .then((h) => { if (gone) h?.remove?.(); else handle = h; })
          .catch(() => {});
      } catch { /* module absent */ }
    }
    flush();
    return () => {
      gone = true;
      off();
      window.removeEventListener('online', flush);
      document.removeEventListener('visibilitychange', onVisible);
      try { handle?.remove?.(); } catch { /* déjà retiré */ }
    };
  }, [queryClient]);
}

export default function Snake() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState(() => (params.get('jouer') === '1' ? 'game' : 'menu'));
  const [prefs] = useSnakePrefs();
  const me = useSnakeMe();
  usePendingFlush();
  // Retour au menu depuis une partie : le focus revient sur « Nouvelle partie »
  const fromGame = useRef(false);

  // `?jouer=1` (« Jouer » de Vitesse et options, « Battre mon record » du classement)
  useEffect(() => {
    if (!params.has('jouer')) return;
    if (params.get('jouer') === '1') setView('game');
    const next = new URLSearchParams(params);
    next.delete('jouer');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const toMenu = () => {
    fromGame.current = true;
    setView('menu');
  };

  useAndroidBack(view === 'game', toMenu);

  const inGame = view === 'game';
  return (
    <SnakeShell
      title="Snake du Gang"
      backTo="/jeux"
      backLabel={inGame ? 'Retour au menu du jeu' : 'Retour aux jeux'}
      onBack={inGame ? toMenu : null}
      mainClassName="flex flex-1 flex-col items-center gap-5 px-3.5 pb-6 pt-3.5"
    >
      {inGame ? (
        <SnakeGame level={prefs.level} prefs={prefs} me={me} onMenu={toMenu} />
      ) : (
        <SnakeMenu level={prefs.level} me={me} onPlay={() => setView('game')} autoFocus={fromGame.current} />
      )}
    </SnakeShell>
  );
}
