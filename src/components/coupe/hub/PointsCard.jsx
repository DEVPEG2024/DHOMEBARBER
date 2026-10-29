import React from 'react';
import { Lock } from 'lucide-react';
import { queryFailed } from '@/components/shared/LoadError';
import CoupeLoadError from '../CoupeLoadError';
import { num, rankSuffix, seasonMonth } from './coupeFormat';

/**
 * Tes Points de Coupe (maquette « Accueil de la Coupe ») : points de la saison, place, victoires et
 * défaites, la règle « Victoire +3, défaite −1 », et une mention claire quand le compte n'a pas
 * encore droit aux points (`eligible_reason` de `GET /coupe/me`).
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

function Stat({ value, label }) {
  return (
    <div className="text-center">
      <p className="font-fut text-[28px] font-extrabold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] text-[#9db0a6]">{label}</p>
    </div>
  );
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

const CARD_STYLE = {
  background: 'linear-gradient(135deg, #1d180a 0%, #12161a 70%)',
  borderColor: 'rgba(235, 193, 94, .3)',
};

export default function PointsCard({ query, isSalon = false }) {
  const { data, error, refetch, isFetching, isPending } = query;

  if (queryFailed(query)) {
    return <CoupeLoadError compact what="tes points" error={error} onRetry={refetch} retrying={isFetching} />;
  }

  if (isPending || !data) {
    return (
      <section aria-busy="true" aria-label="Tes Points de Coupe" className="rounded-[20px] border p-[18px]" style={CARD_STYLE}>
        <div className="h-3 w-32 animate-pulse rounded bg-white/10" />
        <div className="mt-3 h-[60px] w-24 animate-pulse rounded-lg bg-white/10" />
        <div className="mt-3 h-3.5 w-44 animate-pulse rounded bg-white/10" />
      </section>
    );
  }

  const stats = data.season_stats || {};
  const eligible = data.eligible !== false;
  const why = eligible ? null : eligibilityText(data.eligible_reason);
  const month = seasonMonth(data.season);

  return (
    <section aria-labelledby="coupe-points-title" className="flex flex-col gap-3 rounded-[20px] border p-[18px]" style={CARD_STYLE}>
      {/* Libellé sur toute la largeur : à 320 px, à côté des victoires, il passait sur deux lignes */}
      <div className="flex flex-col gap-1.5">
        <h2 id="coupe-points-title" className="text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-[#c9b27a]">
          {isSalon ? 'Points de Coupe du salon' : 'Tes Points de Coupe'}
        </h2>
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="font-fut text-[70px] font-extrabold leading-[.85] text-[#ebc15e] tabular-nums">{num(stats.points)}</p>
            <p className="text-[13px] text-[#eef3ef]">
              {placeLine({ rank: num(stats.rank) || null, optIn: !!data.opt_in, month, isSalon, eligible })}
            </p>
          </div>
          <div className="flex shrink-0 gap-3.5">
            <Stat value={num(stats.wins)} label={num(stats.wins) === 1 ? 'victoire' : 'victoires'} />
            <Stat value={num(stats.losses)} label={num(stats.losses) === 1 ? 'défaite' : 'défaites'} />
          </div>
        </div>
      </div>

      {why && (
        <div role="note" className="flex items-start gap-2.5 rounded-xl border border-[#ebc15e]/25 bg-black/25 p-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#ebc15e]" aria-hidden="true" />
          <p className="text-[12.5px] leading-snug text-[#c9d3cd]">
            <span className="block font-semibold text-[#eef3ef]">{why.title}</span>
            {why.text}
          </p>
        </div>
      )}

      <p className="border-t border-white/8 pt-2.5 text-xs leading-[1.45] text-[#9db0a6]">
        Victoire +3, défaite −1. Ces points ne changent pas ton niveau Gang.
      </p>
    </section>
  );
}
