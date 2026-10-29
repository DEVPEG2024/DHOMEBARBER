import React, { useState } from 'react';
import { Scissors, Star } from 'lucide-react';
import { BARBER_PHOTO_ASPECT, BARBER_PHOTO_BG } from '@/lib/barberPhoto';
import { ROLE_BARBER, ROLE_SALON, avatarTone, initialsOf } from './coupeFormat';

/**
 * Avatar d'un joueur de la Coupe (maquettes « Accueil de la Coupe » et « Classement ») :
 *  - barber : sa photo **en portrait** (1748 × 2480, jamais ronde ni carrée), initiale sinon ;
 *  - client : rond, sa photo ou ses initiales sur un fond tiré de sa clé ;
 *  - salon (« D'Home Barber ») : le logo du salon, en tuile carrée arrondie (comme dans le fil).
 * `size` : `row` (liste du classement), `preview` (accueil), `podium`, `first` (1re place), `sheet`.
 */
export const SALON_LOGO = '/icons/icon-192.png';

const SIZES = {
  row: { round: 36, portrait: 26, tile: 36, portraitRadius: 6, tileRadius: 10, text: 12 },
  preview: { round: 36, portrait: 28, tile: 36, portraitRadius: 6, tileRadius: 10, text: 13 },
  podium: { round: 58, portrait: 58, tile: 58, portraitRadius: 10, tileRadius: 14, text: 18 },
  first: { round: 68, portrait: 64, tile: 64, portraitRadius: 12, tileRadius: 16, text: 20 },
  sheet: { round: 64, portrait: 56, tile: 64, portraitRadius: 10, tileRadius: 16, text: 20 },
};

/** Image qui retombe sur son remplaçant si elle ne charge pas (média supprimé, hors ligne). */
function Photo({ src, fallback }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return fallback;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className="block h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export default function PlayerAvatar({ role, name, url, seed, size = 'row', ring = null, className = '' }) {
  const s = SIZES[size] || SIZES.row;
  const border = ring ? { boxShadow: `0 0 0 2px ${ring}` } : null;

  if (role === ROLE_SALON) {
    return (
      <span
        className={`block shrink-0 overflow-hidden bg-black ${className}`}
        style={{ width: s.tile, height: s.tile, borderRadius: s.tileRadius, ...border }}
        aria-hidden="true"
      >
        <img src={SALON_LOGO} alt="" className="block h-full w-full object-cover" decoding="async" />
      </span>
    );
  }

  if (role === ROLE_BARBER) {
    const initial = (String(name || '').trim().charAt(0) || '?').toUpperCase();
    return (
      <span
        className={`block shrink-0 overflow-hidden ${className}`}
        style={{ width: s.portrait, aspectRatio: BARBER_PHOTO_ASPECT, background: BARBER_PHOTO_BG, borderRadius: s.portraitRadius, ...border }}
        aria-hidden="true"
      >
        <Photo
          src={url}
          fallback={(
            <span className="flex h-full w-full items-center justify-center font-fut font-bold text-[#eef3ef]" style={{ fontSize: s.text }}>
              {initial}
            </span>
          )}
        />
      </span>
    );
  }

  return (
    <span
      className={`block shrink-0 overflow-hidden rounded-full ${className}`}
      style={{ width: s.round, height: s.round, background: avatarTone(seed || name), ...border }}
      aria-hidden="true"
    >
      <Photo
        src={url}
        fallback={(
          <span className="flex h-full w-full items-center justify-center font-semibold text-[#eef3ef]" style={{ fontSize: s.text }}>
            {initialsOf(name)}
          </span>
        )}
      />
    </span>
  );
}

/** Marque du rôle à côté du nom : étoile bleue du salon, ciseaux d'un barber, rien pour un client. */
export function RoleMark({ role, size = 14 }) {
  if (role === ROLE_SALON) {
    return <Star role="img" aria-label="Le salon" className="shrink-0 fill-[#3b82f6] text-[#3b82f6]" style={{ width: size, height: size }} strokeWidth={1.5} />;
  }
  if (role === ROLE_BARBER) {
    return <Scissors role="img" aria-label="Barber" className="shrink-0 text-[#9db0a6]" style={{ width: size, height: size }} strokeWidth={2.2} />;
  }
  return null;
}
