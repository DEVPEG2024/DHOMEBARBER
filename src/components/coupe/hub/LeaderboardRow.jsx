import React from 'react';
import PlayerAvatar, { RoleMark } from './PlayerAvatar';
import { ROLE_BARBER, ROLE_SALON, num, rankSuffix } from './coupeFormat';

/**
 * Une ligne du classement de la Coupe (maquettes « Accueil de la Coupe » et « Classement ») :
 * rang, avatar (portrait pour un barber, rond pour un client, logo du salon), nom avec l'étoile
 * bleue du salon ou les ciseaux d'un barber, points. Sa propre ligne est dorée et s'appelle « Toi »
 * (l'admin garde « D'Home Barber » : la ligne du salon est commune à tous les comptes admin).
 *
 * `variant` : `preview` (accueil, sans bilan) ou `row` (classement, avec « 24 V · 3 D »).
 * `onOpen(row)` : la ligne d'un autre joueur ouvre sa fiche (Signaler, Bloquer).
 */
const PLACE_COLORS = { 1: '#ebc15e', 2: '#c9ced3', 3: '#c08a5a' };

export function displayName(row) {
  return row?.me && row?.role !== ROLE_SALON ? 'Toi' : String(row?.name || 'Joueur');
}

export function RankNumber({ rank, className = '', style }) {
  if (!rank) return <span className={className} style={style} aria-hidden="true">–</span>;
  return (
    <span className={className} style={style}>
      {rank}<span className="sr-only">{rankSuffix(rank)}</span>
    </span>
  );
}

export default function LeaderboardRow({ row, variant = 'row', onOpen = null, last = false }) {
  const mine = !!row.me;
  const rank = num(row.rank) || null;
  const preview = variant === 'preview';
  const rankColor = mine ? '#ebc15e' : (PLACE_COLORS[rank] && preview ? PLACE_COLORS[rank] : '#9db0a6');
  // Les portraits (26 ou 28 px de large) gardent la place d'un avatar rond de 36 px : noms alignés
  const portraitGap = row.role === ROLE_BARBER ? (preview ? 'mx-1' : 'mx-[5px]') : '';

  const content = (
    <>
      <RankNumber
        rank={rank}
        className={`shrink-0 font-fut font-extrabold leading-none tabular-nums ${preview ? 'w-[18px] text-lg' : 'w-5 text-[17px]'}`}
        style={{ color: rankColor }}
      />
      <PlayerAvatar role={row.role} name={row.name} url={row.avatar_url} seed={row.key_hash} size={preview ? 'preview' : 'row'} className={portraitGap} />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className={`flex min-w-0 items-center gap-1.5 text-sm ${mine ? 'font-bold' : 'font-semibold'}`}>
          <span className="truncate">{displayName(row)}</span>
          <RoleMark role={row.role} size={preview ? 14 : 12} />
        </span>
        {!preview && (
          <span className={`text-[11.5px] leading-none ${mine ? 'text-[#c9b27a]' : 'text-[#8a9a92]'}`}>
            {num(row.wins)} V · {num(row.losses)} D
          </span>
        )}
      </span>
      <span className={`shrink-0 font-fut text-xl font-extrabold leading-none tabular-nums ${mine ? 'text-[#ebc15e]' : ''}`}>
        {num(row.points)}<span className="sr-only"> points</span>
      </span>
    </>
  );

  const rowClass = `flex w-full items-center gap-3 px-3.5 text-left ${preview ? 'py-3' : 'py-[11px]'}`;
  return (
    <li className={`${last ? '' : 'border-b border-white/6'} ${mine ? 'bg-[rgba(235,193,94,.08)]' : ''}`}>
      {onOpen && !mine ? (
        <button
          type="button"
          onClick={() => onOpen(row)}
          aria-haspopup="dialog"
          className={`${rowClass} transition-colors hover:bg-white/4 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#ebc15e]`}
        >
          {content}
        </button>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
    </li>
  );
}
