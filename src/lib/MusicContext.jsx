import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

const MusicContext = createContext();

// Path to the audio file in public/ or an external URL
const MUSIC_SRC = '/ambiance.mp3';
const DEFAULT_VOLUME = 0.15; // 15% — subtle background

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
    } else {
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
      audio.play().then(() => {
        setPlaying(true);
        setStarted(true);
      }).catch(() => {});
    };

    document.addEventListener('click', startOnInteraction, { once: true });
    document.addEventListener('touchstart', startOnInteraction, { once: true });

    return () => {
      document.removeEventListener('click', startOnInteraction);
      document.removeEventListener('touchstart', startOnInteraction);
    };
  }, [started]);

  return (
    <MusicContext.Provider value={{ playing, toggle }}>
      {children}
    </MusicContext.Provider>
  );
}

export function useMusic() {
  return useContext(MusicContext);
}
