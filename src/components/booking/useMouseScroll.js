/**
 * Rangée qui défile de gauche à droite (bande de jours, barbers, produits) utilisable à la souris.
 *
 * Sur un téléphone, le doigt la fait défiler. Sur un ordinateur avec une souris, rien ne bougeait :
 * la molette (verticale) faisait défiler la page, le glisser ne faisait rien et la barre de
 * défilement est masquée (`scrollbar-hide`). Sur dhomebarber.fr, les jours au-delà de la première
 * semaine d'un mois étaient inatteignables (audit du 24 oct. 2026). Ce module ajoute :
 *  - la molette au-dessus de la rangée : elle la fait défiler de gauche à droite, sauf au bout de
 *    la rangée, sauf si la page était en train de défiler (le pointeur qui passe sur la rangée pendant
 *    la lecture ne bloque pas la page), et sauf un défilement déjà horizontal (pavé tactile, Maj) ;
 *  - le glisser à la souris (bouton gauche), sans déclencher le clic du jour sous le pointeur.
 * Sans effet au doigt et au stylet (`pointerType`), qui gardent le défilement natif.
 */
import { useEffect, useRef } from 'react';

/** La page a défilé il y a moins de ce délai (ms) : la molette continue de faire défiler la page. */
const PAGE_SCROLL_GRACE_MS = 350;
/** Déplacement (px) au-delà duquel un appui souris devient un glisser (en deçà : un clic). */
const DRAG_THRESHOLD = 6;
/** Molette « une carte par cran » : délai minimal entre deux cartes (un geste de pavé = une ou deux cartes). */
const WHEEL_STEP_COOLDOWN_MS = 350;

/**
 * `ref` : rangée qui défile (`overflow-x-auto`). `ready` : la rangée est affichée (une rangée
 * montée plus tard, une fois ses données chargées, est branchée à ce moment-là).
 * `onWheelStep(sens)` (facultatif, carrousel aimanté `snap-mandatory`) : la molette avance d'une carte
 * par cran (`sens` = 1 ou -1) au lieu de quelques pixels, que l'aimantation ramènerait à la même carte.
 */
export function useMouseScroll(ref, ready = true, { onWheelStep = null } = {}) {
  const stepRef = useRef(onWheelStep);
  stepRef.current = onWheelStep;
  useEffect(() => {
    const el = ref.current;
    if (!el || !ready) return undefined;
    let lastPageScroll = 0;
    let lastStep = 0;
    let drag = null;
    let suppressClick = false;
    let resetTimer = 0;

    const onPageScroll = () => { lastPageScroll = Date.now(); };

    const onWheel = (e) => {
      if (e.ctrlKey) return; // zoom au pavé tactile
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // déjà horizontal : défilement natif
      if (Date.now() - lastPageScroll < PAGE_SCROLL_GRACE_MS) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1;
      const delta = e.deltaY * unit;
      if ((delta < 0 && el.scrollLeft <= 0) || (delta > 0 && el.scrollLeft >= max - 1)) return; // au bout : la page
      e.preventDefault();
      if (stepRef.current) {
        const now = Date.now();
        if (now - lastStep < WHEEL_STEP_COOLDOWN_MS) return;
        lastStep = now;
        stepRef.current(delta > 0 ? 1 : -1);
        return;
      }
      el.scrollBy({ left: delta, behavior: 'auto' });
    };

    const endDrag = () => {
      if (!drag) return;
      if (drag.moved) {
        el.style.scrollSnapType = '';
        el.style.cursor = '';
        el.style.userSelect = '';
        // Le clic qui suit le relâchement n'est pas un choix (il est arrêté par onClickCapture) ;
        // sans clic (relâché hors de la rangée), le repère est levé au tour suivant
        suppressClick = true;
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => { suppressClick = false; }, 0);
      }
      drag = null;
    };

    const onPointerDown = (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (el.scrollWidth <= el.clientWidth) return;
      drag = { id: e.pointerId, x: e.clientX, left: el.scrollLeft, moved: false };
    };
    const onPointerMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!(e.buttons & 1)) { endDrag(); return; }
      const dx = e.clientX - drag.x;
      if (!drag.moved) {
        if (Math.abs(dx) < DRAG_THRESHOLD) return;
        drag.moved = true;
        // Pas d'aimantation pendant le glisser : la rangée suit la souris, elle se cale au relâchement
        el.style.scrollSnapType = 'none';
        el.style.cursor = 'grabbing';
        el.style.userSelect = 'none';
        try { el.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
      }
      el.scrollLeft = drag.left - dx;
    };
    const onPointerUp = (e) => { if (drag && e.pointerId === drag.id) endDrag(); };
    const onClickCapture = (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    };
    // Une image ou un lien glissés partiraient en glisser-déposer du navigateur
    const onDragStart = (e) => e.preventDefault();

    window.addEventListener('scroll', onPageScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('click', onClickCapture, true);
    el.addEventListener('dragstart', onDragStart);
    return () => {
      clearTimeout(resetTimer);
      window.removeEventListener('scroll', onPageScroll);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('click', onClickCapture, true);
      el.removeEventListener('dragstart', onDragStart);
    };
  }, [ref, ready]);
}

export default useMouseScroll;
