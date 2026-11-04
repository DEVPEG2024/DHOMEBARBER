// Tournois de La Coupe du Gang (planche validée le 3 nov. 2026, écrans 1 à 5 et 8 à 10 ; contrat
// docs/fonctions/coupe-tournois-contrat.md, section 6) : carte de l'accueil, page d'un tournoi dans
// chacun de ses états (inscription, présence, tirage, tableau en direct, qualifié, éliminé,
// champion, podium, annulé), « Jouer mon match », palmarès (fiche et classement), drapeau éteint,
// panne réseau, largeurs d'écran et console. Faux serveur : `api.tournois` (e2e/support/fauxTournois.js).
// L'écran de jeu lui-même (salle du tournoi, tirs au but) est vérifié par e2e/coupe-tournoi-match.spec.js.
import { test, expect, RESEAU_COUPE } from './support/test.js';
import { CLIENT } from './support/donnees.js';
import { attendreSansDebordement, toast } from './support/outils.js';

const CLE_MOI = `compte-${CLIENT.id}`;
const carte = (page) => page.getByRole('region', { name: 'Coupe de Novembre' });
const partie = (page) => page.locator('[data-coupe-partie]');
const titre = (page, nom) => page.getByRole('heading', { level: 1, name: nom });
const heureParis = (date) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);

/**
 * Le temps du serveur simulé avance : la page le voit à sa relecture suivante (3 s au plus pendant
 * la présence et le tournoi), le navigateur garde son horloge (l'app suit `server_now`).
 */
const avancer = (api, ms) => api.tournois.avancer(ms);

/** Côté du client de test dans un match interne du faux serveur. */
const monCote = (m) => m.p.indexOf(CLE_MOI);

/** Éléments de la page qui dépassent l'écran à droite (coupés par `overflow-x-clip`). */
function elementsQuiDepassent(page) {
  return page.evaluate(() => {
    const largeur = document.documentElement.clientWidth;
    return [...document.querySelectorAll('main *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > largeur + 0.5 && !el.closest('[aria-hidden="true"]');
      })
      .map((el) => `${el.tagName.toLowerCase()} « ${(el.textContent || '').trim().slice(0, 30)} » (${Math.round(el.getBoundingClientRect().right)} px)`);
  });
}

test.describe('Tournois : carte de l\'accueil de la Coupe', () => {
  test('prochain tournoi sous les Points : date, format, places, vers sa page', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'inscriptions' });
    await connecter(CLIENT);
    await page.goto('/coupe');

    const bloc = carte(page);
    await expect(bloc).toBeVisible();
    await expect(bloc).toContainText('Prochain tournoi');
    await expect(bloc).toContainText('dans 3 jours');
    await expect(bloc).toContainText(/19:00/);
    await expect(bloc).toContainText('8 joueurs · élimination directe · ~30 min');
    await expect(bloc).toContainText('7 inscrits · plus que 1 place');
    // Sous les Points de Coupe, avant « Comment tu joues ? »
    const y = async (loc) => (await loc.boundingBox()).y;
    expect(await y(bloc)).toBeGreaterThan(await y(page.getByRole('region', { name: /Points de Coupe/ })));
    expect(await y(bloc)).toBeLessThan(await y(page.getByRole('heading', { name: 'Comment tu joues ?' })));

    const lien = bloc.getByRole('link', { name: 'Voir et s’inscrire' });
    await expect(lien).toHaveAttribute('href', `/coupe/tournoi/${t.id}`);
    await lien.click();
    await expect(titre(page, 'Coupe de Novembre')).toBeVisible();
    await page.goBack();
    await expect(bloc).toBeVisible();
  });

  test('tournoi en cours avant le prochain ; inscrit : « Voir le tournoi » ; rien sans tournoi à venir', async ({ page, api, connecter }) => {
    api.tournois.creer({ etat: 'inscriptions', nom: 'Coupe de Décembre', moi: CLIENT, inscrits: 3 });
    const enCours = api.tournois.creer({ etat: 'tableau', nom: 'Coupe de Novembre' });
    await connecter(CLIENT);
    await page.goto('/coupe');
    const bloc = carte(page);
    await expect(bloc).toContainText('Tournoi en cours');
    await expect(bloc).toContainText('En direct');
    await expect(bloc.getByRole('link', { name: 'Voir le tableau' })).toHaveAttribute('href', `/coupe/tournoi/${enCours.id}`);
    await expect(page.getByRole('region', { name: 'Coupe de Décembre' })).toHaveCount(0);

    // Le tournoi en cours se termine : le prochain prend sa place, inscrit
    api.tournois.jouerTour(enCours.id, 1);
    api.tournois.jouerTour(enCours.id, 2);
    api.tournois.jouerTour(enCours.id, 3);
    await page.reload();
    const prochain = page.getByRole('region', { name: 'Coupe de Décembre' });
    await expect(prochain).toContainText('Prochain tournoi');
    await expect(prochain).toContainText('Tu es inscrit');
    await expect(prochain.getByRole('link', { name: 'Voir le tournoi' })).toBeVisible();
    await expect(carte(page)).toHaveCount(0);

    // Plus rien à venir (annulé) : aucune carte
    api.tournois.annuler(api.tournois.liste[0].id);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Comment tu joues ?' })).toBeVisible();
    await expect(page.getByText('Prochain tournoi')).toHaveCount(0);
    await expect(page.getByText('Tournoi en cours')).toHaveCount(0);
  });

  test('complet : liste d\'attente annoncée', async ({ page, api, connecter }) => {
    api.tournois.creer({ etat: 'inscriptions', inscrits: 8, attente: 2 });
    await connecter(CLIENT);
    await page.goto('/coupe');
    await expect(carte(page)).toContainText('8 inscrits · complet, 2 en liste d’attente');
    await expect(carte(page).getByRole('link', { name: 'Voir et rejoindre la liste' })).toBeVisible();
  });
});

test.describe('Tournois : drapeau éteint', () => {
  for (const [nom, valeur] of [['faux (COUPE_TOURNOIS=off)', false], ['absent (serveur plus ancien)', undefined]]) {
    test(`features.coupeTournaments ${nom} : ni carte ni lecture des tournois, la page dit « pause »`, async ({ page, api, connecter }) => {
      const t = api.tournois.creer({ etat: 'inscriptions' });
      if (valeur === undefined) delete api.donnees.parametresPublics.features.coupeTournaments;
      else api.donnees.parametresPublics.features.coupeTournaments = valeur;
      await connecter(CLIENT);
      await page.goto('/coupe');
      await expect(page.getByRole('heading', { name: 'Comment tu joues ?' })).toBeVisible();
      await expect(page.getByRole('region', { name: /Points de Coupe/ })).toContainText('victoire +3');
      await expect(page.getByText('Prochain tournoi')).toHaveCount(0);

      await page.goto(`/coupe/tournoi/${t.id}`);
      await expect(page.getByRole('heading', { name: 'Les tournois font une pause' })).toBeVisible();
      await page.getByRole('button', { name: 'Retour à la Coupe' }).click();
      await expect(page.getByRole('heading', { name: 'Comment tu joues ?' })).toBeVisible();
      expect(api.requetes.filter((r) => /^\/coupe\/(admin\/)?tournaments/.test(r.chemin))).toEqual([]);
    });
  }

  test('jeu fermé (features.coupe faux) : la page du tournoi renvoie à l\'accueil, sans lecture', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'inscriptions' });
    api.donnees.parametresPublics.features.coupe = false;
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(page).toHaveURL((url) => url.pathname === '/');
    expect(api.requetes.filter((r) => r.chemin.startsWith('/coupe/'))).toEqual([]);
  });

  test('tournois coupés pendant que la page est ouverte : « pause » au lieu d\'une erreur', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'presence', moi: CLIENT });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(page.getByRole('button', { name: 'Je suis là' })).toBeVisible();
    api.donnees.parametresPublics.features.coupeTournaments = false;
    await page.getByRole('button', { name: 'Je suis là' }).click();
    await expect(toast(page, 'Les tournois font une pause')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Les tournois font une pause' })).toBeVisible();
  });
});

test.describe('Tournois : inscription (écran 2)', () => {
  test('page du tournoi : format, déroulé, inscrits ; s\'inscrire puis se désinscrire', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'inscriptions' });
    const debut = new Date(t.starts_at);
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);

    await expect(titre(page, 'Coupe de Novembre')).toBeVisible();
    await expect(page.getByText('Tournoi · inscriptions ouvertes')).toBeVisible();
    const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'short' }).format(debut);
    await expect(page.getByText(`${jour.charAt(0).toUpperCase()}${jour.slice(1)} · 19:00`)).toBeVisible();
    await expect(page.getByText('8 joueurs, élimination directe')).toBeVisible();
    await expect(page.getByText('~30 min, fini vers 19:30')).toBeVisible();
    await expect(page.getByText('Premier à 5, tirs au but si égalité')).toBeVisible();
    const deroule = page.getByRole('list', { name: 'Déroulé' }).getByRole('listitem');
    await expect(deroule).toHaveCount(4);
    await expect(deroule.nth(0)).toContainText('18:45');
    await expect(deroule.nth(0)).toContainText('Tu confirmes ta présence');
    await expect(deroule.nth(1)).toContainText('19:00');
    await expect(deroule.nth(1)).toContainText('Tirage au sort en direct');
    await expect(page.getByRole('region', { name: 'Inscrits' })).toContainText('7 / 8');
    // Sept inscrits (la place vide, en pointillés, n'est pas lue)
    const inscrits = page.getByRole('list', { name: 'Joueurs inscrits' }).getByRole('listitem');
    await expect(inscrits).toHaveCount(7);
    await expect(inscrits.nth(0)).toContainText('Lucas M.');
    await expect(page.getByText('Rappel 30 min avant le début')).toBeVisible();

    // S'inscrire : la place restante
    await page.getByRole('button', { name: 'S’inscrire' }).click();
    await expect(toast(page, 'Tu es inscrit au tournoi')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Tu es inscrit : confirme ta présence à partir de 18:45.' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Inscrits' })).toContainText('8 / 8');
    await expect(inscrits).toHaveCount(8);
    await expect(inscrits.nth(7)).toContainText('Toi');
    expect(api.requetesVers('POST', `/coupe/tournaments/${t.id}/register`)).toHaveLength(1);

    // Se désinscrire : lien discret, puis confirmation
    await page.getByRole('button', { name: 'Me désinscrire' }).click();
    await page.getByRole('alertdialog', { name: 'Te désinscrire ?' }).getByRole('button', { name: 'Me désinscrire' }).click();
    await expect(toast(page, 'Tu n’es plus inscrit')).toBeVisible();
    await expect(page.getByRole('button', { name: 'S’inscrire' })).toBeVisible();
    expect(api.requetesVers('DELETE', `/coupe/tournaments/${t.id}/register`)).toHaveLength(1);
  });

  test('complet : liste d\'attente ; partage du lien public', async ({ page, api, connecter, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const t = api.tournois.creer({ etat: 'inscriptions', inscrits: 8, attente: 1 });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(page.getByText('Tournoi · complet, liste d’attente ouverte')).toBeVisible();
    await expect(page.getByText('Liste d’attente : Hugo L.')).toBeVisible();
    await page.getByRole('button', { name: 'Rejoindre la liste d’attente' }).click();
    await expect(toast(page, 'Tu es sur la liste d’attente')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Tu es sur la liste d’attente : tu passes si un inscrit ne confirme pas sa présence.' })).toBeVisible();
    await expect(page.getByText('Liste d’attente : Hugo L., Toi')).toBeVisible();

    // Navigateur d'ordinateur sans partage : le lien public est copié
    await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); });
    await page.getByRole('button', { name: 'Partager le tournoi' }).click();
    await expect(toast(page, 'Lien du tournoi copié')).toBeVisible();
    const copie = await page.evaluate(() => navigator.clipboard.readText());
    expect(copie).toContain(`https://dhomebarber.fr/coupe/tournoi/${t.id}`);
  });

  test('refus du serveur affiché tel quel (clos, exclu du classement)', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'inscriptions' });
    api.coupeRest.exclus.add(CLE_MOI);
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await page.getByRole('button', { name: 'S’inscrire' }).click();
    await expect(toast(page, 'Le salon t’a retiré des classements : tu ne peux pas t’inscrire aux tournois.')).toBeVisible();
    api.coupeRest.exclus.delete(CLE_MOI);

    api.surcharger('POST', `/coupe/tournaments/${t.id}/register`, () => ({ status: 409, json: { error: 'Les inscriptions à ce tournoi sont closes', code: 'closed' } }));
    await page.getByRole('button', { name: 'S’inscrire' }).click();
    await expect(toast(page, 'Les inscriptions à ce tournoi sont closes')).toBeVisible();
    await expect(page.getByRole('button', { name: 'S’inscrire' })).toBeEnabled();
  });

  test('inscription hors connexion : « Pas de connexion », le bouton revient', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'inscriptions' });
    api.surcharger('POST', `/coupe/tournaments/${t.id}/register`, () => RESEAU_COUPE);
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await page.getByRole('button', { name: 'S’inscrire' }).click();
    await expect(toast(page, 'Pas de connexion internet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'S’inscrire' })).toBeEnabled();
    await expect(page.getByText('Failed to fetch')).toHaveCount(0);
  });
});

test.describe('Tournois : présence (écran 3)', () => {
  test('compte à rebours, « Je suis là », présents et liste d\'attente', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'presence', moi: CLIENT, attente: 1 });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);

    await expect(titre(page, 'Coupe de Novembre')).toBeVisible();
    await expect(page.getByText(/^Aujourd’hui · \d\d:\d\d$/)).toBeVisible();
    await expect(page.getByRole('timer')).toHaveAccessibleName(/^Début dans 1[12]:\d\d$/);
    const debut = heureParis(new Date(t.starts_at));
    await expect(page.getByText(`Confirme ta présence avant ${debut}. Sans elle, ta place va au premier de la liste d’attente.`)).toBeVisible();
    const presents = page.getByRole('region', { name: 'Présents' });
    await expect(presents).toContainText('6 / 8');
    const lignes = presents.getByRole('list').getByRole('listitem');
    await expect(lignes).toHaveCount(8);
    await expect(lignes.nth(0)).toContainText('Toi');
    await expect(lignes.nth(0)).toContainText('Pas encore confirmé');
    await expect(lignes.nth(1)).toContainText('Présent');
    await expect(presents.getByRole('img', { name: 'Barber' }).first()).toBeVisible();
    await expect(presents).toContainText('Liste d’attente : Mehdi A.');
    await expect(page.getByText('Garde l’app ouverte : après le tirage, ton match t’attend ici.')).toBeVisible();

    await page.getByRole('button', { name: 'Je suis là' }).click();
    await expect(toast(page, 'Présence confirmée')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Présence confirmée' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Je suis là' })).toHaveCount(0);
    await expect(presents).toContainText('7 / 8');
    await expect(lignes.nth(0)).toContainText('Présent');
    await expect(page.getByText(`C’est noté : tu es dans le tirage de ${debut}.`)).toBeVisible();
    expect(api.requetesVers('POST', `/coupe/tournaments/${t.id}/checkin`)).toHaveLength(1);

    // Relu toutes les 3 s : un autre joueur confirme
    const nora = api.tournois.tournoi(t.id).joueurs.find((j) => !j.present_le && !j.attente);
    nora.present_le = api.tournois.ms();
    await page.clock.runFor(3500);
    await expect(presents).toContainText('8 / 8');
  });

  test('pas inscrit pendant la présence : s\'inscrire vaut présence', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'presence' });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(page.getByText('Il reste 1 place : inscris-toi, ça vaut présence.')).toBeVisible();
    await page.getByRole('button', { name: 'S’inscrire' }).click();
    await expect(toast(page, 'Tu es inscrit, ta présence est notée')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Présence confirmée' })).toBeVisible();
    expect(api.requetesVers('POST', `/coupe/tournaments/${t.id}/checkin`)).toHaveLength(0);
  });

  test('d\'après l\'heure du serveur : présence ouverte même si le téléphone retarde', async ({ page, api, connecter }) => {
    // Le serveur est 20 min plus loin que le navigateur : la présence est ouverte pour lui
    const t = api.tournois.creer({ etat: 'inscriptions', moi: CLIENT, debut: api.tournois.ms() + 30 * 60_000 });
    api.tournois.decalage = 20 * 60_000;
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(page.getByRole('button', { name: 'Je suis là' })).toBeVisible();
    await expect(page.getByRole('timer')).toHaveAccessibleName(/^Début dans (9|10):\d\d$/);
  });

  test('début passé, avant le tirage : « Tirage en cours… », puis le tirage', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'presence', moi: { compte: CLIENT, present: true }, debut: api.tournois.ms() + 60_000 });
    // Le serveur tire au sort seulement à la requête qui suit le début : on retient le tirage
    const tirer = api.tournois.tirerTournoi.bind(api.tournois);
    let retenu = true;
    api.tournois.tirerTournoi = (x, i) => (retenu ? undefined : tirer(x, i));
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(page.getByRole('status').filter({ hasText: 'Présence confirmée' })).toBeVisible();
    avancer(api, 61_000);
    await expect(page.getByRole('timer')).toHaveAccessibleName('Tirage en cours');
    retenu = false;
    await page.clock.runFor(3500);
    await expect(titre(page, 'Tirage au sort')).toBeVisible();
  });

  test('moins de 4 présents au début : annulé', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'presence', moi: CLIENT, presents: 2 });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(page.getByRole('button', { name: 'Je suis là' })).toBeVisible();
    avancer(api, 12 * 60_000 + 1000);
    await expect(titre(page, 'Tournoi annulé')).toBeVisible();
    await expect(page.getByText('Moins de 4 joueurs ont confirmé leur présence : le tournoi n’a pas eu lieu.')).toBeVisible();
  });
});

test.describe('Tournois : tirage au sort (écran 4)', () => {
  test('animé : les matchs se révèlent sur l\'heure du serveur, puis le tableau', async ({ page, api, connecter }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    // Heure du serveur arrêtée : seul `avancer` la fait bouger (le tirage suit l'heure du serveur)
    api.tournois.figer();
    const t = api.tournois.creer({ etat: 'tirage', moi: CLIENT });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);

    await expect(titre(page, 'Tirage au sort')).toBeVisible();
    await expect(page.getByText('Les 2 têtes de série (meilleurs Points de Coupe) sont séparées : elles ne se croisent pas avant la finale.')).toBeVisible();
    const tires = page.getByRole('list', { name: 'Matchs du premier tour' }).getByRole('listitem');
    await expect(tires).toHaveCount(4);
    await expect(tires.nth(0)).toContainText('…');
    await expect(page.getByRole('heading', { name: 'Déjà tirés' })).toBeVisible();

    // 30 s pour 4 matchs : un toutes les 6 s
    avancer(api, 6500);
    await expect(tires.nth(0)).toContainText('Lucas M.');
    await expect(tires.nth(0)).toContainText('TS');
    await expect(tires.nth(0)).toContainText('Romain');
    await expect(tires.nth(1)).toContainText('…');
    await expect(page.getByRole('region', { name: 'Tirage en cours' })).toContainText('Quart de finale · match 1');

    avancer(api, 18_000);
    await expect(tires.nth(3)).toContainText('Toi');
    await expect(tires.nth(3)).toContainText('Dom');
    await expect(page.getByRole('region', { name: 'Tirage en cours' })).toContainText('Toi');

    avancer(api, 6000);
    // Ton match devient jouable sous tes yeux : « Ton match commence » (fermée ici)
    const fenetre = page.getByRole('dialog', { name: 'Ton match commence' });
    await expect(fenetre).toBeVisible();
    await fenetre.getByRole('button', { name: 'Pas maintenant' }).click();
    await expect(titre(page, 'Tableau du tournoi')).toBeVisible();
  });

  test('« réduire les animations » : toute la liste tout de suite ; « Voir le tableau » passe le tirage', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tirage', moi: CLIENT, tirageDepuis: 2000 });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(titre(page, 'Tirage au sort')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Le tirage' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Tirage en cours' })).toHaveCount(0);
    const tires = page.getByRole('list', { name: 'Matchs du premier tour' }).getByRole('listitem');
    await expect(tires.nth(0)).toContainText('Lucas M.');
    await expect(tires.nth(1)).toContainText('D\'Home Barber');
    await expect(tires.nth(1).getByRole('img', { name: 'Le salon' })).toBeVisible();
    await expect(tires.nth(2)).toContainText('Kevin');
    await expect(tires.nth(3)).toContainText('Toi');

    await page.getByRole('button', { name: 'Voir le tableau' }).click();
    await expect(titre(page, 'Tableau du tournoi')).toBeVisible();
    // Ton match commence à la fin du tirage (30 s) : compte à rebours, bouton pas encore actif
    const mien = page.getByRole('article', { name: 'Ton match : Quart 4' });
    await expect(mien).toContainText(/Commence dans 0:2\d/);
    await expect(mien.getByRole('button', { name: 'Jouer mon match' })).toBeDisabled();
  });

  test('exempts : moins de présents que de places, les têtes de série passent d\'office', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tableau', moi: CLIENT, inscrits: 5 });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    // 6 présents pour 8 places : Lucas et Kevin (têtes de série) exempts, toi au premier tour
    await expect(titre(page, 'Tableau du tournoi')).toBeVisible();
    const quart1 = page.getByRole('article', { name: 'Quart 1' });
    await expect(quart1).toContainText('Lucas M.');
    await expect(quart1).toContainText('Qualifié d’office');
    await expect(quart1).toContainText('Pas d’adversaire');
    await expect(quart1).not.toContainText('Exempt');
    await expect(quart1.getByRole('img', { name: 'Qualifié' })).toBeVisible();
    await expect(page.getByRole('article', { name: /^Ton match/ })).toBeVisible();
  });
});

test.describe('Tournois : tableau en direct (écran 5) et « Jouer mon match »', () => {
  test('tours en onglets, scores en direct, ton match en tête ; « Jouer mon match » ouvre le jeu du tournoi', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tableau', moi: CLIENT });
    const mien = api.tournois.match(t.id, CLIENT);
    api.tournois.direct(t.id, { tour: 1, place: 0 }, { sc: [3, 2], playing: true });
    api.tournois.direct(t.id, CLIENT, { sc: [0, 0], present: [false, true], playing: false });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);

    await expect(titre(page, 'Tableau du tournoi')).toBeVisible();
    await expect(page.getByText('Coupe de Novembre', { exact: true })).toBeVisible();
    const onglets = page.getByRole('tablist', { name: 'Tours' }).getByRole('tab');
    await expect(onglets).toHaveCount(3);
    await expect(onglets.nth(0)).toHaveAccessibleName('Quarts de finale');
    await expect(onglets.nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect(onglets.nth(1)).toHaveAccessibleName('Demi-finales');
    await expect(onglets.nth(2)).toHaveAccessibleName('Finale');

    const cartes = page.getByRole('tabpanel').getByRole('article');
    await expect(cartes).toHaveCount(4);
    // Ton match d'abord : Dom est déjà là
    const carteMienne = cartes.nth(0);
    await expect(carteMienne).toHaveAccessibleName('Ton match : Quart 4');
    await expect(carteMienne).toContainText('Toi');
    await expect(carteMienne).toContainText('Dom est prêt');
    await expect(carteMienne.getByRole('img', { name: 'Barber' })).toBeVisible();
    // Quart 1 en direct, 3 – 2
    const quart1 = page.getByRole('article', { name: 'Quart 1' });
    await expect(quart1).toContainText('En direct');
    await expect(quart1).toContainText('Lucas M.3');
    await expect(quart1).toContainText('Romain2');
    await expect(page.getByRole('article', { name: 'Quart 2' })).toContainText(/Prêt · forfait dans 1:\d\d/);
    await expect(page.getByRole('heading', { name: 'Ensuite, les demies' })).toBeVisible();
    await expect(page.getByText('Le gagnant de Lucas M. – Romain contre celui de D\'Home Barber – Sarah K.')).toBeVisible();
    await expect(page.getByText('Éliminé ? Tu suis la suite ici, scores en direct.')).toBeVisible();

    // Le score bouge : relu toutes les 3 s
    api.tournois.direct(t.id, { tour: 1, place: 0 }, { sc: [4, 2], playing: true });
    await page.clock.runFor(3500);
    await expect(quart1).toContainText('Lucas M.4');

    // Onglet Demies : à connaître
    await onglets.nth(1).click();
    await expect(page.getByRole('article', { name: 'Demie 1' })).toContainText('À venir');
    await expect(page.getByRole('status').filter({ hasText: 'Ton match · Quart 4' })).toBeVisible();
    await page.getByRole('status').getByRole('button', { name: 'Jouer' }).click();

    await expect(page).toHaveURL((url) => url.pathname === '/coupe'
      && url.searchParams.get('tmatch') === mien.id && url.searchParams.get('tournoi') === t.id);
    await expect(partie(page)).toHaveAttribute('data-coupe-partie', 'online');
    await expect(partie(page)).toHaveAttribute('data-coupe-action', 'tournament');
    await expect(partie(page)).toHaveAttribute('data-coupe-tmatch', mien.id);
    await expect(partie(page)).toHaveAttribute('data-coupe-tournoi', t.id);
    // Retour : le tableau du tournoi
    await page.goBack();
    await expect(titre(page, 'Tableau du tournoi')).toBeVisible();
    await page.getByRole('article', { name: 'Ton match : Quart 4' }).getByRole('button', { name: 'Jouer mon match' }).click();
    await expect(partie(page)).toHaveAttribute('data-coupe-action', 'tournament');
  });

  test('lien de match illisible : message, retour à l\'accueil de la Coupe', async ({ page, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/coupe?tmatch=%3Cscript%3E&tournoi=abc');
    await expect(toast(page, 'Ce match de tournoi n’est pas valable.')).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === '/coupe' && url.search === '');
    await expect(page.getByRole('heading', { name: 'Comment tu joues ?' })).toBeVisible();
  });

  test('spectateur (pas inscrit) : le tableau, sans ton match', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tableau' });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(titre(page, 'Tableau du tournoi')).toBeVisible();
    await expect(page.getByText('Tu n’es pas inscrit à ce tournoi : tu le suis en spectateur, scores en direct.')).toBeVisible();
    await expect(page.getByRole('article', { name: /^Ton match/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Jouer mon match' })).toHaveCount(0);
  });

  test('absent au tirage : suivi d\'ici', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'presence', moi: CLIENT });
    api.tournois.avancer(12 * 60_000 + 40_000);
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(titre(page, 'Tableau du tournoi')).toBeVisible();
    await expect(page.getByText('Tu n’as pas confirmé ta présence à temps : tu suis le tournoi d’ici.')).toBeVisible();
  });
});

test.describe('Tournois : après ton match (écran 8)', () => {
  test('qualifié aux tirs au but : résultat, parcours, prochain adversaire en direct ; puis « Jouer mon match »', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tableau', moi: CLIENT });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(page.getByRole('article', { name: 'Ton match : Quart 4' })).toBeVisible();

    const mien = api.tournois.match(t.id, CLIENT);
    const cote = monCote(mien);
    api.tournois.finir(t.id, mien.id, { sc: [3, 3], so: cote === 0 ? [2, 1] : [1, 2], gagnant: cote, raison: 'shootout' });
    // L'autre quart qui donne ton adversaire : Kevin – Yanis B., en direct
    api.tournois.direct(t.id, { tour: 1, place: 2 }, { sc: [3, 2], playing: true });
    await page.clock.runFor(3500);

    await expect(titre(page, 'Qualifié !')).toBeVisible();
    await expect(page.getByText('Coupe de Novembre · quart 4')).toBeVisible();
    await expect(page.getByText('Tu bats Dom aux tirs au but')).toBeVisible();
    await expect(page.getByText('3 – 3 après le but en or · tirs au but 2 – 1')).toBeVisible();
    const parcours = page.getByRole('region', { name: 'Ton parcours' }).getByRole('listitem');
    await expect(parcours).toHaveCount(3);
    await expect(parcours.nth(0)).toContainText('Quart de finale');
    await expect(parcours.nth(0)).toContainText('Dom · 3 – 3, t.a.b. 2 – 1');
    await expect(parcours.nth(1)).toContainText('Demi-finale');
    await expect(parcours.nth(1)).toContainText('Bientôt');
    await expect(parcours.nth(2)).toContainText('Finale');
    const prochain = page.getByRole('region', { name: /^Ta demi-finale contre/ });
    await expect(prochain).toContainText('Ta demi-finale contre le gagnant de Kevin – Yanis B.');
    await expect(prochain).toContainText('3 – 2');

    // Voir le tableau, puis revoir son résultat
    await page.getByRole('button', { name: 'Voir le tableau' }).click();
    await expect(titre(page, 'Tableau du tournoi')).toBeVisible();
    await page.getByRole('button', { name: 'Revoir ton résultat' }).click();
    await expect(titre(page, 'Qualifié !')).toBeVisible();

    // Kevin gagne : ta demie est jouable, la page passe sur le tableau (« Ton match commence »)
    api.tournois.finir(t.id, { tour: 1, place: 2 }, { gagnant: 0 });
    await page.clock.runFor(3500);
    await page.getByRole('dialog', { name: 'Ton match commence' }).getByRole('button', { name: 'Pas maintenant' }).click();
    await expect(titre(page, 'Tableau du tournoi')).toBeVisible();
    const demie = page.getByRole('article', { name: 'Ton match : Demie 2' });
    await expect(demie).toContainText('Kevin');
    await expect(demie.getByRole('button', { name: 'Jouer mon match' })).toBeEnabled();
    await expect(page.getByRole('tab', { name: 'Demi-finales' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Quarts de finale, fini' })).toHaveCount(0);
  });

  test('éliminé : le résultat, puis le tableau', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tableau', moi: CLIENT });
    const mien = api.tournois.match(t.id, CLIENT);
    api.tournois.finir(t.id, mien.id, { gagnant: 1 - monCote(mien), sc: monCote(mien) === 0 ? [3, 5] : [5, 3] });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(titre(page, 'Éliminé')).toBeVisible();
    await expect(page.getByText('Dom te bat', { exact: true })).toBeVisible();
    await expect(page.getByText('3 – 5', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ton parcours' }).getByRole('listitem').nth(0)).toContainText('Dom · 5 – 3');
    await page.getByRole('button', { name: 'Voir le tableau' }).click();
    await expect(titre(page, 'Tableau du tournoi')).toBeVisible();
    await expect(page.getByRole('article', { name: 'Quart 4' }).getByRole('img', { name: 'Qualifié' })).toBeVisible();
  });

  test('exempt au premier tour : « Tu passes ce tour d\'office »', async ({ page, api, connecter }) => {
    // 5 présents pour 8 places : toi tête de série (le plus de points), exempt
    api.coupeRest.etats[CLIENT.id].saison = [200, 66, 0];
    const t = api.tournois.creer({ etat: 'tableau', moi: CLIENT, inscrits: 4 });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(titre(page, 'Qualifié !')).toBeVisible();
    await expect(page.getByText('Tu passes ce tour d’office')).toBeVisible();
  });
});

test.describe('Tournois : fin (écran 9), annulation', () => {
  test('champion : trophée, finale, podium ; « Voir mon palmarès » ; le tableau final', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'fini', moi: CLIENT });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(titre(page, 'Champion')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Trophée de la Coupe du Gang' })).toBeVisible();
    await expect(page.getByText('Tu remportes le tournoi')).toBeVisible();
    await expect(page.getByText('Finale : Toi 5 – 2 Lucas M.')).toBeVisible();
    const podium = page.getByRole('list', { name: 'Podium' }).getByRole('listitem');
    await expect(podium).toHaveCount(3);
    await expect(page.getByRole('listitem', { name: '1er : Toi' })).toBeVisible();
    await expect(page.getByRole('listitem', { name: '2e : Lucas M.' })).toBeVisible();
    await expect(page.getByRole('listitem', { name: '3e : D\'Home Barber et Kevin' })).toBeVisible();
    await expect(page.getByText('Trophée dans ton palmarès')).toBeVisible();
    await expect(page.getByText('Annoncé dans le fil')).toBeVisible();

    await page.getByRole('button', { name: 'Voir mon palmarès' }).click();
    const fiche = page.getByRole('dialog');
    await expect(fiche.getByRole('heading', { name: 'Palmarès' })).toBeVisible();
    await expect(fiche.getByRole('img', { name: '1 tournoi gagné' })).toBeVisible();
    const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(t.starts_at));
    await expect(fiche).toContainText(`Coupe de Novembre · ${jour}`);
    await expect(fiche.getByRole('button', { name: 'Signaler' })).toHaveCount(0);
    await fiche.getByRole('button', { name: 'Fermer' }).click();

    await page.getByRole('button', { name: 'Voir le tableau' }).click();
    await expect(titre(page, 'Tableau du tournoi')).toBeVisible();
    await expect(page.getByText('En direct')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Finale, fini', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Voir le podium' }).click();
    await expect(titre(page, 'Champion')).toBeVisible();
  });

  test('fini sans toi en champion : le champion, ta place, le podium', async ({ page, api, connecter }) => {
    // Tu perds ton quart contre Dom ; Lucas M. gagne tout
    const t = api.tournois.creer({ etat: 'fini', moi: CLIENT, gagnants: (m) => (m.p[0] === CLE_MOI ? 1 : 0) });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(titre(page, 'Tournoi terminé')).toBeVisible();
    await expect(page.getByText('Lucas M. remporte le tournoi')).toBeVisible();
    await expect(page.getByText('Tu t’arrêtes en quart de finale')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Voir mon palmarès' })).toHaveCount(0);
  });

  test('annulé par le salon', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'annule', raison: 'admin' });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(titre(page, 'Tournoi annulé')).toBeVisible();
    await expect(page.getByText('Le salon a annulé ce tournoi.')).toBeVisible();
    await page.getByRole('button', { name: 'Retour à la Coupe' }).click();
    await expect(page.getByRole('heading', { name: 'Comment tu joues ?' })).toBeVisible();
  });

  test('tournoi inconnu : « Tournoi introuvable »', async ({ page, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/coupe/tournoi/7a000000-0000-4000-8000-0000000000ff');
    await expect(page.getByRole('heading', { name: 'Tournoi introuvable' })).toBeVisible();
  });
});

test.describe('Tournois : palmarès au classement et sur la fiche (écran 10)', () => {
  test('petite coupe d\'or et nombre de titres à côté du nom ; rien sans titre ; fiche avec le palmarès', async ({ page, api, connecter }) => {
    api.tournois.ajouterTitre('joueur-lucas', { name: 'Coupe d’Octobre', date: '2026-10-20', rank: 1 });
    api.tournois.ajouterTitre('joueur-lucas', { name: 'Coupe de Septembre', date: '2026-09-18', rank: 1 });
    api.tournois.ajouterTitre('joueur-mehdi', { name: 'Coupe d’Octobre', date: '2026-10-20', rank: 2 });
    api.tournois.ajouterTitre('joueur-hugo', { name: 'Coupe de Septembre', date: '2026-09-18', rank: 1 });
    await connecter(CLIENT);

    // Accueil : haut du classement, Lucas a deux titres
    await page.goto('/coupe');
    const apercu = page.getByRole('region', { name: 'Classement de la saison' });
    await expect(apercu.getByRole('listitem').nth(0).getByRole('img', { name: '2 tournois gagnés' })).toBeVisible();
    await expect(apercu.getByRole('listitem').nth(0)).toContainText('2');
    await expect(apercu.getByRole('listitem').nth(1).getByRole('img', { name: /tournois? gagnés?/ })).toHaveCount(0);

    // Classement : Hugo L. (1 titre) ; Mehdi A. finaliste seulement : pas de coupe
    await page.goto('/coupe/classement');
    const suite = page.getByRole('list', { name: 'Suite du classement' });
    await expect(suite.getByRole('listitem').filter({ hasText: 'Hugo L.' }).getByRole('img', { name: '1 tournoi gagné' })).toBeVisible();
    await expect(suite.getByRole('listitem').filter({ hasText: 'Mehdi A.' }).getByRole('img', { name: /gagné/ })).toHaveCount(0);

    await suite.getByRole('button', { name: /Mehdi A\./ }).click();
    const fiche = page.getByRole('dialog', { name: /Mehdi A\./ });
    await expect(fiche.getByRole('heading', { name: 'Palmarès' })).toBeVisible();
    await expect(fiche).toContainText('Finaliste');
    await expect(fiche).toContainText('Coupe d’Octobre · 20 oct. 2026');
    await fiche.getByRole('button', { name: 'Fermer' }).click();

    // Sans titre : pas de palmarès sur la fiche
    await suite.getByRole('button', { name: /Romain/ }).click();
    await expect(page.getByRole('dialog', { name: /Romain/ })).toContainText('Saison');
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Palmarès' })).toHaveCount(0);
  });
});

test.describe('Tournois : panne réseau', () => {
  test('page du tournoi hors connexion : « Pas de connexion internet » puis Réessayer', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'inscriptions' });
    let horsLigne = true;
    api.surcharger('GET', `/coupe/tournaments/${t.id}`, () => (horsLigne ? RESEAU_COUPE : undefined));
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    const alerte = page.getByRole('alert').filter({ hasText: 'Pas de connexion internet' });
    await expect(alerte).toBeVisible();
    await expect(alerte).toContainText('le tournoi');
    await expect(page.getByText('Failed to fetch')).toHaveCount(0);
    horsLigne = false;
    await alerte.getByRole('button', { name: 'Réessayer' }).click();
    await expect(titre(page, 'Coupe de Novembre')).toBeVisible();
  });

  test('accueil de la Coupe : liste des tournois en panne, pas de carte ni d\'erreur à l\'écran', async ({ page, api, connecter }) => {
    api.tournois.creer({ etat: 'inscriptions' });
    api.surcharger('GET', '/coupe/tournaments', () => RESEAU_COUPE);
    await connecter(CLIENT);
    await page.goto('/coupe');
    await expect(page.getByRole('region', { name: /Points de Coupe/ })).toContainText('victoire +3');
    await expect.poll(() => api.requetesVers('GET', '/coupe/tournaments').length).toBeGreaterThan(0);
    await expect(page.getByText('Prochain tournoi')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

// ─── Relecture du 4 nov. 2026 : corrections décidées par le chef (une série par point) ─────────

/** Fenêtre « Ton match commence ». */
const fenetreMatch = (page) => page.getByRole('dialog', { name: 'Ton match commence' });

/** Le compte de test dans le faux serveur (requêtes directes aux règles du faux serveur). */
const compteClient = (api) => api.comptes.find((c) => c.id === CLIENT.id);

test.describe('Tournois : se désinscrire (point 1)', () => {
  test('présence : « Me désinscrire » discret, loin de « Je suis là », avec confirmation', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'presence', moi: CLIENT });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    const jeSuisLa = page.getByRole('button', { name: 'Je suis là' });
    const lien = page.getByRole('button', { name: 'Me désinscrire' });
    await expect(jeSuisLa).toBeVisible();
    // Un lien en texte (ni bord ni capitales de bouton), à distance du gros bouton
    const style = await lien.evaluate((el) => {
      const c = getComputedStyle(el);
      return { bord: c.borderTopWidth, police: parseFloat(c.fontSize), souligne: c.textDecorationLine, capitales: c.textTransform };
    });
    expect(style).toMatchObject({ bord: '0px', souligne: 'underline' });
    expect(style.capitales).not.toBe('uppercase');
    expect(style.police).toBeLessThanOrEqual(14);
    const a = await jeSuisLa.boundingBox();
    const b = await lien.boundingBox();
    expect(b.y - (a.y + a.height)).toBeGreaterThanOrEqual(10);

    // « Garder ma place » : rien n'est envoyé
    await lien.click();
    const confirmation = page.getByRole('alertdialog', { name: 'Te désinscrire ?' });
    await expect(confirmation).toContainText('Tu ne joueras pas « Coupe de Novembre ». Ta place se libère pour un autre joueur.');
    await confirmation.getByRole('button', { name: 'Garder ma place' }).click();
    await expect(confirmation).toHaveCount(0);
    expect(api.requetesVers('DELETE', `/coupe/tournaments/${t.id}/register`)).toHaveLength(0);
    await expect(jeSuisLa).toBeVisible();

    // Confirmé : désinscrit
    await lien.click();
    await confirmation.getByRole('button', { name: 'Me désinscrire' }).click();
    await expect(toast(page, 'Tu n’es plus inscrit')).toBeVisible();
    expect(api.requetesVers('DELETE', `/coupe/tournaments/${t.id}/register`)).toHaveLength(1);
    await expect(page.getByRole('button', { name: 'S’inscrire' })).toBeVisible();
  });

  test('320 × 568 : inscrit, aucun pied collé sur les inscrits ; pas inscrit, seul « S\'inscrire » reste collé', async ({ page, api, connecter }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const inscrit = api.tournois.creer({ etat: 'inscriptions', inscrits: 8, attente: 1, moi: { compte: CLIENT, attente: true } });
    const libre = api.tournois.creer({ etat: 'inscriptions', nom: 'Coupe de Décembre' });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${inscrit.id}`);
    await expect(page.getByRole('status').filter({ hasText: 'Tu es sur la liste d’attente' })).toBeVisible();
    const pions = page.getByRole('list', { name: 'Joueurs inscrits' }).getByRole('listitem');
    await expect(pions).toHaveCount(8);
    for (let i = 0; i < 8; i += 1) {
      // Pion amené tout en bas de l'écran : rien ne le recouvre
      const visible = await pions.nth(i).evaluate((el) => {
        el.scrollIntoView({ block: 'end', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
      });
      expect(visible, `pion ${i + 1} recouvert`).toBe(true);
    }
    await expect(page.locator('div.sticky')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Me désinscrire' })).toBeVisible();

    await page.goto(`/coupe/tournoi/${libre.id}`);
    await expect(page.getByRole('button', { name: 'S’inscrire' })).toBeVisible();
    const pied = await page.locator('div.sticky').boundingBox();
    expect(pied.height).toBeLessThanOrEqual(120);
  });
});

test.describe('Tournois : retour du jeu vers le tableau (point 2)', () => {
  test('salle d\'attente quittée : jamais le tableau d\'avant avec « Jouer mon match » pendant la relecture', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tableau', moi: CLIENT });
    const mien = api.tournois.match(t.id, CLIENT);
    Object.assign(api.coupe.tournoi, { match: mien.id, nom: t.name, tour: 'Quart de finale', you: monCote(mien), forfaitDans: 90_000 });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await page.getByRole('article', { name: 'Ton match : Quart 4' }).getByRole('button', { name: 'Jouer mon match' }).click();
    await expect(page.getByRole('heading', { name: /^En attente de/ })).toBeVisible();

    // La relecture du tournoi tarde (réseau lent)
    let lent = true;
    await page.route(`**/coupe/tournaments/${t.id}`, async (route) => {
      if (lent) await new Promise((r) => { setTimeout(r, 1500); });
      await route.fallback();
    });
    await page.getByRole('button', { name: 'Retour au tableau' }).last().click();
    await expect(page.getByText('Mise à jour du tableau…')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Jouer mon match' })).toHaveCount(0);
    lent = false;
    // Relu : toujours à jouer (on a quitté la salle d'attente), « Jouer mon match » revient, sans fenêtre
    await expect(page.getByRole('article', { name: 'Ton match : Quart 4' }).getByRole('button', { name: 'Jouer mon match' })).toBeEnabled();
    await page.clock.runFor(3500);
    await expect(fenetreMatch(page)).toHaveCount(0);
  });

  test('match joué, serveur pas encore à jour : la page attend, puis « Qualifié ! », jamais « Jouer mon match »', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tableau', moi: CLIENT });
    const mien = api.tournois.match(t.id, CLIENT);
    const cote = monCote(mien);
    Object.assign(api.coupe.tournoi, { match: mien.id, nom: t.name, tour: 'Quart de finale', you: cote, forfaitDans: 90_000 });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await page.getByRole('article', { name: 'Ton match : Quart 4' }).getByRole('button', { name: 'Jouer mon match' }).click();
    await expect(page.getByRole('heading', { name: /^En attente de/ })).toBeVisible();
    const cnx = api.coupe.derniere();
    api.coupe.regles = 2;
    api.coupe.rejoint(cnx);
    api.coupe.etat(cnx, { ph: 'live', sc: [4, 1] });
    await expect(page.getByRole('dialog', { name: 'La Coupe du Gang' })).toHaveAttribute('data-play', '1', { timeout: 15_000 });
    api.coupe.etat(cnx, { ph: 'over', sc: [5, 1] });
    cnx.envoyer({
      t: 'end', winner: cote, sc: cote === 0 ? [5, 1] : [1, 5], forfeit: false, cancelled: false, reason: null, tour: true,
      points: { ranked: true, reason: null, delta: cote === 0 ? [3, -1] : [-1, 3], total: 45, rank: 6, rank_before: 8 },
    });
    await page.getByRole('button', { name: 'Retour au tableau' }).click({ timeout: 15_000 });

    // Le serveur des tournois n'a pas encore enregistré le match : il le dit encore « à jouer »
    await expect(page.getByText('Mise à jour du tableau…')).toBeVisible();
    await page.clock.runFor(3500);
    await expect(page.getByText('Mise à jour du tableau…')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Jouer mon match' })).toHaveCount(0);
    api.tournois.finir(t.id, mien.id, { sc: cote === 0 ? [5, 1] : [1, 5], gagnant: cote });
    await page.clock.runFor(3500);
    await expect(titre(page, 'Qualifié !')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Jouer mon match' })).toHaveCount(0);
  });
});

test.describe('Tournois : hors du tableau (point 3)', () => {
  test('présent sans place au tirage (`out` sans tête de série) : « Le tableau était complet »', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tableau', inscrits: 8, moi: { compte: CLIENT, attente: true, present: true } });
    const moi = api.tournois.tournoi(t.id).joueurs.find((j) => j.cle === CLE_MOI);
    expect(moi).toMatchObject({ statut: 'out', seed: null });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(titre(page, 'Tableau du tournoi')).toBeVisible();
    await expect(page.getByText('Le tableau était complet : tu suis le tournoi en spectateur.')).toBeVisible();
    await expect(page.getByRole('article', { name: /^Ton match/ })).toHaveCount(0);
  });

  test('retiré par le salon : il le lit avant le tirage (sans « S\'inscrire ») et pendant le tournoi (jamais « Éliminé »)', async ({ page, api, connecter }) => {
    const avant = api.tournois.creer({ etat: 'inscriptions', moi: CLIENT });
    api.tournois.retirer(avant.id, CLE_MOI);
    // Le vrai serveur refuse la réinscription d'un joueur retiré
    expect(api.tournois.traiter({ compte: compteClient(api), methode: 'POST', chemin: `/coupe/tournaments/${avant.id}/register`, corps: {} }))
      .toMatchObject({ status: 403, json: { code: 'removed', error: 'Le salon t’a retiré de ce tournoi' } });
    const pendant = api.tournois.creer({ etat: 'tableau', moi: CLIENT, nom: 'Coupe de Décembre' });
    api.tournois.retirer(pendant.id, CLE_MOI);
    await connecter(CLIENT);

    await page.goto(`/coupe/tournoi/${avant.id}`);
    await expect(page.getByRole('status').filter({ hasText: 'Le salon t’a retiré de ce tournoi.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'S’inscrire' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Me désinscrire' })).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Joueurs inscrits' })).not.toContainText('Toi');

    await page.goto(`/coupe/tournoi/${pendant.id}`);
    await expect(titre(page, 'Tableau du tournoi')).toBeVisible();
    await expect(page.getByText('Le salon t’a retiré de ce tournoi : tu le suis en spectateur.')).toBeVisible();
    await expect(titre(page, 'Éliminé')).toHaveCount(0);
    await expect(page.getByRole('article', { name: /^Ton match/ })).toHaveCount(0);
  });
});

test.describe('Tournois : accords (point 4)', () => {
  test('« Ton quart de finale » (16 places), « Ta finale »', async ({ page, api, connecter }) => {
    const seize = api.tournois.creer({ etat: 'tableau', taille: 16, moi: CLIENT });
    const huitieme = api.tournois.match(seize.id, CLIENT);
    api.tournois.finir(seize.id, huitieme.id, { gagnant: monCote(huitieme) });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${seize.id}`);
    await expect(titre(page, 'Qualifié !')).toBeVisible();
    await expect(page.getByRole('region', { name: /^Ton quart de finale contre/ })).toBeVisible();
    await expect(page.getByText(/Ta quart/)).toHaveCount(0);

    // 8 places : quart et demie gagnés, la finale t'attend
    const huit = api.tournois.creer({ etat: 'tableau', moi: CLIENT, nom: 'Coupe de Décembre' });
    const quart = api.tournois.match(huit.id, CLIENT);
    api.tournois.finir(huit.id, quart.id, { gagnant: monCote(quart) });
    api.tournois.finir(huit.id, { tour: 1, place: 2 }, { gagnant: 0 });
    const demie = api.tournois.match(huit.id, CLIENT);
    api.tournois.finir(huit.id, demie.id, { gagnant: monCote(demie) });
    await page.goto(`/coupe/tournoi/${huit.id}`);
    await expect(titre(page, 'Qualifié !')).toBeVisible();
    await expect(page.getByRole('region', { name: /^Ta finale contre/ })).toBeVisible();
  });
});

test.describe('Tournois : connexion perdue (point 5)', () => {
  test('tableau affiché puis plus de réseau : bandeau, plus de « En direct », comptes à rebours figés, « Jouer » grisé', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tableau', moi: CLIENT });
    api.tournois.direct(t.id, { tour: 1, place: 0 }, { sc: [3, 2], playing: true });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    const mienne = page.getByRole('article', { name: 'Ton match : Quart 4' });
    await expect(mienne.getByRole('button', { name: 'Jouer mon match' })).toBeEnabled();
    await expect(page.getByText('En direct', { exact: true })).toHaveCount(2);

    let coupe = true;
    api.surcharger('GET', `/coupe/tournaments/${t.id}`, () => (coupe ? RESEAU_COUPE : undefined));
    await page.clock.runFor(3500);
    await expect(page.getByRole('status').filter({ hasText: 'Connexion perdue, on réessaie…' })).toBeVisible();
    await expect(page.getByText('En direct', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('article', { name: 'Quart 1' })).toContainText('En cours · figé');
    await expect(mienne).toContainText(/Forfait dans 1:\d\d · figé/);
    await expect(mienne.getByRole('button', { name: 'Jouer mon match' })).toBeDisabled();
    const fige = await mienne.textContent();
    await page.clock.runFor(4000);
    expect(await mienne.textContent()).toBe(fige);

    // Le réseau revient : tout repart
    coupe = false;
    await page.clock.runFor(3500);
    await expect(page.getByText('Connexion perdue, on réessaie…')).toHaveCount(0);
    await expect(mienne.getByRole('button', { name: 'Jouer mon match' })).toBeEnabled();
    await expect(mienne).not.toContainText('figé');
    await expect(page.getByText('En direct', { exact: true })).toHaveCount(2);
  });
});

test.describe('Tournois : 320 px (point 6)', () => {
  test('compte à rebours de ton match jamais coupé ; nom long sur deux lignes, sans couper un mot ni déborder', async ({ page, api, connecter }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    const nom = 'Coupe de Novembre des Gros Dégradés';
    const t = api.tournois.creer({ etat: 'tableau', taille: 16, moi: CLIENT, nom });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    const mienne = page.getByRole('article', { name: /^Ton match/ });
    const note = mienne.getByText(/^Forfait dans \d:\d\d$/);
    await expect(note).toBeVisible();
    const coupee = await note.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const carte = el.closest('article').getBoundingClientRect();
      return el.scrollWidth > el.clientWidth + 1 || r.right > carte.right + 0.5;
    });
    expect(coupee).toBe(false);

    // En-tête : le nom et le titre en entier, deux lignes au plus, aucun mot coupé
    const entier = (loc) => loc.evaluate((el) => {
      const hauteurLigne = parseFloat(getComputedStyle(el).lineHeight);
      const mots = [];
      const texte = el.firstChild;
      const re = /\S+/g;
      let m;
      while ((m = re.exec(texte.textContent))) {
        const range = document.createRange();
        range.setStart(texte, m.index);
        range.setEnd(texte, m.index + m[0].length);
        const lignes = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
        if (lignes.size > 1) mots.push(m[0]);
      }
      return {
        // Coupé par les deux lignes au plus (en-tête) ou débordant sur le côté
        cacheBas: el.scrollHeight > el.clientHeight + 1,
        deborde: el.scrollWidth > el.clientWidth + 1,
        lignes: Math.round(el.getBoundingClientRect().height / hauteurLigne),
        motsCoupes: mots,
      };
    });
    for (const loc of [page.getByText(nom, { exact: true }), titre(page, 'Tableau du tournoi')]) {
      const r = await entier(loc);
      expect(r).toMatchObject({ cacheBas: false, deborde: false });
      expect(r.lignes).toBeLessThanOrEqual(2);
      expect(r.motsCoupes).toEqual([]);
    }

    // Page d'inscription : un mot plus long que la ligne à 38 px ne déborde pas et n'est pas coupé
    const long = api.tournois.creer({ etat: 'inscriptions', nom: 'Grand Tournoi Interbarbershop' });
    await page.goto(`/coupe/tournoi/${long.id}`);
    const grand = titre(page, 'Grand Tournoi Interbarbershop');
    await expect(grand).toBeVisible();
    const r = await entier(grand);
    expect(r.deborde).toBe(false);
    expect(r.motsCoupes).toEqual([]);
    expect(await elementsQuiDepassent(page)).toEqual([]);
  });
});

test.describe('Tournois : ton match prêt, temps écoulé (point 7)', () => {
  test('« Ton adversaire t\'attend » seulement s\'il est là ; « Temps écoulé » et « Jouer » grisé après l\'échéance', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tableau', moi: CLIENT });
    const mien = api.tournois.match(t.id, CLIENT);
    const cote = monCote(mien);
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    const mienne = page.getByRole('article', { name: 'Ton match : Quart 4' });
    await expect(mienne).toContainText(/Forfait dans 1:\d\d/);

    await page.getByRole('tab', { name: 'Demi-finales' }).click();
    const bandeau = page.getByRole('status').filter({ hasText: 'Ton match · Quart 4' });
    await expect(bandeau).toContainText('Ton match est prêt.');
    await expect(bandeau).not.toContainText('t’attend');

    // L'adversaire entre dans la salle
    api.tournois.direct(t.id, CLIENT, { present: cote === 0 ? [false, true] : [true, false], playing: false });
    await page.clock.runFor(3500);
    await expect(bandeau).toContainText('Ton adversaire t’attend.');

    // Échéance passée sans coup d'envoi (heure du serveur ; ce faux serveur n'arbitre pas encore)
    api.tournois.direct(t.id, CLIENT, { present: [true, true], playing: false });
    avancer(api, 2 * 60_000 + 5000);
    await page.clock.runFor(3500);
    await expect(bandeau).toContainText('Temps écoulé.');
    await expect(bandeau.getByRole('button', { name: 'Jouer' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Quarts de finale' }).click();
    await expect(mienne).toContainText('Temps écoulé');
    await expect(mienne.getByRole('button', { name: 'Jouer mon match' })).toBeDisabled();
  });
});

test.describe('Tournois : exempts (point 8)', () => {
  test('16 places, 5 présents : « Qualifié d\'office », « pas de match », jamais « Exempt » ; parcours idem', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tirage', taille: 16, moi: CLIENT, inscrits: 4, tirageDepuis: 2000 });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    const liste = page.getByRole('list', { name: 'Matchs du premier tour' });
    await expect(liste.getByRole('listitem')).toHaveCount(8);
    await expect(liste.getByRole('listitem').filter({ hasText: 'Qualifié d’office' })).toHaveCount(5);
    await expect(liste.getByRole('listitem').filter({ hasText: 'Deux places libres : pas de match' })).toHaveCount(3);
    await expect(liste).not.toContainText('Exempt');

    await page.getByRole('button', { name: 'Voir le tableau' }).click();
    await expect(titre(page, 'Qualifié !')).toBeVisible();
    const parcours = page.getByRole('region', { name: 'Ton parcours' }).getByRole('listitem');
    await expect(parcours.nth(0)).toContainText('Qualifié d’office');
    await expect(page.getByRole('region', { name: 'Ton parcours' })).not.toContainText('Exempt');
    await page.getByRole('button', { name: 'Voir le tableau' }).click();
    await page.getByRole('tab', { name: /^8es de finale/ }).click();
    const panneau = page.getByRole('tabpanel');
    await expect(panneau.getByRole('article').filter({ hasText: 'Qualifié d’office' })).toHaveCount(5);
    await expect(panneau.getByRole('article').filter({ hasText: 'Deux places libres : pas de match' })).toHaveCount(3);
    await expect(panneau).not.toContainText('Exempt');
  });

  test('exempt dont l\'adversaire est déjà connu : l\'heure de son match, pas « dès qu\'ils auront fini »', async ({ page, api, connecter }) => {
    // 5 présents pour 8 places : toi tête de série n° 2, Kevin n° 3, tous deux exempts : demie Toi – Kevin
    api.coupeRest.etats[CLIENT.id].saison = [85, 30, 0];
    const t = api.tournois.creer({ etat: 'tirage', moi: CLIENT, inscrits: 4, tirageDepuis: 2000 });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await page.getByRole('button', { name: 'Voir le tableau' }).click();
    await expect(titre(page, 'Qualifié !')).toBeVisible();
    const prochain = page.getByRole('region', { name: /^Ta demi-finale contre Kevin/ });
    await expect(prochain).toContainText(/Ton match commence ici dans 0:2\d\. Reste dans l’app\./);
    await expect(prochain).not.toContainText('dès qu’ils auront fini');
  });
});

test.describe('Tournois : carte de l\'accueil (point 9)', () => {
  test('présence : « Confirme ta présence » tant qu\'on ne l\'a pas fait', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'presence', moi: CLIENT });
    await connecter(CLIENT);
    await page.goto('/coupe');
    const bloc = carte(page);
    await expect(bloc.getByRole('status')).toHaveText(`Confirme ta présence avant ${heureParis(new Date(t.starts_at))}`);
    await expect(bloc.getByRole('link', { name: 'Confirmer ma présence' })).toHaveAttribute('href', `/coupe/tournoi/${t.id}`);

    api.tournois.tournoi(t.id).joueurs.find((j) => j.cle === CLE_MOI).present_le = api.tournois.ms();
    await page.reload();
    await expect(bloc).toContainText('Tu es inscrit, présence confirmée');
    await expect(bloc.getByText(/Confirme ta présence/)).toHaveCount(0);
    await expect(bloc.getByRole('link', { name: 'Voir le tournoi' })).toBeVisible();
  });

  test('tournoi en cours : « Ton match est prêt » et « Jouer mon match » quand il est jouable', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tirage', moi: CLIENT, tirageDepuis: 25_000 });
    const mien = api.tournois.match(t.id, CLIENT);
    await connecter(CLIENT);
    await page.goto('/coupe');
    const bloc = carte(page);
    await expect(bloc.getByRole('link', { name: 'Voir le tableau' })).toBeVisible();
    await expect(bloc.getByText('Ton match est prêt')).toHaveCount(0);

    avancer(api, 6000);
    await page.clock.runFor(3500);
    await expect(bloc.getByRole('status')).toHaveText('Ton match est prêt');
    const jouer = bloc.getByRole('link', { name: 'Jouer mon match' });
    await expect(jouer).toHaveAttribute('href', `/coupe?tmatch=${mien.id}&tournoi=${t.id}`);
    await jouer.click();
    await expect(partie(page)).toHaveAttribute('data-coupe-tmatch', mien.id);
  });
});

test.describe('Tournois : « Ton match commence » (point 10)', () => {
  test('ton match devient jouable sous tes yeux : 5 s, puis le jeu s\'ouvre seul ; jamais une 2e fois', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tirage', moi: CLIENT, tirageDepuis: 25_000 });
    const mien = api.tournois.match(t.id, CLIENT);
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(titre(page, 'Tirage au sort')).toBeVisible();
    await expect(fenetreMatch(page)).toHaveCount(0);

    avancer(api, 6000);
    await page.clock.runFor(3500);
    const fenetre = fenetreMatch(page);
    await expect(fenetre).toBeVisible();
    await expect(fenetre).toContainText('Quart 4');
    await expect(fenetre).toContainText('Contre');
    await expect(fenetre).toContainText('Dom');
    await expect(fenetre.getByRole('timer')).toHaveAccessibleName(/^Le jeu s’ouvre dans [1-5] s$/);
    await expect(fenetre.getByRole('button', { name: 'Y aller' })).toBeVisible();
    await expect(fenetre.getByRole('button', { name: 'Fermer' })).toBeVisible();
    // « Réduire les animations » : l'anneau ne glisse pas
    await expect(fenetre.locator('circle').nth(1)).not.toHaveAttribute('style', /transition/);

    await page.clock.runFor(5500);
    await expect(page).toHaveURL((url) => url.pathname === '/coupe' && url.searchParams.get('tmatch') === mien.id);
    await expect(partie(page)).toHaveAttribute('data-coupe-tmatch', mien.id);

    // Retour au tableau : le match est toujours à jouer, mais plus de fenêtre
    await page.goBack();
    await expect(page.getByRole('article', { name: 'Ton match : Quart 4' }).getByRole('button', { name: 'Jouer mon match' })).toBeEnabled();
    await page.clock.runFor(7000);
    await expect(fenetreMatch(page)).toHaveCount(0);
  });

  test('« Pas maintenant » et la croix la ferment pour de bon ; « Y aller » ouvre le match suivant', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tirage', moi: CLIENT, tirageDepuis: 25_000 });
    const mien = api.tournois.match(t.id, CLIENT);
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(titre(page, 'Tirage au sort')).toBeVisible();
    avancer(api, 6000);
    await page.clock.runFor(3500);
    await fenetreMatch(page).getByRole('button', { name: 'Pas maintenant' }).click();
    await expect(fenetreMatch(page)).toHaveCount(0);
    await page.clock.runFor(7000);
    await expect(fenetreMatch(page)).toHaveCount(0);
    await expect(page).toHaveURL((url) => url.pathname === `/coupe/tournoi/${t.id}`);
    await expect(page.getByRole('article', { name: 'Ton match : Quart 4' }).getByRole('button', { name: 'Jouer mon match' })).toBeEnabled();

    // Quart gagné, l'autre quart finit : ta demie devient jouable, fenêtre (croix), puis l'autre tournoi
    api.tournois.finir(t.id, mien.id, { gagnant: monCote(mien) });
    await page.clock.runFor(3500);
    await expect(titre(page, 'Qualifié !')).toBeVisible();
    api.tournois.finir(t.id, { tour: 1, place: 2 }, { gagnant: 0 });
    await page.clock.runFor(3500);
    await fenetreMatch(page).getByRole('button', { name: 'Fermer' }).click();
    await expect(fenetreMatch(page)).toHaveCount(0);
    const demie = api.tournois.match(t.id, CLIENT);
    await page.getByRole('article', { name: 'Ton match : Demie 2' }).getByRole('button', { name: 'Jouer mon match' }).click();
    await expect(partie(page)).toHaveAttribute('data-coupe-tmatch', demie.id);

    // « Y aller » : tout de suite, sans attendre les 5 s
    const autre = api.tournois.creer({ etat: 'tirage', moi: CLIENT, tirageDepuis: 25_000, nom: 'Coupe de Décembre' });
    const sien = api.tournois.match(autre.id, CLIENT);
    await page.goto(`/coupe/tournoi/${autre.id}`);
    await expect(titre(page, 'Tirage au sort')).toBeVisible();
    avancer(api, 6000);
    await page.clock.runFor(3500);
    await fenetreMatch(page).getByRole('button', { name: 'Y aller' }).click();
    await expect(partie(page)).toHaveAttribute('data-coupe-tmatch', sien.id);
  });

  test('page cachée quand il devient jouable : pas de fenêtre, ni au retour', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tirage', moi: CLIENT, tirageDepuis: 25_000 });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(titre(page, 'Tirage au sort')).toBeVisible();
    await page.clock.runFor(1000);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Le match devient jouable à l'heure prévue (sans relecture, onglet caché)
    await page.clock.runFor(6000);
    await page.evaluate(() => {
      delete document.visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(3500);
    await expect(page.getByRole('article', { name: 'Ton match : Quart 4' }).getByRole('button', { name: 'Jouer mon match' })).toBeEnabled();
    await expect(fenetreMatch(page)).toHaveCount(0);
  });
});

test.describe('Tournois : petits défauts (point 11)', () => {
  test('tirage animé : boules dans la coupe, chacune à sa place quand les autres sortent', async ({ page, api, connecter }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    api.tournois.figer();
    const t = api.tournois.creer({ etat: 'tirage', taille: 16, moi: CLIENT });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    const boules = page.locator('[data-boule]');
    await expect(boules).toHaveCount(16);
    // Places (hors du petit balancement) et géométrie de la coupe : demi-disque de 110 px sous le bord
    const places = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-boule]')].map((b) => {
      const c = b.parentElement;
      const x = b.offsetLeft + 17 - c.clientWidth / 2;
      const y = b.offsetTop + 17;
      const centre = x > 0 ? 5 : x < 0 ? -5 : 0;
      const dedans = Math.hypot(x - centre, y - 18) + 17 <= 110 && y - 17 >= 26;
      return [b.dataset.boule, { x, y, dedans }];
    })));
    const avant = await places();
    expect(Object.values(avant).filter((p) => !p.dedans)).toEqual([]);
    // 16 places : 8 matchs, un toutes les 3,3 s
    avancer(api, 3500);
    await expect(boules).toHaveCount(14);
    const apres = await places();
    for (const [cle, p] of Object.entries(apres)) expect(p, `boule ${cle}`).toEqual(avant[cle]);
  });

  test('1366 px : le haut du stade se fond dans le noir sur les côtés', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'inscriptions' });
    await connecter(CLIENT);
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(titre(page, 'Coupe de Novembre')).toBeVisible();
    await expect(page.locator('[data-fondu-bords]')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('[data-fondu-bords]')).toBeHidden();
  });
});

test.describe('Tournois : faux serveur aligné sur le vrai, côté joueurs (point 12)', () => {
  test('ordre et textes des refus, désinscription sans inscription, échéance et heure d\'un match', async ({ api }) => {
    const compte = compteClient(api);
    const req = (methode, chemin) => api.tournois.traiter({ compte, methode, chemin, corps: {} });
    const enCours = api.tournois.creer({ etat: 'tableau' });
    // Exclu du classement : `banned` avant `closed` (comme `register` du vrai serveur)
    api.coupeRest.exclus.add(CLE_MOI);
    expect(req('POST', `/coupe/tournaments/${enCours.id}/register`)).toMatchObject({ status: 403, json: { code: 'banned' } });
    api.coupeRest.exclus.delete(CLE_MOI);
    expect(req('POST', `/coupe/tournaments/${enCours.id}/register`))
      .toMatchObject({ status: 409, json: { code: 'closed', error: 'Les inscriptions sont fermées pour ce tournoi' } });
    expect(req('POST', `/coupe/tournaments/${enCours.id}/checkin`))
      .toMatchObject({ status: 409, json: { code: 'closed', error: 'Le tournoi a commencé : la présence est fermée' } });

    const ouvert = api.tournois.creer({ etat: 'inscriptions' });
    expect(req('DELETE', `/coupe/tournaments/${ouvert.id}/register`)).toEqual({ json: { ok: true } });
    expect(req('POST', `/coupe/tournaments/${ouvert.id}/checkin`))
      .toMatchObject({ status: 409, json: { code: 'not_yet', error: 'La présence s’ouvre 15 minutes avant le début (à 18:45)' } });

    // Match commencé : plus d'échéance de forfait ; match à venir : pas d'heure
    const t = api.tournois.creer({ etat: 'tableau', moi: CLIENT });
    api.tournois.direct(t.id, CLIENT, { sc: [1, 0], playing: true });
    const vue = req('GET', `/coupe/tournaments/${t.id}`).json;
    expect(vue.me.match.forfeit_at).toBeNull();
    expect(vue.me.match.ready_at).not.toBeNull();
    expect(vue.rounds[1].matches[0]).toMatchObject({ status: 'pending', ready_at: null, forfeit_at: null });
  });
});

for (const largeur of [320, 390]) {
  test.describe(`Tournois à ${largeur} px`, () => {
    test(`aucun défilement horizontal (accueil, inscription, présence, tirage, tableau, qualifié, champion), console sans erreur`, async ({ page, api, connecter, journal }) => {
      await page.setViewportSize({ width: largeur, height: 760 });
      const nom = 'Coupe de Novembre des Gros Dégradés';
      const inscription = api.tournois.creer({ etat: 'inscriptions', taille: 16, nom, inscrits: 12 });
      const presence = api.tournois.creer({ etat: 'presence', taille: 16, moi: CLIENT, attente: 2, nom: 'Présence' });
      const tirage = api.tournois.creer({ etat: 'tirage', taille: 16, moi: CLIENT, nom: 'Tirage' });
      const tableau = api.tournois.creer({ etat: 'tableau', taille: 16, moi: CLIENT, nom: 'Tableau' });
      api.tournois.direct(tableau.id, { tour: 1, place: 0 }, { sc: [3, 2], playing: true });
      const fini = api.tournois.creer({ etat: 'fini', moi: CLIENT, nom: 'Fini' });
      await connecter(CLIENT);

      await page.goto('/coupe');
      await expect(page.getByText('Tournoi en cours')).toBeVisible();
      await attendreSansDebordement(page, 'l\'accueil de la Coupe avec la carte du tournoi');
      expect(await elementsQuiDepassent(page), 'accueil').toEqual([]);

      const ecrans = [
        [inscription.id, () => titre(page, nom), 'l\'inscription'],
        [presence.id, () => page.getByRole('button', { name: 'Je suis là' }), 'la présence'],
        [tirage.id, () => titre(page, 'Tirage au sort'), 'le tirage'],
        [tableau.id, () => page.getByRole('article', { name: /^Ton match/ }), 'le tableau'],
        [fini.id, () => titre(page, 'Champion'), 'le champion'],
      ];
      for (const [id, attendu, quoi] of ecrans) {
        await page.goto(`/coupe/tournoi/${id}`);
        await expect(attendu()).toBeVisible();
        await attendreSansDebordement(page, quoi);
        expect(await elementsQuiDepassent(page), quoi).toEqual([]);
      }

      // Qualifié
      const mien = api.tournois.match(tableau.id, CLIENT);
      api.tournois.finir(tableau.id, mien.id, { gagnant: monCote(mien) });
      await page.goto(`/coupe/tournoi/${tableau.id}`);
      await expect(titre(page, 'Qualifié !')).toBeVisible();
      await attendreSansDebordement(page, 'qualifié');
      expect(await elementsQuiDepassent(page), 'qualifié').toEqual([]);

      expect(journal.console, 'Erreurs dans la console').toEqual([]);
    });
  });
}

/**
 * Polices réelles pour les captures (les tests reçoivent une réponse vide de Google Fonts) :
 * `CAPTURE_POLICES=<dossier>` contenant `fonts.css` et ses fichiers (même format que
 * e2e/snake-pages.spec.js).
 */
async function policesLocales(page) {
  const dossier = process.env.CAPTURE_POLICES;
  if (!dossier) return;
  const { readFileSync } = await import('node:fs');
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: readFileSync(`${dossier}/fonts.css`, 'utf8') }));
  await page.route('https://fonts.gstatic.com/**', (route) => {
    const nom = new URL(route.request().url()).pathname.slice(1).replace(/\//g, '_');
    route.fulfill({ contentType: 'font/woff2', body: readFileSync(`${dossier}/${nom}`) });
  });
}

// Captures pour la revue (CAPTURE_TOURNOIS=<dossier>) : chaque écran à 390 px
test('captures des écrans des tournois à 390 px (CAPTURE_TOURNOIS)', async ({ page, api, connecter }) => {
  test.skip(!process.env.CAPTURE_TOURNOIS, 'captures seulement sur demande');
  test.setTimeout(120_000);
  const dossier = process.env.CAPTURE_TOURNOIS;
  await policesLocales(page);
  api.tournois.ajouterTitre('joueur-lucas', { name: 'Coupe d’Octobre', date: '2026-10-20', rank: 1 });
  const inscription = api.tournois.creer({ etat: 'inscriptions', taille: 16, inscrits: 11 });
  const presence = api.tournois.creer({ etat: 'presence', taille: 16, moi: CLIENT, inscrits: 12, attente: 2, nom: 'Coupe du Mardi' });
  const tableau = api.tournois.creer({ etat: 'tableau', moi: CLIENT, nom: 'Coupe du Soir' });
  api.tournois.direct(tableau.id, { tour: 1, place: 0 }, { sc: [3, 2], playing: true });
  api.tournois.direct(tableau.id, CLIENT, { present: [false, true], playing: false });
  const qualifie = api.tournois.creer({ etat: 'tableau', moi: CLIENT, nom: 'Coupe Qualif' });
  const m = api.tournois.match(qualifie.id, CLIENT);
  api.tournois.finir(qualifie.id, m.id, { sc: [3, 3], so: monCote(m) === 0 ? [2, 1] : [1, 2], gagnant: monCote(m), raison: 'shootout' });
  api.tournois.direct(qualifie.id, { tour: 1, place: 2 }, { sc: [3, 2], playing: true });
  const fini = api.tournois.creer({ etat: 'fini', moi: CLIENT, nom: 'Coupe de Novembre' });
  await connecter(CLIENT);
  await page.setViewportSize({ width: 390, height: 844 });

  const capture = async (nom, pret) => {
    await pret();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${dossier}/tournoi-${nom}.png`, fullPage: true });
  };
  await page.goto('/coupe');
  await capture('1-accueil', () => expect(page.getByText('Tournoi en cours')).toBeVisible());
  await page.goto(`/coupe/tournoi/${inscription.id}`);
  await capture('2-inscription', () => expect(titre(page, 'Coupe de Novembre')).toBeVisible());
  await page.goto(`/coupe/tournoi/${presence.id}`);
  await capture('3-presence', () => expect(page.getByRole('button', { name: 'Je suis là' })).toBeVisible());
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  api.tournois.figer();
  const tirage = api.tournois.creer({ etat: 'tirage', taille: 16, moi: CLIENT, nom: 'Coupe Tirage', tirageDepuis: 16_000 });
  await page.goto(`/coupe/tournoi/${tirage.id}`);
  await capture('4-tirage', () => expect(page.getByRole('region', { name: 'Tirage en cours' })).toBeVisible());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/coupe/tournoi/${tableau.id}`);
  await capture('5-tableau', () => expect(page.getByRole('article', { name: /^Ton match/ })).toBeVisible());
  await page.goto(`/coupe/tournoi/${qualifie.id}`);
  await capture('8-qualifie', () => expect(titre(page, 'Qualifié !')).toBeVisible());
  await page.goto(`/coupe/tournoi/${fini.id}`);
  await capture('9-champion', () => expect(titre(page, 'Champion')).toBeVisible());
  await page.getByRole('button', { name: 'Voir mon palmarès' }).click();
  await capture('10-palmares', () => expect(page.getByRole('dialog').getByRole('heading', { name: 'Palmarès' })).toBeVisible());
  await page.goto('/coupe/classement');
  await capture('10-classement', () => expect(page.getByRole('list', { name: 'Podium' })).toBeVisible());
});
