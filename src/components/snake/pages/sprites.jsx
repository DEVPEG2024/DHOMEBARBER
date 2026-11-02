import React from 'react';

/**
 * Snake du Gang : petits dessins à pixels des pages (carte de la page Jeux, Comment jouer,
 * pictogramme du jeu). Repris case pour case de la planche du 2 nov. 2026 ; dessinés par nous
 * (aucune marque). Chaque dessin est une liste de rectangles [x, y, largeur, hauteur] rendue en un
 * seul chemin SVG net (`crispEdges`), à la couleur du texte (`currentColor`) sauf `fill` donné.
 */

// Bestioles : 14 × 7 cases (deux cases du jeu), dans l'ordre `KINDS` du moteur
const BUGS = {
  souris: [[3, 0, 2, 1], [2, 1, 7, 1], [1, 2, 9, 1], [0, 3, 2, 1], [3, 3, 8, 1], [13, 3, 1, 1], [1, 4, 10, 1], [12, 4, 1, 1], [3, 5, 1, 1], [8, 5, 1, 1], [10, 5, 2, 1]],
  araignee: [
    [2, 0, 1, 1], [5, 0, 1, 1], [8, 0, 1, 1], [11, 0, 1, 1], [3, 1, 1, 1], [5, 1, 1, 1], [8, 1, 1, 1], [10, 1, 1, 1],
    [0, 2, 1, 1], [4, 2, 6, 1], [13, 2, 1, 1], [1, 3, 12, 1], [0, 4, 1, 1], [4, 4, 6, 1], [13, 4, 1, 1],
    [3, 5, 1, 1], [5, 5, 1, 1], [8, 5, 1, 1], [10, 5, 1, 1], [2, 6, 1, 1], [5, 6, 1, 1], [8, 6, 1, 1], [11, 6, 1, 1],
  ],
  poisson: [[4, 0, 4, 1], [2, 1, 8, 1], [12, 1, 1, 1], [1, 2, 2, 1], [4, 2, 9, 1], [0, 3, 12, 1], [1, 4, 12, 1], [2, 5, 8, 1], [12, 5, 1, 1], [4, 6, 4, 1]],
  scarabee: [
    [2, 0, 1, 1], [5, 0, 1, 1], [8, 0, 1, 1], [3, 1, 8, 1], [0, 2, 6, 1], [7, 2, 5, 1], [0, 3, 5, 1], [6, 3, 7, 1],
    [0, 4, 6, 1], [7, 4, 5, 1], [3, 5, 8, 1], [2, 6, 1, 1], [5, 6, 1, 1], [8, 6, 1, 1],
  ],
};

/** Nom affiché de chaque bestiole (clés `KINDS` du moteur). */
export const BUG_NAMES = { souris: 'Souris', araignee: 'Araignée', poisson: 'Poisson', scarabee: 'Scarabée' };

// Bouchée : losange de 5 × 5
const DIAMOND = [[2, 0, 1, 1], [1, 1, 3, 1], [0, 2, 5, 1], [1, 3, 3, 1], [2, 4, 1, 1]];

// Tête du serpent vue de côté (flèche de 4 × 6, « avance tout seul »)
const HEAD = [[0, 0, 1, 6], [1, 1, 1, 4], [2, 2, 1, 2]];

// Pictogramme du jeu, 7 × 7 (2 px la case à 14 px) : le serpent de la carte de la page Jeux en
// petit (queue en bas, une marche, la tête vers sa bouchée)
const ICON = [[0, 5, 3, 1], [2, 2, 1, 3], [2, 1, 3, 1], [6, 1, 1, 1]];

const pathOf = (rects) => rects.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h-${w}z`).join('');

/** Dessin à pixels : `rects` dans une grille `cols` × `rows`, affiché à `width` × `height` px. */
export function PixelSprite({ rects, cols, rows, width, height, className, style, fill = 'currentColor', label }) {
  return (
    <svg
      viewBox={`0 0 ${cols} ${rows}`}
      width={width}
      height={height}
      className={className}
      style={style}
      shapeRendering="crispEdges"
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
    >
      <path d={pathOf(rects)} fill={fill} />
    </svg>
  );
}

/** Bestiole (`kind` de `KINDS`) ; 2 px par case par défaut. */
export function BugSprite({ kind, width = 28, height = 14, ...rest }) {
  return <PixelSprite rects={BUGS[kind] || BUGS.souris} cols={14} rows={7} width={width} height={height} {...rest} />;
}

/** Bouchée (losange). */
export function DiamondSprite({ size = 10, ...rest }) {
  return <PixelSprite rects={DIAMOND} cols={5} rows={5} width={size} height={size} {...rest} />;
}

/** Tête du serpent (flèche vers la droite). */
export function HeadSprite({ width = 8, height = 12, ...rest }) {
  return <PixelSprite rects={HEAD} cols={4} rows={6} width={width} height={height} {...rest} />;
}

/** Pictogramme du Snake du Gang (accueil, fil, page Jeux) : taille par `className`, comme les icônes lucide. */
export function SnakeIcon({ className = 'w-4 h-4', style }) {
  return <PixelSprite rects={ICON} cols={7} rows={7} className={className} style={style} />;
}
