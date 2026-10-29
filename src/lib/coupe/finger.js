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
 * Repère du terrain : joueur 0 en bas, joueur 1 en haut (à deux sur un téléphone).
 */
import { PR, FINGER_OFFSET } from './engine.js';

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
