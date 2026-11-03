import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { COLS, ROWS } from '@/lib/snake/engine';
import { createRenderer, cellSizeFor } from '@/lib/snake/renderer';
import { lcdScore } from '@/lib/snake/format';
import Lcd from '../Lcd';
import { SNAKE_COLORS as C, lcdBackground } from '../palette';

/**
 * Écran vert de la partie (planche `Partie.dc.html`) : barre d'état (score sur 4 chiffres,
 * « BONUS n » pendant une bestiole, « NIV n »), terrain de 22 × 16 cases dessiné sur un canvas net,
 * écrans PRÊT ? et PAUSE.
 *
 * Taille de case entière, prise sur la largeur disponible : 14 px à 390 px d'écran, 10 px à 320 px.
 * Le glisser est lu sur tout le téléphone (`swipe.js`), pas seulement ici. Textes de PRÊT ? et PAUSE
 * selon l'appareil : glisser au doigt, clavier sur ordinateur.
 */
// Texte pour le doigt, ou pour l'ordinateur (souris et clavier)
const TOUCH_ONLY = '[@media(hover:hover)_and_(pointer:fine)]:hidden';
const DESK_ONLY = 'hidden [@media(hover:hover)_and_(pointer:fine)]:inline';
// Marges entre le bord de l'écran et le terrain : page 2 × 14, téléphone 2 × (12 + 1 de bord),
// cadre 2 × 8, écran vert 2 × 6 ; sert à deviner la case avant la première mesure. La planche
// donne 7 px à l'écran vert mais déborde alors de 2 px du téléphone : 6 px gardent ses cases de
// 14 px à 390 px sans rien faire déborder
const AROUND_PX = 82;

function initialCell() {
  if (typeof window === 'undefined') return 14;
  return cellSizeFor(Math.min(window.innerWidth || 390, 390) - AROUND_PX);
}

export default function GameField({ controller, status, score, level, waiting, statsRef, autoFocus = false }) {
  const measureRef = useRef(null);
  const canvasRef = useRef(null);
  const fieldRef = useRef(null);
  const [cell, setCell] = useState(initialCell);

  // Case entière selon la largeur réelle de l'écran vert
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return undefined;
    const measure = () => setCell(cellSizeFor(el.clientWidth));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Dessin : le contrôleur appelle le dessinateur à chaque pas, React n'y est pour rien
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !controller) return undefined;
    const renderer = createRenderer(canvas);
    let dpr = 1;
    const fit = () => {
      dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      renderer.resize(cell, dpr);
      controller.redraw();
    };
    controller.setDrawer((game, opts) => renderer.draw(game, opts));
    fit();
    // Zoom ou écran changé (rapport de pixels différent) : canvas refait à la nouvelle densité
    let mq = null;
    const onDpr = () => fit();
    try {
      mq = window.matchMedia(`(resolution: ${dpr}dppx)`);
      if (mq.addEventListener) mq.addEventListener('change', onDpr);
    } catch {
      mq = null;
    }
    return () => {
      if (mq && mq.removeEventListener) mq.removeEventListener('change', onDpr);
      controller.setDrawer(null);
    };
  }, [controller, cell]);

  useEffect(() => {
    if (!autoFocus) return;
    try { fieldRef.current?.focus({ preventScroll: true }); } catch { /* focus refusé */ }
  }, [autoFocus]);

  const w = COLS * cell;
  const h = ROWS * cell;
  const box = 'pointer-events-none absolute left-1/2 top-1/2 w-[220px] max-w-[calc(100%-24px)] -translate-x-1/2 -translate-y-1/2 px-3 py-3.5 text-center';

  return (
    <Lcd
      className="w-full"
      frame={8}
      radius={20}
      grid={cell}
      innerClassName="flex flex-col items-center gap-1"
      innerStyle={{ padding: '6px 6px 7px', backgroundImage: 'none' }}
    >
      <div ref={measureRef} className="-mb-1 h-0 w-full" aria-hidden="true" />
      <div className="flex h-[22px] items-center justify-between border-b-2 text-base leading-none" style={{ width: w, borderColor: C.encre }}>
        <span><span className="sr-only">Score : </span>{lcdScore(score)}</span>
        <span ref={statsRef} hidden className="px-1.5 py-0.5 text-xs leading-none" style={{ background: C.encre, color: C.lcd }}>
          BONUS <span data-bonus-left="" />
        </span>
        <span className="text-xs">NIV {level}</span>
      </div>
      <div
        ref={fieldRef}
        role="group"
        tabIndex={0}
        aria-label="Terrain du jeu : glisse sur le téléphone ou utilise les flèches, 5 ou Espace pour la pause"
        className="relative cursor-pointer select-none outline-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [touch-action:none] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E2618]"
        style={{ width: w, height: h, ...lcdBackground(cell) }}
      >
        <canvas ref={canvasRef} aria-hidden="true" className="absolute left-0 top-0 block" style={{ width: w, height: h }} />
        {status === 'ready' && (
          <div className={box} style={{ background: C.encre, color: C.lcd }}>
            <div className="text-[22px] font-bold leading-tight">PRÊT ?</div>
            <div className="mt-1.5 text-[11px]">
              {waiting ? 'Un instant…' : (
                <>
                  <span className={TOUCH_ONLY}>Glisse pour partir</span>
                  <span className={DESK_ONLY}>Flèche ou Espace</span>
                </>
              )}
            </div>
          </div>
        )}
        {status === 'pause' && (
          <div className={box} style={{ background: C.encre, color: C.lcd }}>
            <div className="text-[22px] font-bold leading-tight">PAUSE</div>
            <div className="mt-1.5 text-[11px]">
              <span className={TOUCH_ONLY}>Glisse ou touche GO</span>
              <span className={DESK_ONLY}>Espace pour reprendre</span>
            </div>
          </div>
        )}
      </div>
    </Lcd>
  );
}
