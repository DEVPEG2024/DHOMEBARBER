/*
 * Doigt → cible du joueur de La Coupe du Gang (demande du propriétaire du 29 oct. 2026 : « quand on
 * met le doigt sur le pion, il ne doit pas bouger »).
 *
 * - Doigt posé sur son joueur (ou tout près, GRAB_RADIUS) : le joueur est pris là où il est, il ne
 *   saute pas ; l'écart entre le doigt et le joueur reste le même jusqu'à ce que le doigt se lève.
 * - Doigt posé ailleurs dans sa moitié : le joueur y va, un peu au-dessus du doigt (FINGER_OFFSET,
 *   vers le milieu du terrain) pour que le pouce ne le cache pas.
 * - Souris : le pointeur lui-même, sans écart.
 *
 * À deux sur un téléphone, `fingerSide` dit à quel joueur va un doigt qui se pose.
 *
 * Repère du terrain : joueur 0 en bas, joueur 1 en haut (à deux sur un téléphone).
 */
import { H, PR, FINGER_OFFSET, penaltySpot } from './engine.js';

// Le doigt « tient » son joueur jusqu'à 20 unités hors de son rond (un pouce vise mal)
export const GRAB_RADIUS = PR + 20;

/**
 * Écart { dx, dy } à ajouter au point du doigt pour obtenir la cible, fixé au moment où il se pose.
 * @param {{x: number, y: number}|null} point  doigt dans le repère du terrain
 * @param {{x: number, y: number}|null} paddle  joueur de ce camp à cet instant
 */
export function fingerOffset(point, paddle, pointerType, side = 0) {
  if (pointerType === 'mouse') return { dx: 0, dy: 0 };
  if (point && paddle && Number.isFinite(paddle.x) && Number.isFinite(paddle.y)) {
    const dx = paddle.x - point.x;
    const dy = paddle.y - point.y;
    if (dx * dx + dy * dy <= GRAB_RADIUS * GRAB_RADIUS) return { dx, dy };
  }
  return { dx: 0, dy: side === 1 ? FINGER_OFFSET : -FINGER_OFFSET };
}

/**
 * Joueur (0 en bas, 1 en haut) d'un doigt qui se pose, à deux sur un téléphone : celui de la moitié
 * de l'écran où il se pose. Pendant un penalty (règlement v2), la limite passe au point de penalty :
 * derrière le ballon, le tireur ; entre le ballon et la cage, le gardien. Le tireur est placé dans
 * la moitié du gardien : avec la ligne du milieu, le doigt posé sur lui allait au gardien et le
 * penalty ne pouvait pas être tiré (3 nov. 2026). Un joueur passé de l'autre côté de la limite (but
 * en or) est pris par un doigt posé sur lui (GRAB_RADIUS) si aucun doigt ne le tient déjà.
 * @param {{x: number, y: number}} point  doigt dans le repère du terrain
 * @param {object|null} frame  image du match (`paddles`, `mode`)
 * @param {Array} active  doigt qui tient chaque joueur (null : aucun)
 */
export function fingerSide(point, frame, active = [null, null]) {
  const mode = frame && frame.mode;
  const line = mode && mode.k === 'pen' && (mode.s === 0 || mode.s === 1) ? penaltySpot(mode.s).y : H / 2;
  const side = point.y < line ? 1 : 0;
  const o = 1 - side;
  const pads = frame && frame.paddles;
  const p = pads && pads[o];
  if (!p || active[o] != null || (o === 0 ? p.y >= line : p.y <= line)) return side;
  const d = Math.hypot(p.x - point.x, p.y - point.y);
  const own = pads[side] ? Math.hypot(pads[side].x - point.x, pads[side].y - point.y) : Infinity;
  return d <= GRAB_RADIUS && d < own ? o : side;
}
