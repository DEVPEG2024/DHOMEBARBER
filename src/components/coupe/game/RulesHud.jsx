import React from 'react';
import { WARN_MAX } from '@/lib/coupe/engine';
import { EVENT_NAMES } from './rulesV2';
import { mmss } from './format';

/*
 * Écran de match du règlement v2 (planche « Écran de match » du 31 oct. 2026, contrat :
 * docs/fonctions/coupe-du-gang-regles-v2-contrat.md, section 8), posé par l'écran de jeu seulement
 * quand le match se joue en règlement v2 (`frame.rules === 2`) : sans `rules` (adversaire sur une
 * app publiée), l'écran d'aujourd'hui, sans rien de plus.
 *
 *  - `RulesBar` : bande sous la barre du haut. Pour chaque joueur, ses buts en pastilles
 *    (`goalsToWin`) et ses avertissements (3) ; au milieu, le penalty et son compte (3, 2, 1) ou
 *    le but en or ; dessous, la jauge « Prochain événement » (pendant un événement : son nom et le
 *    temps qui lui reste).
 *    Valeurs lues dans l'image du match par la boucle de l'écran de jeu : `ui` ne change que quand
 *    un chiffre affiché change (quelques fois par seconde au plus) ; la jauge est remplie par la
 *    boucle elle-même (`fillRef`, transform seul), sans rendu React à chaque image.
 *  - `RulesBanner` : un bandeau à la fois sur le terrain (nom de l'événement, faute, penalty,
 *    arrêt, but électrique…), jamais dans le canvas, lu par les lecteurs d'écran (zone `polite`).
 */

/** Pastilles de buts : pleines jusqu'au score, vides ensuite. */
function GoalPips({ n, of, tone, label }) {
  const full = Math.max(0, Math.min(of, Number(n) || 0));
  return (
    <span className="cdg-v2-pips" role="img" aria-label={label}>
      {Array.from({ length: of }, (_, i) => (
        <i key={i} className={`cdg-v2-pip${i < full ? ` cdg-on cdg-${tone}` : ''}`} />
      ))}
    </span>
  );
}

/** Avertissements (ballon gardé 5 s) : 3 pastilles d'or. */
function WarnPips({ n, label }) {
  const full = Math.max(0, Math.min(WARN_MAX, Number(n) || 0));
  return (
    <span className="cdg-v2-warn" role="img" aria-label={label}>
      <span aria-hidden="true">Avert.</span>
      {Array.from({ length: WARN_MAX }, (_, i) => (
        <i key={i} className={`cdg-v2-dot${i < full ? ' cdg-on' : ''}`} />
      ))}
    </span>
  );
}

const buts = (n) => `${n} ${Math.abs(n) > 1 ? 'buts' : 'but'}`;

/**
 * `ui` : { gw, warn: [bas, haut], mode: null | 'pen' | 'gold', penS (tireur, repère local),
 * digit (secondes pour tirer, arrondies au-dessus), shot (tir parti), goldLeft (s), event (sorte de
 * l'événement en cours, « storm+water » pour deux à la fois), hasNext } ; `names` : [bas, haut]
 * (« Toi », « Kevin » ; à deux « Bas », « Haut ») ; `local` : à deux sur un téléphone.
 */
export function RulesBar({ ui, names, score, local = false, fillRef }) {
  const [a, b] = Array.isArray(score) ? score : [0, 0];
  const gw = ui.gw;
  let chip = null;
  let line = null;
  if (ui.mode === 'pen') {
    chip = (
      <span className="cdg-v2-chip cdg-v2-pen">
        <span>Penalty</span>
        {ui.digit ? <b>{ui.digit}</b> : null}
      </span>
    );
    const shooter = ui.penS === 1 ? 1 : 0;
    if (local) line = `Tir du joueur du ${shooter === 0 ? 'bas' : 'haut'}`;
    else if (shooter === 0) line = ui.shot ? 'Tir parti' : 'À toi de tirer : 3 s';
    else line = `${names[1]} tire : garde ta ligne de but`;
  } else if (ui.mode === 'gold') {
    chip = <span className="cdg-v2-chip cdg-v2-gold"><span>But en or</span></span>;
    line = ui.goldLeft == null ? 'Le prochain but gagne' : `Le prochain but gagne · ${mmss(ui.goldLeft)}`;
  }
  // Événement annoncé ou en cours : son nom à la place de « Prochain événement », la jauge montre
  // alors le temps qui lui reste (remplie par la boucle)
  const live = ui.event
    ? String(ui.event).split('+').map((k) => EVENT_NAMES[k]).filter(Boolean).join(' + ') || null
    : null;
  return (
    <div className="cdg-v2" role="group" aria-label="Buts et avertissements">
      <div className="cdg-v2-row">
        <span className="cdg-v2-side">
          <span className="cdg-v2-name cdg-me">{names[0]}</span>
          <GoalPips n={a} of={gw} tone="me" label={`${names[0]} : ${buts(a)} sur ${gw}`} />
        </span>
        <span className="cdg-v2-mid">{chip}</span>
        <span className="cdg-v2-side">
          <GoalPips n={b} of={gw} tone="rival" label={`${names[1]} : ${buts(b)} sur ${gw}`} />
          <span className="cdg-v2-name">{names[1]}</span>
        </span>
      </div>
      <div className="cdg-v2-row">
        <WarnPips n={ui.warn[0]} label={`Avertissements, ${names[0]} : ${ui.warn[0]} sur ${WARN_MAX}`} />
        {line ? (
          <span className="cdg-v2-line">{line}</span>
        ) : (
          // Jauge : remplie par la boucle de l'écran de jeu (transform), vide sans événement prévu
          <span className="cdg-v2-gauge" aria-hidden="true" data-on={ui.hasNext || live ? '' : undefined} data-live={live ? '' : undefined}>
            <span className="cdg-v2-gauge-label">{live || 'Prochain événement'}</span>
            <span className="cdg-v2-bar"><span className="cdg-v2-fill" ref={fillRef} /></span>
          </span>
        )}
        <WarnPips n={ui.warn[1]} label={`Avertissements, ${names[1]} : ${ui.warn[1]} sur ${WARN_MAX}`} />
      </div>
    </div>
  );
}

/**
 * Bandeau du terrain (un à la fois, ~1,4 s, posé par l'écran de jeu) : titre en capitales, une
 * ligne d'explication, parfois une seconde (« Penalty pour toi »). La zone reste montée pendant le
 * match (sinon les lecteurs d'écran n'entendent pas le premier bandeau).
 */
export function RulesBanner({ banner }) {
  return (
    <div className="cdg-banner-zone" aria-live="polite" aria-atomic="true">
      {banner && (
        <div
          key={banner.id}
          className="cdg-banner"
          data-kind={banner.kind}
          data-pos={banner.pos || 'mid'}
          // Fondu de sortie juste avant que l'écran de jeu le retire
          style={{ '--cdg-banner-out': `${Math.max(0, (banner.ms || 1400) - 280)}ms` }}
        >
          <strong>{banner.title}</strong>
          {banner.sub && <span>{banner.sub}</span>}
          {banner.sub2 && <span className="cdg-banner-sub2">{banner.sub2}</span>}
        </div>
      )}
    </div>
  );
}
