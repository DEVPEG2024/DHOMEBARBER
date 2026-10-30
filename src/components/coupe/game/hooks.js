/*
 * Petits crochets de l'écran de jeu de La Coupe du Gang.
 */
import { useEffect, useRef, useState } from 'react';
import { useMusic } from '@/lib/MusicContext';
import { unlockAudio } from '@/lib/coupe/audioUnlock';

// Choix « musique coupée » du MusicContext (dhb-music-off) : `toggle` l'écrit quand il met la
// musique en pause, alors que ce n'est pas le client qui l'a coupée ici
const MUSIC_OFF_KEY = 'dhb-music-off';

/**
 * Musique de l'app (sur les pages de la Coupe : le chant de l'accueil, voir MusicContext) en pause
 * pendant que `active` est vrai (match lancé : la tribune prend le relais ; son du jeu coupé), puis
 * reprise s'il l'a mise en pause : quand `active` repasse à faux et à la sortie de l'écran de jeu.
 * Aussi quand elle démarre pendant le jeu (premier toucher de la session, voir MusicContext). Le
 * choix « coupée » n'est jamais enregistré par le jeu.
 */
export function useSalonMusicPaused(active = true) {
  const music = useMusic();
  const musicRef = useRef(music);
  musicRef.current = music;
  const pausedRef = useRef(false);
  const playing = !!music?.playing;

  useEffect(() => {
    const m = musicRef.current;
    if (typeof m?.toggle !== 'function') return;
    if (active && playing) {
      m.toggle();
      pausedRef.current = true;
      try { localStorage.removeItem(MUSIC_OFF_KEY); } catch { /* stockage indisponible */ }
    } else if (!active && !playing && pausedRef.current) {
      pausedRef.current = false;
      m.toggle();
    }
  }, [active, playing]);

  useEffect(() => () => {
    const m = musicRef.current;
    if (pausedRef.current && m && !m.playing && typeof m.toggle === 'function') m.toggle();
  }, []);
}

/** Un champ de saisie a le focus (clavier ouvert : fiche « Signaler » sur iPad, par exemple). */
function fieldFocused() {
  if (typeof document === 'undefined') return false;
  if (document.body?.classList.contains('keyboard-open')) return true;
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName !== 'INPUT') return false;
  return !['button', 'checkbox', 'radio', 'range', 'reset', 'submit', 'color', 'file', 'image'].includes(String(el.type || '').toLowerCase());
}

/**
 * Vrai pendant une saisie (champ actif ou clavier ouvert) : la fenêtre rétrécie par le clavier ne
 * doit pas passer pour un téléphone tourné.
 */
/**
 * Son du jeu débloqué pendant le clic qui ouvre une partie (« Jouer », « Créer un match »,
 * « Rejoindre », « Défier »…) : au coup d'envoi, qui arrive du réseau sans geste, musique et
 * bruitages partent ensemble (avant : il fallait couper puis remettre le son). `musicOk` : musique
 * permise par le serveur (sinon son fichier n'est pas chargé).
 */
export function useAudioUnlockOnGesture(musicOk) {
  useEffect(() => {
    const prime = () => unlockAudio({ music: musicOk });
    const opts = { capture: true, passive: true };
    document.addEventListener('click', prime, opts);
    document.addEventListener('touchend', prime, opts);
    document.addEventListener('keydown', prime, opts);
    return () => {
      document.removeEventListener('click', prime, opts);
      document.removeEventListener('touchend', prime, opts);
      document.removeEventListener('keydown', prime, opts);
    };
  }, [musicOk]);
}

export function useTyping() {
  const [typing, setTyping] = useState(fieldFocused);
  useEffect(() => {
    let inTimer = 0;
    let outTimer = 0;
    // Entrée dans un champ : tout de suite (au tour suivant, le focus est posé). Sortie, ou fenêtre
    // redimensionnée : le clavier met ~300 ms à se refermer (la fenêtre reste petite), on relit après.
    const onIn = () => {
      clearTimeout(outTimer);
      clearTimeout(inTimer);
      inTimer = setTimeout(() => { if (fieldFocused()) setTyping(true); }, 0);
    };
    const onOut = () => {
      clearTimeout(outTimer);
      outTimer = setTimeout(() => setTyping(fieldFocused()), 350);
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    window.addEventListener('resize', onOut);
    return () => {
      clearTimeout(inTimer);
      clearTimeout(outTimer);
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
      window.removeEventListener('resize', onOut);
    };
  }, []);
  return typing;
}

/** Secondes restantes avant `deadline` (heure de l'appareil, ms), relues 4 fois par seconde. */
export function useSecondsLeft(deadline) {
  const read = () => (deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0);
  const [left, setLeft] = useState(read);
  useEffect(() => {
    if (!deadline) return undefined;
    setLeft(read());
    const id = setInterval(() => setLeft(read()), 250);
    return () => clearInterval(id);
    // `read` ne dépend que de `deadline`
  }, [deadline]);
  return left;
}

/** Vrai tant que la requête média correspond (téléphone tourné, par exemple). */
export function useMediaQuery(query) {
  const get = () => {
    try { return typeof window !== 'undefined' && !!window.matchMedia?.(query).matches; } catch { return false; }
  };
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia(query); } catch { return undefined; }
    const on = () => setMatches(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener?.(on);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener?.(on);
    };
  }, [query]);
  return matches;
}

/**
 * Écran gardé allumé tant que `active` (match en cours), repris au retour au premier plan. Essai
 * silencieux : refusé ou absent, on joue quand même.
 */
export function useWakeLock(active) {
  const lockRef = useRef(null);
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.wakeLock) return undefined;
    let wanted = true;
    const request = async () => {
      if (!wanted || lockRef.current || document.hidden) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (!wanted) { lock.release().catch(() => {}); return; }
        lockRef.current = lock;
        lock.addEventListener?.('release', () => { if (lockRef.current === lock) lockRef.current = null; });
      } catch {
        lockRef.current = null;
      }
    };
    const onVisible = () => { if (!document.hidden) request(); };
    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      wanted = false;
      document.removeEventListener('visibilitychange', onVisible);
      const lock = lockRef.current;
      lockRef.current = null;
      try { lock?.release?.()?.catch?.(() => {}); } catch { /* déjà relâché */ }
    };
  }, [active]);
}
