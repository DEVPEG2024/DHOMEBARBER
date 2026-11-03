import { useRef } from 'react';
import { UP, RIGHT, DOWN, LEFT } from '@/lib/snake/engine';

/**
 * Glisser pour tourner, sur tout le téléphone de la partie (écran vert et zone « GLISSE »).
 *
 *   const swipe = useSwipe(controller, (dir) => flashArrow(pad, dir));
 *   <Phone {...swipe}>…</Phone>
 *
 * Virage dès 14 px, et le geste continue : un « L » donne deux virages. Toucher qui bouge de moins
 * de 8 px = `controller.tap()` (lancer ou reprendre) ; entre les deux, rien. Un geste qui commence
 * sur une touche ou un lien est laissé au bouton (la capture du pointeur lui volerait son clic).
 */
export const SWIPE_PX = 14;
export const TAP_MAX_PX = 8;

const CONTROLS = 'button, a, input, [role="switch"]';

function swipeDir(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? RIGHT : LEFT;
  return dy > 0 ? DOWN : UP;
}

export function useSwipe(controller, onTurn) {
  const gesture = useRef(null);
  const onTurnRef = useRef(onTurn);
  onTurnRef.current = onTurn;

  const turn = (dx, dy) => {
    const dir = swipeDir(dx, dy);
    controller.turn(dir);
    onTurnRef.current?.(dir);
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest(CONTROLS)) return;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* capture refusée */ }
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, far: 0, turned: false };
  };

  const onPointerMove = (e) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    // Plus grand écart depuis le point de départ : au-delà de 8 px, ce n'est plus un toucher
    g.far = Math.max(g.far, Math.abs(e.clientX - g.x0), Math.abs(e.clientY - g.y0));
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    turn(dx, dy);
    g.turned = true;
    g.x = e.clientX;
    g.y = e.clientY;
  };

  const onPointerUp = (e) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const far = Math.max(g.far, Math.abs(e.clientX - g.x0), Math.abs(e.clientY - g.y0));
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_PX) turn(dx, dy);
    else if (!g.turned && far < TAP_MAX_PX) controller.tap();
  };

  const onPointerCancel = () => { gesture.current = null; };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onContextMenu: (e) => e.preventDefault(),
  };
}
