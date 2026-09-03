/**
 * Format des photos de barbers.
 *
 * Référence : portrait vertical 1748 × 2480 px (ratio A4 / A5, ≈ 1:1,42),
 * cadrage buste centré sur fond sombre. Toutes les photos de barbers sont
 * recadrées à ce ratio à l'upload (Équipe, Mes paramètres) et affichées dans
 * un cadre de même proportion (accueil, réservation, profil public, admin).
 */
export const BARBER_PHOTO_WIDTH = 1748;
export const BARBER_PHOTO_HEIGHT = 2480;

/** Ratio largeur / hauteur (≈ 0,705), pour react-easy-crop. */
export const BARBER_PHOTO_RATIO = BARBER_PHOTO_WIDTH / BARBER_PHOTO_HEIGHT;

/** Valeur CSS `aspect-ratio` correspondante. */
export const BARBER_PHOTO_ASPECT = `${BARBER_PHOTO_WIDTH} / ${BARBER_PHOTO_HEIGHT}`;

/** Fond sombre derrière la photo (même ton que la référence). */
export const BARBER_PHOTO_BG = '#0a0a0a';
