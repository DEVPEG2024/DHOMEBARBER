import React from 'react';
import { PauseCircle, RefreshCw, WifiOff } from 'lucide-react';
import { isNetworkError } from '@/components/shared/LoadError';
import { isCoupeClosed } from './coupeErrors';

/**
 * Chargement raté sur un écran de La Coupe du Gang : même rôle que `LoadError` (à afficher à la
 * place d'un état vide, après `queryFailed`), aux couleurs sombres du jeu et au tutoiement.
 * Jeu coupé par le serveur (`disabled`) : « La Coupe fait une pause », sans « Réessayer ».
 *
 *   if (queryFailed(query)) return <CoupeLoadError compact what="tes points" error={query.error} onRetry={query.refetch} />;
 */
export default function CoupeLoadError({ what = 'la Coupe du Gang', error, onRetry, retrying = false, compact = false, className = '' }) {
  const closed = isCoupeClosed(error);
  const offline = !closed && (error ? isNetworkError(error) : typeof navigator !== 'undefined' && navigator.onLine === false);
  const Icon = closed ? PauseCircle : WifiOff;
  let title = `Impossible de charger ${what}`;
  let text = 'Le serveur n’a pas répondu. Réessaie dans un instant.';
  if (closed) {
    title = 'La Coupe fait une pause';
    text = 'Le salon a mis le jeu en pause. Reviens un peu plus tard.';
  } else if (offline) {
    title = 'Pas de connexion internet';
    text = `Vérifie ton réseau, puis réessaie pour afficher ${what}.`;
  }
  return (
    <div
      role="alert"
      className={`flex flex-col items-center rounded-2xl border border-white/8 bg-[#12171a] text-center ${compact ? 'px-4 py-5' : 'px-6 py-10'} ${className}`}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#ebc15e]/25 bg-[rgba(235,193,94,.1)]">
        <Icon className="h-5 w-5 text-[#ebc15e]" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-[#eef3ef]">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-snug text-[#9db0a6]">{text}</p>
      {onRetry && !closed && (
        <button
          type="button"
          onClick={() => onRetry()}
          disabled={retrying}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#ebc15e] px-4 text-sm font-semibold text-[#1a1205] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ebc15e]"
        >
          <RefreshCw className={`h-4 w-4 ${retrying ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
          Réessayer
        </button>
      )}
    </div>
  );
}
