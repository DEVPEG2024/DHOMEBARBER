import React from 'react';
import MatchStage from './MatchStage';
import { UnscaledBox } from './ScreenFrame';
import { CARD, DISPLAY, LABEL } from './ScreenParts';
import { liveKey, liveTitle, nameOf, scoreText } from './screenFormat';

/*
 * Match montré en grand (planche, écran 14, colonne du milieu) : la vue en direct du serveur de jeu
 * (MatchStage : bande du score, joueur du haut en blanc à gauche, joueur du bas en rouge à droite,
 * puis le terrain). Pendant les 8 s du score final, un panneau « Fin du match » par-dessus
 * (« Quart 1 · Fin du match » pour un match de tournoi : `tour.title`, repli `label`).
 * Noms seulement (« Lucas M. », prénom du barber, « D'Home Barber »), pions aux initiales.
 */

/** Joueurs et score : la vue en direct d'abord (`ui`), la ligne de `live` sinon. */
function matchInfo(target, ui) {
  const names = Array.isArray(ui?.names) && ui.names.length === 2 ? ui.names : (Array.isArray(target?.names) ? target.names : []);
  const sc = Array.isArray(ui?.sc) ? ui.sc : target?.sc;
  return {
    players: [0, 1].map((i) => ({ name: nameOf({ name: names[i] }) })),
    sc: Array.isArray(sc) ? sc : [0, 0],
  };
}

/**
 * « Lucas M. gagne », « Aux tirs au but (4 – 3) »… d'après le résultat (ou le dernier score).
 * `cut` : la vue en direct a perdu le match sans sa fin (reconnexion) : le dernier score, sans vainqueur.
 */
function finalLines(info, result, cut = false) {
  const sc = Array.isArray(result?.sc) ? result.sc : info.sc;
  if (cut) return { label: 'Fin du direct', title: `${info.players[1].name} – ${info.players[0].name}`, score: scoreText([sc[1], sc[0]]), detail: '' };
  let winner = result ? result.winner : null;
  if (!result && Number(sc[0]) !== Number(sc[1])) winner = Number(sc[0]) > Number(sc[1]) ? 0 : 1;
  if (result?.reason === 'closed') return { title: 'Match interrompu', score: scoreText(sc), detail: '' };
  if (winner !== 0 && winner !== 1) return { title: 'Match terminé', score: scoreText(sc), detail: '' };
  const ordered = winner === 0 ? sc : [sc[1], sc[0]];
  const so = Array.isArray(result?.so) ? result.so : null;
  let detail = '';
  if (result?.forfeit) detail = 'Par forfait';
  else if (so) detail = `Aux tirs au but (${scoreText(winner === 0 ? so : [so[1], so[0]])})`;
  else if (result?.reason === 'golden_goal') detail = 'Au but en or';
  return { title: `${info.players[winner].name} gagne`, score: scoreText(ordered), detail };
}

function FinalPanel({ info, result, cut, title }) {
  const lines = finalLines(info, result, cut);
  const label = lines.label || 'Fin du match';
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[rgba(11,11,12,.6)] p-6">
      <div role="status" className={`${CARD} flex w-full flex-col items-center gap-2.5 px-5 py-6 text-center`}>
        <span className={LABEL}>{title ? `${title} · ${label}` : label}</span>
        <p className={`${DISPLAY} text-[34px] [overflow-wrap:anywhere]`}>{lines.title}</p>
        {lines.score && <p className={`${DISPLAY} text-[44px] tabular-nums text-[color:var(--coupe-or)]`}>{lines.score}</p>}
        {lines.detail && <p className="text-lg text-[color:var(--coupe-gris-clair)]">{lines.detail}</p>}
      </div>
    </div>
  );
}

/**
 * `target` : ligne de `live` du match ; `final` : `{ result }` pendant le score final.
 * `spectator` : la vue en direct de l'écran (`useScreenSpectator`, une seule socket pour tout
 * l'écran) ; son `ui` sert aussi au panneau du score final.
 * La hauteur vient du parent (`className`, ou la ligne de la grille).
 */
export default function BigMatch({ target, final, spectator, className = '' }) {
  const tkey = liveKey(target);
  const ui = spectator?.key === tkey ? spectator.ui : null;
  const info = matchInfo(target, ui);
  return (
    <section aria-label="Match en direct" data-grand={target.id} className={`relative flex min-h-0 flex-col ${className}`}>
      {/* Hors de la mise à l'échelle de l'écran : le stade et le terrain dessiné restent superposés ;
          la bande du score reçoit l'échelle (MatchStage) */}
      <UnscaledBox className="min-h-0 flex-1">
        <MatchStage key={tkey} spectator={spectator?.key === tkey ? spectator : null} row={target} />
      </UnscaledBox>
      {final && <FinalPanel info={info} result={final.result} cut={!!final.cut} title={liveTitle(target)} />}
    </section>
  );
}
