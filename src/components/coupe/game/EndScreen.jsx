import React, { useEffect, useRef } from 'react';
import { Ban, Flag, Loader2, Share2 } from 'lucide-react';
import { LEVELS } from '@/lib/coupe/engine';
import { formatDelta, pointsWord, seasonLabel } from './format';

// Match amical : pourquoi le serveur n'a pas compté de points (`end.points.reason`, codes de
// lib/coupePoints.js du serveur)
const REASONS = {
  no_card: 'Match amical : les points comptent quand vous avez tous les deux une carte Gang (au moins une visite au salon).',
  not_eligible: 'Match amical : ce match ne compte pas pour le classement.',
  same_player: 'Match amical : pas de points entre deux comptes « D’Home Barber ».',
  too_short: 'Match trop court pour compter des points (moins de 10 s de jeu)',
  time_limit_draw: 'Match nul : pas de points.',
  cancelled: 'Match annulé : aucun point.',
  no_result: 'Points non comptés pour ce match.',
  db_error: 'Points non comptés : le match n’a pas pu être enregistré.',
};

/** Place au classement : « 6e », avec le suffixe en exposant. */
function Place({ rank }) {
  return <>{rank}<sup>{rank === 1 ? 're' : 'e'}</sup></>;
}

function PlaceRow({ points }) {
  const { rank, rankBefore } = points;
  if (!rank) return <span>Hors classement</span>;
  if (rankBefore && rankBefore !== rank) {
    return (
      <span role="img" aria-label={`${rankBefore}e place avant le match, ${rank}e après`}>
        <Place rank={rankBefore} /> → <Place rank={rank} />
      </span>
    );
  }
  return <span><Place rank={rank} /> place</span>;
}

function PointsCard({ points, opponent, draw, reason }) {
  if (draw) return <p className="cdg-pts-info" role="status">{REASONS.time_limit_draw}</p>;
  // Fin envoyée sans les points (le serveur ne les a pas confirmés à temps) : ils arrivent ensuite
  if (!points) {
    if (reason === 'too_short') return <p className="cdg-pts-info" role="status">{REASONS.too_short}</p>;
    return <p className="cdg-pts-info" role="status">Points pas encore confirmés : regarde ton classement dans un instant.</p>;
  }
  if (!points.ranked) {
    const why = REASONS[points.reason] || REASONS[reason] || 'Match amical : pas de points pour ce match.';
    return <p className="cdg-pts-info" role="status">{why}</p>;
  }
  const before = points.total == null ? null : points.total - points.delta;
  return (
    <div className="cdg-pts">
      <div className="cdg-pts-main">
        <span>
          <span className={`cdg-pts-delta${points.delta < 0 ? ' cdg-neg' : ''}`}>{formatDelta(points.delta)}</span>
          <small>Points de Coupe</small>
        </span>
        {points.total != null && (
          <span className="cdg-pts-total" role="img" aria-label={`${before} points avant, ${points.total} après`}>
            <span>{before}</span> → {points.total}
          </span>
        )}
      </div>
      <div className="cdg-pts-row">
        <span>{seasonLabel()}</span>
        <PlaceRow points={points} />
      </div>
      <div className="cdg-pts-row">
        <span>{opponent}</span>
        <span>{formatDelta(points.oppDelta)} {pointsWord(points.oppDelta)}</span>
      </div>
    </div>
  );
}

/** Titre et textes de la fin, d'après le résultat (en ligne, contre le salon, à deux). */
export function endTexts({ mode, level, opponent, result }) {
  const online = mode === 'online';
  const out = { eyebrow: '', title: '', win: false, who: '', note: null, info: null };
  if (online) {
    out.eyebrow = `En ligne · contre ${opponent}`;
    out.who = `Toi contre ${opponent}`;
    if (result?.cancelled) {
      out.title = 'Match annulé';
      out.note = 'Moins de 20 s de jeu avant l’abandon : le match ne compte pas.';
    } else if (result?.draw) {
      out.title = 'Match nul';
      out.note = 'Temps écoulé : 5 minutes de jeu sans vainqueur.';
    } else if (result?.reason === 'time_limit' && !result?.forfeit) {
      // 5 minutes de jeu effectif : celui qui mène gagne
      out.win = !!result?.won;
      out.title = out.win ? 'Victoire au temps' : 'Défaite au temps';
      out.note = 'Temps écoulé : 5 minutes de jeu, celui qui mène gagne.';
    } else {
      out.win = !!result?.won;
      out.title = out.win ? 'Victoire' : 'Défaite';
      if (result?.abandoned) out.note = 'Tu as abandonné : défaite par forfait.';
      else if (result?.forfeit) out.note = out.win ? `${opponent} a quitté le match : victoire par forfait.` : 'Défaite par forfait.';
    }
  } else if (mode === 'local') {
    out.eyebrow = 'À deux sur ce téléphone';
    out.who = 'Bas contre haut';
    out.win = true;
    out.title = result?.winner === 1 ? 'Haut gagne' : 'Bas gagne';
    out.info = 'Match amical sur un téléphone : pas de points.';
  } else {
    const L = LEVELS[level] || LEVELS.barber;
    out.eyebrow = `Contre le salon · ${L.name}`;
    out.who = `Toi contre ${L.name}`;
    out.win = result?.winner === 0;
    out.title = out.win ? 'Victoire' : 'Défaite';
    out.info = out.win
      ? <>Entraînement, pas de points. En ligne, cette victoire te rapporterait <b>+3 Points de Coupe</b>.</>
      : <>Entraînement, pas de points. En ligne, une défaite retire <b>1 Point de Coupe</b>, jamais sous 0.</>;
  }
  return out;
}

/**
 * Fin du match (maquette « Fin du match ») : Victoire / Défaite / Match nul, score, points (+3 / −1,
 * total, place avant → après), « Revanche », « Partager en story », « Retour » ; en ligne, Signaler
 * et Bloquer l'adversaire.
 */
export default function EndScreen({
  mode, level, opponent, result, rematchNote, canRematch, onRematch, onExit,
  canModerate, onReport, onBlock, blocked, reported, onShare, sharing = false,
}) {
  const rematchRef = useRef(null);
  useEffect(() => {
    rematchRef.current?.focus?.({ preventScroll: true });
  }, []);
  const online = mode === 'online';
  const [a, b] = result?.score || [0, 0];
  const { eyebrow, title, win, who, note, info } = endTexts({ mode, level, opponent, result });

  return (
    <section className="cdg-end" aria-labelledby="cdg-end-title">
      <div className="cdg-end-body">
        <div className="cdg-end-head">
          <p className="cdg-eyebrow">{eyebrow}</p>
          <h2 className={`cdg-result${win ? ' cdg-win' : ''}${title.length > 12 ? ' cdg-long' : title.length > 9 ? ' cdg-mid' : ''}`} id="cdg-end-title">{title}</h2>
          <p className="cdg-final"><span>{a} – {b}</span><span className="cdg-who">{who}</span></p>
        </div>
        {note && <p className="cdg-note">{note}</p>}
        {online && !result?.cancelled && (
          <PointsCard points={result?.points} opponent={opponent} draw={!!result?.draw} reason={result?.reason} />
        )}
        {info && <p className="cdg-pts-info">{info}</p>}
        <div className="cdg-end-actions">
          <button ref={rematchRef} type="button" className="cdg-btn cdg-primary" onClick={onRematch} disabled={!canRematch}>
            Revanche
            {rematchNote && <small>{rematchNote}</small>}
          </button>
          <div className={`cdg-row${onShare ? '' : ' cdg-single'}`}>
            {onShare && (
              <button type="button" className="cdg-btn cdg-ghost cdg-btn-sm" onClick={onShare} disabled={sharing} aria-busy={sharing}>
                <span className="cdg-inline">
                  {sharing
                    ? <Loader2 className="h-4 w-4 cdg-spin" aria-hidden="true" />
                    : <Share2 className="h-4 w-4" aria-hidden="true" />}
                  Partager en story
                </span>
              </button>
            )}
            <button type="button" className="cdg-btn cdg-ghost cdg-btn-sm" onClick={onExit}>Retour</button>
          </div>
          {online && canModerate && (
            <div className="cdg-mod">
              <button type="button" className="cdg-link" onClick={onReport} disabled={reported}>
                <Flag className="h-4 w-4" aria-hidden="true" />{reported ? 'Signalé' : 'Signaler'}
              </button>
              <button type="button" className="cdg-link" onClick={onBlock} disabled={blocked}>
                <Ban className="h-4 w-4" aria-hidden="true" />{blocked ? 'Bloqué' : 'Bloquer'}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
