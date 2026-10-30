import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
// Chant de l'accueil de La Coupe du Gang (« On t'oublie pas », du propriétaire, 30 oct. 2026) :
// -20 LUFS, fondu de 1,5 s à la fin pour reboucler sur la montée du début
import COUPE_CHANT_URL from '@/assets/coupe/accueil-chant.mp3';

const MusicContext = createContext();

// Morceau joué selon la page (`MusicRouteSync`) : l'ambiance du salon, très discrète, partout ;
// le chant de la Coupe sur ses pages (/coupe, /coupe/classement, /coupe-test). Pendant un match,
// l'écran de jeu met ce morceau en pause et joue la tribune (useSalonMusicPaused, audioUnlock.js).
// Le volume ne marche pas sur iOS : le niveau de chaque fichier est aussi posé dans le fichier.
const TRACKS = {
  salon: { src: '/ambiance.mp3', volume: 0.01 }, // 1% — very subtle background
  coupe: { src: COUPE_CHANT_URL, volume: 1 },
};
// Choix « musique coupée » retenu d'une ouverture à l'autre : sans lui, le premier toucher
// relançait la musique à chaque ouverture de l'app
const OFF_KEY = 'dhb-music-off';

function readMusicOff() {
  try { return localStorage.getItem(OFF_KEY) === '1'; } catch { return false; }
}

function writeMusicOff(off) {
  try {
    if (off) localStorage.setItem(OFF_KEY, '1');
    else localStorage.removeItem(OFF_KEY);
  } catch { /* stockage indisponible : le choix vaut pour cette session */ }
}

export function MusicProvider({ children }) {
  const audioRef = useRef(null);
  const trackRef = useRef('salon');
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const playingRef = useRef(false);
  playingRef.current = playing;

  // Create audio element once
  useEffect(() => {
    // Morceau déjà choisi par la page (les effets des enfants passent avant celui-ci)
    const track = TRACKS[trackRef.current];
    const audio = new Audio(track.src);
    audio.loop = true;
    audio.volume = track.volume;
    audio.preload = 'auto';
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Autre morceau pour la page : le même lecteur (débloqué par le premier toucher sur iOS) change de
  // fichier et repart du début s'il jouait ; en pause, il le prépare seulement
  const setTrack = useCallback((key) => {
    const track = TRACKS[key];
    if (!track || trackRef.current === key) return;
    trackRef.current = key;
    const audio = audioRef.current;
    if (!audio) return;
    // Lecture en cours, ou demandée à l'instant (sortie du jeu sur une autre page)
    const wasPlaying = playingRef.current || !audio.paused;
    audio.src = track.src;
    audio.volume = track.volume;
    if (!wasPlaying) return;
    audio.play().then(() => setPlaying(true), () => setPlaying(false));
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
      writeMusicOff(true);
    } else {
      writeMusicOff(false);
      audio.play().then(() => {
        setPlaying(true);
        setStarted(true);
      }).catch(() => {
        // Autoplay blocked — will work on next user gesture
      });
    }
  }, [playing]);

  // Try to auto-start on first user interaction
  useEffect(() => {
    if (started) return;

    const startOnInteraction = () => {
      const audio = audioRef.current;
      if (!audio || started) return;
      // Coupée par l'utilisateur, ou espace admin (tablette du salon, agenda) : seul le bouton
      // lance la musique. Chemin lu au moment du toucher : le fournisseur est au-dessus du Router.
      if (readMusicOff()) return;
      if (/^\/admin(\/|$)/.test(window.location.pathname || '')) return;
      audio.play().then(() => {
        setPlaying(true);
        setStarted(true);
      }).catch(() => {});
    };

    // Pas de { once: true } : un premier toucher sur /admin ne doit pas consommer l'écoute
    // pour la suite de la session côté client (l'effet se nettoie dès que la musique démarre)
    document.addEventListener('click', startOnInteraction);
    document.addEventListener('touchstart', startOnInteraction);

    return () => {
      document.removeEventListener('click', startOnInteraction);
      document.removeEventListener('touchstart', startOnInteraction);
    };
  }, [started]);

  // App en arrière-plan (autre app, écran verrouillé, onglet caché) : la musique s'arrête et ne
  // reprend pas toute seule. Le choix « coupée » n'est pas enregistré : ce n'est pas l'utilisateur
  // qui l'a coupée. `started` reste vrai, donc pas de relance au toucher suivant non plus.
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) return;
      const audio = audioRef.current;
      if (audio && !audio.paused) audio.pause();
      setPlaying(false);
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Apps natives : l'événement « pause » de Capacitor arrive aussi quand la WebView ne
    // signale pas le passage en arrière-plan
    let handle = null;
    let disposed = false;
    if (Capacitor.isNativePlatform()) {
      Promise.resolve(App.addListener('pause', () => {
        const audio = audioRef.current;
        if (audio && !audio.paused) audio.pause();
        setPlaying(false);
      })).then((h) => {
        if (disposed) h?.remove?.();
        else handle = h;
      }).catch(() => {});
    }

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      handle?.remove?.();
    };
  }, []);

  return (
    <MusicContext.Provider value={{ playing, toggle, setTrack }}>
      {children}
    </MusicContext.Provider>
  );
}

export function useMusic() {
  return useContext(MusicContext);
}

/** Morceau d'une page : le chant de la Coupe sur ses pages, l'ambiance du salon ailleurs. */
export function musicTrackFor(pathname) {
  return /^\/coupe(\/|-test|$)/.test(pathname || '') ? 'coupe' : 'salon';
}

/** Dans le Router (le fournisseur est au-dessus) : choisit le morceau d'après la page. */
export function MusicRouteSync() {
  const { pathname } = useLocation();
  const setTrack = useMusic()?.setTrack;
  const track = musicTrackFor(pathname);
  useEffect(() => { setTrack?.(track); }, [setTrack, track]);
  return null;
}
