/*
 * Textes du règlement v2 de La Coupe du Gang (31 oct. 2026, contrat :
 * docs/fonctions/coupe-du-gang-regles-v2-contrat.md, section 8) : bandeaux de l'écran de match,
 * astuces, résumé des règles. Tutoiement, comme tout le jeu. Aucun texte dans le canvas : les
 * bandeaux sont du HTML posé sur le terrain (RulesBanner), un à la fois.
 *
 * `who` : les deux joueurs en repère local, [bas, haut], chacun { name, obj, me } : `name` en tête
 * de phrase (« Kevin », « Le salon »), `obj` après « pour » (« le salon »), `me` : c'est toi (à deux
 * sur un téléphone, personne). Positions des bandeaux (`pos`) : 'mid' (milieu du terrain,
 * comme la planche), 'high' (entre la cage du haut et le milieu : sous la bannière « BUT ! » du
 * dessin il n'y a pas la place) ou 'low' (entre le milieu et la cage du bas) ; un penalty pousse
 * le bandeau loin du point de penalty et du tireur.
 */
import { FX_ELEC, FX_FIRE, GOALS_TO_WIN, GOALS_TO_WIN_V2, WARN_MAX } from '@/lib/coupe/engine';

/** Buts pour gagner d'après le drapeau du serveur (textes d'avant le match). */
export const goalsFor = (rulesV2) => (rulesV2 ? GOALS_TO_WIN_V2 : GOALS_TO_WIN);

/** « Premier à 5 buts ». */
export const firstTo = (rulesV2) => `Premier à ${goalsFor(rulesV2)} buts`;

/** Nom de chaque événement, annoncé 1 s avant (bandeau en capitales), et ce qu'il fait. */
export const EVENT_NAMES = {
  foam: 'Mousse à raser',
  gel: 'Gel',
  storm: 'Orage',
  goals: 'Buts qui bougent',
  water: 'Arrosage',
  smoke: 'Fumigène',
};
export const EVENT_HINTS = {
  foam: 'Le ballon ralentit dans la mousse',
  gel: 'Le ballon glisse et accélère',
  storm: 'Passe dans un éclair : but à 2',
  goals: 'Les cages glissent sur leur ligne',
  water: 'Les jets poussent le ballon',
  smoke: 'La fumée cache le ballon',
};

/** « Tu » ou « Kevin » (sujet), « toi » ou « Kevin » (après « pour »). */
const subject = (p) => (p?.me ? 'Tu' : p?.name || 'L’adversaire');
const forWhom = (p) => (p?.me ? 'toi' : p?.obj || p?.name || 'l’adversaire');

/**
 * Place du bandeau d'un penalty d'après son tireur (repère local) : le joueur du bas tire vers la
 * cage du haut (point de penalty dans la moitié haute) : bandeau en bas ; et l'inverse.
 */
export const penaltyPos = (shooter) => (shooter === 0 ? 'low' : 'high');

/**
 * Bandeau d'une faute (`foul { side, k, warn, pen }`) : FAUTE + raison, ou AVERTISSEMENT n/3.
 * Un penalty suit toujours une faute qui en donne un : il est dit dans la même bande (deux
 * bandeaux de suite cacheraient le début du tir).
 */
export function foulBanner({ side, k, warn, pen }, who) {
  const s = side === 1 ? 1 : 0;
  const fautif = who[s];
  const tireur = who[1 - s];
  const pour = `Penalty pour ${forWhom(tireur)}`;
  if (k === 'keep' && !pen) {
    const n = Math.max(1, Math.min(WARN_MAX, Math.round(Number(warn) || 1)));
    return {
      kind: 'warn',
      title: `Avertissement ${n}/${WARN_MAX}`,
      sub: fautif?.me ? 'Ballon gardé 5 s : il change de camp' : `${fautif?.name || 'L’adversaire'} a gardé le ballon 5 s`,
      pos: 'mid',
    };
  }
  let why;
  if (k === 'camp') why = `${subject(fautif)} ${fautif?.me ? 'campais devant ton' : 'campait devant son'} but`;
  else if (k === 'block') why = `${subject(fautif)} ${fautif?.me ? 'bloquais' : 'bloquait'} le ballon`;
  else why = `${WARN_MAX}e avertissement : ballon gardé 5 s`;
  return { kind: 'foul', title: 'Faute', sub: why, sub2: pen ? pour : null, pos: pen ? penaltyPos(1 - s) : 'mid' };
}

/** Bandeau du début d'un penalty quand aucune faute ne vient de l'annoncer (reprise d'un match). */
export function penaltyBanner(shooter, who) {
  return { kind: 'penalty', title: 'Penalty', sub: `Pour ${forWhom(who[shooter === 1 ? 1 : 0])}`, pos: penaltyPos(shooter) };
}

/** Fin d'un penalty sans but (`pen_end { r }`) : ARRÊTÉ ! ou RATÉ. Rien pour un but. */
export function penEndBanner(r, shooter, who) {
  const s = shooter === 1 ? 1 : 0;
  const tireur = who[s];
  const gardien = who[1 - s];
  if (r === 'saved') {
    let sub = 'Le gardien a sorti le ballon';
    if (gardien?.me) sub = 'Bien gardé !';
    else if (tireur?.me) sub = `${gardien?.name || 'L’adversaire'} a arrêté ton tir`;
    return { kind: 'saved', title: 'Arrêté !', sub, pos: 'mid' };
  }
  if (r === 'missed') {
    let sub = 'Pas de but à temps';
    if (tireur?.me) sub = 'Pas de but en 3 s';
    else if (tireur?.name) sub = `${tireur.name} a raté son penalty`;
    return { kind: 'missed', title: 'Raté', sub, pos: 'mid' };
  }
  return null;
}

/** But en feu (+1) ou électrique (+2) : bandeau au-dessus de la bannière « BUT ! » du dessin. */
export function goalBanner({ scorer, value, fx }, who) {
  const p = who[scorer === 1 ? 1 : 0];
  if (Number(value) === 2 || fx === FX_ELEC) {
    return { kind: 'elec', title: 'But électrique', sub: `+2 pour ${forWhom(p)}`, pos: 'high' };
  }
  if (fx === FX_FIRE) return { kind: 'fire', title: 'But en feu', sub: `+1 pour ${forWhom(p)}`, pos: 'high' };
  return null;
}

/** Début du but en or (`gold`). */
export const GOLD_BANNER = { kind: 'gold', title: 'But en or', sub: 'Le prochain but gagne', pos: 'high' };

/** Annonce d'un événement (`event { e }`), 1 s avant qu'il agisse. */
export function eventBanner(e) {
  const name = EVENT_NAMES[e?.k];
  if (!name) return null;
  return { kind: 'event', event: e.k, title: name, sub: EVENT_HINTS[e.k], pos: 'mid' };
}

/** Astuces montrées une fois par écran de jeu (bulle du haut du terrain). */
export const TIPS = {
  camp: 'Ne reste pas plus de 3 s devant ton but',
  campLocal: 'Pas plus de 3 s devant son but',
  shoot: 'Tire avant 3 s',
  keep: 'Garde ta ligne de but',
  penLocal: 'Le tireur a 3 s, le gardien reste sur sa ligne de but',
  gold: 'Tu peux monter chez l’adversaire',
  goldLocal: 'Vous pouvez monter chez l’adversaire',
};
