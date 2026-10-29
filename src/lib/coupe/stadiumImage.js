/*
 * Image du stade de La Coupe du Gang (thème du 29 oct. 2026) : adresse, taille et préchargement,
 * sans le moteur du jeu (l'accueil, le fil et la page Jeux l'importent sans charger le jeu). Le
 * calcul de la caméra et la place du terrain dans l'image sont dans stadium.js.
 */
import stadiumUrl from '@/assets/coupe/stade.webp';

export const STADIUM_URL = stadiumUrl;
/** Taille de l'image (px). */
export const STADIUM_W = 1206;
export const STADIUM_H = 2129;

let loading = null;
/**
 * Charge et décode l'image une fois (accueil de la Coupe, page Jeux) : l'avant-match ne doit pas
 * attendre le réseau. Rend `true` une fois prête, `false` en cas d'échec (le jeu redessine alors
 * son propre terrain).
 */
export function preloadStadium() {
  if (loading) return loading;
  loading = new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve(false); return; }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const done = () => resolve(true);
      if (typeof img.decode === 'function') img.decode().then(done, done);
      else done();
    };
    img.onerror = () => {
      loading = null;
      resolve(false);
    };
    img.src = STADIUM_URL;
  });
  return loading;
}
