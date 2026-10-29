import React from 'react';
import { Link } from 'react-router-dom';
import { queryFailed } from '@/components/shared/LoadError';
import CoupeLoadError from '../CoupeLoadError';
import PlayerAvatar from './PlayerAvatar';
import LeaderboardRow from './LeaderboardRow';
import { ROLE_SALON, num } from './coupeFormat';

/**
 * Haut du classement de la saison sur l'accueil de la Coupe (maquettes « Accueil de la Coupe » et
 * « CoupeAccueilRouge ») : les trois premiers puis sa propre ligne (en rouge), « Tout voir » vers
 * /coupe/classement.
 * `me` (avatar et rôle du compte connecté) sert quand sa ligne n'est pas parmi les 50 renvoyées.
 */
function MyStatusRow({ meInfo, me }) {
  const optedOut = meInfo && meInfo.opt_in === false && me.role !== ROLE_SALON;
  const rank = num(meInfo?.rank) || null;
  if (rank && !optedOut) {
    return (
      <LeaderboardRow
        variant="preview"
        last
        row={{ rank, me: true, role: me.role, name: me.name, avatar_url: me.avatarUrl, key_hash: me.seed, points: meInfo.points }}
      />
    );
  }
  // Pas (ou plus) au classement : sa ligne garde la teinte rouge, plus légère (ce n'est pas une erreur)
  return (
    <li className="flex items-center gap-3 bg-[color:var(--coupe-rouge-fond)] px-3.5 py-3">
      <span className="w-[18px] shrink-0 font-fut text-lg font-extrabold leading-none text-[color:var(--coupe-gris)]" aria-hidden="true">–</span>
      <PlayerAvatar role={me.role} name={me.name} url={me.avatarUrl} seed={me.seed} size="preview" className={me.role === 'barber' ? 'mx-1' : ''} />
      <span className="min-w-0 flex-1 text-[13px] leading-snug text-[color:var(--coupe-gris-clair)]">
        {optedOut ? 'Tu n’apparais pas dans le classement' : 'Pas encore classé cette saison'}
      </span>
      <span className="shrink-0 font-fut text-xl font-extrabold leading-none tabular-nums text-[color:var(--coupe-rouge-vif)]">
        {num(meInfo?.points)}<span className="sr-only"> points</span>
      </span>
    </li>
  );
}

export default function LeaderboardPreview({ query, me }) {
  const { data, error, refetch, isFetching, isPending } = query;
  const failed = queryFailed(query);
  const rows = Array.isArray(data?.rows) ? data.rows.filter(Boolean) : [];
  const top = rows.slice(0, 3);
  const mineInTop = top.some((r) => r.me);
  const mineRow = rows.find((r) => r.me) || null;

  return (
    <section aria-labelledby="coupe-top-title" className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="coupe-top-title" className="font-fut text-xl font-extrabold uppercase leading-none tracking-[0.04em]">
          Classement de la saison
        </h2>
        {/* Rouge vif sur le noir (5,6:1) ; cible de 44 px de haut sans changer la hauteur de la rangée */}
        <Link
          to="/coupe/classement"
          className="-my-3 -mr-2 inline-flex min-h-[44px] shrink-0 items-center rounded-lg px-2 text-[13px] font-semibold text-[color:var(--coupe-rouge-vif)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          Tout voir
        </Link>
      </div>

      {failed ? (
        <CoupeLoadError compact what="le classement" error={error} onRetry={refetch} retrying={isFetching} />
      ) : isPending ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)]" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 border-b border-white/8 px-3.5 py-3 last:border-0">
              <span className="h-9 w-9 rounded-full bg-white/6 motion-safe:animate-pulse" />
              <span className="h-3.5 flex-1 rounded bg-white/6 motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)]">
          {top.length === 0 && (
            <li className="border-b border-white/8 px-3.5 py-3 text-[13px] text-[color:var(--coupe-gris)]">
              Personne n’est encore classé cette saison.
            </li>
          )}
          {top.map((row, i) => (
            <LeaderboardRow key={row.key_hash || `${row.rank}-${i}`} row={row} variant="preview" last={mineInTop && i === top.length - 1} />
          ))}
          {!mineInTop && (mineRow
            ? <LeaderboardRow row={mineRow} variant="preview" last />
            : <MyStatusRow meInfo={data?.me} me={me} />)}
        </ul>
      )}
    </section>
  );
}
