import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

const MusicContext = createContext();

// Path to the audio file in public/ or an external URL
const MUSIC_SRC = '/ambiance.mp3';
const DEFAULT_VOLUME = 0.01; // 1% — very subtle background
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
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);

  // Create audio element once
  useEffect(() => {
    const audio = new Audio(MUSIC_SRC);
    audio.loop = true;
    audio.volume = DEFAULT_VOLUME;
    audio.preload = 'auto';
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
    };
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
    <MusicContext.Provider value={{ playing, toggle }}>
      {children}
    </MusicContext.Provider>
  );
}

export function useMusic() {
  return useContext(MusicContext);
}
