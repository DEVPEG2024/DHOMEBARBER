import React from 'react';
import coupeLogoUrl from '@/assets/coupe/logo-coupe.webp';
import { coupeTournamentUrl } from '@/lib/coupe/coupeApi';
import BigMatch from './BigMatch';
import { BoardCards, BracketWide } from './Board';
import { WatchQrCard } from './Cards';
import { CARD, DISPLAY, LABEL, LIST, LiveBadge, ROW } from './ScreenParts';
import {
  clockOf, isTournamentLive, liveKey, livePair, liveTitle, msOf, nextBoardMatch, roundShort, roundsOf, scoreText,
} from './screenFormat';

/*
 * Mode tournoi de l'écran du salon (planche, écran 14) : le tableau, le match en cours en grand,
 * « Aussi en direct », « Prochain match » et le QR « Regarde sur ton téléphone ».
 * Match en grand : le match du tournoi commencé le plus tôt encore en cours ; à sa fin, 8 s sur le
 * score final puis le suivant, sinon tout le tableau (useBigMatch). Avant le tirage (présence, 15 min
 * avant) : l'heure du début et le QR du tournoi.
 * Un match de tournoi se nomme par `tour.title` (« Quart 4 »), repli sur `tour.label`. Textes
 * d'information à 16 px de scène au moins (décision A4).
 */

function Header({ tournament, now }) {
  const live = isTournamentLive(tournament);
  const starts = msOf(tournament?.starts_at);
  let badge = null;
  if (live) badge = <LiveBadge>{`En direct${tournament.round_label ? ` · ${roundShort(tournament.round_label)}` : ''}`}</LiveBadge>;
  else if (starts != null && now < starts) badge = <LiveBadge tone="gold">{`Début à ${clockOf(starts)}`}</LiveBadge>;
  else badge = <LiveBadge tone="gold">Tirage au sort…</LiveBadge>;
  return (
    <div className="flex shrink-0 items-center gap-3.5">
      <img src={coupeLogoUrl} alt="La Coupe du Gang" decoding="async" className="h-[92px] w-[92px] shrink-0 object-contain" />
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className={`${DISPLAY} line-clamp-2 text-[40px] [overflow-wrap:anywhere]`}>{String(tournament?.name || 'Tournoi')}</h1>
        {badge}
      </div>
    </div>
  );
}

/** Avant le tirage : l'heure du début, la présence à confirmer dans l'app. */
function BeforeDraw({ tournament, now }) {
  const starts = msOf(tournament?.starts_at);
  const minutes = starts == null ? null : Math.max(0, Math.ceil((starts - now) / 60_000));
  return (
    <section aria-label="Avant le tirage" className={`${CARD} flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center`}>
      <span className={LABEL}>{minutes ? 'Le tournoi commence' : 'Tirage au sort'}</span>
      <p className={`${DISPLAY} text-[72px] tabular-nums`}>{starts == null ? '' : clockOf(starts)}</p>
      <p className="text-xl font-semibold">{minutes ? `Dans ${minutes} min` : 'Le tableau arrive dans un instant'}</p>
      <p className="max-w-[520px] text-base text-[color:var(--coupe-gris)]">
        Inscrits : confirme ta présence avec « Je suis là » dans l’app avant le début.
      </p>
    </section>
  );
}

/** Autres matchs en direct (3 au plus) ; un match de tournoi avec son nom (« Quart 4 »). */
function AlsoLiveCard({ rows }) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby="ecran-aussi" className={`${CARD} pb-1.5`}>
      <h2 id="ecran-aussi" className={`${LABEL} px-3.5 pb-1.5 pt-3.5`}>Aussi en direct</h2>
      <ul className={LIST}>
        {rows.slice(0, 3).map((r) => {
          const title = liveTitle(r);
          return (
            <li key={liveKey(r)} className={`${ROW} py-2.5`}>
              <span className="flex min-w-0 flex-col">
                {title && <span className="truncate text-base leading-tight text-[color:var(--coupe-gris)]">{title}</span>}
                <span className="truncate">{livePair(r)}</span>
              </span>
              <b className="ml-auto shrink-0 font-fut text-[22px] tabular-nums">{scoreText(r.sc) || '0 – 0'}</b>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Prochain match du tableau (rien à annoncer : rien). */
function NextMatchCard({ next }) {
  if (!next) return null;
  return (
    <section aria-labelledby="ecran-ensuite" className={`${CARD} flex flex-col gap-1.5 p-3.5`}>
      <h2 id="ecran-ensuite" className={LABEL}>Prochain match</h2>
      <p className="truncate text-xl font-bold">{`${next.names[0]} – ${next.names[1]}`}</p>
      <p className="text-base leading-snug text-[color:var(--coupe-gris)]">
        {next.ready ? 'Commence dès que les deux joueurs sont là' : 'Après les matchs en cours'}
      </p>
    </section>
  );
}

export default function TournamentMode({ tournament, liveRows: rows, now, portrait, big, spectator }) {
  const { target, final } = big;
  const rounds = roundsOf(tournament);
  const drawn = rounds.length > 0;
  const liveByMid = new Map(rows.filter((r) => r.kind === 'tour').map((r) => [String(r.id), r]));
  const others = rows.filter((r) => !target || liveKey(r) !== liveKey(target))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'tour' ? -1 : 1));
  const next = drawn ? nextBoardMatch(rounds, liveByMid) : null;
  const tournamentUrl = coupeTournamentUrl(tournament.id);
  const side = (
    <>
      <AlsoLiveCard rows={others} />
      <NextMatchCard next={next} />
    </>
  );
  const qr = (extra = '') => <WatchQrCard target={target} tournamentUrl={tournamentUrl} className={extra} />;
  const board = drawn
    ? <BracketWide tournament={tournament} liveByMid={liveByMid} className="flex-1" />
    : <BeforeDraw tournament={tournament} now={now} />;

  if (portrait) {
    return (
      <div className="flex h-full flex-col gap-7 p-7" data-mode="tournoi">
        <Header tournament={tournament} now={now} />
        {target ? (
          <>
            {/* Toute la largeur : la bande du score garde la place des noms */}
            <BigMatch target={target} final={final} spectator={spectator} className="h-[600px] shrink-0" />
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-8">
              <BoardCards tournament={tournament} liveByMid={liveByMid} shownMid={target?.kind === 'tour' ? String(target.id) : null} />
              <div className="flex min-h-0 min-w-0 flex-col gap-[18px] overflow-hidden">
                {qr()}
                {side}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex min-h-0 flex-1 flex-col">{board}</div>
            <div className="grid shrink-0 grid-cols-2 items-start gap-8">
              {qr()}
              <div className="flex min-w-0 flex-col gap-[18px]">{side}</div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[380px_380px_376px] gap-x-9 p-9" data-mode="tournoi">
      {target ? (
        <>
          <div className="flex min-h-0 flex-col gap-[18px] overflow-hidden">
            <Header tournament={tournament} now={now} />
            <BoardCards tournament={tournament} liveByMid={liveByMid} shownMid={target?.kind === 'tour' ? String(target.id) : null} />
          </div>
          <BigMatch target={target} final={final} spectator={spectator} />
        </>
      ) : (
        <div className="col-span-2 flex min-h-0 flex-col gap-[18px] overflow-hidden">
          <Header tournament={tournament} now={now} />
          {board}
        </div>
      )}
      <div className="flex min-h-0 flex-col gap-[18px] overflow-hidden">
        {side}
        {qr('mt-auto')}
      </div>
    </div>
  );
}
