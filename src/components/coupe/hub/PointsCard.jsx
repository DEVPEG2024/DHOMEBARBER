import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Lock } from 'lucide-react';
import { queryFailed } from '@/components/shared/LoadError';
import CoupeLoadError from '../CoupeLoadError';
import { COUPE_COLORS } from '../palette';
import { num, rankSuffix, seasonMonth } from './coupeFormat';
import { mix } from './theme';

/**
 * Tes Points de Coupe en une bande (accueil repensé, planche validée le 29 oct. 2026 au soir :
 * https://claude.ai/artifact/7SCyeV4pPNSeHtUzmZvW2m) : les points en or, la place de la saison, le
 * bilan et la règle « victoire +3, défaite −1 » ; toute la bande mène au classement. Une mention
 * claire quand le compte n'a pas encore droit aux points (`eligible_reason` de `GET /coupe/me`).
 * Thème stade : carte noire teintée de rouge sombre, bordée d'or.
 */

/** Pourquoi les matchs de ce compte sont amicaux (codes de lib/coupePoints.js du serveur). */
function eligibilityText(reason) {
  if (reason === 'no_card') {
    return {
      title: 'Les points arrivent avec ta première visite',
      text: 'Ta première visite au salon t’ouvre les Points de Coupe. En attendant, tous tes matchs sont amicaux.',
    };
  }
  if (reason === 'not_eligible') {
    return {
      title: 'Pas de points pour le moment',
      text: 'Ta fiche barber n’est pas active : tes matchs sont amicaux.',
    };
  }
  return {
    title: 'Pas de points pour le moment',
    text: 'Tes matchs sont amicaux pour l’instant.',
  };
}

function placeLine({ rank, optIn, month, isSalon, eligible }) {
  // Hors du classement par choix : pas de place affichée (le classement ne le montre pas)
  if (!optIn && !isSalon) return 'Tu n’apparais pas dans le classement';
  if (rank) {
    return (
      <>
        {rank}<sup>{rankSuffix(rank)}</sup> {month ? `de la saison de ${month}` : 'de la saison'}
      </>
    );
  }
  if (!eligible) return 'Pas encore classé';
  return 'Pas encore classé : joue un match en ligne';
}

// Du rouge très sombre (un quart de rouge sombre dans le noir) vers la carte noire
const CARD_STYLE = {
  background: `linear-gradient(135deg, ${mix(COUPE_COLORS.rougeSombre, COUPE_COLORS.noir, 0.75)} 0%, ${COUPE_COLORS.noir2} 65%)`,
  borderColor: COUPE_COLORS.orBord,
};
// Points en or, ombre portée rouge sombre (or sur la carte : 9,9:1)
const POINTS_STYLE = { textShadow: `0 3px 0 ${COUPE_COLORS.rougeSombre}` };

export default function PointsCard({ query, isSalon = false }) {
  const { data, error, refetch, isFetching, isPending } = query;
  const title = isSalon ? 'Points de Coupe du salon' : 'Tes Points de Coupe';

  if (queryFailed(query)) {
    return <CoupeLoadError compact what="tes points" error={error} onRetry={refetch} retrying={isFetching} />;
  }

  if (isPending || !data) {
    return (
      <section aria-busy="true" aria-label={title} className="flex items-center gap-3.5 rounded-2xl border px-3.5 py-3" style={CARD_STYLE}>
        <span className="h-10 w-12 rounded-lg bg-white/10 motion-safe:animate-pulse" />
        <span className="flex flex-1 flex-col gap-2">
          <span className="h-3 w-40 rounded bg-white/10 motion-safe:animate-pulse" />
          <span className="h-3 w-52 rounded bg-white/10 motion-safe:animate-pulse" />
        </span>
      </section>
    );
  }

  const stats = data.season_stats || {};
  const eligible = data.eligible !== false;
  const why = eligible ? null : eligibilityText(data.eligible_reason);
  const month = seasonMonth(data.season);
  const wins = num(stats.wins);
  const losses = num(stats.losses);

  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <Link
        to="/coupe/classement"
        className="flex items-center gap-3.5 rounded-2xl border px-3.5 py-3 text-white hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        style={CARD_STYLE}
      >
        <span className="shrink-0 font-fut text-[42px] font-extrabold leading-none text-[color:var(--coupe-or)] tabular-nums" style={POINTS_STYLE}>
          {num(stats.points)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase leading-none tracking-[0.12em] text-[color:var(--coupe-gris-clair)]">{title}</span>
          <span className="text-[13px] font-semibold leading-snug">
            {placeLine({ rank: num(stats.rank) || null, optIn: !!data.opt_in, month, isSalon, eligible })}
          </span>
          {/* Deux morceaux insécables : la ligne ne se coupe qu'entre le bilan et la règle */}
          <span className="text-xs leading-snug text-[color:var(--coupe-gris)]">
            <span className="whitespace-nowrap">{wins} {wins === 1 ? 'victoire' : 'victoires'} · {losses} {losses === 1 ? 'défaite' : 'défaites'}</span>
            {' · '}
            <span className="whitespace-nowrap">victoire +3, défaite −1</span>
          </span>
        </span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[color:var(--coupe-gris)]" aria-hidden="true" />
      </Link>

      {why && (
        <div role="note" className="flex items-start gap-2.5 rounded-xl border border-white/12 bg-[color:var(--coupe-noir2)] p-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-white" aria-hidden="true" />
          <p className="text-[12.5px] leading-snug text-[color:var(--coupe-gris-clair)]">
            <span className="block font-semibold text-white">{why.title}</span>
            {why.text}
          </p>
        </div>
      )}
    </section>
  );
}
