import React from 'react';
import { PauseCircle, RefreshCw, WifiOff } from 'lucide-react';
import { isNetworkError } from '@/components/shared/LoadError';
import { isSnakeClosed } from './snakeErrors';
import { SNAKE_COLORS as C } from './palette';

/**
 * Chargement raté sur un écran du Snake du Gang : même rôle que `LoadError` (à afficher à la place
 * d'un état vide, après `queryFailed`), sombre partout (il pose lui-même ses couleurs : garde
 * d'App.jsx, page Jeux) et au tutoiement. Jeu coupé par le serveur (`disabled`) : « Le Snake fait
 * une pause », sans « Réessayer ».
 *
 *   if (queryFailed(query)) return <SnakeLoadError compact what="le classement" error={query.error} onRetry={query.refetch} />;
 */
export default function SnakeLoadError({ what = 'le Snake du Gang', error, onRetry, retrying = false, compact = false, className = '' }) {
  const closed = isSnakeClosed(error);
  const offline = !closed && (error ? isNetworkError(error) : typeof navigator !== 'undefined' && navigator.onLine === false);
  const Icon = closed ? PauseCircle : WifiOff;
  let title = `Impossible de charger ${what}`;
  let text = 'Le serveur n’a pas répondu. Réessaie dans un instant.';
  if (closed) {
    title = 'Le Snake fait une pause';
    text = 'Le salon a mis le jeu en pause. Reviens un peu plus tard.';
  } else if (offline) {
    title = 'Pas de connexion internet';
    text = `Vérifie ton réseau, puis réessaie pour afficher ${what}.`;
  }
  return (
    <div
      role="alert"
      className={`flex flex-col items-center rounded-2xl border text-center ${compact ? 'px-4 py-5' : 'px-6 py-10'} ${className}`}
      style={{ background: C.carte, borderColor: 'rgba(255, 255, 255, 0.1)', colorScheme: 'dark' }}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'rgba(61, 190, 126, 0.12)' }}>
        <Icon className="h-5 w-5" style={{ color: C.vertTexte }} aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-snug" style={{ color: C.gris }}>{text}</p>
      {onRetry && !closed && (
        <button
          type="button"
          onClick={() => onRetry()}
          disabled={retrying}
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          style={{ background: C.vert }}
        >
          <RefreshCw className={`h-4 w-4 ${retrying ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
          Réessayer
        </button>
      )}
    </div>
  );
}
