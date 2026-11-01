/**
 * Briques communes des blocs du tableau de bord (refonte du 1er nov. 2026).
 *
 * Règles de mise en page, pour tous les blocs :
 *  - libellés en 12 px au moins (`text-xs`), précisions en 11 px (`text-[11px]`), jamais en dessous ;
 *  - couleurs d'alerte par paires clair / sombre (`TONE`) : le jaune clair était illisible en mode clair ;
 *  - montants par `euro()` (« 4 950 € »), en chiffres alignés (`tabular-nums`) ;
 *  - chargement « … », échec « — » : jamais « 0 € » quand une source manque ;
 *  - ce qui est cliquable est un vrai bouton ou lien (clavier, lecteur d'écran), 44 px de haut au moins ;
 *  - animations : transform et opacité seulement, coupées par « réduire les animations » (MotionConfig
 *    de la page).
 */
import React, { useId } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, RefreshCw, WifiOff } from 'lucide-react';
import { euro } from '@/lib/euro';
import { isNetworkError } from '@/components/shared/LoadError';

/** Texte coloré lisible dans les deux thèmes. */
export const TONE = {
  amber: 'text-amber-700 dark:text-amber-400',
  green: 'text-emerald-700 dark:text-emerald-400',
  red: 'text-red-700 dark:text-red-400',
  blue: 'text-blue-700 dark:text-blue-400',
  orange: 'text-orange-700 dark:text-orange-400',
  pink: 'text-pink-700 dark:text-pink-400',
  violet: 'text-violet-700 dark:text-violet-400',
  primary: 'text-primary',
  muted: 'text-muted-foreground',
};

/** Fond + bordure d'une pastille ou d'un bandeau, avec le texte assorti. */
export const TONE_BOX = {
  amber: 'bg-amber-500/10 border-amber-600/50 dark:border-amber-500/30 text-amber-800 dark:text-amber-300',
  green: 'bg-emerald-500/10 border-emerald-600/50 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300',
  red: 'bg-red-500/10 border-red-600/50 dark:border-red-500/30 text-red-800 dark:text-red-300',
  blue: 'bg-blue-500/10 border-blue-600/50 dark:border-blue-500/30 text-blue-800 dark:text-blue-300',
  orange: 'bg-orange-500/10 border-orange-600/50 dark:border-orange-500/30 text-orange-800 dark:text-orange-300',
  muted: 'bg-secondary/60 border-border text-muted-foreground',
};

/**
 * Bloc du tableau de bord : `<section>` titrée (h2), carte.
 * @param {{ title: string, icon?: React.ComponentType, action?: React.ReactNode, hint?: string,
 *   className?: string, children: React.ReactNode }} props
 */
export function Section({ title, icon: Icon, action = null, hint = '', className = '', children }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`bg-card border border-border rounded-2xl p-4 sm:p-5 min-w-0 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 id={id} className="text-sm font-semibold text-foreground flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />}
            <span className="min-w-0">{title}</span>
          </h2>
          {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Montant : « … » en chargement, « — » en échec, sinon « 4 950 € ». */
export function Money({ value, loading = false, failed = false, className = '' }) {
  return <span className={`tabular-nums ${className}`}>{failed ? '—' : loading ? '…' : euro(value)}</span>;
}

/** Pastille de texte (statut, compteur). */
export function Pill({ tone = 'muted', children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONE_BOX[tone] || TONE_BOX.muted} ${className}`}>
      {children}
    </span>
  );
}

/**
 * Lien interne en bouton visible (« Ouvrir l'agenda › ») : 44 px de haut, chevron visible.
 * Sans `to` (compte sans accès à la page) : rien.
 */
export function GoLink({ to, children, className = '' }) {
  if (!to) return null;
  return (
    <Link
      to={to}
      className={`inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${className}`}
    >
      {children}
      <ChevronRight className="w-4 h-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}

/**
 * Erreur d'un bloc, sur une ligne : « Impossible de charger … » (ou « Pas de connexion ») + Réessayer.
 * Remplace la grande carte d'erreur qui poussait les chiffres hors de l'écran.
 */
export function InlineError({ what, error, onRetry, retrying = false, className = '' }) {
  const offline = error ? isNetworkError(error) : typeof navigator !== 'undefined' && navigator.onLine === false;
  return (
    <div role="alert" className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 text-xs ${TONE_BOX.amber} ${className}`}>
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0">{offline ? 'Pas de connexion internet' : `Impossible de charger ${what}`}</span>
      {onRetry && (
        <button
          type="button"
          onClick={() => onRetry()}
          disabled={retrying}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-semibold underline-offset-2 hover:underline disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
          Réessayer
        </button>
      )}
    </div>
  );
}

/** Ligne « libellé … valeur » d'une liste de chiffres. */
export function Row({ label, value, hint = '', tone = '', strong = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 min-w-0">
      <span className="text-xs text-muted-foreground min-w-0 break-words">
        {label}
        {hint && <span className="block text-[11px]">{hint}</span>}
      </span>
      <span className={`text-sm tabular-nums shrink-0 ${strong ? 'font-bold text-foreground' : 'font-semibold'} ${tone ? TONE[tone] : ''}`}>{value}</span>
    </div>
  );
}

/** Note d'avertissement discrète (liste coupée, données en retard). */
export function Note({ tone = 'amber', children, className = '' }) {
  return <p className={`text-[11px] ${TONE[tone] || TONE.amber} ${className}`}>{children}</p>;
}
