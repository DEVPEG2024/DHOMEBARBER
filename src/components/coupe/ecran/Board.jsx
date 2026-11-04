import React from 'react';
import { CARD, LABEL, LIST, ROW } from './ScreenParts';
import { boardRow, boardWindow, roundsOf } from './screenFormat';

/*
 * Tableau d'un tournoi sur l'écran du salon (planche, écran 14).
 *  - `BoardCards` : à côté du match en grand, le tour en cours et le suivant, une carte par tour
 *    (« Quarts de finale », « Demi-finales »…) : score rouge en direct, blanc une fois fini, « à
 *    suivre », « Inès B. contre Lucas M. ou Dom » pour une place pas encore connue.
 *  - `BracketWide` : sans match en grand, tout le tableau, un tour par colonne.
 * Noms seulement (jamais de photo). Texte à 16 px de scène au moins (taille de la scène, `text-base`).
 */

const RED = 'text-[color:var(--coupe-rouge-vif)]';
const MUTED = 'text-[color:var(--coupe-gris)]';

/** `dense` : 16 joueurs (8es et quarts côte à côte), scores sans interligne pour tenir sans défiler. */
function RowContent({ row, dense = false }) {
  const [a, b] = row.names;
  const score = `font-fut tabular-nums ${dense ? 'text-xl leading-none' : 'text-[22px]'}`;
  if (row.state === 'bye') {
    return (
      <>
        <span className="min-w-0 truncate">{row.known[0] ? a : b}</span>
        <span className={`ml-auto shrink-0 ${MUTED}`}>passe le tour</span>
      </>
    );
  }
  if (row.state === 'later' && !(row.known[0] && row.known[1])) {
    // Place pas encore connue : « Inès B. contre Lucas M. ou Dom », sinon les deux places en gris
    if (row.known[0] || row.known[1]) {
      const [known, other] = row.known[0] ? [a, b] : [b, a];
      return (
        <>
          <span className="min-w-0 shrink truncate">{known}</span>
          <span className={`ml-auto min-w-0 truncate ${MUTED}`}>{`contre ${other}`}</span>
        </>
      );
    }
    return <span className={`min-w-0 truncate ${MUTED}`}>{`${a} – ${b}`}</span>;
  }
  return (
    <>
      <span className="min-w-0 truncate">{`${a} – ${b}`}</span>
      {row.state === 'live' && <b className={`ml-auto shrink-0 ${score} ${RED}`}>{row.score || '0 – 0'}</b>}
      {row.state === 'done' && (
        <span className="ml-auto flex shrink-0 items-baseline gap-1.5">
          {row.so && <span className={MUTED}>{`t.a.b. ${row.so}`}</span>}
          <b className={score}>{row.score || 'forfait'}</b>
        </span>
      )}
      {(row.state === 'next' || row.state === 'later') && <span className={`ml-auto shrink-0 ${MUTED}`}>à suivre</span>}
    </>
  );
}

/**
 * Le tour en cours et le suivant, une carte par tour. `liveByMid` : `live` par match de tournoi ;
 * `shownMid` : le match montré en grand (trait rouge à gauche de sa ligne, `aria-current`).
 */
export function BoardCards({ tournament, liveByMid, shownMid = null, className = '' }) {
  const rounds = roundsOf(tournament);
  const shown = boardWindow(rounds);
  const total = shown.reduce((n, r) => n + r.matches.length, 0);
  // 16 joueurs (8es et quarts) : lignes plus serrées pour tenir sans défiler (texte à 16 px de scène)
  const dense = total > 7;
  const rowPad = dense ? 'py-[5px] leading-snug' : 'py-2.5';
  return (
    <div className={`flex min-h-0 flex-col gap-[18px] ${className}`}>
      {shown.map((r) => (
        <section key={r.index} aria-labelledby={`ecran-tour-${r.index}`} className={`${CARD} pb-1.5`}>
          <h2 id={`ecran-tour-${r.index}`} className={`${LABEL} px-3.5 pb-1.5 pt-3.5`}>{r.label}</h2>
          <ul className={LIST}>
            {r.matches.map((m, slot) => {
              const row = boardRow(rounds, r.index, slot, liveByMid);
              return (
                <li
                  key={row.mid || slot}
                  data-match={row.mid || undefined}
                  data-etat={row.state}
                  aria-current={shownMid && row.mid === shownMid ? 'true' : undefined}
                  className={`${ROW} ${rowPad} ${shownMid && row.mid === shownMid ? 'shadow-[inset_3px_0_0_var(--coupe-rouge-vif)]' : ''}`}
                >
                  <RowContent row={row} dense={dense} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Une place d'un match du tableau complet (nom et buts) ; `dense` : 16 joueurs, buts à 16 px. */
function Side({ row, side, dense = false }) {
  const name = row.names[side];
  const goals = Array.isArray(row.sc) ? row.sc[side] : null;
  const won = row.state === 'done' && row.winner === side;
  const lost = row.state === 'done' && row.winner === 1 - side;
  const tone = !row.known[side] || lost ? MUTED : '';
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={`min-w-0 flex-1 truncate ${won ? 'font-bold' : ''} ${tone}`}>
        {row.state === 'bye' && !row.known[side] ? 'Exempt' : name}
      </span>
      {goals != null && (
        <span className={`shrink-0 font-fut ${dense ? 'text-base' : 'text-lg'} font-extrabold tabular-nums ${row.state === 'live' ? RED : ''}`}>{goals}</span>
      )}
    </span>
  );
}

/** Tout le tableau, un tour par colonne (sans match en grand). */
export function BracketWide({ tournament, liveByMid, className = '' }) {
  const rounds = roundsOf(tournament);
  const dense = rounds[0]?.matches?.length > 4;
  return (
    <section aria-label="Tableau" className={`flex min-h-0 gap-3.5 ${className}`}>
      {rounds.map((r, index) => (
        <div key={index} className="flex min-w-0 flex-1 flex-col">
          <h2 className={`${LABEL} pb-2.5`}>{r.label}</h2>
          <ul className="flex min-h-0 flex-1 flex-col justify-around gap-1.5">
            {r.matches.map((m, slot) => {
              const row = boardRow(rounds, index, slot, liveByMid);
              const live = row.state === 'live';
              return (
                <li
                  key={row.mid || slot}
                  data-match={row.mid || undefined}
                  data-etat={row.state}
                  className={`${CARD} flex flex-col ${dense ? 'px-2.5 py-1 leading-tight' : 'gap-1 px-3 py-2'} ${live ? 'border-[rgba(255,61,68,.55)]' : ''}`}
                >
                  <Side row={row} side={0} dense={dense} />
                  <Side row={row} side={1} dense={dense} />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
