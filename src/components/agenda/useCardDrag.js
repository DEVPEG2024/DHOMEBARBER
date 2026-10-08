import { useCallback, useEffect, useRef, useState } from 'react';
import { hapticFeedback } from '@/lib/capacitor';
import { START_HOUR, END_HOUR, SNAP_GRID, timeToMinutes, aptDuration, canDragAppointment } from './agendaUtils';

const MOUSE_THRESHOLD = 5; // px avant qu'un clic devienne un glissé
const TOUCH_SLOP = 8; // px : au-delà, avant l'appui long, le doigt fait défiler la grille
const LONG_PRESS_MS = 450; // appui pour « décoller » une carte au doigt
const EDGE = 48; // px du bord de la grille où elle défile toute seule

const minutesAt = (clientY, colEl, hourHeight) =>
  START_HOUR * 60 + ((clientY - colEl.getBoundingClientRect().top) / hourHeight) * 60;

/**
 * Glisser-déposer des cartes dans les grilles Jour / Semaine.
 * Chaque colonne porte `data-drop-column="<clé>"` (id du barber en vue Jour, date en vue Semaine).
 * Souris : le glissé démarre après 5 px ; doigt : après un appui de 450 ms sans bouger (le défilement
 * reste libre avant). Au lâcher, `onDrop({ apt, column, startMin })` si la carte a changé de place.
 * Un clic qui suit un glissé n'ouvre pas la fiche (`guard`).
 */
export default function useCardDrag({ hourHeight, scrollRef, onDrop }) {
  const [drag, setDrag] = useState(null); // { apt, column, startMin, duration }
  const suppressClickUntil = useRef(0);
  const timers = useRef({ press: null, frame: null });

  useEffect(() => () => {
    clearTimeout(timers.current.press);
    cancelAnimationFrame(timers.current.frame);
  }, []);

  const begin = useCallback((e, apt) => {
    const isTouch = e.type === 'touchstart';
    if (!isTouch && e.button !== 0) return;
    if (!canDragAppointment(apt)) return;
    const originCol = e.currentTarget.closest('[data-drop-column]');
    if (!originCol) return;

    const p = isTouch ? e.touches[0] : e;
    const origin = { x: p.clientX, y: p.clientY };
    let last = origin;
    const duration = aptDuration(apt);
    const aptStart = timeToMinutes(apt.start_time);
    const originKey = originCol.getAttribute('data-drop-column');
    // Décalage entre le doigt et le haut de la carte : la carte ne saute pas sous le doigt
    const grabOffset = minutesAt(p.clientY, originCol, hourHeight) - aptStart;
    let active = false;
    let target = { column: originKey, startMin: aptStart };

    const locate = () => {
      const under = document.elementFromPoint(last.x, last.y);
      const col = under?.closest?.('[data-drop-column]');
      if (!col) return; // hors de la grille (en-tête, marge) : on garde la dernière position
      const raw = minutesAt(last.y, col, hourHeight) - grabOffset;
      const snapped = Math.round(raw / SNAP_GRID) * SNAP_GRID;
      const startMin = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60 - duration, snapped));
      const column = col.getAttribute('data-drop-column');
      if (column !== target.column || startMin !== target.startMin) {
        target = { column, startMin };
        setDrag({ apt, duration, ...target });
      }
    };

    // Près d'un bord, la grille défile toute seule (verticalement, et horizontalement en vue Jour à 5 barbers)
    const autoScroll = () => {
      const sc = scrollRef.current;
      if (sc) {
        const r = sc.getBoundingClientRect();
        const speed = (dist) => Math.ceil(Math.min(dist, EDGE) / 3);
        let dy = 0;
        let dx = 0;
        if (last.y < r.top + EDGE) dy = -speed(r.top + EDGE - last.y);
        else if (last.y > r.bottom - EDGE) dy = speed(last.y - (r.bottom - EDGE));
        if (sc.scrollWidth > sc.clientWidth) {
          if (last.x < r.left + EDGE) dx = -speed(r.left + EDGE - last.x);
          else if (last.x > r.right - EDGE) dx = speed(last.x - (r.right - EDGE));
        }
        if (dy || dx) {
          sc.scrollTop += dy;
          sc.scrollLeft += dx;
          locate();
        }
      }
      timers.current.frame = requestAnimationFrame(autoScroll);
    };

    const activate = () => {
      active = true;
      hapticFeedback();
      setDrag({ apt, duration, ...target });
      timers.current.frame = requestAnimationFrame(autoScroll);
    };

    const onMove = (ev) => {
      const q = ev.touches ? ev.touches[0] : ev;
      last = { x: q.clientX, y: q.clientY };
      const dist = Math.hypot(last.x - origin.x, last.y - origin.y);
      if (!active) {
        if (isTouch) {
          if (dist > TOUCH_SLOP) { clearTimeout(timers.current.press); cleanup(); }
          return;
        }
        if (dist < MOUSE_THRESHOLD) return;
        activate();
      }
      if (ev.cancelable) ev.preventDefault();
      locate();
    };

    const onEnd = () => {
      clearTimeout(timers.current.press);
      cancelAnimationFrame(timers.current.frame);
      cleanup();
      if (!active) return;
      suppressClickUntil.current = Date.now() + 400;
      setDrag(null);
      if (target.column !== originKey || target.startMin !== aptStart) onDrop({ apt, ...target });
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

    if (isTouch) timers.current.press = setTimeout(activate, LONG_PRESS_MS);
  }, [hourHeight, scrollRef, onDrop]);

  /** Ouvre la fiche seulement si la carte n'a pas été glissée juste avant. */
  const guard = useCallback((fn) => (apt) => {
    if (Date.now() < suppressClickUntil.current) return;
    fn(apt);
  }, []);

  /** Props à poser sur une carte déplaçable. */
  const bind = (apt) => (canDragAppointment(apt)
    ? { onMouseDown: (e) => begin(e, apt), onTouchStart: (e) => begin(e, apt) }
    : {});

  return { drag, bind, guard };
}
