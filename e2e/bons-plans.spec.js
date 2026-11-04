// Bons plans du Gang : pastille de remise sur la carte principale (« Coup de cœur ») et les vignettes
// de l'accueil, tirée des offres du partenaire, sinon de son accroche (5 nov. 2026).
import { test, expect } from './support/test.js';
import { CLIENT } from './support/donnees.js';
import { attendreSansDebordement } from './support/outils.js';

const partenaire = (name, champs = {}) => ({
  id: name.toLowerCase(), name, category: 'services', is_active: true, is_featured: true, offers: [], sort_order: 1,
  created_at: '2026-09-25T10:00:00.000Z', ...champs,
});
const offre = (title, percent) => ({ id: `o-${title}`, title, details: '', percent });

const WASHUP = partenaire('WashUp', { tagline: '-15% sur les prestations de nettoyage' });
const IMPRIMEUR = partenaire('Imprimeur', {
  tagline: 'Vos supports : −10 % le premier mois', offers: [offre('Cartes', 5), offre('Catalogue', 20), offre('Café offert', null)],
});
const GARAGE = partenaire('Garage', { tagline: "50 % de crédit d'impôt, entre 10-15 % de gagné", offers: [offre('Lavage offert', null)] });

const cartePrincipale = (page, nom) => page.getByRole('button', { name: new RegExp(`Coup de cœur.*${nom}`) });
const pastille = (carte) => carte.getByText(/^-\d+%$/);

test.describe('Bons plans du Gang : pastille de la carte principale', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(CLIENT);
  });

  test('la remise vient des offres, sinon de l\'accroche ; sans remise chiffrée, pas de pastille', async ({ page, api }) => {
    api.tables.Partner.push(WASHUP, IMPRIMEUR, GARAGE);
    await page.goto('/partners');

    await expect(pastille(cartePrincipale(page, 'WashUp'))).toHaveText('-15%');
    await expect(pastille(cartePrincipale(page, 'Imprimeur'))).toHaveText('-20%');
    await expect(cartePrincipale(page, 'Garage')).toBeVisible();
    await expect(pastille(cartePrincipale(page, 'Garage'))).toHaveCount(0);
  });

  for (const largeur of [320, 390]) {
    test(`à ${largeur} px, elle reste dans le coin haut droit, sans toucher au reste de la carte`, async ({ page, api }) => {
      await page.setViewportSize({ width: largeur, height: 760 });
      api.tables.Partner.push(partenaire('Un partenaire au nom vraiment très long pour la carte', { tagline: '-100 % sur la première visite au salon' }));
      await page.goto('/partners');

      const carte = cartePrincipale(page, 'Un partenaire');
      const boite = await carte.boundingBox();
      const badge = await pastille(carte).boundingBox();
      // top-3 right-3 (12 px) comptés depuis l'intérieur de la bordure de 1 px
      expect(boite.x + boite.width - (badge.x + badge.width)).toBeCloseTo(13, 0);
      expect(badge.y - boite.y).toBeCloseTo(13, 0);
      const coupDeCoeur = await carte.getByText('Coup de cœur').boundingBox();
      expect(badge.y + badge.height).toBeLessThanOrEqual(coupDeCoeur.y);
      await attendreSansDebordement(page, `/partners à ${largeur} px`);
    });
  }

  test('la vignette de l\'accueil porte la même remise', async ({ page, api }) => {
    api.tables.Partner.push(WASHUP);
    await page.goto('/');
    await expect(page.locator('a[href="/partners?p=washup"]').getByText('-15%', { exact: true })).toBeVisible();
  });
});
