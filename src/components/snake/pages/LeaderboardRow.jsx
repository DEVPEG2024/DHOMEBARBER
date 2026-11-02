import React from 'react';
import { initialsOf, rankText } from '@/lib/snake/format';
import { SNAKE_COLORS as C } from '../palette';

/**
 * Ligne du classement du Snake du Gang (planche `Classement.dc.html`) : place (1re en or), initiales,
 * nom, pastille « Toi », détail (« Niveau 7 », « Barber · Niveau 6 »), score à pixels. Ta ligne sur
 * fond vert. `as` : 'li' dans la liste numérotée, 'div' pour ta place sous la liste.
 */
export default function LeaderboardRow({ rank, name, role, score, level, me = false, as: Tag = 'li', initials }) {
  const first = rank === 1;
  const detail = [role === 'barber' ? 'Barber' : null, Number.isInteger(level) ? `Niveau ${level}` : null].filter(Boolean).join(' · ');
  return (
    <Tag
      className="flex h-14 min-w-0 items-center gap-3 rounded-[14px] border px-3"
      style={{
        background: me ? 'rgba(61, 190, 126, 0.12)' : C.carte,
        borderColor: me ? C.vertBord : C.carteBord,
      }}
      data-snake-me={me ? 'true' : undefined}
    >
      <span
        aria-hidden="true"
        className="grid h-7 min-w-[28px] shrink-0 place-items-center rounded-[8px] px-1 font-pixel text-sm"
        style={{ background: first ? C.or : C.pastille, color: first ? '#1A1A1A' : C.blanc }}
      >
        {rank}
      </span>
      <span className="sr-only">{rankText(rank)} : </span>
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold"
        style={{ background: C.pastille, color: C.grisClair }}
      >
        {initials || initialsOf(name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold text-white">
          <span className="truncate">{name}</span>
          {me && (
            <span className="shrink-0 rounded-full px-2 py-px text-[11px] font-bold text-white" style={{ background: C.vert }}>Toi</span>
          )}
        </span>
        {detail && <span className="truncate text-xs" style={{ color: C.gris }}>{detail}</span>}
      </span>
      <span className="shrink-0 font-pixel text-[17px] font-bold tabular-nums" style={{ color: first ? C.or : C.blanc }}>
        {score}
        <span className="sr-only"> points</span>
      </span>
    </Tag>
  );
}
