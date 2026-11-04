import React, { useEffect } from 'react';
import { Trophy, X } from 'lucide-react';
import Pawn from './Pawn';
import { mmss } from './format';
import { useSecondsLeft } from './hooks';

/**
 * Salle d'attente d'un match de tournoi (planche des tournois, écran 6 « Ton match ») : le tour
 * (« Quart de finale ») en bandeau, le nom du tournoi, les deux pions, « En attente de Kevin » et
 * le compte à rebours jusqu'au forfait (`tour.until`, heure de l'appareil, null tant que l'horloge
 * du serveur n'est pas lue). Ni code ni lien à partager : le tableau dit qui joue contre qui, le
 * match commence dès que l'adversaire ouvre le sien. La croix, Échap et « Retour au tableau »
 * quittent la salle (on peut revenir tant que le temps n'est pas écoulé).
 *
 * `tour` : { name, label, until } ; `opponent` : { name, role } ou null ; `me` : { name, role, photo } ;
 * `goals` : buts pour gagner (5 en règlement v2).
 */
export default function TournamentWaiting({ tour, opponent, me, goals = 5, reconnecting = false, onExit }) {
  const until = tour?.until || null;
  const left = useSecondsLeft(until);
  const opp = opponent?.name || null;
  const who = opp || 'ton adversaire';

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onExit?.(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onExit]);

  let clock;
  if (!until) clock = <>Le compte à rebours arrive…</>;
  else if (left > 0) {
    clock = (
      <>
        Sans {who} dans <b className="cdg-tw-left">{mmss(left)}</b>, tu gagnes par forfait.
      </>
    );
  } else clock = <>Temps écoulé : le résultat arrive.</>;

  return (
    <section className="cdg-screen" aria-labelledby="cdg-tw-title">
      <div className="cdg-defi cdg-tw">
        <button type="button" className="cdg-close" onClick={onExit} aria-label="Retour au tableau">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <p className="cdg-eyebrow">{tour?.name || 'Tournoi de la Coupe'}</p>
        <p className="cdg-tw-band">
          <Trophy className="h-[18px] w-[18px]" aria-hidden="true" />
          <span>{tour?.label || 'Match de tournoi'}</span>
        </p>
        <div className="cdg-tw-vs" aria-hidden="true">
          <span className="cdg-tw-side">
            <Pawn name={me?.name} role={me?.role} photo={me?.photo || null} tone="gold" size={72} />
            <span className="cdg-tw-name">Toi</span>
          </span>
          <span className="cdg-tw-mark">VS</span>
          <span className="cdg-tw-side">
            <Pawn name={opp || '?'} role={opponent?.role || 'user'} tone="rival" size={72} />
            <span className="cdg-tw-name">{opp || 'Adversaire'}</span>
          </span>
        </div>
        <h2 className="cdg-message cdg-sm cdg-tw-title" id="cdg-tw-title">En attente de {who}</h2>
        <p className="cdg-wait" role="status">
          <span className="cdg-dot" aria-hidden="true" />
          {reconnecting ? 'Reconnexion…' : 'Coup d’envoi à son arrivée'}
        </p>
        <p className="cdg-tw-clock" role="timer" aria-live="off">{clock}</p>
        <p className="cdg-small">Premier à {goals} · égalité après le but en or : tirs au but</p>
        <button type="button" className="cdg-btn cdg-ghost w-full" onClick={onExit}>Retour au tableau</button>
        <p className="cdg-small">Tu peux revenir tant que le temps n&apos;est pas écoulé.</p>
      </div>
    </section>
  );
}
