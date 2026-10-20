/**
 * Petits outils partagés par les vérifications (aucune dépendance au faux serveur).
 */
import { expect } from '@playwright/test';

const JOUR_LONG = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** « jeudi 22 octobre » : libellé d'un jour tel que l'app l'écrit (date-fns, `EEEE d MMMM`). */
export function libelleJour(cle) {
  const [a, m, j] = cle.split('-').map(Number);
  const p = Object.fromEntries(JOUR_LONG.formatToParts(new Date(Date.UTC(a, m - 1, j))).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** Échappe un texte pour l'insérer dans une expression régulière. */
export const echapper = (texte) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Remplit et envoie le formulaire de connexion (`/login`). */
export async function seConnecterParEcran(page, email, motDePasse) {
  await page.getByPlaceholder('Email *').fill(email);
  await page.getByPlaceholder('Mot de passe *').fill(motDePasse);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

/** Toast affiché (sonner) contenant ce texte. */
export const toast = (page, texte) => page.locator('[data-sonner-toast]').filter({ hasText: texte });

/**
 * Largeur qui dépasse de l'écran (0 = aucune) : la page ne doit jamais défiler de gauche à droite.
 * Les zones qui défilent elles-mêmes (grille de l'agenda, bande de jours) ne comptent pas : seul le
 * document est mesuré.
 */
export async function debordementHorizontal(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(doc.scrollWidth, document.body.scrollWidth) - doc.clientWidth;
  });
}

/** Vérifie qu'aucun débordement horizontal n'existe, avec le nom de la page dans le message. */
export async function attendreSansDebordement(page, nom) {
  await expect.poll(() => debordementHorizontal(page), { message: `Défilement horizontal sur ${nom}` }).toBeLessThanOrEqual(0);
}
