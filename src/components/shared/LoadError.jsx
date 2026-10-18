import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

/** Vrai si l'erreur vient du réseau (pas de réponse du serveur), pas d'un refus. */
export function isNetworkError(err) {
  if (!err) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (err.status || err.response?.status) return false;
  return /failed to fetch|load failed|network|networkerror|fetch/i.test(String(err.message || ''));
}

/**
 * Message d'erreur en français pour un toast : jamais « Load failed », « Failed to fetch » ni
 * « HTTP 503 ». Réseau / délai → « Pas de connexion… » ; réponse du serveur → son message (sinon le
 * repli) ; erreur levée dans l'app (HEIC, « Permission refusée »…) → son message, déjà en français ;
 * erreur d'une API du navigateur (DOMException du push) → `foreign` quand il est fourni.
 *
 *   toast.error(friendlyError(err, 'Erreur lors de la mise à jour'));
 */
export function friendlyError(err, fallback, { foreign } = {}) {
  if (isNetworkError(err)) return 'Pas de connexion internet. Vérifiez votre réseau, puis réessayez.';
  if (err?.timeout) return 'Le serveur met trop de temps à répondre. Réessayez dans un instant.';
  const status = err?.status || err?.response?.status;
  const msg = String(err?.message || '').trim();
  const serverMsg = err?.data?.error || err?.data?.message;
  if (/^HTTP \d+$/.test(msg) || (status >= 500 && !serverMsg)) return 'Le serveur ne répond pas. Réessayez dans un instant.';
  if (status === 429 && !serverMsg) return 'Trop de tentatives. Réessayez dans quelques minutes.';
  if (status) return serverMsg || (msg && !/^HTTP/.test(msg) ? msg : fallback);
  if (foreign && err?.name && err.name !== 'Error') return foreign;
  return msg || fallback;
}

/**
 * Vrai quand une requête React Query n'a rien pu montrer : échec sans données, ou requête mise en
 * pause hors connexion (React Query 5 : `fetchStatus === 'paused'`, ni isError ni isLoading) alors
 * qu'elle n'a encore rien chargé (ou n'affiche que les données d'une autre période,
 * `keepPreviousData`). Une requête désactivée reste `idle` : jamais considérée en échec.
 *
 *   if (queryFailed(query)) return <LoadError what="vos commandes" error={query.error} onRetry={query.refetch} />;
 */
export function queryFailed(q) {
  if (!q) return false;
  return (q.isError && !q.data) || (q.fetchStatus === 'paused' && (q.isPending || q.isPlaceholderData));
}

/**
 * État d'erreur d'une liste qui n'a pas pu se charger : à afficher À LA PLACE de l'état vide
 * (« Aucune commande »…), sinon le client croit que ses données ont disparu.
 *
 *   if (query.isError && !query.data) return <LoadError what="vos commandes" onRetry={query.refetch} />;
 */
export default function LoadError({ what = 'cette page', error, onRetry, retrying = false, compact = false, className = '' }) {
  const offline = error ? isNetworkError(error) : typeof navigator !== 'undefined' && navigator.onLine === false;
  return (
    <div
      role="alert"
      className={`flex flex-col items-center text-center rounded-2xl border border-border bg-card/60 ${compact ? 'px-4 py-5' : 'px-6 py-10'} ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center mb-3">
        <WifiOff className="w-5 h-5 text-amber-400" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-foreground">
        {offline ? 'Pas de connexion internet' : `Impossible de charger ${what}`}
      </p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        {offline
          ? `Vérifiez votre réseau, puis réessayez pour afficher ${what}.`
          : 'Le serveur n’a pas répondu. Réessayez dans un instant.'}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={() => onRetry()}
          disabled={retrying}
          className="mt-4 h-10 px-4 inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" />
          Réessayer
        </button>
      )}
    </div>
  );
}
