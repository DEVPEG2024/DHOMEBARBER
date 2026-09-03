import React from 'react';
import { useLocation } from 'react-router-dom';
import { useMusic } from '@/lib/MusicContext';
import { Volume2, VolumeX } from 'lucide-react';

export default function MusicToggle() {
  const { playing, toggle } = useMusic();
  const { pathname } = useLocation();

  // Sur l'accueil le bouton est intégré au hero (rangée des réseaux sociaux) :
  // pas de bouton flottant par-dessus les cartes d'information
  if (pathname === '/') return null;

  return (
    <button
      onClick={toggle}
      className="fixed bottom-36 right-4 z-50 w-10 h-10 rounded-full backdrop-blur-xl bg-white/10 border border-white/15 flex items-center justify-center shadow-lg transition-all active:scale-90 hover:bg-white/15"
      aria-label={playing ? 'Couper la musique' : 'Activer la musique'}
    >
      {playing ? (
        <Volume2 className="w-4 h-4 text-primary" />
      ) : (
        <VolumeX className="w-4 h-4 text-muted-foreground" />
      )}
    </button>
  );
}
