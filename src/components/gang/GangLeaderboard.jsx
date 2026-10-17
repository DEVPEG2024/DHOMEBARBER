import React from 'react';
import { Link } from 'react-router-dom';
import { Trophy, ChevronRight } from 'lucide-react';
import { useGangLeaderboard } from '@/lib/gangCardApi';
import GangCard from '@/components/gang/GangCard';
import LoadError from '@/components/shared/LoadError';

// Petites cartes : 300 × 440 à l'échelle 0,4 → 120 × 176 px
const MINI = 0.4;

const plural = (n, one, many) => (n === 1 ? one : many);

/**
 * « Team of the Season » : les 5 clients les plus réguliers des 90 derniers jours, parmi ceux
 * qui ont accepté d'y figurer (classement calculé par le serveur, mis en cache 5 min).
 *
 * - `variant="feed"` (en tête du fil) : rien tant que le classement est vide, en chargement ou
 *   en échec, avec un lien « Ma carte » ;
 * - `variant="page"` (page « Ta carte Gang ») : chargement, erreur et classement vide affichés.
 *   `optedIn` : le client a activé l'option ; le classement vide explique alors le seuil de
 *   visites au lieu de l'inviter à activer ce qu'il vient d'activer.
 */
export default function GangLeaderboard({ variant = 'feed', optedIn = false }) {
  const query = useGangLeaderboard();
  const { data, isPending, isError, error, refetch, isFetching } = query;
  const entries = Array.isArray(data?.entries) ? data.entries.filter((e) => e?.card) : [];
  const days = Number(data?.days) || 90;
  // Seuil de visites exigé par le serveur (codé en dur dans son SQL : 2), repli si absent
  const minVisits = Number(data?.min_visits) || 2;
  const inFeed = variant === 'feed';

  if (inFeed && entries.length === 0) return null;

  return (
    <section aria-labelledby={`tots-${variant}`} className={inFeed ? 'mb-6' : ''}>
      <div className="flex items-end justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 id={`tots-${variant}`} className="flex items-center gap-2 font-fut text-xl font-extrabold uppercase tracking-wide text-foreground leading-none">
            <Trophy className="w-4 h-4 text-[#7fd0ff] shrink-0" aria-hidden="true" />
            Team of the Season
          </h2>
          <p className="text-[11px] text-muted-foreground mt-1">Les plus réguliers des {days} derniers jours</p>
        </div>
        {inFeed && (
          <Link to="/gang-card" className="shrink-0 inline-flex items-center gap-0.5 text-xs font-semibold text-primary">
            Ma carte <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>

      {!inFeed && isPending && (
        <div className="flex gap-3 overflow-hidden" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shrink-0 rounded-2xl bg-secondary animate-pulse" style={{ width: 300 * MINI, height: 440 * MINI }} />
          ))}
        </div>
      )}

      {!inFeed && !isPending && isError && !data && (
        <LoadError compact what="le classement" error={error} onRetry={refetch} retrying={isFetching} />
      )}

      {!inFeed && !isPending && !(isError && !data) && entries.length === 0 && (
        <p className="rounded-2xl border border-border bg-card/60 px-4 py-5 text-center text-xs text-muted-foreground">
          {optedIn
            ? `Tu es inscrit : il faut au moins ${minVisits} visites sur les ${days} derniers jours pour apparaître dans le classement.`
            : 'Personne pour l’instant : active l’option pour y figurer.'}
        </p>
      )}

      {entries.length > 0 && (
        // Rangée qui défile : déborde jusqu'aux bords de l'écran, marges de 16 px conservées
        <ol className="-mx-4 px-4 pt-2 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {entries.map((entry) => (
            <li key={`${entry.rank}-${entry.card.serial || entry.card.name}`} className="snap-start shrink-0 flex flex-col items-center" style={{ width: 300 * MINI }}>
              <div className="relative">
                <GangCard card={entry.card} size={MINI} flippable={false} interactive={false} />
                <span
                  className="absolute -top-1.5 -left-1 z-10 w-7 h-7 rounded-full bg-[#e43a4f] text-white font-fut text-base font-extrabold flex items-center justify-center shadow-lg ring-2 ring-background"
                  aria-label={`Rang ${entry.rank}`}
                >
                  {entry.rank}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-tight text-center text-muted-foreground">
                <span className="font-semibold text-foreground">{entry.season_visits} {plural(entry.season_visits, 'visite', 'visites')}</span>
                {' '}en {days} jours
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
