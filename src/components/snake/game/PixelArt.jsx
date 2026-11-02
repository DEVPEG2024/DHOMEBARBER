import React from 'react';
import { SNAKE_COLORS as C } from '../palette';

/*
 * Petits dessins à pixels de l'écran vert (planche du 2 nov. 2026) : serpent du menu avec son
 * point, serpent enroulé de l'écran de fin. Carrés de 7 px tous les 8 px, yeux couleur écran.
 * En SVG (`crispEdges`) : nets, et réduits sans flou sur un petit écran.
 */

// Serpent du menu (`Main.dc.html`) : carrés (gauche, haut) dans une boîte de 112 × 64
const MENU_SNAKE = [[0, 48], [8, 48], [16, 48], [24, 48], [32, 48], [32, 40], [32, 32], [40, 32], [48, 32], [56, 32], [64, 32], [64, 24], [64, 16], [64, 8]];
const MENU_EYES = [[65, 9], [69, 9]];
// Serpent enroulé de la fin (`Perdu.dc.html`) : boîte de 64 × 40
const CURL_SNAKE = [[0, 32], [8, 32], [16, 32], [24, 32], [32, 32], [40, 32], [48, 32], [48, 24], [48, 16], [40, 16], [32, 16], [32, 24]];
const CURL_EYES = [[33, 26], [36, 26]];
// Point en losange (5 × 5)
const DIAMOND = [[2, 0, 1, 1], [1, 1, 3, 1], [0, 2, 5, 1], [1, 3, 3, 1], [2, 4, 1, 1]];

function Squares({ cells, eyes }) {
  return (
    <>
      {cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="7" height="7" fill={C.encre} />)}
      {eyes.map(([x, y]) => <rect key={`o${x}-${y}`} x={x} y={y} width="2" height="2" fill={C.lcd} />)}
    </>
  );
}

/** Serpent du menu et son point (112 × 64 à taille réelle). */
export function MenuSnake({ className = '' }) {
  return (
    <svg viewBox="0 0 112 64" className={className} shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      <Squares cells={MENU_SNAKE} eyes={MENU_EYES} />
      <g transform="translate(92 4) scale(3)">
        {DIAMOND.map(([x, y, w, h]) => <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} fill={C.encre} />)}
      </g>
    </svg>
  );
}

/** Serpent enroulé de l'écran de fin (64 × 40 à taille réelle). */
export function CurledSnake({ className = '' }) {
  return (
    <svg viewBox="0 0 64 40" className={className} shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      <Squares cells={CURL_SNAKE} eyes={CURL_EYES} />
    </svg>
  );
}
