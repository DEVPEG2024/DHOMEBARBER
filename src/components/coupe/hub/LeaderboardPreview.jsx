import React from 'react';
import { Link } from 'react-router-dom';
import { queryFailed } from '@/components/shared/LoadError';
import CoupeLoadError from '../CoupeLoadError';
import PlayerAvatar from './PlayerAvatar';
import LeaderboardRow from './LeaderboardRow';
import { ROLE_SALON, num } from './coupeFormat';

/**
 * Haut du classement de la saison sur l'accueil de la Coupe (maquette « Accueil de la Coupe ») :
 * les trois premiers puis sa propre ligne, « Tout voir » vers /coupe/classement.
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
  return (
    <li className="flex items-center gap-3 bg-[rgba(235,193,94,.05)] px-3.5 py-3">
      <span className="w-[18px] shrink-0 font-fut text-lg font-extrabold leading-none text-[#9db0a6]" aria-hidden="true">–</span>
      <PlayerAvatar role={me.role} name={me.name} url={me.avatarUrl} seed={me.seed} size="preview" className={me.role === 'barber' ? 'mx-1' : ''} />
      <span className="min-w-0 flex-1 text-[13px] leading-snug text-[#9db0a6]">
        {optedOut ? 'Tu n’apparais pas dans le classement' : 'Pas encore classé cette saison'}
      </span>
      <span className="shrink-0 font-fut text-xl font-extrabold leading-none tabular-nums text-[#c9b27a]">
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
        <Link to="/coupe/classement" className="shrink-0 text-[13px] font-semibold text-[#ebc15e] hover:text-[#f5d68a]">
          Tout voir
        </Link>
      </div>

      {failed ? (
        <CoupeLoadError compact what="le classement" error={error} onRetry={refetch} retrying={isFetching} />
      ) : isPending ? (
        <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#12171a]" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 border-b border-white/6 px-3.5 py-3 last:border-0">
              <span className="h-9 w-9 animate-pulse rounded-full bg-white/6" />
              <span className="h-3.5 flex-1 animate-pulse rounded bg-white/6" />
            </div>
          ))}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-white/8 bg-[#12171a]">
          {top.length === 0 && (
            <li className="border-b border-white/6 px-3.5 py-3 text-[13px] text-[#9db0a6]">
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
