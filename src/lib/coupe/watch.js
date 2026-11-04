/*
 * La Coupe du Gang : spectateurs et écran du salon (contrat docs/fonctions/coupe-spectateurs-contrat.md).
 * Valeurs partagées par la vue spectateur, l'écran du salon et l'écran de jeu des joueurs.
 */
import { initialsOf } from '@/components/coupe/hub/coupeFormat';

/** Réactions toutes faites (`cheer {r}` : l'index), aucun message écrit (contrat, section 0.5). */
export const CHEERS = Object.freeze(['Allez !', 'Quel but', 'Bravo', 'Oh non']);
/** Une réaction par spectateur toutes les 3 s (le serveur ignore les autres). */
export const CHEER_GAP_MS = 3000;
/** Le spectateur voit le match 200 ms en différé (dessin lissé entre deux états du serveur). */
export const WATCH_DELAY_MS = 200;
/** Clé de l'écran du salon rangée sur l'appareil (`/ecran#cle=…`). */
export const SCREEN_KEY_STORAGE = 'dhb-ecran-cle';

// Lien envoyé ou montré à quelqu'un : toujours l'adresse publique, jamais window.location.origin
const SITE = 'https://dhomebarber.fr';

/** Texte du pion d'un joueur vu par un spectateur : initiales, « DHB » pour le salon, jamais une photo. */
export const watchPawnText = (name, role) => (role === 'salon' || role === 'admin' ? 'DHB' : initialsOf(name));

/** `/coupe/regarder?m=<match de tournoi>&tournoi=<tournoi>` ou `?w=<match ordinaire>`. */
export function watchPath({ m = null, w = null, tournoi = null } = {}) {
  const q = new URLSearchParams();
  if (m) q.set('m', String(m));
  else if (w) q.set('w', String(w));
  if (m && tournoi) q.set('tournoi', String(tournoi));
  return `/coupe/regarder?${q.toString()}`;
}

/** Même lien, adresse publique (QR de l'écran du salon, partage). */
export const watchUrl = (target) => `${SITE}${watchPath(target)}`;
