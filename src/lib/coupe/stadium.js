/*
 * Stade de La Coupe du Gang (thème validé le 29 oct. 2026, docs/fonctions/coupe-du-gang-stade.md) :
 * image vue du ciel, tribunes rouges et noires, logo D'Home Barber, sans aucune marque de club.
 * Son terrain est tracé aux mesures exactes du moteur (engine.js) : c'est LE terrain du match. Le
 * jeu n'y dessine plus le sien (un seul terrain, jamais deux superposés quand la caméra bouge) ; il
 * y pose les joueurs, le ballon, le score et les effets.
 *
 * Image refaite par docs/prototypes/stade-coupe/ (gazon d'un seul tenant, lignes du jeu). Toute
 * nouvelle version garde la taille et la place du terrain ci-dessous, sinon le jeu tombe à côté.
 */
import { W, H } from './engine.js';
import { MS, MG, viewOf } from './renderer.js';
import { STADIUM_W, STADIUM_H } from './stadiumImage.js';

// Adresse, taille et préchargement de l'image : stadiumImage.js (sans le moteur, pour l'accueil et
// la page Jeux), repris ici pour l'écran de jeu
export { STADIUM_URL, STADIUM_W, STADIUM_H, preloadStadium } from './stadiumImage.js';

/** Terrain du jeu dans l'image : coin haut gauche (px) et px par unité du moteur (640 unités = 1234 px). */
export const PITCH_X0 = 255.4375;
export const PITCH_Y0 = 543;
export const PITCH_K = 1234 / 640;

/**
 * Terrain du jeu à l'écran pour un canvas de `width` × `height` px (mêmes calculs que le dessin,
 * `viewOf` de renderer.js) : { left, top, width, height } dans le repère du canvas.
 */
export function pitchRectIn(width, height) {
  const v = viewOf(width, height);
  return { left: v.ox + MS * v.s, top: v.oy + MG * v.s, width: W * v.s, height: H * v.s };
}

/** Place de l'image (échelle `s`, coin `x`, `y`) pour que son terrain recouvre exactement `rect`. */
export function pitchPlacement(rect) {
  const s = rect.width / (W * PITCH_K);
  return { s, x: rect.left - PITCH_X0 * s, y: rect.top - PITCH_Y0 * s };
}

/** Place de l'image pour montrer le stade entier dans `width` × `height` px, centré. */
export function fullPlacement(width, height) {
  const s = Math.max(0.01, Math.min(width / STADIUM_W, height / STADIUM_H));
  return { s, x: (width - STADIUM_W * s) / 2, y: (height - STADIUM_H * s) / 2 };
}

/**
 * Transformation CSS (`transform-origin: 0 0`) qui amène l'image de la place `from` à la place
 * `to`, les deux exprimées dans le même repère : `translate(dx, dy) scale(k)`. Appliquée au seul
 * calque de l'image (le canvas n'est jamais transformé : il est caché pendant le zoom et réapparaît
 * quand le terrain de l'image est revenu exactement sous lui).
 */
export function cameraTransform(from, to) {
  const k = to.s / from.s;
  return { k, dx: to.x - k * from.x, dy: to.y - k * from.y };
}

/** `translate(…px, …px) scale(…)` d'une transformation de caméra. */
export const cameraCss = (t) => `translate(${t.dx.toFixed(2)}px, ${t.dy.toFixed(2)}px) scale(${t.k.toFixed(5)})`;
