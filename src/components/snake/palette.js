/**
 * Snake du Gang : couleurs de la planche du 2 nov. 2026 (https://claude.ai/artifact/4Kf7Xxy7S45CFzckUmbT2B).
 * Pages sombres quel que soit le thème de l'app, écran vert à pixels, vert de l'app pour les boutons.
 */
// Police à pixels de l'écran vert (Silkscreen, licence OFL) embarquée dans le bundle : l'app hors
// connexion garde son écran rétro (Google Fonts ne répond pas sans réseau). Chargée avec le code du
// Snake seulement (pages chargées à la demande, carte de la page Jeux).
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/silkscreen/latin-700.css';
export const SNAKE_COLORS = Object.freeze({
  fond: '#0D0F12', // fond des pages
  carte: '#15181D', // cartes, lignes du classement
  carteBord: 'rgba(255, 255, 255, 0.06)',
  gris: '#A3ABB5', // texte secondaire (contraste ≥ 4,5:1 sur le fond)
  grisClair: '#C9CFD6',
  piste: '#3A414B', // interrupteur éteint, barre de niveau éteinte
  pastille: '#262B33', // avatars, places
  vert: '#1F7A4C', // boutons
  vertBord: '#2E9E66',
  vertTexte: '#3DBE7E', // liens, flèches, accents sur le fond sombre
  or: '#EBC15E', // record, 1re place
  blanc: '#FFFFFF',
  // Téléphone
  corps: '#1B1F25',
  corpsBord: '#2C323B',
  cadreEcran: '#0E1114',
  touche: '#262B33',
  toucheBord: '#363D47',
  toucheSurvol: '#2B313A',
  logoTexte: '#8D96A1',
  // Écran vert (LCD)
  lcd: '#B9C99F',
  encre: '#1E2618',
  encreDouce: '#3F4D36',
  quadrillage: 'rgba(30, 38, 24, 0.07)',
});

/** Fond quadrillé de l'écran vert, maille `size` px (14 = une case du jeu à 390 px). */
export function lcdBackground(size = 10) {
  const g = SNAKE_COLORS.quadrillage;
  return {
    backgroundColor: SNAKE_COLORS.lcd,
    backgroundImage: `linear-gradient(${g} 1px, transparent 1px), linear-gradient(90deg, ${g} 1px, transparent 1px)`,
    backgroundSize: `${size}px ${size}px`,
  };
}
