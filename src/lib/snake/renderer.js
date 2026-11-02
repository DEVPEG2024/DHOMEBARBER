/**
 * Snake du Gang : dessin du terrain sur un canvas (planche du 2 nov. 2026, `Partie.dc.html`).
 *
 * Le canvas a la taille du terrain multipliée par le rapport de pixels de l'écran : chaque bord est
 * arrondi au pixel réel, rien n'est flou. Le quadrillage et le vert de l'écran viennent du fond CSS
 * du terrain (`lcdBackground`) ; le canvas ne pose que le serpent, le point et la bestiole.
 *
 * Mesures de la planche, pour une case de 14 px (proportionnelles à une autre taille) :
 *  - anneau du corps : carré de 12 px, 1 px de marge ;
 *  - tête : même carré, deux yeux de 3 px couleur écran, tournés vers la direction ;
 *  - point : losange de 5 × 5 pixels de 2 px ;
 *  - bestiole : dessin de 14 × 7 pixels sur deux cases.
 *
 *   const r = createRenderer(canvas);
 *   r.resize(cell, devicePixelRatio);
 *   r.draw(state, { showSnake: true, showFood: true });
 */
import { COLS, ROWS, DIRS, xOf, yOf } from './engine';
import { SNAKE_COLORS as C } from '@/components/snake/palette';

// Dessins à pixels de la planche : [x, y, largeur, hauteur]
const FOOD = [[2, 0, 1, 1], [1, 1, 3, 1], [0, 2, 5, 1], [1, 3, 3, 1], [2, 4, 1, 1]];

export const CRITTERS = {
  souris: [[3, 0, 2, 1], [2, 1, 7, 1], [1, 2, 9, 1], [0, 3, 2, 1], [3, 3, 8, 1], [13, 3, 1, 1], [1, 4, 10, 1], [12, 4, 1, 1], [3, 5, 1, 1], [8, 5, 1, 1], [10, 5, 2, 1]],
  araignee: [[2, 0, 1, 1], [5, 0, 1, 1], [8, 0, 1, 1], [11, 0, 1, 1], [3, 1, 1, 1], [5, 1, 1, 1], [8, 1, 1, 1], [10, 1, 1, 1], [0, 2, 1, 1], [4, 2, 6, 1], [13, 2, 1, 1], [1, 3, 12, 1], [0, 4, 1, 1], [4, 4, 6, 1], [13, 4, 1, 1], [3, 5, 1, 1], [5, 5, 1, 1], [8, 5, 1, 1], [10, 5, 1, 1], [2, 6, 1, 1], [5, 6, 1, 1], [8, 6, 1, 1], [11, 6, 1, 1]],
  poisson: [[4, 0, 4, 1], [2, 1, 8, 1], [12, 1, 1, 1], [1, 2, 2, 1], [4, 2, 9, 1], [0, 3, 12, 1], [1, 4, 12, 1], [2, 5, 8, 1], [12, 5, 1, 1], [4, 6, 4, 1]],
  scarabee: [[2, 0, 1, 1], [5, 0, 1, 1], [8, 0, 1, 1], [3, 1, 8, 1], [0, 2, 6, 1], [7, 2, 5, 1], [0, 3, 5, 1], [6, 3, 7, 1], [0, 4, 6, 1], [7, 4, 5, 1], [3, 5, 8, 1], [2, 6, 1, 1], [5, 6, 1, 1], [8, 6, 1, 1]],
};

// Yeux de la tête (case de 14 px), selon la direction : haut, droite, bas, gauche
const EYES = [
  [[3, 3], [8, 3]],
  [[8, 3], [8, 8]],
  [[3, 8], [8, 8]],
  [[3, 3], [3, 8]],
];

/** Taille de case entière pour une largeur disponible (14 px au plus, comme la planche). */
export function cellSizeFor(width, { max = 14, min = 6 } = {}) {
  const n = Math.floor((Number(width) || 0) / COLS);
  return Math.max(min, Math.min(max, n));
}

export function createRenderer(canvas) {
  const ctx = canvas ? canvas.getContext('2d') : null;
  let cell = 14;
  let dpr = 1;

  // Rectangle en px CSS, bords arrondis au pixel réel : deux rectangles voisins se touchent sans
  // trou ni recouvrement, et rien n'est flou
  function rect(x, y, w, h) {
    const x0 = Math.round(x * dpr);
    const y0 = Math.round(y * dpr);
    const x1 = Math.round((x + w) * dpr);
    const y1 = Math.round((y + h) * dpr);
    if (x1 > x0 && y1 > y0) ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  // Dessin à pixels `pixels` posé dans la boîte (x, y, w, h), grille de `gw` × `gh`
  function sprite(pixels, x, y, w, h, gw, gh) {
    const sx = w / gw;
    const sy = h / gh;
    for (const [px, py, pw, ph] of pixels) rect(x + px * sx, y + py * sy, pw * sx, ph * sy);
  }

  function resize(nextCell, nextDpr = 1) {
    cell = Math.max(1, Math.floor(nextCell));
    dpr = Math.max(1, Math.min(4, Number(nextDpr) || 1));
    if (!canvas) return;
    const w = COLS * cell;
    const h = ROWS * cell;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }

  function drawSegment(c) {
    const m = cell / 14;
    rect(xOf(c) * cell + m, yOf(c) * cell + m, cell - 2 * m, cell - 2 * m);
  }

  function drawHead(c, dir) {
    const x = xOf(c) * cell;
    const y = yOf(c) * cell;
    const m = cell / 14;
    ctx.fillStyle = C.encre;
    rect(x + m, y + m, cell - 2 * m, cell - 2 * m);
    ctx.fillStyle = C.lcd;
    const eye = Math.max(1, 3 * m);
    for (const [ex, ey] of EYES[dir] || EYES[1]) rect(x + ex * m, y + ey * m, eye, eye);
  }

  /**
   * Dessine l'état du moteur. `showSnake` faux : serpent caché (clignotement de fin) ;
   * `showFood` faux : pas encore de point (graine pas encore connue).
   */
  function draw(state, { showSnake = true, showFood = true } = {}) {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!state) return;
    ctx.fillStyle = C.encre;
    if (showFood && state.food !== null && state.food !== undefined) {
      // Losange de 5 × 5 au centre de la case (10 px dans une case de 14)
      const unit = Math.max(1, Math.floor((cell - 4) / 5));
      const size = unit * 5;
      const off = Math.floor((cell - size) / 2);
      sprite(FOOD, xOf(state.food) * cell + off, yOf(state.food) * cell + off, size, size, 5, 5);
    }
    if (state.bonus) {
      const pixels = CRITTERS[state.bonus.kind] || CRITTERS.souris;
      sprite(pixels, xOf(state.bonus.cell) * cell, yOf(state.bonus.cell) * cell, cell * 2, cell, 14, 7);
    }
    if (showSnake && state.snake && state.snake.length) {
      ctx.fillStyle = C.encre;
      for (let i = state.snake.length - 1; i >= 1; i -= 1) drawSegment(state.snake[i]);
      drawHead(state.snake[0], DIRS[state.dir] ? state.dir : 1);
    }
  }

  return { resize, draw, get cell() { return cell; } };
}
