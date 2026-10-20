/**
 * `test` et `expect` des vérifications de bout en bout, avec leurs fixtures :
 *  - `api`     : faux serveur en mémoire (e2e/support/mockApi.js), installé avant toute navigation.
 *                À la fin du test, échec si l'app a appelé une route de l'API non simulée, ou si
 *                elle a remonté une erreur par sa mesure d'audience (écran planté, `reportError`).
 *  - `page`    : horloge figée sur le mardi de référence à 10 h (Paris), musique coupée ; échec si
 *                une erreur JavaScript non rattrapée est survenue dans la page.
 *  - `journal` : messages d'erreur de la console du navigateur (vérifiés par les tests transverses).
 *  - `connecter(compte)` : session ouverte sans passer par l'écran de connexion (jeton posé dans
 *                le stockage local avant le chargement de l'app, comme après une vraie connexion).
 */
import { test as base, expect } from '@playwright/test';
import { FauxServeur } from './mockApi.js';
import { MAINTENANT } from './temps.js';

export { expect };
export { RESEAU_COUPE } from './mockApi.js';

export const test = base.extend({
  api: async ({ context, baseURL }, use) => {
    const api = new FauxServeur();
    await api.installer(context, baseURL);
    await use(api);
    expect(
      api.nonPrevues,
      'Requêtes vers l\'API sans route dans le faux serveur : ajoutez-les à e2e/support/mockApi.js',
    ).toEqual([]);
    expect(api.erreursApp, 'Erreurs remontées par l\'app (écran planté, erreur non gérée)').toEqual([]);
    expect(api.erreursServeur, 'Exceptions dans le faux serveur ou une surcharge').toEqual([]);
  },

  journal: async ({}, use) => {
    await use({ console: [], page: [] });
  },

  page: async ({ page, api: _api, journal }, use) => {
    // Le faux serveur est installé (dépendance `api`) avant toute navigation de la page
    await page.clock.install({ time: MAINTENANT });
    await page.addInitScript(() => {
      try { localStorage.setItem('dhb-music-off', '1'); } catch { /* stockage indisponible */ }
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') journal.console.push(msg.text());
    });
    page.on('pageerror', (err) => journal.page.push(String(err?.stack || err)));
    await use(page);
    expect(journal.page, 'Erreurs JavaScript non rattrapées dans la page').toEqual([]);
  },

  connecter: async ({ page, api }, use) => {
    await use(async (compte) => {
      const jeton = api.ouvrirSession(compte.email);
      // Posé une seule fois par onglet : une déconnexion (ou une session expirée) n'est pas annulée
      // par le rechargement qui suit
      await page.addInitScript((j) => {
        if (sessionStorage.getItem('e2e-session-posee')) return;
        sessionStorage.setItem('e2e-session-posee', '1');
        localStorage.setItem('base44_access_token', j);
        localStorage.setItem('token', j);
      }, jeton);
      return jeton;
    });
  },
});
