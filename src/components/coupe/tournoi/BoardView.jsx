import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Eye, Play } from 'lucide-react';
import { watchPath } from '@/lib/coupe/watch';
import { COUPE_COLORS } from '../palette';
import { alpha } from '../hub/theme';
import { num } from '../hub/coupeFormat';
import { BTN_RED, CARD, LiveDot, LivePill, PlayerLabel, TPawn, TournamentShell } from './ui';
import {
  canJoin, currentRound, forfeitPassed, isEmptyBye, isPlayable, matchTitle, mmss, msOf, mySide, pairingText,
  playerName, roundDone, roundNames, roundsCount, roundsOf, scoreOf,
} from './tournoiFormat';

/**
 * Tableau du tournoi en direct (planche validée le 3 nov. 2026, écran 5) : un onglet par tour
 * (coche d'un tour fini), les matchs du tour (scores en direct, vainqueur coché d'or, perdant en
 * gris), « Ensuite, … » pour le tour suivant. Ton match est en tête, en rouge, avec « Jouer mon
 * match » dès qu'il est jouable (avant : le compte à rebours ; pendant : l'échéance du forfait ;
 * après elle : grisé, « Temps écoulé »). Le tournoi fini garde son tableau (`finished`, sans
 * « En direct »). Exempt : « Qualifié d'office », deux places libres : « Pas de match ».
 * `offline` (connexion perdue) : ni « En direct » ni « Jouer », comptes à rebours figés et signalés.
 * À 320 px, un compte à rebours n'est jamais coupé (il passe à la ligne).
 * Spectateurs (`canWatch` : `features.coupeSpectators`, contrat docs/fonctions/coupe-spectateurs-contrat.md,
 * section 4.3) : « Regarder » sur chaque match en cours (`live.playing`), sauf le sien, vers
 * `/coupe/regarder?m=<match>&tournoi=<tournoi>` ; rien hors connexion.
 */

/** Durée d'un compte à rebours, jamais coupée ; « figé » quand la connexion est perdue. */
function Clock({ ms, frozen }) {
  return <span className="whitespace-nowrap tabular-nums">{mmss(ms)}{frozen ? ' · figé' : ''}</span>;
}

/** État d'un match, en haut à droite de sa carte. */
function MatchState({ m, now, offline }) {
  if (m.status === 'bye') return <span>{isEmptyBye(m) ? 'Pas de match' : 'Qualifié d’office'}</span>;
  if (m.status === 'done') {
    const extra = m.reason === 'shootout' ? ' · t.a.b.' : ['forfeit', 'double_forfeit', 'admin'].includes(m.reason) ? ' · forfait' : '';
    return <span>Fini{extra}</span>;
  }
  if (m.status === 'ready') {
    if (m.live?.playing) return offline ? <span>En cours · figé</span> : <LiveDot>En direct</LiveDot>;
    if (!isPlayable(m, now)) return <span>Commence dans <Clock ms={msOf(m.ready_at) - now} frozen={offline} /></span>;
    const fa = msOf(m.forfeit_at);
    if (fa == null) return <span>Prêt</span>;
    if (forfeitPassed(m, now)) return <span>Temps écoulé</span>;
    return <span>Prêt · forfait dans <Clock ms={fa - now} frozen={offline} /></span>;
  }
  return <span>À venir</span>;
}

function PlayerLine({ m, side, big = false }) {
  const p = m.p?.[side];
  const sc = scoreOf(m);
  const finished = m.status === 'done' || m.status === 'bye';
  const won = finished && Number(m.winner) === side;
  const lost = finished && m.winner != null && Number(m.winner) !== side;
  return (
    <div className={`flex items-center gap-2.5 text-sm ${lost ? 'text-[#8a8c91]' : ''}`}>
      {p ? <TPawn player={p} size={big ? 30 : 26} dim={lost} /> : <TPawn empty size={big ? 30 : 26} />}
      <PlayerLabel player={p} exempt={m.status === 'bye' ? 'Pas d’adversaire' : 'À connaître'} className={`${won || p?.me ? 'font-bold' : 'font-semibold'} ${!p ? 'text-[color:var(--coupe-gris)]' : ''}`} />
      {won && <Check role="img" aria-label="Qualifié" className="h-3.5 w-3.5 shrink-0 text-[color:var(--coupe-or)]" strokeWidth={3} />}
      {sc && m.status !== 'bye' && (
        <span className="ml-auto font-fut text-[22px] font-extrabold leading-none tabular-nums">
          {sc[side]}
          {Array.isArray(m.so) && m.reason === 'shootout' && <span className="ml-1 font-inter text-[11px] font-semibold text-[color:var(--coupe-gris)]">({m.so[side]})</span>}
        </span>
      )}
    </div>
  );
}

/** Ton adversaire est-il dans la salle du match (`live.present` du serveur) ? */
const opponentPresent = (m) => {
  const side = mySide(m);
  return side >= 0 && m.live?.present?.[1 - side] === true;
};

/** Note de ton match (en haut à droite de sa carte), ou null. */
function myNote(m, now, offline) {
  if (m.status !== 'ready') return null;
  const side = mySide(m);
  const other = side >= 0 ? m.p?.[1 - side] : null;
  if (!isPlayable(m, now)) return <>Commence dans <Clock ms={msOf(m.ready_at) - now} frozen={offline} /></>;
  if (forfeitPassed(m, now)) return 'Temps écoulé';
  if (m.live?.playing) return offline ? 'En cours · figé' : 'En cours';
  if (other && opponentPresent(m)) return `${playerName(other)} est prêt`;
  if (msOf(m.forfeit_at) != null) return <>Forfait dans <Clock ms={msOf(m.forfeit_at) - now} frozen={offline} /></>;
  return null;
}

/** Un match en cours que l'on peut regarder (jamais le sien, jamais hors connexion). */
const watchable = (m, offline) => !offline && m.status === 'ready' && m.live?.playing === true && mySide(m) < 0;

/**
 * Carte d'un match ; `mine` : ton match, en rouge, avec « Jouer mon match » ; `watchHref` : match en
 * cours d'autres joueurs, « Regarder ».
 */
export function MatchCard({ m, total, now, mine = false, offline = false, onPlay = null, watchHref = null }) {
  const title = matchTitle(m.round, m.slot, total);
  const joinable = mine && canJoin(m, now) && !offline;
  const mineNote = mine ? myNote(m, now, offline) : null;
  if (isEmptyBye(m)) {
    return (
      <article aria-label={title} className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-[color:var(--coupe-noir2)] px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--coupe-gris)]">
        <span>{title}</span>
        <span className="font-semibold normal-case tracking-normal text-[color:var(--coupe-gris-clair)]">Deux places libres : pas de match</span>
      </article>
    );
  }
  return (
    <article
      aria-label={mine ? `Ton match : ${title}` : title}
      className={`flex flex-col gap-1.5 rounded-2xl border px-3 py-2.5 ${mine ? '' : 'border-white/8 bg-[color:var(--coupe-noir2)]'}`}
      style={mine ? { borderColor: COUPE_COLORS.rouge, background: `linear-gradient(160deg, ${alpha(COUPE_COLORS.rouge, 0.16)}, ${COUPE_COLORS.noir2} 60%)` } : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--coupe-gris)]">
        <span className={mine ? 'text-[color:var(--coupe-rouge-vif)]' : ''}>{mine ? `Ton match · ${title}` : title}</span>
        <span className="ml-auto min-w-0 text-right font-semibold normal-case tracking-normal text-[color:var(--coupe-gris-clair)]">
          {mineNote || <MatchState m={m} now={now} offline={offline} />}
        </span>
      </div>
      <PlayerLine m={m} side={0} big={mine} />
      <PlayerLine m={m} side={1} big={mine} />
      {mine && m.status === 'ready' && (
        <button type="button" className={`${BTN_RED} mt-1`} onClick={() => onPlay?.(m)} disabled={!joinable}>
          <Play className="h-5 w-5" aria-hidden="true" />
          Jouer mon match
        </button>
      )}
      {!mine && watchHref && (
        <Link
          to={watchHref}
          aria-label={`Regarder ${playerName(m.p?.[0])} contre ${playerName(m.p?.[1])}`}
          className="mt-1 flex min-h-[44px] items-center justify-center gap-2 rounded-[10px] border border-white/[.14] bg-[color:var(--coupe-noir3)] text-sm font-semibold text-white hover:bg-white/6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          Regarder
        </Link>
      )}
    </article>
  );
}

/** Bandeau de son match quand l'onglet affiché n'est pas son tour. */
function MyMatchBanner({ m, total, now, offline, onPlay, onOpen }) {
  const playable = isPlayable(m, now);
  const joinable = canJoin(m, now) && !offline;
  let text = 'Bientôt prêt.';
  if (playable && forfeitPassed(m, now)) text = 'Temps écoulé.';
  else if (playable && m.live?.playing) text = 'Ton match est en cours.';
  else if (playable) text = opponentPresent(m) ? 'Ton adversaire t’attend.' : 'Ton match est prêt.';
  return (
    <div role="status" className="flex items-center gap-3 rounded-2xl border border-[color:var(--coupe-rouge-trait)] bg-[color:var(--coupe-rouge-fond)] p-3">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--coupe-rouge-vif)]">Ton match · {matchTitle(m.round, m.slot, total)}</span>
        <span className="text-[13px] text-[color:var(--coupe-gris-clair)]">{text}</span>
      </span>
      {joinable ? (
        <button type="button" onClick={() => onPlay(m)} className="min-h-[44px] shrink-0 rounded-xl bg-[color:var(--coupe-rouge)] px-3.5 font-fut text-[15px] font-extrabold uppercase tracking-[0.06em] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          Jouer
        </button>
      ) : (
        <button type="button" onClick={onOpen} className="min-h-[44px] shrink-0 rounded-xl border border-white/20 px-3.5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          Voir
        </button>
      )}
    </div>
  );
}

export default function BoardView({ t, now, offline = false, onBack, onPlay, note = null, header = null, canWatch = false }) {
  const size = num(t.size) || 16;
  const total = roundsCount(size);
  const rounds = roundsOf(t);
  const finished = t.status === 'finished';
  const myMatch = t.me?.match && typeof t.me.match === 'object' ? t.me.match : null;
  const defaultRound = myMatch?.round ?? currentRound(t);
  const [selected, setSelected] = useState(defaultRound);
  // Mon match passe au tour suivant : l'onglet suit (sauf si l'on regardait un autre tour exprès)
  const followRef = useRef(defaultRound);
  useEffect(() => {
    if (followRef.current === defaultRound) return;
    followRef.current = defaultRound;
    setSelected(defaultRound);
  }, [defaultRound]);
  const tabsRef = useRef([]);
  const round = rounds.find((r) => r.round === selected) || rounds[0];
  const next = rounds.find((r) => r.round === (round?.round ?? 0) + 1);

  const selectTab = (i) => {
    const r = rounds[(i + rounds.length) % rounds.length];
    if (!r) return;
    setSelected(r.round);
    tabsRef.current[rounds.indexOf(r)]?.focus();
  };
  const onTabKey = (e, i) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); selectTab(i + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); selectTab(i - 1); }
  };

  const matches = round?.matches || [];
  const mineHere = myMatch && round && myMatch.round === round.round
    ? matches.find((m) => m.id === myMatch.id) || myMatch
    : null;
  const others = matches.filter((m) => m.id !== mineHere?.id);

  return (
    <TournamentShell
      onBack={onBack}
      label={t.name}
      title="Tableau du tournoi"
      offline={offline}
      action={finished || offline ? null : <LivePill />}
    >
      <div className="flex flex-col gap-3">
        {header}
        {myMatch && !mineHere && myMatch.status === 'ready' && (
          <MyMatchBanner m={myMatch} total={total} now={now} offline={offline} onPlay={onPlay} onOpen={() => setSelected(myMatch.round)} />
        )}
        {note && <p className="rounded-2xl border border-white/8 bg-[color:var(--coupe-noir2)] px-3.5 py-3 text-[13px] leading-snug text-[color:var(--coupe-gris-clair)]">{note}</p>}

        {rounds.length > 0 ? (
          <>
            <div role="tablist" aria-label="Tours" className="flex gap-1.5 rounded-[14px] border border-white/8 bg-[color:var(--coupe-noir2)] p-1">
              {rounds.map((r, i) => {
                const active = r.round === round?.round;
                const names = roundNames(r.round, total);
                const done = roundDone(r);
                return (
                  <button
                    key={r.round}
                    ref={(el) => { tabsRef.current[i] = el; }}
                    type="button"
                    role="tab"
                    id={`coupe-tour-${r.round}`}
                    aria-selected={active}
                    aria-controls="coupe-tour-matchs"
                    aria-label={`${r.label || names.plural}${done ? ', fini' : ''}`}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setSelected(r.round)}
                    onKeyDown={(e) => onTabKey(e, i)}
                    className={`flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-[10px] px-1 text-[13px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${active ? 'bg-[color:var(--coupe-rouge)] text-white' : 'text-[color:var(--coupe-gris)] hover:text-white'}`}
                  >
                    <span className="truncate">{names.short}</span>
                    {done && <Check className="h-[13px] w-[13px] shrink-0" strokeWidth={3} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            <div role="tabpanel" id="coupe-tour-matchs" aria-labelledby={round ? `coupe-tour-${round.round}` : undefined} className="flex flex-col gap-2.5">
              {mineHere && <MatchCard m={mineHere} total={total} now={now} mine offline={offline} onPlay={onPlay} />}
              {others.map((m) => (
                <MatchCard
                  key={m.id}
                  m={m}
                  total={total}
                  now={now}
                  offline={offline}
                  watchHref={canWatch && watchable(m, offline) ? watchPath({ m: m.id, tournoi: t.id }) : null}
                />
              ))}
            </div>

            {next && (
              <section aria-labelledby="coupe-tournoi-ensuite" className="flex flex-col gap-1.5 px-1 pt-1">
                <h2 id="coupe-tournoi-ensuite" className="text-[13px] font-bold text-[color:var(--coupe-gris)]">
                  Ensuite, {next.round === total ? 'la finale' : `les ${roundNames(next.round, total).short.toLowerCase()}`}
                </h2>
                {next.matches.map((m) => (
                  <p key={m.id} className="text-[13px]">{pairingText(t, m, total)}</p>
                ))}
              </section>
            )}
          </>
        ) : (
          <p className={`${CARD} px-4 py-6 text-center text-[13px] text-[color:var(--coupe-gris)]`}>Le tableau arrive dans un instant.</p>
        )}

        {!finished && (
          <p className="mt-auto pt-2 text-center text-xs text-[color:var(--coupe-gris)]">Éliminé ? Tu suis la suite ici, scores en direct.</p>
        )}
      </div>
    </TournamentShell>
  );
}
