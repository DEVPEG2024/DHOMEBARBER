import { COUPE_COLORS } from '../palette';

/*
 * Thème stade de l'accueil de la Coupe, du classement et de leurs fenêtres (planche validée le
 * 29 oct. 2026, docs/fonctions/coupe-du-gang-stade.md) : rouge, noir et blanc, une touche d'or.
 *
 * Les couleurs viennent toutes de `COUPE_COLORS` (palette.js). Tailwind ne lit pas un objet JS :
 * la palette est posée en variables CSS (`COUPE_VARS`) sur la racine de chaque écran (CoupeShell,
 * fiche d'un joueur, chargement du jeu, CoupeLoadError), et les classes les lisent
 * (`text-[color:var(--coupe-or)]`). Tout composant de hub/ s'affiche sous une de ces racines.
 */

/** `#rrggbb` → `rgba(r, g, b, a)`. */
export function alpha(hex, a) {
  const n = parseInt(String(hex).slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Mélange de deux couleurs `#rrggbb` (`t` = part de la seconde) : `rgb(…)`. */
export function mix(a, b, t) {
  const pa = parseInt(String(a).slice(1, 7), 16);
  const pb = parseInt(String(b).slice(1, 7), 16);
  const ch = (shift) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/**
 * Style de la racine d'un écran de la Coupe : toujours sombre (quel que soit le thème de l'app)
 * et la palette en variables CSS.
 */
export const COUPE_VARS = {
  colorScheme: 'dark',
  '--coupe-rouge': COUPE_COLORS.rouge,
  '--coupe-rouge-vif': COUPE_COLORS.rougeVif,
  '--coupe-noir': COUPE_COLORS.noir,
  '--coupe-noir2': COUPE_COLORS.noir2,
  '--coupe-noir3': COUPE_COLORS.noir3,
  '--coupe-gris-clair': COUPE_COLORS.grisClair,
  '--coupe-gris': COUPE_COLORS.gris,
  '--coupe-gris-sombre': COUPE_COLORS.grisSombre,
  '--coupe-or': COUPE_COLORS.or,
  '--coupe-or-bord': COUPE_COLORS.orBord,
  // Voiles rouges : ta ligne du classement (.14), bandeaux et choix sélectionnés (.08), traits (.45).
  // Rouge vif sur le voile .14 posé sur une carte : 4,8:1.
  '--coupe-rouge-voile': alpha(COUPE_COLORS.rouge, 0.14),
  '--coupe-rouge-fond': alpha(COUPE_COLORS.rouge, 0.08),
  '--coupe-rouge-trait': alpha(COUPE_COLORS.rouge, 0.45),
};
