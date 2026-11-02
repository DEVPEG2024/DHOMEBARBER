/**
 * Snake du Gang : moteur du jeu, règles du Snake classique (demande du propriétaire du 2 nov. 2026 :
 * « les vraies règles », « juste pas de labyrinthe »). Contrat : docs/fonctions/snake-du-gang-contrat.md.
 *
 * DEUX COPIES IDENTIQUES OCTET POUR OCTET : src/lib/snake/engine.js (app) et
 * dhomebarber-api/lib/snakeEngine.mjs (serveur, qui rejoue chaque partie pour recalculer le score ;
 * test/test-snake-engine.js compare les deux fichiers). Toute modification se fait dans les deux.
 *
 * Aucune dépendance, aucune heure, aucun hasard hors de la graine : la même graine, le même niveau
 * et les mêmes gestes donnent toujours la même partie, sur le téléphone comme sur le serveur.
 *
 * Règles :
 *  - grille de 22 × 16 cases, sans murs : le serpent qui sort d'un côté revient par l'autre ;
 *  - il avance d'une case à chaque pas (300 − 25 × niveau ms) ; on ne fait que tourner, jamais de
 *    demi-tour ;
 *  - un point mangé : +1 case et le niveau en points ;
 *  - toutes les 5 bouchées, une bestiole (2 cases de large) reste 24 pas ; l'attraper rapporte
 *    niveau × (2 + ⌈pas restants / 6⌉) et ne fait pas grandir ;
 *  - perdu quand la tête entre dans le corps (la case que la queue quitte au même pas est libre) ;
 *    plus une case libre pour le point suivant : partie finie aussi (`full`, jamais vu en vrai).
 *
 * Gestes : tableau plat [pas, direction, pas, direction, …] (direction 0 haut, 1 droite, 2 bas,
 * 3 gauche), noté par `play` au pas où le virage s'applique. Le serveur le rejoue avec `replay`.
 *
 * L'état (`createGame`) est un objet simple que `step` et `play` modifient sur place.
 */

export const SNAKE_RULES = 1;
export const COLS = 22;
export const ROWS = 16;
export const CELLS = COLS * ROWS;
export const LEVEL_MIN = 1;
export const LEVEL_MAX = 9;
export const LEVEL_DEFAULT = 5;
// Une bestiole toutes les 5 bouchées, visible 24 pas, 2 cases de large
export const BONUS_EVERY = 5;
export const BONUS_STEPS = 24;
export const BONUS_WIDTH = 2;
export const KINDS = ['souris', 'araignee', 'poisson', 'scarabee'];

/** Directions : 0 haut, 1 droite, 2 bas, 3 gauche, en [dx, dy] (y vers le bas). */
export const UP = 0;
export const RIGHT = 1;
export const DOWN = 2;
export const LEFT = 3;
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// Départ : 5 cases sur l'avant-dernière ligne, tête à droite, vers la droite
export const START_CELLS = [[7, 14], [6, 14], [5, 14], [4, 14], [3, 14]];
export const START_DIR = RIGHT;

/** Bornes d'une partie rejouée par le serveur (3 h au niveau 9 ; 30 000 virages). */
export const MAX_TICKS = 150000;
export const MAX_MOVES = 30000;

export const isLevel = (n) => Number.isInteger(n) && n >= LEVEL_MIN && n <= LEVEL_MAX;

/** Durée d'un pas (ms) : 275 au niveau 1, 75 au niveau 9. */
export function tickMs(level) {
  return 300 - 25 * level;
}

/** Points d'une bouchée : le niveau. */
export function foodPoints(level) {
  return level;
}

/** Points d'une bestiole attrapée quand il lui restait `left` pas (24 → niveau × 6, 1 → niveau × 3). */
export function bonusPoints(level, left) {
  return level * (2 + Math.ceil(left / 6));
}

export const cellOf = (x, y) => y * COLS + x;
export const xOf = (cell) => cell % COLS;
export const yOf = (cell) => Math.floor(cell / COLS);

/** Cases d'une bestiole : la sienne et celle de droite (jamais à cheval sur le bord). */
export function bonusCells(bonus) {
  return bonus ? [bonus.cell, bonus.cell + 1] : [];
}

const onBonus = (bonus, cell) => !!bonus && (cell === bonus.cell || cell === bonus.cell + 1);

/** Virage permis : une autre direction que la sienne, jamais le demi-tour. */
export function canTurn(current, next) {
  return Number.isInteger(next) && next >= 0 && next <= 3 && next !== current && next !== (current + 2) % 4;
}

// Hasard à graine (mulberry32) : entiers sur 32 bits, identique dans tous les moteurs JavaScript
function nextUint(state) {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

const randomBelow = (state, n) => nextUint(state) % n;

// Point suivant : une case libre au hasard (ni le serpent, ni la bestiole), lues dans l'ordre des cases
function placeFood(state) {
  const free = [];
  for (let c = 0; c < CELLS; c += 1) {
    if (!state.occ[c] && !onBonus(state.bonus, c)) free.push(c);
  }
  return free.length ? free[randomBelow(state, free.length)] : null;
}

// Bestiole : deux cases libres côte à côte sur une même ligne (pas encore de point à ce moment-là)
function placeBonus(state) {
  const free = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x <= COLS - BONUS_WIDTH; x += 1) {
      const c = cellOf(x, y);
      if (!state.occ[c] && !state.occ[c + 1]) free.push(c);
    }
  }
  return free.length ? free[randomBelow(state, free.length)] : null;
}

/**
 * Nouvelle partie. `seed` : entier de 0 à 2³² − 1 (donné par le serveur) ; `level` : 1 à 9.
 * @returns {object} état : { rules, seed, level, rng, tick, dir, snake (cases, tête d'abord), occ,
 *   food, bonus: { cell, left, kind } | null, eaten, bonuses, critters, score, over, end }
 */
export function createGame({ seed = 0, level = LEVEL_DEFAULT } = {}) {
  const s = Number(seed) >>> 0;
  const state = {
    rules: SNAKE_RULES,
    seed: s,
    level: isLevel(level) ? level : LEVEL_DEFAULT,
    rng: s | 0,
    tick: 0,
    dir: START_DIR,
    snake: START_CELLS.map(([x, y]) => cellOf(x, y)),
    occ: new Array(CELLS).fill(0),
    food: null,
    bonus: null,
    eaten: 0,
    bonuses: 0,
    critters: 0,
    score: 0,
    over: false,
    end: null,
  };
  for (const c of state.snake) state.occ[c] = 1;
  state.food = placeFood(state);
  return state;
}

/**
 * Un pas dans la direction actuelle. Rend ce qui s'est passé :
 * { ate, caught (points de la bestiole, 0 sinon), spawned (bestiole apparue), vanished (bestiole
 *   partie), died } ; `end` de l'état : 'bite' (mordu) ou 'full' (plus de place).
 */
export function step(state) {
  const ev = { ate: false, caught: 0, spawned: false, vanished: false, died: false };
  if (state.over) return ev;
  state.tick += 1;
  const head = state.snake[0];
  const [dx, dy] = DIRS[state.dir];
  const next = cellOf((xOf(head) + dx + COLS) % COLS, (yOf(head) + dy + ROWS) % ROWS);
  const ate = next === state.food;
  const tail = state.snake[state.snake.length - 1];
  // Sans bouchée, la queue avance au même pas : sa case est libre pour la tête
  if (!ate) state.occ[tail] = 0;
  if (state.occ[next]) {
    if (!ate) state.occ[tail] = 1;
    state.over = true;
    state.end = 'bite';
    ev.died = true;
    return ev;
  }
  if (!ate) state.snake.pop();
  state.snake.unshift(next);
  state.occ[next] = 1;

  const bonus = state.bonus;
  if (bonus && onBonus(bonus, next)) {
    const points = bonusPoints(state.level, bonus.left);
    state.score += points;
    state.bonuses += 1;
    state.bonus = null;
    ev.caught = points;
  } else if (bonus) {
    if (bonus.left > 1) bonus.left -= 1;
    else {
      state.bonus = null;
      ev.vanished = true;
    }
  }

  if (ate) {
    ev.ate = true;
    state.score += foodPoints(state.level);
    state.eaten += 1;
    state.food = null;
    if (state.eaten % BONUS_EVERY === 0 && !state.bonus) {
      const cell = placeBonus(state);
      if (cell !== null) {
        state.bonus = { cell, left: BONUS_STEPS, kind: KINDS[state.critters % KINDS.length] };
        state.critters += 1;
        ev.spawned = true;
      }
    }
    state.food = placeFood(state);
    if (state.food === null) {
      state.over = true;
      state.end = 'full';
    }
  }
  return ev;
}

/**
 * Un pas joué par le téléphone : applique le virage `dir` s'il est permis (sinon tout droit), le
 * note dans `moves` (tableau plat [pas, direction, …]) puis avance.
 */
export function play(state, dir, moves) {
  if (!state.over && dir !== undefined && dir !== null && canTurn(state.dir, dir)) {
    if (moves) moves.push(state.tick, dir);
    state.dir = dir;
  }
  return step(state);
}

const fail = (error) => ({ ok: false, error });

/**
 * Rejoue une partie (serveur) : `ticks` pas depuis la graine, avec les virages notés.
 * `end` (facultatif) : fin annoncée par le téléphone, 'bite', 'full' ou 'quit' (partie quittée).
 * @returns {{ ok: true, score, eaten, bonuses, ticks, end, length } | { ok: false, error }}
 *   erreurs : 'bad_level', 'bad_seed', 'bad_ticks', 'bad_moves' (forme, ordre, virage après la
 *   fin), 'bad_move' (demi-tour ou même direction), 'dead_early' (perdu avant le dernier pas),
 *   'bad_end' (fin annoncée différente)
 */
export function replay({ seed, level, moves, ticks, end } = {}) {
  if (!isLevel(level)) return fail('bad_level');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return fail('bad_seed');
  if (!Number.isInteger(ticks) || ticks < 0 || ticks > MAX_TICKS) return fail('bad_ticks');
  if (!Array.isArray(moves) || moves.length % 2 !== 0 || moves.length > 2 * MAX_MOVES) return fail('bad_moves');
  const state = createGame({ seed, level });
  let i = 0;
  for (let t = 0; t < ticks; t += 1) {
    if (state.over) return fail('dead_early');
    if (i < moves.length && moves[i] === t) {
      const dir = moves[i + 1];
      if (!canTurn(state.dir, dir)) return fail('bad_move');
      state.dir = dir;
      i += 2;
    }
    step(state);
  }
  // Un virage jamais lu : pas hors de l'ordre, en double, non entier ou après la fin
  if (i < moves.length) return fail('bad_moves');
  const finalEnd = state.over ? state.end : 'quit';
  if (end !== undefined && end !== finalEnd) return fail('bad_end');
  return {
    ok: true,
    score: state.score,
    eaten: state.eaten,
    bonuses: state.bonuses,
    ticks: state.tick,
    end: finalEnd,
    length: state.snake.length,
  };
}
