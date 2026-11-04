// Tournois de La Coupe du Gang, côté admin (planche validée le 3 nov. 2026, écrans 11 et 12 ;
// contrat docs/fonctions/coupe-tournois-contrat.md, sections 3.4 et 6) : liste dans Admin → La Coupe
// du Gang, créer (contrôles de l'app et erreurs du serveur), modifier, suivre en direct (matchs en
// jeu, match qui attend un joueur), déclarer forfait, faire rejouer, retirer un joueur, annuler
// avec confirmation, drapeau éteint (ni section ni lecture), panne réseau, 320 et 390 px, console.
// Faux serveur : `api.tournois` (e2e/support/fauxTournois.js).
import { test, expect, RESEAU_COUPE } from './support/test.js';
import { ADMIN } from './support/donnees.js';
import { jour } from './support/temps.js';
import { JOUEURS_TOURNOI } from './support/fauxTournois.js';
import { attendreSansDebordement, toast } from './support/outils.js';

const CHEMIN_PARAMETRES = '/api/apps/public/prod/public-settings/by-id/prod';
const section = (page) => page.getByRole('region', { name: 'Tournois' });
const titre = (page, nom) => page.getByRole('heading', { level: 1, name: nom });
const nomDe = (cle) => JOUEURS_TOURNOI.find((j) => j.cle === cle)?.nom;
const appelsTournois = (api) => api.requetes.filter((r) => /^\/coupe\/(admin\/)?tournaments/.test(r.chemin));
/** Ligne d'un match du tableau (« Quart 2 · fini »…). */
const ligne = (page, texte) => page.getByRole('region', { name: 'Tableau' }).getByRole('listitem').filter({ hasText: texte });

/** Ouvre le suivi d'un tournoi depuis la liste. */
async function suivre(page, nom) {
  await page.goto('/admin/coupe');
  await section(page).getByRole('button', { name: new RegExp(nom) }).click();
  await expect(titre(page, nom)).toBeVisible();
}

test.describe('Tournois admin : liste', () => {
  test('en cours, à venir, terminés et annulés, avec inscrits et présents ; un tournoi ouvre son suivi', async ({ page, api, connecter }) => {
    api.tournois.creer({ etat: 'inscriptions', nom: 'Coupe de Décembre', attente: 2, inscrits: 8 });
    api.tournois.creer({ etat: 'presence', nom: 'Coupe Express', inscrits: 5 });
    const enCours = api.tournois.creer({ etat: 'tableau', nom: 'Coupe de Novembre' });
    api.tournois.creer({ etat: 'fini', nom: 'Coupe d’Octobre', debut: Date.now() - 20 * 86_400_000 });
    api.tournois.creer({ etat: 'annule', nom: 'Coupe annulée', raison: 'not_enough' });
    await connecter(ADMIN);
    await page.goto('/admin/coupe');

    const liste = section(page);
    await expect(liste.getByRole('heading', { name: 'Tournois' })).toBeVisible();
    // Au-dessus des chiffres de la Coupe
    const y = async (loc) => (await loc.boundingBox()).y;
    await expect(page.getByRole('region', { name: 'Aujourd’hui' })).toBeVisible();
    expect(await y(liste)).toBeLessThan(await y(page.getByRole('region', { name: 'Aujourd’hui' })));

    const item = (nom) => liste.getByRole('button', { name: new RegExp(nom) });
    await expect(item('Coupe de Novembre')).toContainText('En cours');
    await expect(item('Coupe de Décembre')).toContainText('Inscriptions');
    await expect(item('Coupe de Décembre')).toContainText('8/8 inscrits · 2 en attente');
    await expect(item('Coupe de Décembre')).not.toContainText('présent');
    await expect(item('Coupe Express')).toContainText('Présence');
    await expect(item('Coupe Express')).toContainText('5/8 inscrits · 4 présents');
    await expect(item('Coupe d’Octobre')).toContainText('Fini');
    await expect(item('Coupe annulée')).toContainText('Annulé');
    // Ordre : en cours, à venir (début croissant), puis terminés et annulés
    const ordre = await liste.getByRole('listitem').allInnerTexts();
    expect(ordre.map((x) => x.split('\n')[0])).toEqual(['Coupe de Novembre', 'Coupe Express', 'Coupe de Décembre', 'Coupe annulée', 'Coupe d’Octobre']);

    // Suivi dans l'adresse, retour du navigateur = la liste
    await item('Coupe de Novembre').click();
    await expect(titre(page, 'Coupe de Novembre')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/admin/coupe\\?tournoi=${enCours.id}$`));
    await page.getByRole('button', { name: 'Retour aux tournois' }).click();
    await expect(liste).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/coupe$/);
    await item('Coupe de Novembre').click();
    await page.goBack();
    await expect(liste).toBeVisible();
    await expect(page.getByText('Paires qui jouent le plus ensemble')).toBeVisible();
  });

  test('aucun tournoi : message et « Nouveau tournoi »', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    await page.goto('/admin/coupe');
    await expect(section(page)).toContainText('Aucun tournoi pour le moment');
    await expect(section(page).getByRole('button', { name: 'Nouveau tournoi' })).toBeVisible();
    expect(api.requetesVers('GET', '/coupe/admin/tournaments').length).toBeGreaterThan(0);
  });
});

test.describe('Tournois admin : créer et modifier', () => {
  test('contrôles de l\'app, erreur du serveur affichée telle quelle, puis publié et suivi', async ({ page, api, connecter }) => {
    let refus = 1;
    api.surcharger('POST', '/coupe/admin/tournaments', () => {
      if (refus <= 0) return undefined;
      refus -= 1;
      return { status: 400, json: { error: 'Un autre tournoi est déjà prévu à cette heure-là', code: 'bad_time' } };
    });
    await connecter(ADMIN);
    await page.goto('/admin/coupe');
    await section(page).getByRole('button', { name: 'Nouveau tournoi' }).click();

    const fenetre = page.getByRole('dialog', { name: 'Nouveau tournoi' });
    await expect(fenetre).toBeVisible();
    await expect(fenetre.getByLabel('Nom', { exact: true })).toHaveValue(/^Coupe d/);
    await expect(fenetre.getByLabel('Heure (20:00 au plus tard)')).toHaveValue('19:00');
    await expect(fenetre.getByRole('button', { name: '8 · ~30 min' })).toHaveAttribute('aria-pressed', 'true');
    await expect(fenetre.getByRole('switch', { name: 'Prévenir les joueurs de la Coupe maintenant' })).toHaveAttribute('aria-checked', 'true');
    await expect(fenetre).toContainText('Ouvert à tout le monde : clients, barbers, salon');
    await expect(fenetre).toContainText('Aucune notification ne part entre 21:00 et 08:00');
    await expect(fenetre).toContainText('présence de 18:45 à 19:00 · ~30 min, fini vers 19:30');
    const publier = fenetre.getByRole('button', { name: 'Publier le tournoi' });
    const alerte = fenetre.getByRole('alert');

    // Contrôles de l'app : rien ne part
    await fenetre.getByLabel('Nom', { exact: true }).fill('   ');
    await publier.click();
    await expect(alerte).toHaveText('Donnez un nom au tournoi.');
    await fenetre.getByLabel('Nom', { exact: true }).fill('Coupe du Mardi');
    await fenetre.getByLabel('Jour', { exact: true }).fill(jour(2));
    await fenetre.getByLabel('Heure (20:00 au plus tard)').fill('21:00');
    await publier.click();
    await expect(alerte).toContainText('entre 08:00 et 20:00');
    // Aujourd'hui 10:15 (il est 10:00) : moins de 30 min
    await fenetre.getByLabel('Jour', { exact: true }).fill(jour(0));
    await fenetre.getByLabel('Heure (20:00 au plus tard)').fill('10:15');
    await publier.click();
    await expect(alerte).toContainText('au moins 30 min après maintenant');
    expect(api.requetesVers('POST', '/coupe/admin/tournaments')).toHaveLength(0);

    // 16 joueurs, sans prévenir, jour J+2 à 19:00 : le serveur refuse une première fois
    await fenetre.getByLabel('Jour', { exact: true }).fill(jour(2));
    await fenetre.getByLabel('Heure (20:00 au plus tard)').fill('19:00');
    await fenetre.getByRole('button', { name: '16 · ~40 min' }).click();
    await expect(fenetre).toContainText('~40 min, fini vers 19:40');
    await fenetre.getByRole('switch', { name: 'Prévenir les joueurs de la Coupe maintenant' }).click();
    await publier.click();
    await expect(alerte).toHaveText('Un autre tournoi est déjà prévu à cette heure-là');
    await expect(publier).toBeEnabled();

    await publier.click();
    await expect(toast(page, 'Tournoi publié')).toBeVisible();
    expect(api.requetesVers('POST', '/coupe/admin/tournaments').at(-1).corps).toEqual({
      name: 'Coupe du Mardi', starts_at: `${jour(2)}T19:00`, size: 16, notify: false,
    });
    const cree = api.tournois.liste.find((t) => t.name === 'Coupe du Mardi');
    expect(cree).toMatchObject({ size: 16, notify: false, status: 'open' });
    // Le suivi du nouveau tournoi s'ouvre
    await expect(fenetre).toHaveCount(0);
    await expect(titre(page, 'Coupe du Mardi')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Chiffres du tournoi' })).toContainText('0/16');
    await page.getByRole('button', { name: 'Retour aux tournois' }).click();
    await expect(section(page).getByRole('button', { name: /Coupe du Mardi/ })).toContainText('0/16 inscrits');
  });

  test('prévenir les joueurs : la case part dans la demande', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    await page.goto('/admin/coupe');
    await section(page).getByRole('button', { name: 'Nouveau tournoi' }).click();
    const fenetre = page.getByRole('dialog', { name: 'Nouveau tournoi' });
    await fenetre.getByLabel('Nom', { exact: true }).fill('Coupe Flash');
    await fenetre.getByLabel('Jour', { exact: true }).fill(jour(1));
    await fenetre.getByRole('button', { name: 'Publier le tournoi' }).click();
    await expect(toast(page, 'Tournoi publié, les joueurs sont prévenus')).toBeVisible();
    expect(api.requetesVers('POST', '/coupe/admin/tournaments').at(-1).corps).toEqual({
      name: 'Coupe Flash', starts_at: `${jour(1)}T19:00`, size: 8, notify: true,
    });
  });

  test('modifier le nom et l\'heure tant qu\'il est ouvert : seuls les champs changés partent', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'inscriptions', nom: 'Coupe de Décembre' });
    let refus = 1;
    api.surcharger('PATCH', `/coupe/admin/tournaments/${t.id}`, () => {
      if (refus <= 0) return undefined;
      refus -= 1;
      return { status: 409, json: { error: 'Le tournoi a commencé : il ne se modifie plus', code: 'closed' } };
    });
    await connecter(ADMIN);
    // Lien direct vers le suivi
    await page.goto(`/admin/coupe?tournoi=${t.id}`);
    await expect(titre(page, 'Coupe de Décembre')).toBeVisible();
    await page.getByRole('button', { name: 'Modifier le nom ou l’heure' }).click();

    const fenetre = page.getByRole('dialog', { name: 'Modifier le tournoi' });
    await expect(fenetre.getByLabel('Nom', { exact: true })).toHaveValue('Coupe de Décembre');
    await expect(fenetre.getByLabel('Jour', { exact: true })).toHaveValue(jour(3));
    await expect(fenetre.getByLabel('Heure (20:00 au plus tard)')).toHaveValue('19:00');
    await expect(fenetre).toContainText('8 joueurs · ~30 min (ne se change plus)');
    await expect(fenetre.getByRole('switch')).toHaveCount(0);

    await fenetre.getByLabel('Nom', { exact: true }).fill('Coupe de Noël');
    await fenetre.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(fenetre.getByRole('alert')).toHaveText('Le tournoi a commencé : il ne se modifie plus');
    expect(api.requetesVers('PATCH', `/coupe/admin/tournaments/${t.id}`).at(-1).corps).toEqual({ name: 'Coupe de Noël' });

    await fenetre.getByLabel('Heure (20:00 au plus tard)').fill('18:30');
    await fenetre.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(toast(page, 'Tournoi modifié')).toBeVisible();
    expect(api.requetesVers('PATCH', `/coupe/admin/tournaments/${t.id}`).at(-1).corps).toEqual({
      name: 'Coupe de Noël', starts_at: `${jour(3)}T18:30`,
    });
    await expect(titre(page, 'Coupe de Noël')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Chiffres du tournoi' })).toContainText('18:30');

    // Sans lien d'origine : le retour mène à la liste
    await page.getByRole('button', { name: 'Retour aux tournois' }).click();
    await expect(section(page).getByRole('button', { name: /Coupe de Noël/ })).toBeVisible();
  });

  test('tournoi en cours : ni « Modifier » ni nouvelle inscription possible', async ({ page, api, connecter }) => {
    api.tournois.creer({ etat: 'tableau', nom: 'Coupe de Novembre' });
    await connecter(ADMIN);
    await suivre(page, 'Coupe de Novembre');
    await expect(page.getByRole('region', { name: 'Tableau' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Modifier le nom ou l’heure' })).toHaveCount(0);
  });
});

test.describe('Tournois admin : suivre en direct', () => {
  test('chiffres, match en jeu, match qui attend un joueur avec son échéance, puis forfait déclaré', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tableau', nom: 'Coupe de Novembre' });
    const q2 = api.tournois.direct(t.id, { tour: 1, place: 1 }, { sc: [3, 2] });
    const q3 = api.tournois.direct(t.id, { tour: 1, place: 2 }, { present: [true, false], playing: false });
    const q4 = api.tournois.match(t.id, { tour: 1, place: 3 });
    await connecter(ADMIN);
    await suivre(page, 'Coupe de Novembre');

    await expect(page.getByText('Quarts', { exact: true })).toBeVisible();
    const chiffres = page.getByRole('group', { name: 'Chiffres du tournoi' });
    await expect(chiffres).toContainText('7joueurs');
    await expect(chiffres).toContainText('0matchs joués');
    await expect(chiffres).toContainText('1en direct');
    await expect(chiffres).toContainText(/fin ~\d{2}:\d{2}/);

    const direct = page.getByRole('region', { name: 'En direct' });
    await expect(direct).toContainText(`${nomDe(q2.p[0])} – ${nomDe(q2.p[1])}`);
    await expect(direct).toContainText('3 – 2');
    await expect(direct).toContainText('Un match coupé par le serveur se relance tout seul');

    // Quart 3 : un seul joueur dans la salle ; Quart 4 : personne
    const attente3 = page.getByRole('region', { name: 'Quart 3 en attente' });
    await expect(attente3).toContainText(`${nomDe(q3.p[1])} n’a pas encore rejoint son match contre ${nomDe(q3.p[0])}`);
    await expect(attente3).toContainText(/\d:\d{2} \/ 2:00/);
    const attente4 = page.getByRole('region', { name: 'Quart 4 en attente' });
    await expect(attente4).toContainText(`Ni ${nomDe(q4.p[0])} ni ${nomDe(q4.p[1])}`);
    await expect(attente4).toContainText('le vainqueur est tiré au sort');
    // Le compte à rebours avance (heure du serveur)
    const avant = await attente3.getByText(/\/ 2:00/).innerText();
    await expect(attente3.getByText(/\/ 2:00/)).not.toHaveText(avant, { timeout: 4000 });

    // Tableau : l'exempt passe d'office, le match en jeu, ceux qui attendent
    await expect(ligne(page, 'Quart 1 · exempt')).toContainText('passe d’office');
    await expect(ligne(page, 'Quart 2 · en direct')).toContainText('3 – 2');
    await expect(ligne(page, 'Quart 3 · en attente')).toBeVisible();
    await expect(ligne(page, 'Demie 1 · à venir')).toBeVisible();

    // Déclarer forfait : « Retour » ne fait rien, puis le joueur présent passe
    await attente3.getByRole('button', { name: 'Déclarer forfait' }).click();
    const choix = page.getByRole('alertdialog', { name: 'Déclarer forfait · Quart 3' });
    await choix.getByRole('button', { name: 'Retour' }).click();
    await expect(choix).toHaveCount(0);
    await attente3.getByRole('button', { name: 'Déclarer forfait' }).click();
    await expect(choix.getByRole('button', { name: `${nomDe(q3.p[1])} passe` })).toBeVisible();
    await choix.getByRole('button', { name: `${nomDe(q3.p[0])} passe (dans la salle)` }).click();
    await expect(toast(page, `${nomDe(q3.p[0])} passe au tour suivant`)).toBeVisible();
    expect(api.requetesVers('POST', `/coupe/admin/tournaments/${t.id}/matches/${q3.id}/winner`).at(-1).corps).toEqual({ side: 0 });
    expect(api.tournois.match(t.id, q3.id)).toMatchObject({ status: 'done', winner: 0, reason: 'admin' });
    await expect(attente3).toHaveCount(0);
    await expect(ligne(page, 'Quart 3 · fini')).toContainText('forfait déclaré par le salon');
    await expect(chiffres).toContainText('1matchs joués');

    // Forfait sur un match en jeu, depuis le tableau
    await ligne(page, 'Quart 2 · en direct').getByRole('button', { name: 'Déclarer forfait' }).click();
    await page.getByRole('alertdialog', { name: 'Déclarer forfait · Quart 2' }).getByRole('button', { name: `${nomDe(q2.p[1])} passe` }).click();
    await expect(toast(page, `${nomDe(q2.p[1])} passe au tour suivant`)).toBeVisible();
    expect(api.requetesVers('POST', `/coupe/admin/tournaments/${t.id}/matches/${q2.id}/winner`).at(-1).corps).toEqual({ side: 1 });
  });

  test('relu toutes les 3 s : un match lancé et un score qui change apparaissent seuls', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tableau', nom: 'Coupe de Novembre' });
    await connecter(ADMIN);
    await suivre(page, 'Coupe de Novembre');
    const direct = page.getByRole('region', { name: 'En direct' });
    await expect(direct).toContainText('Aucun match en jeu pour le moment');
    const q2 = api.tournois.direct(t.id, { tour: 1, place: 1 }, { sc: [1, 0] });
    await expect(direct).toContainText('1 – 0', { timeout: 6000 });
    q2.live.sc = [2, 2];
    await expect(direct).toContainText('2 – 2', { timeout: 6000 });
    await expect(page.getByRole('region', { name: 'Quart 2 en attente' })).toHaveCount(0);
  });

  test('faire rejouer un match fini (confirmation, refus du serveur affiché) ; plus possible une fois le suivant joué', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tableau', nom: 'Coupe de Novembre' });
    const q2 = api.tournois.finir(t.id, { tour: 1, place: 1 }, { sc: [5, 3], gagnant: 0 });
    api.tournois.finir(t.id, { tour: 1, place: 2 }, { sc: [5, 1], gagnant: 0 });
    api.tournois.finir(t.id, { tour: 1, place: 3 }, { sc: [2, 5], gagnant: 1 });
    // Demie 2 jouée : les quarts 3 et 4 ne se rejouent plus
    api.tournois.finir(t.id, { tour: 2, place: 1 }, { sc: [5, 4], gagnant: 0 });
    let refus = 1;
    api.surcharger('POST', `/coupe/admin/tournaments/${t.id}/matches/${q2.id}/replay`, () => {
      if (refus <= 0) return undefined;
      refus -= 1;
      return { status: 409, json: { error: 'Le match suivant a déjà commencé', code: 'not_replayable' } };
    });
    await connecter(ADMIN);
    await suivre(page, 'Coupe de Novembre');

    await expect(ligne(page, 'Quart 3 · fini')).toContainText('5 – 1');
    await expect(ligne(page, 'Quart 3 · fini').getByRole('button', { name: 'Faire rejouer' })).toHaveCount(0);
    await expect(ligne(page, 'Quart 4 · fini').getByRole('button', { name: 'Faire rejouer' })).toHaveCount(0);
    await expect(ligne(page, 'Demie 2 · fini')).toBeVisible();
    const quart2 = ligne(page, 'Quart 2 · fini');
    await expect(quart2).toContainText(`${nomDe(q2.p[0])} 5 – 3 ${nomDe(q2.p[1])}`);

    await quart2.getByRole('button', { name: 'Faire rejouer' }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Faire rejouer quart 2 ?' });
    await expect(confirmation).toContainText('le résultat est effacé et le vainqueur retiré du tour suivant');
    await confirmation.getByRole('button', { name: 'Retour' }).click();
    await expect(confirmation).toHaveCount(0);
    expect(api.requetesVers('POST', `/coupe/admin/tournaments/${t.id}/matches/${q2.id}/replay`)).toHaveLength(0);

    // Le serveur refuse une première fois : son message, la fenêtre reste ouverte
    await quart2.getByRole('button', { name: 'Faire rejouer' }).click();
    await confirmation.getByRole('button', { name: 'Faire rejouer' }).click();
    await expect(toast(page, 'Le match suivant a déjà commencé')).toBeVisible();
    await expect(confirmation.getByRole('button', { name: 'Faire rejouer' })).toBeEnabled();

    await confirmation.getByRole('button', { name: 'Faire rejouer' }).click();
    await expect(toast(page, 'Match à rejouer')).toBeVisible();
    expect(api.requetesVers('POST', `/coupe/admin/tournaments/${t.id}/matches/${q2.id}/replay`)).toHaveLength(2);
    expect(api.tournois.match(t.id, q2.id).status).toBe('ready');
    await expect(confirmation).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Quart 2 en attente' })).toBeVisible();
    await expect(ligne(page, 'Quart 2 · en attente')).toBeVisible();
    await expect(ligne(page, 'Demie 1 · à venir')).toBeVisible();
  });

  test('tournoi fini : podium et tableau, sans action', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'fini', nom: 'Coupe d’Octobre' });
    await connecter(ADMIN);
    await suivre(page, 'Coupe d’Octobre');
    const interne = api.tournois.tournoi(t.id);
    await expect(page.getByText('Fini', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Podium' })).toContainText(`Champion ${nomDe(interne.champion)}`);
    await expect(page.getByRole('region', { name: 'Tableau' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Faire rejouer' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Déclarer forfait' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Annuler le tournoi' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Voir la page du tournoi' })).toHaveAttribute('href', `/coupe/tournoi/${t.id}`);
  });
});

test.describe('Tournois admin : retirer, annuler', () => {
  test('retirer un joueur avant le tirage : sa place va au premier de la liste d\'attente', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'inscriptions', nom: 'Coupe de Décembre', inscrits: 8, attente: 1 });
    await connecter(ADMIN);
    await suivre(page, 'Coupe de Décembre');
    const joueurs = page.getByRole('region', { name: 'Joueurs' });
    await expect(joueurs).toContainText('Liste d’attente : 1');
    await expect(joueurs.getByRole('listitem')).toHaveCount(9);
    await expect(joueurs.getByRole('link', { name: 'Voir la page du tournoi' })).toHaveAttribute('href', `/coupe/tournoi/${t.id}`);

    await joueurs.getByRole('button', { name: 'Retirer un joueur' }).click();
    const liste = page.getByRole('dialog', { name: 'Retirer un joueur' });
    await expect(liste.getByRole('listitem')).toHaveCount(9);
    await liste.getByRole('button', { name: 'Retirer Lucas M.' }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Retirer Lucas M. du tournoi ?' });
    await expect(confirmation).toContainText('le premier qui y attend la prend');
    await confirmation.getByRole('button', { name: 'Retirer' }).click();
    await expect(toast(page, 'Lucas M. est retiré du tournoi')).toBeVisible();
    expect(api.requetesVers('POST', `/coupe/admin/tournaments/${t.id}/players/joueur-lucas/remove`)).toHaveLength(1);
    await expect(joueurs).toContainText('Liste d’attente : 0');
    await expect(joueurs.getByRole('listitem')).toHaveCount(8);
    await expect(joueurs).not.toContainText('Lucas M.');
  });

  test('retirer un joueur pendant le tournoi : seuls ceux encore en lice, son match perdu par forfait', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tableau', nom: 'Coupe de Novembre' });
    const q4 = api.tournois.finir(t.id, { tour: 1, place: 3 }, { sc: [5, 0], gagnant: 0 });
    const q2 = api.tournois.match(t.id, { tour: 1, place: 1 });
    await connecter(ADMIN);
    await suivre(page, 'Coupe de Novembre');

    await page.getByRole('region', { name: 'Joueurs' }).getByRole('button', { name: 'Retirer un joueur' }).click();
    const liste = page.getByRole('dialog', { name: 'Retirer un joueur' });
    // 7 joueurs, un éliminé
    await expect(liste.getByRole('listitem')).toHaveCount(6);
    await expect(liste).not.toContainText(nomDe(q4.p[1]));
    await liste.getByRole('button', { name: `Retirer ${nomDe(q2.p[0])}` }).click();
    const confirmation = page.getByRole('alertdialog', { name: `Retirer ${nomDe(q2.p[0])} du tournoi ?` });
    await expect(confirmation).toContainText('Il perd son match en cours (ou le prochain) par forfait');
    await confirmation.getByRole('button', { name: 'Retirer' }).click();
    await expect(toast(page, `${nomDe(q2.p[0])} est retiré du tournoi`)).toBeVisible();
    expect(api.tournois.match(t.id, q2.id)).toMatchObject({ status: 'done', winner: 1, reason: 'admin' });
    await expect(ligne(page, 'Quart 2 · fini')).toContainText('forfait déclaré par le salon');
  });

  test('annuler le tournoi : confirmation, « Garder le tournoi » ne fait rien', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'inscriptions', nom: 'Coupe de Décembre' });
    await connecter(ADMIN);
    await suivre(page, 'Coupe de Décembre');

    await page.getByRole('button', { name: 'Annuler le tournoi' }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Annuler « Coupe de Décembre » ?' });
    await expect(confirmation).toContainText('Les inscrits sont prévenus');
    await confirmation.getByRole('button', { name: 'Garder le tournoi' }).click();
    await expect(confirmation).toHaveCount(0);
    expect(api.requetesVers('POST', `/coupe/admin/tournaments/${t.id}/cancel`)).toHaveLength(0);
    expect(api.tournois.tournoi(t.id).status).toBe('open');

    await page.getByRole('button', { name: 'Annuler le tournoi' }).click();
    await confirmation.getByRole('button', { name: 'Annuler le tournoi' }).click();
    await expect(toast(page, 'Tournoi annulé')).toBeVisible();
    expect(api.requetesVers('POST', `/coupe/admin/tournaments/${t.id}/cancel`)).toHaveLength(1);
    expect(api.tournois.tournoi(t.id)).toMatchObject({ status: 'cancelled', cancel_reason: 'admin' });
    await expect(page.getByRole('status').filter({ hasText: 'Annulé par le salon' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Annuler le tournoi' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Modifier le nom ou l’heure' })).toHaveCount(0);
  });
});

test.describe('Tournois admin : drapeau et réseau', () => {
  for (const [nom, valeur] of [['faux (COUPE_TOURNOIS=off)', false], ['absent (serveur plus ancien)', undefined]]) {
    test(`features.coupeTournaments ${nom} : ni section ni lecture des tournois, même par un lien de suivi`, async ({ page, api, connecter }) => {
      const t = api.tournois.creer({ etat: 'inscriptions' });
      if (valeur === undefined) delete api.donnees.parametresPublics.features.coupeTournaments;
      else api.donnees.parametresPublics.features.coupeTournaments = valeur;
      await connecter(ADMIN);
      await page.goto(`/admin/coupe?tournoi=${t.id}`);
      await expect(page.getByText('Paires qui jouent le plus ensemble')).toBeVisible();
      await expect.poll(() => api.requetesVers('GET', CHEMIN_PARAMETRES).length).toBeGreaterThan(0);
      await page.evaluate(() => new Promise((fin) => requestAnimationFrame(() => requestAnimationFrame(() => fin()))));
      await expect(page.getByRole('heading', { level: 1, name: 'La Coupe du Gang' })).toBeVisible();
      await expect(section(page)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Nouveau tournoi' })).toHaveCount(0);
      expect(appelsTournois(api)).toEqual([]);
    });
  }

  test('jeu coupé (features.coupe faux) : aucune section des tournois', async ({ page, api, connecter }) => {
    api.donnees.parametresPublics.features.coupe = false;
    await connecter(ADMIN);
    await page.goto('/admin/coupe');
    await expect(page.getByText('Le jeu est coupé')).toBeVisible();
    await expect(section(page)).toHaveCount(0);
    expect(appelsTournois(api)).toEqual([]);
  });

  test('liste hors connexion : « Pas de connexion internet » puis Réessayer', async ({ page, api, connecter }) => {
    api.tournois.creer({ etat: 'inscriptions', nom: 'Coupe de Décembre' });
    let horsLigne = true;
    api.surcharger('GET', '/coupe/admin/tournaments', () => (horsLigne ? RESEAU_COUPE : undefined));
    await connecter(ADMIN);
    await page.goto('/admin/coupe');
    const alerte = section(page).getByRole('alert');
    await expect(alerte).toContainText('Pas de connexion internet');
    await expect(page.getByText('Failed to fetch')).toHaveCount(0);
    // Le reste de la page s'affiche
    await expect(page.getByText('Paires qui jouent le plus ensemble')).toBeVisible();
    horsLigne = false;
    await alerte.getByRole('button', { name: 'Réessayer' }).click();
    await expect(section(page).getByRole('button', { name: /Coupe de Décembre/ })).toBeVisible();
  });

  test('envois hors connexion : « Pas de connexion », le bouton revient, rien de faux à l\'écran', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'inscriptions', nom: 'Coupe de Décembre' });
    api.surcharger('POST', '/coupe/admin/tournaments', () => RESEAU_COUPE);
    api.surcharger('POST', `/coupe/admin/tournaments/${t.id}/cancel`, () => RESEAU_COUPE);
    await connecter(ADMIN);
    await page.goto('/admin/coupe');

    // Créer : la réponse est perdue, le tournoi a peut-être été publié
    await section(page).getByRole('button', { name: 'Nouveau tournoi' }).click();
    const fenetre = page.getByRole('dialog', { name: 'Nouveau tournoi' });
    await fenetre.getByLabel('Jour', { exact: true }).fill(jour(2));
    await fenetre.getByRole('button', { name: 'Publier le tournoi' }).click();
    await expect(fenetre.getByRole('alert')).toContainText('Pas de connexion internet : le tournoi a peut-être déjà été publié');
    await expect(fenetre.getByRole('button', { name: 'Publier le tournoi' })).toBeEnabled();
    await fenetre.getByRole('button', { name: 'Close' }).click();
    await expect(fenetre).toHaveCount(0);

    // Annuler : coupure, la fenêtre reste ouverte et le bouton revient
    await section(page).getByRole('button', { name: /Coupe de Décembre/ }).click();
    await page.getByRole('button', { name: 'Annuler le tournoi' }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Annuler « Coupe de Décembre » ?' });
    await confirmation.getByRole('button', { name: 'Annuler le tournoi' }).click();
    await expect(toast(page, 'Pas de connexion internet')).toBeVisible();
    await expect(confirmation.getByRole('button', { name: 'Annuler le tournoi' })).toBeEnabled();
    expect(api.tournois.tournoi(t.id).status).toBe('open');
  });

  test('suivi : coupure pendant le tournoi, les derniers chiffres restent avec un avertissement', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tableau', nom: 'Coupe de Novembre' });
    let horsLigne = false;
    api.surcharger('GET', `/coupe/tournaments/${t.id}`, () => (horsLigne ? RESEAU_COUPE : undefined));
    await connecter(ADMIN);
    await suivre(page, 'Coupe de Novembre');
    await expect(page.getByRole('region', { name: 'Tableau' })).toBeVisible();
    horsLigne = true;
    await expect(page.getByRole('status').filter({ hasText: 'Pas de connexion : les chiffres ne sont plus à jour' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('region', { name: 'Tableau' })).toBeVisible();
    horsLigne = false;
    await expect(page.getByRole('status').filter({ hasText: 'Pas de connexion' })).toHaveCount(0, { timeout: 10000 });
  });
});

for (const largeur of [320, 390]) {
  test.describe(`Tournois admin à ${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: 760 } });

    test(`liste, création, suivi en direct et retrait sans défilement horizontal ni erreur dans la console à ${largeur} px`, async ({ page, api, connecter, journal }) => {
      const nom = 'Coupe de Novembre des Gros Dégradés du Gang';
      api.tournois.creer({ etat: 'inscriptions', taille: 16, nom: 'Coupe de Décembre des Lames', inscrits: 16, attente: 2 });
      const enCours = api.tournois.creer({ etat: 'tableau', taille: 16, nom });
      api.tournois.direct(enCours.id, { tour: 1, place: 1 }, { sc: [3, 2] });
      api.tournois.direct(enCours.id, { tour: 1, place: 2 }, { present: [true, false], playing: false });
      api.tournois.finir(enCours.id, { tour: 1, place: 3 }, { sc: [3, 3], so: [3, 2], gagnant: 0, raison: 'shootout' });
      api.tournois.creer({ etat: 'fini', nom: 'Coupe d’Octobre' });
      await connecter(ADMIN);

      await page.goto('/admin/coupe');
      await expect(section(page).getByRole('button', { name: /Gros Dégradés/ })).toBeVisible();
      await attendreSansDebordement(page, 'la liste des tournois');

      await section(page).getByRole('button', { name: 'Nouveau tournoi' }).click();
      const fenetre = page.getByRole('dialog', { name: 'Nouveau tournoi' });
      await expect(fenetre.getByRole('button', { name: 'Publier le tournoi' })).toBeVisible();
      await attendreSansDebordement(page, 'la création d\'un tournoi');
      await fenetre.getByRole('button', { name: 'Close' }).click();

      await section(page).getByRole('button', { name: /Gros Dégradés/ }).click();
      await expect(page.getByRole('region', { name: '8e de finale 3 en attente' })).toBeVisible();
      await expect(ligne(page, '8e de finale 4 · fini')).toContainText('tirs au but 3 – 2');
      await attendreSansDebordement(page, 'le suivi en direct');
      await page.getByRole('button', { name: 'Retirer un joueur' }).click();
      await expect(page.getByRole('dialog', { name: 'Retirer un joueur' })).toBeVisible();
      await attendreSansDebordement(page, 'le retrait d\'un joueur');
      await page.getByRole('dialog', { name: 'Retirer un joueur' }).getByRole('button', { name: 'Close' }).click();

      await page.getByRole('button', { name: 'Retour aux tournois' }).click();
      await section(page).getByRole('button', { name: /Coupe de Décembre des Lames/ }).click();
      await expect(page.getByRole('region', { name: 'Joueurs' })).toContainText('Liste d’attente : 2');
      await attendreSansDebordement(page, 'le suivi d\'un tournoi ouvert');
      expect(journal.console).toEqual([]);
    });
  });
}
