# Vérifications de bout en bout (Playwright)

Une vingtaine de parcours joués dans Chromium sur le **build local** (`vite preview`, port 4173),
avec une **API simulée en mémoire**. Ils tournent aussi à chaque push et pull request vers `main`
(GitHub Actions, `.github/workflows/verifications.yml`).

## Règle absolue : jamais la production

Aucune requête ne doit atteindre `dhomebarber-api-3aabb8313cb6.herokuapp.com` ni aucun autre
service réel. Tout ce qui ne vient pas du build local est intercepté (`support/mockApi.js`) :

- l'API est servie par le faux serveur (entités, connexion, routes dédiées) ;
- une route de l'API **non prévue** reçoit `501` et fait **échouer le test** (message
  « Requêtes vers l'API sans route dans le faux serveur ») : on voit tout de suite ce qui manque ;
- les autres domaines (polices Google, CDN…) reçoivent une réponse vide ;
- tous les WebSockets sont simulés (`/ws/live` reçoit un compteur fictif) ; le service worker de
  l'app est bloqué ;
- filet de sécurité (`playwright.config.js`) : le navigateur passe par un proxy injoignable pour
  tout domaine autre que `localhost`, une requête qui échapperait à l'interception échoue.

Ne jamais contourner l'interception (`route.continue()` vers l'API, jeton réel, `fetch` direct),
ni ouvrir un contexte de navigation sans la fixture `api` (`browser.newContext()`).

Chaque test échoue aussi si une erreur JavaScript n'est pas rattrapée dans la page, ou si l'app
remonte une erreur par sa mesure d'audience (écran planté attrapé par l'ErrorBoundary).

## Lancer en local

```bash
npm run test:e2e          # build puis vérifications
npm run test:e2e:fast     # sans refaire le build (dist/ déjà à jour)
npx playwright test e2e/reservation.spec.js        # un seul fichier
npx playwright test -g "Peu importe" --headed      # un seul test, navigateur visible
npx playwright show-trace test-results/…/trace.zip # rejouer un échec
```

Premier lancement sur une machine : `npx playwright install chromium`.

L'horloge du navigateur est figée sur **le prochain mardi à 10 h, heure de Paris**
(`support/temps.js`) et toutes les dates des données simulées en partent (`jour(n)`) : les tests
donnent le même résultat quel que soit le jour ou l'heure du lancement. Animations réduites
(`reducedMotion: 'reduce'`) : les pulsations infinies empêcheraient les clics.

## Organisation

| Fichier | Contenu |
|---|---|
| `support/test.js` | `test` / `expect` avec les fixtures `api`, `page`, `journal`, `connecter` |
| `support/mockApi.js` | Faux serveur (`FauxServeur`) : routes, filtres `q`, tri, sessions |
| `support/donnees.js` | Salon, barbers (Dom, Kevin, Romain, 7 j / 7), prestations, comptes, RDV, avis, produits |
| `support/temps.js` | Heure de Paris, jour de référence, `jour(n)` |
| `support/outils.js` | Libellé d'un jour, connexion par l'écran, toasts, débordement horizontal |
| `*.spec.js` | Les vérifications, regroupées par écran |

Comptes simulés : `client.test@dhomebarber.fr` et `admin.test@dhomebarber.fr`, mot de passe
`MotDePasse123`.

## Ajouter un test

```js
import { test, expect } from './support/test.js';
import { CLIENT } from './support/donnees.js';

test('ce que l\'utilisateur doit voir', async ({ page, api, connecter }) => {
  await connecter(CLIENT);                       // session ouverte sans passer par l'écran
  await page.goto('/appointments');
  await expect(page.getByRole('heading', { name: 'Rendez-vous' })).toBeVisible();
  expect(api.requetesVers('GET', '/entities/Appointment')).not.toHaveLength(0);
});
```

- Viser ce que l'utilisateur voit : `getByRole`, `getByText`, `getByPlaceholder` ; pas de classes CSS.
- Jamais de `waitForTimeout` : attendre un état (`expect(...).toBeVisible()`, `expect.poll`).
- Écrire les noms de tests et les messages en français.

## Changer une réponse du faux serveur pour un test

```js
import { RESEAU_COUPE } from './support/test.js';

api.surcharger('POST', '/entities/Appointment', () => ({ status: 409, json: { error: 'Créneau pris' } }));
api.surcharger('GET', '/entities/User/me', () => RESEAU_COUPE);   // échec réseau
api.revoquerSessions();                                           // le jeton devient refusé (401)
```

La fabrique reçoit la requête décodée (`methode`, `chemin`, `query`, `q`, `corps`, `compte`) et
rend `{ status, json }`, `RESEAU_COUPE`, ou `undefined` pour garder la réponse par défaut.

## Ajouter une route au faux serveur

Quand un test échoue avec « Requêtes vers l'API sans route » :

1. Lire la vraie route dans le dépôt du serveur (`dhomebarber-api/routes/…`) pour reprendre
   **la même forme de réponse**.
2. L'ajouter dans `routeConnue()` de `support/mockApi.js`, avec la même règle d'accès (401 sans
   session, 403 hors équipe…). Une entité générique (`/entities/<Nom>`) n'a besoin que de son nom
   dans `ENTITES` (et d'une table dans `support/donnees.js` si elle doit contenir des lignes).
3. Relancer : la liste des routes non prévues doit être vide.
