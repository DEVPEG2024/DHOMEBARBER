import { useCallback, useEffect, useRef, useState } from 'react';
import { hapticFeedback } from '@/lib/capacitor';
import { START_HOUR, END_HOUR, SNAP_GRID, minutesToTime } from './agendaUtils';

const DRAG_THRESHOLD = 4; // pixels avant de considérer un glissé
const LONG_PRESS_MS = 1000; // sur mobile : appui long avant de tracer une pause (le défilement reste libre)

const clampMinutes = (m) => Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, m));

function yToMinutes(clientY, colElement, hourHeight) {
  // Le haut de la colonne suit le défilement : la distance au doigt donne l'heure, en-tête collant compris
  const relY = clientY - colElement.getBoundingClientRect().top;
  const raw = START_HOUR * 60 + (relY / hourHeight) * 60;
  return clampMinutes(Math.round(raw / SNAP_GRID) * SNAP_GRID);
}

/**
 * Glisser sur une colonne vide pour tracer une pause : immédiat à la souris, après un appui long
 * d'une seconde au doigt. `onCreate({ start_time, end_time, column })` reçoit la colonne d'origine.
 */
export default function useBreakDrag({ hourHeight, onCreate }) {
  const [dragging, setDragging] = useState(null); // { startMin, currentMin, column }
  const longPressTimer = useRef(null);

  useEffect(() => () => clearTimeout(longPressTimer.current), []);

  const start = useCallback((e, column, colElement) => {
    const isTouch = e.type === 'touchstart';
    if (!isTouch && e.button !== 0) return;
    if (e.target.closest('[data-block]')) return;

    const point = isTouch ? e.touches[0] : e;
    const origin = { x: point.clientX, y: point.clientY };
    const startMin = yToMinutes(point.clientY, colElement, hourHeight);
    let active = !isTouch;
    let moved = false;

    const pos = (ev) => (ev.touches ? ev.touches[0] : ev);

    const onMove = (ev) => {
      const p = pos(ev);
      const dist = Math.hypot(p.clientX - origin.x, p.clientY - origin.y);
      if (!active) {
        // Au doigt, bouger avant l'appui long = défiler : on abandonne
        if (dist > DRAG_THRESHOLD) { clearTimeout(longPressTimer.current); cleanup(); }
        return;
      }
      if (!moved && dist < DRAG_THRESHOLD) return;
      moved = true;
      if (isTouch) ev.preventDefault();
      setDragging({ startMin, currentMin: yToMinutes(p.clientY, colElement, hourHeight), column });
    };

    const onEnd = () => {
      clearTimeout(longPressTimer.current);
      cleanup();
      setDragging((prev) => {
        if (prev && moved) {
          const s = Math.min(prev.startMin, prev.currentMin);
          const end = Math.max(prev.startMin, prev.currentMin);
          if (end - s >= 10) {
            setTimeout(() => onCreate({ start_time: minutesToTime(s), end_time: minutesToTime(end), column: prev.column }), 0);
          }
        }
        return null;
      });
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);

    if (isTouch) {
      longPressTimer.current = setTimeout(() => {
        active = true;
        hapticFeedback();
        setDragging({ startMin, currentMin: startMin, column });
      }, LONG_PRESS_MS);
    }
  }, [hourHeight, onCreate]);

  /** Aperçu de la pause en cours de tracé dans cette colonne, ou null. */
  const previewFor = (column) => {
    if (!dragging || dragging.column !== column) return null;
    const s = Math.min(dragging.startMin, dragging.currentMin);
    const e = Math.max(dragging.startMin, dragging.currentMin);
    return e - s < 5 ? null : { startMin: s, endMin: e };
  };

  return { start, previewFor, isDragging: !!dragging };
}
