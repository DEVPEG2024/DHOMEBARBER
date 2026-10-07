import React from 'react';
import { useLocation } from 'react-router-dom';
import { useMusic } from '@/lib/MusicContext';
import { Volume2, VolumeX } from 'lucide-react';

/**
 * Bouton musique des pages client : petit, en haut à droite, sous la zone de sécurité.
 * Il est en position **absolue** (pas fixe) : il défile avec la page, donc ne passe jamais
 * par-dessus les barres collantes (catégories), les barres fixées en bas (panier, sélection,
 * « Suivant ») ni le contenu qui défile. La musique démarre au premier tap (MusicContext) :
 * il faut pouvoir la couper sur chaque page.
 *
 * Quelques pages ont déjà un élément à droite de leur première rangée : le bouton se place
 * alors sous cette rangée, ou au centre. Vérifié à 320, 375, 390 et 430 px sur toutes les routes
 * client : à revoir si l'en-tête d'une page change.
 */
const PLACEMENTS = [
  // Profil barber : « Retour » à gauche, points de pagination à droite → au centre de la rangée
  { match: (p) => p.startsWith('/barber/'), top: 4, center: true },
  // Filtres Snap, essayage couleur : « Retour » + badge Snap ou sélecteur Caméra / Photo → dessous
  { match: (p) => p === '/snap' || p === '/try-on', top: 60 },
  // Cartes cadeau : bouton « Offrir » en haut à droite → sous l'en-tête
  { match: (p) => p === '/gift-cards', top: 68 },
];
const DEFAULT_PLACEMENT = { top: 4, center: false };

export default function MusicToggle() {
  const { playing, toggle } = useMusic();
  const { pathname } = useLocation();

  // Sur l'accueil le bouton est intégré au hero (rangée des réseaux sociaux) :
  // pas de bouton flottant par-dessus les cartes d'information
  if (pathname === '/') return null;
  // L'administration a son propre bouton, dans son en-tête
  if (pathname.startsWith('/admin')) return null;

  const { top, center } = PLACEMENTS.find((p) => p.match(pathname)) || DEFAULT_PLACEMENT;

  return (
    <button
      type="button"
      onClick={toggle}
      style={{ top: `calc(env(safe-area-inset-top, 0px) + ${top}px)` }}
      className={`absolute z-40 w-8 h-8 rounded-full backdrop-blur-xl bg-white/10 border border-white/15 flex items-center justify-center shadow-lg transition-transform active:scale-90 hover:bg-white/15 ${
        center ? 'left-1/2 -translate-x-1/2' : 'right-3'
      }`}
      aria-label={playing ? 'Couper la musique' : 'Activer la musique'}
      data-music-toggle=""
    >
      {playing ? (
        <Volume2 className="w-4 h-4 text-primary" />
      ) : (
        <VolumeX className="w-4 h-4 text-muted-foreground" />
      )}
    </button>
  );
}
