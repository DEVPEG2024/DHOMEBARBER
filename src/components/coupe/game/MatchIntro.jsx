import React from 'react';
import Pawn from './Pawn';

/*
 * Avant-match et fin de match sur le stade (thème stade, docs/fonctions/coupe-du-gang-stade.md,
 * maquettes « StadeAvant » et « StadeAnimation »), posés sur tout l'écran par l'écran de jeu :
 *  - `fx` "vs" puis "vs-out" : bandeau « La Coupe du Gang » et affiche des deux joueurs, pendant
 *    que la caméra montre le stade entier (première seconde du premier coup d'envoi) ;
 *  - `fx` "fin" puis "fin-out" : « FIN DU MATCH » au centre du terrain (`--cdg-pitch-cy`, posé par
 *    StadiumStage), avant que la caméra recule.
 * Monté seulement pendant ces moments ; visuel seulement (aria-hidden) : le score et la fin sont
 * annoncés par l'écran de jeu. Aucun point des joueurs (aucune requête de plus).
 *
 * `players` : [toi (ou le joueur du bas), l'adversaire (ou le joueur du haut)], chacun
 * { name, role, tag?, photo?, label } ; `label` est écrit sous la pastille, `photo` (client) dedans.
 * `goals` : buts pour gagner (3, ou 5 en règlement v2, d'après le coup d'envoi du match).
 */

const MODE_LINES = {
  online: 'Match en ligne',
  bot: 'Entraînement contre le salon',
  local: 'Deux joueurs, un téléphone',
};

function Side({ player, tone }) {
  return (
    <span className="cdg-vs-side">
      <Pawn name={player?.name} role={player?.role} tag={player?.tag} photo={player?.photo} tone={tone} size={66} />
      <span className="cdg-vs-name">{player?.label || player?.name}</span>
    </span>
  );
}

export default function MatchIntro({ fx, mode = 'online', players = [], goals = 3 }) {
  if (!fx) return null;
  const out = fx.endsWith('-out') ? ' cdg-out' : '';

  if (fx.startsWith('fin')) {
    return (
      <div className={`cdg-outro${out}`} aria-hidden="true">
        <span>Fin du match</span>
      </div>
    );
  }

  const online = mode !== 'bot' && mode !== 'local';
  return (
    <div className={`cdg-intro${out}`} aria-hidden="true">
      <div className="cdg-intro-band">
        <p className="cdg-intro-title">La <span>Coupe</span> du Gang</p>
        <p className="cdg-intro-mode">
          <span className="cdg-intro-dot" />
          {MODE_LINES[mode] || MODE_LINES.online}
        </p>
      </div>
      <div className="cdg-vs">
        <div className="cdg-vs-row">
          <Side player={players[0]} tone="gold" />
          <span className="cdg-vs-mark"><span>VS</span></span>
          <Side player={players[1]} tone="rival" />
        </div>
        <p className="cdg-vs-rules">
          Premier à {goals} buts ·{' '}
          {/* Les droits aux points ne sont connus qu'à la fin du match (carte Gang d'un client) */}
          {online ? <><b>+3</b> à la victoire, −1 à la défaite quand vous y avez droit tous les deux</> : 'match amical'}
        </p>
      </div>
    </div>
  );
}
