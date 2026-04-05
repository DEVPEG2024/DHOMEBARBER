import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

export default function BackgroundMusic() {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const audio = new Audio('/ambiance.mp3');
    audio.loop = true;
    audio.volume = 0.1;
    audioRef.current = audio;

    // Start on first user interaction (browser autoplay policy)
    const startMusic = () => {
      if (!audioRef.current) return;
      audioRef.current.play().then(() => {
        setPlaying(true);
        setStarted(true);
      }).catch(() => {});
      document.removeEventListener('click', startMusic);
      document.removeEventListener('touchstart', startMusic);
    };

    document.addEventListener('click', startMusic);
    document.addEventListener('touchstart', startMusic);

    return () => {
      document.removeEventListener('click', startMusic);
      document.removeEventListener('touchstart', startMusic);
      audio.pause();
      audio.src = '';
    };
  }, []);

  const toggle = (e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  if (!started) return null;

  return (
    <button
      onClick={toggle}
      className="fixed bottom-20 right-4 z-50 w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white shadow-lg transition-transform active:scale-90"
      aria-label={playing ? 'Couper la musique' : 'Activer la musique'}
    >
      {playing ? <Volume2 size={18} /> : <VolumeX size={18} />}
    </button>
  );
}
