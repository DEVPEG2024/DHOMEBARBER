// Abonnements au mois, écrans du salon (contrat : docs/fonctions/abonnements-contrat.md, section 4).
// Tout se valide et se scanne sur l'ordinateur du salon, connecté en admin : à la souris, sur grand
// écran, avec une webcam, une douchette USB (qui tape le contenu du QR puis Entrée) ou sans lecteur.
//
// Les abonnements sont créés par `abonnement()` plutôt que par `api.abonnements.creer` tel quel : le
// faux serveur date ses RDV au jour réel, le navigateur vit le mardi de référence (`jour(0)`).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { test, expect, RESEAU_COUPE } from './support/test.js';
import { ADMIN, BARBERS, PRESTATIONS, rendezVous } from './support/donnees.js';
import { PRESTATIONS_ABONNEMENT } from './support/fauxAbonnements.js';
import { instantParis, jour } from './support/temps.js';
import { attendreSansDebordement, debordementHorizontal, libelleJour, toast } from './support/outils.js';

const LUCAS = { email: 'lucas.m@exemple.fr', full_name: 'Lucas M.', phone: '0612345678' };
const THOMAS = { email: 'thomas.r@exemple.fr', full_name: 'Thomas R.', phone: '0698765432' };
const ENZO = { email: 'enzo.b@exemple.fr', full_name: 'Enzo B.', phone: '0655443322' };
const { classiques, premium } = PRESTATIONS_ABONNEMENT;

const KEVIN = {
  id: 'user-kevin', email: 'kevin.compte@dhomebarber.fr', full_name: 'Kevin Barber', phone: '',
  role: 'barber', employee_id: BARBERS.kevin.id, permissions: ['agenda'],
};

const iso = (cle, heure = '09:00') => instantParis(cle, heure).toISOString();
const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const libelle = (n) => libelleJour(jour(n));
const qrDe = (code) => `https://dhomebarber.fr/admin/gift-cards?scan=${code}`;

/**
 * Abonnement prêt pour un test : ses 4 RDV à `jour(jours)`, puis toutes les semaines. `paye` (ou
 * `statut: 'active'`) : avec sa carte, payée aujourd'hui.
 */
function abonnement(api, { client = LUCAS, prestation = classiques, barber = BARBERS.kevin, jours = 9, heure = '17:00', statut = 'pending', moyen = 'cb' } = {}) {
  const vue = api.abonnements.creer({ client, prestation, barber, jours: 0, heure, statut, moyen });
  const rdv = api.tables.Appointment.filter((a) => a.subscription_id === vue.id).sort((a, b) => a.subscription_visit - b.subscription_visit);
  rdv.forEach((a, i) => { a.date = jour(jours + 7 * i); a.created_date = iso(jour(0), '09:30'); });
  const carte = (api.tables.GiftCard || []).find((c) => c.subscription_id === vue.id) || null;
  if (carte) Object.assign(carte, { validated_at: iso(jour(0)), created_at: iso(jour(0)), valid_until: jour(365) });
  return { id: vue.id, rdv, carte, ligne: api.abonnements.lignes.find((l) => l.id === vue.id) };
}

/** Une barbe de 15 € ajoutée dans l'agenda au RDV de la coupe : RDV à 40 €. */
function avecBarbe(rdv) {
  rdv.services = [...rdv.services, { service_id: PRESTATIONS.barbe.id, name: PRESTATIONS.barbe.name, duration: PRESTATIONS.barbe.duration, price: PRESTATIONS.barbe.price }];
  rdv.total_price = rdv.total_price + PRESTATIONS.barbe.price;
  return rdv;
}

/**
 * Même refus que `assertClosable` du vrai serveur : un RDV d'abonnement ne s'encaisse pas tant que sa coupe
 * n'est pas débitée, sauf abonnement annulé ou plus aucune coupe.
 */
function refusDuServeur(api) {
  api.surcharger('PUT', /^\/entities\/Appointment\//, (req) => {
    const rdv = api.tables.Appointment.find((a) => req.chemin.endsWith(`/${a.id}`));
    if (!rdv?.subscription_id) return undefined;
    const c = req.corps || {};
    const encaisse = ['cb', 'especes', 'mixte'].includes(c.payment_method) || c.payment_status === 'paid' || (c.status === 'completed' && c.payment_method !== 'carte_cadeau');
    if (!encaisse || Number(rdv.gift_card_amount) > 0) return undefined;
    const vue = api.abonnements.vue(rdv.subscription_id);
    if (vue.status === 'cancelled' || (vue.status === 'active' && vue.visits_left <= 0)) return undefined;
    return { status: 409, json: { error: 'Ce RDV est payé par l\'abonnement : scannez la carte du client sur l\'ordinateur du salon.', code: 'subscription_appointment' } };
  });
}

/** La première coupe déjà faite : solde 75 € sur 100 €, RDV clôturé par la carte. */
function coupeDejaFaite(ab) {
  ab.carte.remaining_balance = ab.carte.amount - ab.ligne.unit_price;
  Object.assign(ab.rdv[0], { status: 'completed', payment_method: 'carte_cadeau', payment_status: 'paid', gift_card_amount: ab.ligne.unit_price });
}

const caseDe = (page, nom) => page.getByRole('list').getByRole('listitem').filter({ hasText: nom });
const fenetre = (page, nom = /^Valider l'abonnement$/) => page.getByRole('dialog', { name: nom });
const ficheRdv = (page) => page.getByRole('dialog', { name: 'Détails du rendez-vous' });
const carteOuverte = (page) => page.getByRole('dialog', { name: /^Carte cadeau DHB/ });
const onglet = (page, nom) => page.getByRole('tab', { name: nom });
const chiffres = (page) => page.getByRole('region', { name: 'Chiffres', exact: true });
const ligneChiffres = (page, tableau, nom) => chiffres(page).getByRole('table', { name: tableau }).getByRole('row')
  .filter({ has: page.getByRole('rowheader', { name: nom }) });

async function ouvrirFicheDe(page, barber, nom) {
  await page.goto(`/admin/agenda?view=day&date=${jour(0)}`);
  await page.locator(`[data-drop-column="${barber.id}"]`).getByRole('button', { name: nom }).click();
  await expect(ficheRdv(page)).toBeVisible();
  return ficheRdv(page);
}

/** Aucune caméra sur cet ordinateur (le navigateur de test n'en a pas : on le rend certain). */
const sansCamera = (page) => page.addInitScript(() => {
  navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Aucune caméra', 'NotFoundError'); };
});

/**
 * Webcam simulée : une vidéo « prête » dont chaque image est le QR donné, tel que la carte du client
 * l'affiche. La lecture (jsQR) est la vraie.
 */
const cameraQuiVoit = (page, contenu) => page.addInitScript((svg) => {
  const taille = 320;
  const toile = document.createElement('canvas');
  toile.width = taille;
  toile.height = taille;
  const dessin = toile.getContext('2d', { willReadFrequently: true });
  const lire = CanvasRenderingContext2D.prototype.getImageData;
  let image = null;
  const qr = new Image();
  qr.onload = () => {
    dessin.fillStyle = '#ffffff';
    dessin.fillRect(0, 0, taille, taille);
    dessin.drawImage(qr, 20, 20, taille - 40, taille - 40);
    image = lire.call(dessin, 0, 0, taille, taille);
  };
  qr.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  navigator.mediaDevices.getUserMedia = async () => new MediaStream();
  HTMLMediaElement.prototype.play = async function play() {};
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => taille });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => taille });
  CanvasRenderingContext2D.prototype.getImageData = function getImageData(...args) {
    return image || lire.apply(this, args);
  };
}, renderToStaticMarkup(createElement(QRCodeSVG, { xmlns: 'http://www.w3.org/2000/svg', value: contenu, size: 280, level: 'M', includeMargin: true })));

test.describe('Drapeau éteint', () => {
  test('rien de nouveau nulle part, même avec des abonnements déjà en base', async ({ page, api, connecter }) => {
    test.slow(); // plusieurs pages à la suite : le temps de trois tests sur une machine chargée
    api.donnees.parametresPublics.features.subscriptions = false;
    const paye = abonnement(api, { statut: 'active', jours: 0 });
    await connecter(ADMIN);
    await page.setViewportSize({ width: 1366, height: 900 });

    await page.goto('/admin');
    await expect(chiffres(page)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Abonnements', exact: true })).toHaveCount(0);
    await expect(page.getByText(/abonnements? à valider/)).toHaveCount(0);
    await expect(page.getByText(/dont abonnements/)).toHaveCount(0);

    // L'écran n'existe pas : retour au tableau de bord
    await page.goto('/admin/subscriptions');
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto('/admin/gift-cards');
    await expect(page.getByRole('button', { name: 'Scanner' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Saisir le code' })).toHaveCount(0);
    await expect(page.getByText('DHB-ABO1-TEST')).toBeVisible();
    await expect(page.getByText('Abonnement', { exact: true })).toHaveCount(0);

    const fiche = await ouvrirFicheDe(page, BARBERS.kevin, /Lucas M\./);
    await expect(page.getByText(/^Abo /)).toHaveCount(0);
    await expect(fiche.getByTestId('rdv-abonnement')).toHaveCount(0);
    await expect(fiche.getByText('Mode de paiement')).toBeVisible();

    // Aucune route d'abonnement appelée pour un compte de l'équipe
    expect(api.requetesVers('GET', /^\/subscriptions/)).toEqual([]);
    expect(paye.carte.remaining_balance).toBe(100);
  });
});

test.describe('Page Abonnements', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(ADMIN);
  });

  test('menu de l\'admin, trois onglets, chaque abonnement à sa place', async ({ page, api }) => {
    test.slow(); // plusieurs pages à la suite : le temps de trois tests sur une machine chargée
    abonnement(api, { client: LUCAS, jours: 9 });
    abonnement(api, { client: THOMAS, prestation: premium, barber: BARBERS.dom, jours: 12 });
    const enCours = abonnement(api, { client: ENZO, statut: 'active', jours: 2 });
    coupeDejaFaite(enCours);
    const fini = abonnement(api, { client: { ...LUCAS, full_name: 'Marc Fini', email: 'marc@exemple.fr' }, statut: 'active', jours: -21 });
    fini.carte.remaining_balance = 0;
    fini.carte.status = 'used';
    const annule = abonnement(api, { client: { ...LUCAS, full_name: 'Paul Annulé', email: 'paul@exemple.fr' } });
    api.abonnements.annulation(annule.ligne);

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/admin');
    await page.getByRole('link', { name: 'Abonnements', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/subscriptions/);
    await expect(page.getByRole('heading', { name: 'Abonnements' })).toBeVisible();

    await expect(onglet(page, 'À valider (2)')).toHaveAttribute('aria-selected', 'true');
    await expect(onglet(page, 'En cours (1)')).toBeVisible();
    await expect(onglet(page, 'Terminés', { exact: true })).toBeVisible();
    const lucas = caseDe(page, 'Lucas M.');
    await expect(lucas).toContainText('100 €');
    await expect(lucas).toContainText('4 coupes classiques · Kevin');
    await expect(lucas).toContainText(`Premier RDV ${libelle(9)} à 17:00`);
    await expect(caseDe(page, 'Thomas R.')).toContainText('4 coupes premium · Dom');
    await expect(page.getByText('Enzo B.')).toHaveCount(0);

    await onglet(page, 'En cours (1)').click();
    const enzo = caseDe(page, 'Enzo B.');
    await expect(enzo).toContainText('3 coupes restantes');
    await expect(enzo).toContainText(`Prochain RDV ${libelle(9)} à 17:00`);
    await expect(page.getByText('Lucas M.')).toHaveCount(0);

    await onglet(page, 'Terminés').click();
    await expect(caseDe(page, 'Marc Fini')).toContainText('Terminé');
    await expect(caseDe(page, 'Paul Annulé')).toContainText('Annulé');

    // Fenêtre d'un abonnement en cours : coupes, solde, carte
    await onglet(page, 'En cours (1)').click();
    await caseDe(page, 'Enzo B.').getByRole('button').first().click();
    const f = fenetre(page, /^Abonnement$/);
    await expect(f).toContainText('3 coupes restantes');
    await expect(f).toContainText('solde 75 €');
    await expect(f.getByRole('link', { name: 'Ouvrir la carte' })).toBeVisible();
  });

  test('liste vide après une erreur : Réessayer, jamais « Aucun abonnement »', async ({ page, api }) => {
    api.surcharger('GET', '/subscriptions', () => RESEAU_COUPE);
    await page.goto('/admin/subscriptions');
    await expect(page.getByText('Pas de connexion internet')).toBeVisible();
    await expect(page.getByText('Aucun abonnement à valider.')).toHaveCount(0);
    api.surcharges.length = 0;
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByText('Aucun abonnement à valider.')).toBeVisible();
  });

  test('pastilles de date : moins de 48 h en orange, RDV déjà passé en rouge', async ({ page, api }) => {
    abonnement(api, { client: THOMAS, prestation: premium, barber: BARBERS.dom, jours: 1, heure: '10:30' }); // demain
    abonnement(api, { client: LUCAS, jours: 9 }); //                                                          loin
    abonnement(api, { client: { ...LUCAS, full_name: 'Sous 48h', email: 'a@exemple.fr' }, jours: 2, heure: '09:00' }); // 47 h
    abonnement(api, { client: { ...LUCAS, full_name: 'Sur 49h', email: 'b@exemple.fr' }, jours: 2, heure: '11:00' }); //  49 h
    abonnement(api, { client: ENZO, prestation: premium, jours: -1 }); //                                     hier, pas réglé
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/admin/subscriptions');

    const demain = caseDe(page, 'Thomas R.');
    await expect(demain).toHaveAttribute('data-urgence', 'bientot');
    await expect(demain).toContainText('Premier RDV demain à 10:30');
    await expect(caseDe(page, 'Lucas M.')).toHaveAttribute('data-urgence', 'normal');
    await expect(caseDe(page, 'Sous 48h')).toHaveAttribute('data-urgence', 'bientot');
    await expect(caseDe(page, 'Sur 49h')).toHaveAttribute('data-urgence', 'normal');

    const enzo = caseDe(page, 'Enzo B.');
    await expect(enzo).toHaveAttribute('data-urgence', 'pas-regle');
    await expect(enzo).toContainText('Pas réglé');
    await expect(enzo).toContainText(/Premier RDV passé hier, 120\s€ non réglés\./);
    await expect(enzo.getByRole('button', { name: 'Valider', exact: true })).toBeVisible();
    await expect(enzo.getByRole('button', { name: 'Annuler les RDV' })).toBeVisible();
    // Le plus urgent d'abord
    await expect(page.getByRole('list').getByRole('listitem').first()).toContainText('Enzo B.');
  });

  test('valider : aucun choix par défaut, CB puis Espèces, carte créée et ouverte', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, jours: 2 });
    const thomas = abonnement(api, { client: THOMAS, prestation: premium, barber: BARBERS.dom, jours: 12 });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/admin/subscriptions');

    await caseDe(page, 'Lucas M.').getByRole('button').first().click();
    const f = fenetre(page);
    await expect(f).toContainText('Lucas M.');
    await expect(f).toContainText('4 coupes classiques · Kevin');
    await expect(f.getByRole('link', { name: '0612345678' })).toBeVisible();
    await expect(f.getByRole('listitem')).toHaveCount(4);
    await expect(f.getByRole('listitem').first()).toContainText(majuscule(libelle(2)));
    await expect(f.getByTestId('abo-montant')).toHaveText(/^100\s€$/);
    await expect(f).toContainText('Une fois validé, une carte de 4 coupes est créée pour ce client. Il la voit dans l\'app et reçoit une notification.');
    const encaisser = f.getByRole('button', { name: 'Encaissé : créditer les 4 coupes' });
    await expect(encaisser).toBeDisabled();
    await expect(f.getByRole('button', { name: 'CB' })).toHaveAttribute('aria-pressed', 'false');
    await expect(f.getByRole('button', { name: 'Espèces' })).toHaveAttribute('aria-pressed', 'false');

    await f.getByRole('button', { name: 'CB' }).click();
    await encaisser.click();
    await expect(f.getByText('Carte créée')).toBeVisible();
    const carte = api.tables.GiftCard.find((c) => c.subscription_id === lucas.id);
    await expect(f.getByTestId('abo-code')).toHaveText(carte.code);
    expect(api.requetesVers('POST', `/subscriptions/${lucas.id}/validate`).at(-1).corps).toEqual({ payment_method: 'cb' });
    expect(carte).toMatchObject({ status: 'validated', amount: 100, remaining_balance: 100, payment_method: 'cb' });
    await expect(toast(page, 'Abonnement validé')).toBeVisible();

    // La liste suit : plus à valider, en cours
    await f.getByRole('button', { name: 'Terminer' }).click();
    await expect(onglet(page, 'À valider (1)')).toBeVisible();
    await expect(onglet(page, 'En cours (1)')).toBeVisible();

    await caseDe(page, 'Thomas R.').getByRole('button').first().click();
    const f2 = fenetre(page);
    await f2.getByRole('button', { name: 'Espèces' }).click();
    await f2.getByRole('button', { name: 'Encaissé : créditer les 4 coupes' }).click();
    await expect(f2.getByText('Carte créée')).toBeVisible();
    expect(api.tables.GiftCard.find((c) => c.subscription_id === thomas.id).payment_method).toBe('especes');

    // « Ouvrir la carte » : la fiche de la carte d'abonnement
    await f2.getByRole('link', { name: 'Ouvrir la carte' }).click();
    await expect(carteOuverte(page)).toContainText('4 coupes restantes');
    await expect(carteOuverte(page)).toContainText('4 coupes premium · solde 120 €');
  });

  test('double clic : une seule carte ; réponse perdue : le nouvel essai ne recrée rien', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS });
    const thomas = abonnement(api, { client: THOMAS, prestation: premium });
    await page.goto('/admin/subscriptions');

    await caseDe(page, 'Lucas M.').getByRole('button').first().click();
    let f = fenetre(page);
    await f.getByRole('button', { name: 'CB' }).click();
    await f.getByRole('button', { name: 'Encaissé : créditer les 4 coupes' }).dblclick();
    await expect(f.getByText('Carte créée')).toBeVisible();
    expect(api.requetesVers('POST', `/subscriptions/${lucas.id}/validate`)).toHaveLength(1);
    expect(api.tables.GiftCard.filter((c) => c.subscription_id === lucas.id)).toHaveLength(1);
    await f.getByRole('button', { name: 'Terminer' }).click();

    // Le serveur a validé mais la réponse n'arrive pas : même bouton, même carte
    let coupure = true;
    api.surcharger('POST', `/subscriptions/${thomas.id}/validate`, () => {
      if (!coupure) return undefined;
      coupure = false;
      api.abonnements.validation(thomas.ligne, { payment_method: 'cb' });
      return RESEAU_COUPE;
    });
    await caseDe(page, 'Thomas R.').getByRole('button').first().click();
    f = fenetre(page);
    await f.getByRole('button', { name: 'CB' }).click();
    await f.getByRole('button', { name: 'Encaissé : créditer les 4 coupes' }).click();
    await expect(toast(page, 'Pas de connexion internet')).toBeVisible();
    await f.getByRole('button', { name: 'Encaissé : créditer les 4 coupes' }).click();
    await expect(f.getByText('Carte créée')).toBeVisible();
    await expect(toast(page, 'Abonnement déjà validé : aucune seconde carte')).toBeVisible();
    expect(api.tables.GiftCard.filter((c) => c.subscription_id === thomas.id)).toHaveLength(1);
  });

  test('annuler un abonnement à régler : deux temps, RDV libérés, rien à rembourser', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS });
    await page.goto('/admin/subscriptions');
    await caseDe(page, 'Lucas M.').getByRole('button').first().click();
    const f = fenetre(page);
    await f.getByRole('button', { name: 'Annuler l\'abonnement et ses 4 RDV' }).click();
    // Rien n'est parti au premier clic
    expect(api.requetesVers('POST', `/subscriptions/${lucas.id}/cancel`)).toHaveLength(0);
    await expect(f.getByRole('alert')).toContainText('Annuler l\'abonnement et ses 4 RDV ?');
    await expect(f.getByRole('alert')).toContainText('Rien n\'a été encaissé : rien à rembourser.');
    // Pendant la confirmation, on ne valide pas
    await expect(f.getByRole('button', { name: 'Encaissé : créditer les 4 coupes' })).toHaveCount(0);
    await f.getByRole('button', { name: 'Garder' }).click();
    await expect(f.getByRole('button', { name: 'Encaissé : créditer les 4 coupes' })).toBeVisible();

    await f.getByRole('button', { name: 'Annuler l\'abonnement et ses 4 RDV' }).click();
    await f.getByRole('button', { name: 'Confirmer l\'annulation' }).click();
    const fin = page.getByTestId('abo-annule');
    await expect(fin).toContainText('Abonnement annulé');
    await expect(fin).toContainText('4 RDV annulés');
    await expect(fin).toContainText('Rien à rembourser.');
    expect(lucas.rdv.every((a) => a.status === 'cancelled')).toBe(true);
    await fin.getByRole('button', { name: 'Terminer' }).click();
    await expect(onglet(page, 'À valider (0)')).toBeVisible();
  });

  test('« Annuler les RDV » d\'un abonnement pas réglé : la confirmation s\'ouvre directement', async ({ page, api }) => {
    const enzo = abonnement(api, { client: ENZO, prestation: premium, jours: -1 });
    await page.goto('/admin/subscriptions');
    await caseDe(page, 'Enzo B.').getByRole('button', { name: 'Annuler les RDV' }).click();
    const f = fenetre(page);
    await expect(f.getByRole('alert')).toContainText('Annuler l\'abonnement et ses 4 RDV ?');
    await f.getByRole('button', { name: 'Confirmer l\'annulation' }).click();
    await expect(page.getByTestId('abo-annule')).toContainText('4 RDV annulés');
    expect(enzo.ligne.status).toBe('cancelled');
  });

  test('annuler un abonnement payé : le montant à rembourser annoncé avant et après', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: -7 });
    coupeDejaFaite(lucas);
    await page.goto('/admin/subscriptions?tab=active');
    await caseDe(page, 'Lucas M.').getByRole('button').first().click();
    const f = fenetre(page, /^Abonnement$/);
    await f.getByRole('button', { name: 'Annuler l\'abonnement et ses 3 RDV' }).click();
    await expect(f.getByTestId('abo-remboursement')).toHaveText(/À rembourser à la main : 75\s€/);
    await f.getByRole('button', { name: 'Confirmer l\'annulation' }).click();
    const fin = f.getByTestId('abo-annule');
    await expect(fin).toContainText('3 RDV annulés');
    await expect(fin).toContainText('À rembourser à la main au client');
    await expect(fin).toContainText(/75\s€/);
    expect(lucas.carte.status).toBe('expired');
    // La coupe déjà faite reste faite
    expect(lucas.rdv[0].status).toBe('completed');
    await f.getByRole('button', { name: 'Terminer' }).click();
    await onglet(page, 'Terminés').click();
    await expect(caseDe(page, 'Lucas M.')).toContainText('Annulé');
  });
});

test.describe('Annulation : refus et renvoi', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(ADMIN);
  });

  test('RDV passé pas clôturé (`past_visits_open`) : le message du serveur, la fenêtre reste ouverte', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: -1 });
    await page.goto('/admin/subscriptions?tab=active');
    await caseDe(page, 'Lucas M.').getByRole('button').first().click();
    const f = fenetre(page, /^Abonnement$/);
    await f.getByRole('button', { name: /Annuler l'abonnement et ses 4 RDV/ }).click();
    await f.getByRole('button', { name: 'Confirmer l\'annulation' }).click();
    await expect(f.getByTestId('abo-annulation-refus')).toContainText('Un RDV déjà passé n\'est pas clôturé : scannez la carte ou marquez-les absents, puis annulez l\'abonnement.');
    await expect(page.getByTestId('abo-annule')).toHaveCount(0);
    expect(lucas.ligne.status).toBe('active');
    expect(lucas.carte.status).toBe('validated');
    // « Garder » efface le refus
    await f.getByRole('button', { name: 'Garder' }).click();
    await expect(f.getByTestId('abo-annulation-refus')).toHaveCount(0);
  });

  test('renvoi après une coupure : « Déjà annulé », et le montant de la première annulation', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 9 });
    coupeDejaFaite(lucas);
    let coupure = true;
    api.surcharger('POST', `/subscriptions/${lucas.id}/cancel`, () => {
      if (!coupure) return undefined;
      coupure = false;
      api.abonnements.annulation(lucas.ligne);
      return RESEAU_COUPE;
    });
    await page.goto('/admin/subscriptions?tab=active');
    await caseDe(page, 'Lucas M.').getByRole('button').first().click();
    const f = fenetre(page, /^Abonnement$/);
    await f.getByRole('button', { name: /Annuler l'abonnement et ses 3 RDV/ }).click();
    await f.getByRole('button', { name: 'Confirmer l\'annulation' }).click();
    await expect(toast(page, 'Pas de connexion internet')).toBeVisible();
    await f.getByRole('button', { name: 'Confirmer l\'annulation' }).click();
    const fin = page.getByTestId('abo-annule');
    await expect(fin).toContainText('Déjà annulé');
    await expect(fin).not.toContainText('Aucun RDV à annuler');
    await expect(fin).toContainText('À rembourser à la main au client');
    await expect(fin).toContainText(/75\s€/);
  });
});

test.describe('Drapeau illisible', () => {
  const CHEMIN = '/api/apps/public/prod/public-settings/by-id/prod';

  test('page Abonnements : Réessayer, jamais l\'attente sans fin, puis la liste', async ({ page, api, connecter }) => {
    test.slow();
    await connecter(ADMIN);
    abonnement(api, { client: LUCAS });
    let panne = true;
    api.surcharger('GET', CHEMIN, () => (panne ? RESEAU_COUPE : undefined));
    await page.goto('/admin/subscriptions');
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Aucun abonnement à valider.')).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/subscriptions/);
    panne = false;
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(caseDe(page, 'Lucas M.')).toBeVisible();
  });

  test('carte d\'abonnement pendant une panne : toujours une carte d\'abonnement, jamais « Annuler cette carte »', async ({ page, api, connecter }) => {
    test.slow();
    await connecter(ADMIN);
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0 });
    api.surcharger('GET', CHEMIN, () => ({ status: 503, json: { error: 'Service indisponible' } }));
    await page.goto(`/admin/gift-cards?scan=${lucas.carte.code}`);
    const ouverte = carteOuverte(page);
    await expect(ouverte.getByTestId('gc-visits')).toHaveText('4 coupes restantes');
    await expect(ouverte.getByRole('button', { name: 'Annuler cette carte' })).toHaveCount(0);
    await expect(ouverte.getByTestId('gc-cancel-subscription')).toBeVisible();
    await expect(ouverte.getByRole('button', { name: 'Débiter 1 coupe · 25 €' })).toBeVisible();
  });
});

test.describe('Activité clients', () => {
  test.beforeEach(async ({ connecter, api }) => {
    await connecter(ADMIN);
    api.tables.Appointment.length = 0;
  });

  const ligne = (page, type, nom) => page.getByRole('button').filter({ hasText: type }).filter({ hasText: nom });

  test('un abonnement pris : une seule ligne « Abonnement à encaisser », formule et montant', async ({ page, api }) => {
    abonnement(api, { client: LUCAS });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/admin/activity');
    const l = ligne(page, 'Abonnement à encaisser', 'Lucas M.');
    await expect(l).toHaveCount(1);
    await expect(l).toContainText('4 coupes classiques');
    await expect(l).toContainText('4 RDV');
    await expect(l).toContainText(/100(,00)?\s€/);
    await expect(ligne(page, 'Nouveau rendez-vous', 'Lucas M.')).toHaveCount(0);
    await l.click();
    await expect(page).toHaveURL(/\/admin\/subscriptions$/);
  });

  test('valider : aucune « Carte cadeau achetée », ni toast ni ligne ; la ligne ne dit plus « à encaisser »', async ({ page, api }) => {
    abonnement(api, { client: LUCAS });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/admin/subscriptions');
    // Le fil d'activité a déjà été lu une fois (un événement nouveau ferait alors un toast)
    await expect.poll(() => api.requetesVers('GET', '/entities/GiftCard').length).toBeGreaterThan(0);
    const lectures = api.requetesVers('GET', '/entities/GiftCard').length;
    await caseDe(page, 'Lucas M.').getByRole('button').first().click();
    await fenetre(page).getByRole('button', { name: 'CB' }).click();
    await fenetre(page).getByRole('button', { name: 'Encaissé : créditer les 4 coupes' }).click();
    await expect(page.getByTestId('abo-valide')).toBeVisible();
    await expect.poll(() => api.requetesVers('GET', '/entities/GiftCard').length).toBeGreaterThan(lectures);
    await expect(toast(page, 'Abonnement validé')).toBeVisible();
    await expect(toast(page, 'Carte cadeau achetée')).toHaveCount(0);
    await page.getByRole('button', { name: 'Terminer' }).click();
    await page.getByRole('link', { name: /Activité clients/ }).first().click();
    await expect(ligne(page, 'Nouvel abonnement', 'Lucas M.')).toContainText('réglé');
    await expect(ligne(page, 'Carte cadeau achetée', 'Lucas M.')).toHaveCount(0);
    await expect(ligne(page, 'Abonnement à encaisser', 'Lucas M.')).toHaveCount(0);
  });

  test('après coup : RDV repris ou annulé, une ligne « Coupe 2 sur 4 », sans montant', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active' });
    Object.assign(lucas.rdv[1], { status: 'cancelled', cancelled_by: 'client', cancelled_at: iso(jour(0), '09:50'), cancellation_reason: 'Client : empêché' });
    // Repris une heure après l'abonnement : une action à part
    const repris = api.abonnements.ligneRdv(lucas.ligne, { employee_id: BARBERS.kevin.id, employee_name: BARBERS.kevin.name, date: jour(40), start_time: '11:00' }, 2);
    repris.created_date = iso(jour(0), '09:55');
    api.tables.Appointment.push(repris);
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/admin/activity');
    const annule = ligne(page, 'Rendez-vous annulé', 'Lucas M.');
    await expect(annule).toContainText('Coupe 2 sur 4');
    await expect(annule).not.toContainText('€');
    const nouveau = ligne(page, 'Nouveau rendez-vous', 'Lucas M.');
    await expect(nouveau).toHaveCount(1);
    await expect(nouveau).toContainText('Coupe 2 sur 4');
    await expect(nouveau).not.toContainText('€');
    await expect(ligne(page, 'Nouvel abonnement', 'Lucas M.')).toHaveCount(1);
  });
});

test.describe('Tableau de bord', () => {
  test.beforeEach(async ({ connecter, api }) => {
    await connecter(ADMIN);
    api.tables.Appointment.length = 0;
  });

  test('« À faire » : la ligne des abonnements à valider, avec le montant, vers la page', async ({ page, api }) => {
    abonnement(api, { client: LUCAS });
    abonnement(api, { client: THOMAS, prestation: premium });
    await page.goto('/admin');
    const ligne = page.getByRole('region', { name: 'À faire' }).getByRole('link', { name: /2 abonnements à valider/ });
    await expect(ligne).toContainText(/220\s€/);
    await ligne.click();
    await expect(page).toHaveURL(/\/admin\/subscriptions$/);
  });

  test('« À faire » : réservé à l\'admin, un barber ne lit même pas la liste', async ({ page, api, connecter }) => {
    abonnement(api, { client: LUCAS });
    const compte = { ...KEVIN, permissions: ['dashboard', 'agenda'] };
    api.comptes.push({ ...compte, motDePasse: 'x', birth_date: null, photo_url: null, created_date: '2026-01-15T10:00:00.000Z' });
    await page.context().clearCookies();
    await page.addInitScript(() => sessionStorage.removeItem('e2e-session-posee'));
    await connecter(compte);
    await page.goto('/admin');
    await expect(chiffres(page)).toBeVisible();
    await expect(page.getByText(/abonnements? à valider/)).toHaveCount(0);
    expect(api.requetesVers('GET', '/subscriptions')).toEqual([]);
  });

  test('CA du mois sans double compte : 100 € à la vente, 0 € de plus à chaque coupe', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0, heure: '09:00' });
    coupeDejaFaite(lucas); // la coupe de ce matin : 25 € débités
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/admin');

    const cartes = ligneChiffres(page, /^Ventes/, /^Cartes cadeau vendues/);
    await expect(cartes.getByRole('rowheader')).toContainText(/dont abonnements 100\s€/);
    await expect(cartes.getByRole('cell').nth(1)).toHaveText(/^100\s€$/);
    await expect(ligneChiffres(page, /^Ventes/, /^Rendez-vous/).getByRole('cell').nth(1)).toHaveText(/^0\s€$/);
    await expect(ligneChiffres(page, /^Ventes/, /^Total/).getByRole('cell').nth(1)).toHaveText(/^100\s€/);
    await expect(ligneChiffres(page, /^Encaissements/, /^Réglé par carte cadeau/).getByRole('cell').nth(1)).toHaveText(/^25\s€$/);

    // Panneau des abonnements en cours : calculé sur les cartes lues
    const panneau = page.getByRole('region', { name: 'Ventes hors rendez-vous' });
    await expect(panneau.getByText('1 en cours, 3 coupes à faire')).toBeVisible();
    await expect(panneau.getByText(/75\s€ à honorer/)).toBeVisible();
  });

  test('« à venir », « à clôturer » et absent : le nombre reste, 0 € pour un RDV d\'abonnement', async ({ page, api }) => {
    abonnement(api, { client: LUCAS, jours: 0, heure: '17:00' }); //                             à venir aujourd'hui
    abonnement(api, { client: THOMAS, prestation: premium, barber: BARBERS.dom, jours: -1 }); // à clôturer (hier)
    const absent = abonnement(api, { client: ENZO, statut: 'active', barber: BARBERS.romain, jours: 0, heure: '09:00' });
    absent.rdv[0].status = 'no_show';
    // Un RDV ordinaire pour comparer : à venir, il compte, lui
    api.tables.Appointment.push(rendezVous({ id: 'ordinaire', client: { full_name: 'Nina Roche', email: 'nina@exemple.fr', phone: '' }, barber: BARBERS.dom, prestations: [PRESTATIONS.coupeBarbe], date: jour(0), debut: '16:00' }));
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/admin');

    // À venir aujourd'hui : Lucas (0 €) et Nina (35 €)
    await expect(ligneChiffres(page, /^Rendez-vous/, /^À venir/).getByRole('cell').nth(0)).toHaveText(/^35\s€\s*2 RDV$/);
    // À clôturer : le RDV d'hier de Thomas, compté, sans montant, sur la ligne « À faire »
    await expect(page.getByRole('region', { name: 'À faire' }).getByRole('link', { name: /1 prestation à clôturer/ })).not.toContainText('€');
    // Absent : la coupe reste, aucun manque à gagner
    const absences = page.getByText(/Manque à gagner sur 1 absence/).locator('..');
    await expect(absences).toContainText(/0\s€/);
    // CA à venir de tous les mois : seule Nina compte, tous les RDV restent comptés
    const aVenir = page.getByRole('region', { name: 'CA à venir, tous les mois' });
    await expect(aVenir).toContainText(/35\s€/);
    await expect(aVenir).toContainText('11 RDV confirmés'); // Lucas 4, Thomas 3, Enzo 3, Nina 1
    // Le RDV de Lucas dans la liste du jour : sa coupe n'est pas un montant
    await expect(page.getByRole('region', { name: 'Rendez-vous du jour' }).getByRole('listitem').filter({ hasText: 'Lucas M.' })).toContainText('Abo 1/4');
    await expect(page.getByRole('region', { name: 'Rendez-vous du jour' }).getByRole('listitem').filter({ hasText: 'Lucas M.' })).not.toContainText('€');
  });

  test('coupe + barbe : seule la ligne de la coupe sort du montant ouvert, 15 € restent à venir', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, jours: 0, heure: '17:00' });
    avecBarbe(lucas.rdv[0]);
    // À clôturer (hier) : 15 € de barbe, la coupe débitée ou non n'y change rien
    const thomas = abonnement(api, { client: THOMAS, statut: 'active', prestation: classiques, barber: BARBERS.dom, jours: -1, heure: '11:00' });
    avecBarbe(thomas.rdv[0]);
    // Absent avec une barbe : 15 € de manque à gagner, la coupe reste
    const enzo = abonnement(api, { client: ENZO, statut: 'active', barber: BARBERS.romain, jours: 0, heure: '09:00' });
    avecBarbe(enzo.rdv[0]).status = 'no_show';
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/admin');

    await expect(ligneChiffres(page, /^Rendez-vous/, /^À venir/).getByRole('cell').nth(0)).toHaveText(/^15\s€\s*1 RDV$/);
    await expect(page.getByRole('region', { name: 'À faire' }).getByRole('link', { name: /1 prestation à clôturer/ })).toContainText(/15\s€/);
    await expect(page.getByRole('region', { name: 'CA à venir, tous les mois' })).toContainText(/15\s€/);
    await expect(page.getByText(/Manque à gagner sur 1 absence/).locator('..')).toContainText(/15\s€/);
    const ligneLucas = page.getByRole('region', { name: 'Rendez-vous du jour' }).getByRole('listitem').filter({ hasText: 'Lucas M.' });
    await expect(ligneLucas).toContainText('Abo 1/4');
    await expect(ligneLucas).toContainText(/15\s€/);

    // La coupe débitée, sans clôture : les 15 € restent à venir, rien de plus, rien de moins
    Object.assign(lucas.rdv[0], { gift_card_amount: 25 });
    await page.getByRole('button', { name: /Actualiser/ }).first().click();
    await expect(ligneChiffres(page, /^Rendez-vous/, /^À venir/).getByRole('cell').nth(0)).toHaveText(/^15\s€\s*1 RDV$/);
  });

  test('panier moyen : sans les RDV d\'abonnement, le nombre de RDV encaissés les garde', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0, heure: '09:00' });
    coupeDejaFaite(lucas);
    api.tables.Appointment.push(rendezVous({
      id: 'ordinaire', client: { full_name: 'Nina Roche', email: 'nina@exemple.fr', phone: '' }, barber: BARBERS.dom, prestations: [PRESTATIONS.coupeBarbe],
      date: jour(0), debut: '09:30', statut: 'completed', payment_method: 'cb', payment_status: 'paid',
    }));
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/admin');
    await expect(ligneChiffres(page, /^Rendez-vous/, /^RDV encaissés/).getByRole('cell').nth(0)).toHaveText('2');
    // 35 € sur un seul RDV ordinaire : pas 17,50 €
    const panier = ligneChiffres(page, /^Rendez-vous/, /^Panier moyen/);
    await expect(panier.getByRole('cell').nth(0)).toHaveText(/^35\s€$/);
    await expect(panier.getByRole('rowheader')).toContainText('hors abonnements');
  });

  test('« Mois passés » : la précision « dont abonnements », au mois du paiement', async ({ page, api }) => {
    const [a, m] = jour(0).split('-').map(Number);
    const moisPasse = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7);
    api.tables.GiftCard = [
      { id: 'gc-abo', code: 'DHB-ABOA-TEST', amount: 100, remaining_balance: 100, status: 'validated', payment_method: 'cb', validated_at: iso(`${moisPasse}-10`), created_at: iso(`${moisPasse}-10`), subscription_id: 'abo-x', subscription_name: '4 coupes classiques', subscription_unit_price: 25, subscription_visits: 4 },
      { id: 'gc-plain', code: 'DHB-PLAI-TEST', amount: 50, remaining_balance: 50, status: 'validated', payment_method: 'especes', validated_at: iso(`${moisPasse}-11`), created_at: iso(`${moisPasse}-11`) },
    ];
    await page.goto('/admin');
    const bloc = page.getByRole('region', { name: 'Mois passés', exact: true });
    await bloc.getByRole('button', { name: new RegExp(`${moisPasse.slice(0, 4)}`) }).first().click();
    const ligne = bloc.getByRole('table', { name: /^Ventes/ }).getByRole('row').filter({ hasText: 'Cartes cadeau vendues' });
    await expect(ligne).toContainText(/150\s€/);
    await expect(ligne).toContainText(/dont abonnements 100\s€/);
  });
});

test.describe('Agenda : fiche d\'un RDV d\'abonnement', () => {
  test('pastille « Abo 1/4 », pas réglé : pas de CB ni d\'espèces, encaisser puis scanner', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    const lucas = abonnement(api, { client: LUCAS, jours: 0 });
    await page.setViewportSize({ width: 1366, height: 900 });
    const fiche = await ouvrirFicheDe(page, BARBERS.kevin, /Lucas M\./);
    await expect(page.locator(`[data-drop-column="${BARBERS.kevin.id}"]`).getByText('Abo 1/4')).toBeVisible();

    const bloc = fiche.getByTestId('rdv-abonnement');
    await expect(bloc).toContainText('Abonnement · Coupe 1 sur 4');
    await expect(bloc).toContainText(/Pas encore réglé : 100\s€/);
    await expect(bloc).toContainText('Le scan est proposé juste après.');
    await expect(fiche.getByText('Mode de paiement')).toHaveCount(0);
    await expect(fiche.getByText('Pourboire')).toHaveCount(0);
    await expect(fiche.getByRole('button', { name: 'Valider la prestation' })).toHaveCount(0);
    await expect(fiche.getByRole('link', { name: 'Scanner le QR de la carte' })).toHaveCount(0);

    await bloc.getByRole('button', { name: 'Encaisser l\'abonnement' }).click();
    const f = fenetre(page);
    await expect(f.getByRole('button', { name: 'Encaissé : créditer les 4 coupes' })).toBeDisabled();
    await f.getByRole('button', { name: 'Espèces' }).click();
    await f.getByRole('button', { name: 'Encaissé : créditer les 4 coupes' }).click();
    await expect(f.getByText('Carte créée')).toBeVisible();
    const carte = api.tables.GiftCard.find((c) => c.subscription_id === lucas.id);

    // « Ouvrir la carte » : la carte, avec ce RDV déjà choisi
    await f.getByRole('link', { name: 'Ouvrir la carte' }).click();
    await expect(page).toHaveURL(/\/admin\/gift-cards/);
    const ouverte = carteOuverte(page);
    await expect(ouverte).toContainText(carte.code);
    await expect(ouverte.getByTestId('gc-apt-row').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(ouverte.getByTestId('gc-debit-visit')).toHaveText(/Débiter 1 coupe · 25 €/);
  });

  test('payé : « Payé · 4 coupes restantes », le scan et la saisie du code, sans encaissement', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0 });
    const fiche = await ouvrirFicheDe(page, BARBERS.kevin, /Lucas M\./);
    const bloc = fiche.getByTestId('rdv-abonnement');
    await expect(bloc).toContainText('Payé · 4 coupes restantes');
    await expect(bloc).toContainText('4 coupes classiques');
    await expect(bloc.getByRole('button', { name: 'Encaisser l\'abonnement' })).toHaveCount(0);
    await expect(bloc.getByRole('link', { name: 'Scanner le QR de la carte' }))
      .toHaveAttribute('href', `/admin/gift-cards?apt=${lucas.rdv[0].id}&open=scanner`);
    await expect(bloc.getByRole('link', { name: 'Saisir le code de la carte' }))
      .toHaveAttribute('href', `/admin/gift-cards?apt=${lucas.rdv[0].id}&open=code`);
    await expect(fiche.getByText('Mode de paiement')).toHaveCount(0);
  });

  test('barber : il lit l\'état, sans bouton, « À débiter sur l\'ordinateur du salon »', async ({ page, api, connecter }) => {
    api.comptes.push({ ...KEVIN, motDePasse: 'x', birth_date: null, photo_url: null, created_date: '2026-01-15T10:00:00.000Z' });
    await connecter(KEVIN);
    abonnement(api, { client: LUCAS, statut: 'active', jours: 0 });
    abonnement(api, { client: THOMAS, prestation: premium, barber: BARBERS.kevin, jours: 0, heure: '15:00' });
    let fiche = await ouvrirFicheDe(page, BARBERS.kevin, /Lucas M\./);
    let bloc = fiche.getByTestId('rdv-abonnement');
    await expect(bloc).toContainText('Payé · 4 coupes restantes');
    await expect(bloc).toContainText('À débiter sur l\'ordinateur du salon');
    await expect(bloc.getByRole('link')).toHaveCount(0);
    await expect(bloc.getByRole('button')).toHaveCount(0);
    await expect(fiche.getByText('Mode de paiement')).toHaveCount(0);

    await page.keyboard.press('Escape');
    fiche = await ouvrirFicheDe(page, BARBERS.kevin, /Thomas R\./);
    bloc = fiche.getByTestId('rdv-abonnement');
    await expect(bloc).toContainText(/Pas encore réglé : 120\s€/);
    await expect(bloc).toContainText('À débiter sur l\'ordinateur du salon');
    await expect(bloc.getByRole('button')).toHaveCount(0);
  });

  test('absent : rien n\'est débité, « La coupe reste sur la carte. », aucune case', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0, heure: '09:00' });
    const fiche = await ouvrirFicheDe(page, BARBERS.kevin, /Lucas M\./);
    await expect(fiche.getByRole('checkbox')).toHaveCount(0);
    await fiche.getByRole('button', { name: 'Absent' }).click();
    const message = toast(page, 'Marqué absent');
    await expect(message).toBeVisible();
    await expect(message).toContainText('La coupe reste sur la carte.');
    await expect.poll(() => lucas.rdv[0].status).toBe('no_show');
    expect(lucas.carte.remaining_balance).toBe(100);
    expect(api.requetesVers('POST', /\/debit$/)).toEqual([]);

    // Fiche rouverte : la coupe reste, toujours à reprogrammer
    await page.keyboard.press('Escape');
    const relue = await ouvrirFicheDe(page, BARBERS.kevin, /Lucas M\./);
    await expect(relue.getByTestId('rdv-abonnement')).toContainText('La coupe reste sur la carte.');
    await expect(relue.getByTestId('rdv-abonnement')).toContainText('Payé · 4 coupes restantes');
  });

  test('absent, abonnement pas encore réglé : « La coupe reste sur l\'abonnement. »', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    abonnement(api, { client: LUCAS, jours: 0, heure: '09:00' });
    const fiche = await ouvrirFicheDe(page, BARBERS.kevin, /Lucas M\./);
    await expect(fiche.getByTestId('rdv-abonnement')).toContainText('Pas encore réglé');
    // Annuler : même phrase dans la confirmation
    await fiche.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(fiche.getByText('La coupe reste sur l\'abonnement.')).toBeVisible();
    await expect(fiche.getByText('La coupe reste sur la carte.')).toHaveCount(0);
    await fiche.getByRole('button', { name: 'Garder' }).first().click();
    await fiche.getByRole('button', { name: 'Absent' }).click();
    await expect(toast(page, 'Marqué absent')).toContainText('La coupe reste sur l\'abonnement.');
    // Fiche rouverte : la même phrase
    await page.keyboard.press('Escape');
    const relue = await ouvrirFicheDe(page, BARBERS.kevin, /Lucas M\./);
    await expect(relue.getByTestId('rdv-abonnement')).toContainText('La coupe reste sur l\'abonnement.');
  });

  test('plus aucune coupe, RDV encore ouvert : encaissement normal, sans scan', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    refusDuServeur(api);
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: -21, heure: '09:00' });
    Object.assign(lucas.carte, { remaining_balance: 0, status: 'used' });
    const fiche = await ouvrirFicheDe(page, BARBERS.kevin, /Lucas M\./);
    const bloc = fiche.getByTestId('rdv-abonnement');
    await expect(bloc).toContainText('Payé · 0 coupe restante');
    await expect(bloc.getByTestId('rdv-plus-de-coupe')).toBeVisible();
    await expect(bloc.getByRole('link', { name: /Scanner|Saisir/ })).toHaveCount(0);
    await expect(bloc).not.toContainText('À débiter');
    await fiche.getByRole('button', { name: 'CB', exact: true }).last().click();
    await fiche.getByRole('button', { name: 'Valider la prestation' }).click();
    await expect(toast(page, 'Prestation validée !')).toBeVisible();
    expect(api.requetesVers('PUT', `/entities/Appointment/${lucas.rdv[3].id}`).at(-1).corps).toMatchObject({ payment_method: 'cb', status: 'completed' });
  });

  test('après une clôture par la carte : pourboire noté par « Corriger l\'encaissement », sans refus', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    refusDuServeur(api);
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0, heure: '09:00' });
    coupeDejaFaite(lucas);
    const fiche = await ouvrirFicheDe(page, BARBERS.kevin, /Lucas M\./);
    await expect(fiche.getByText('Prestation effectuée')).toBeVisible();
    await fiche.getByRole('button', { name: 'Corriger l\'encaissement' }).click();
    await fiche.getByPlaceholder('0').first().fill('5');
    await fiche.getByRole('button', { name: 'CB', exact: true }).first().click();
    await fiche.getByRole('button', { name: 'Enregistrer la correction' }).click();
    await expect(toast(page, 'Encaissement corrigé')).toBeVisible();
    expect(api.requetesVers('PUT', `/entities/Appointment/${lucas.rdv[0].id}`).at(-1).corps).toMatchObject({ tip: 5, tip_method: 'cb', payment_method: 'carte_cadeau', status: 'completed' });
  });

  test('après un débit partiel (coupe + barbe) : le reste en CB, avec un pourboire, sans refus ni carte', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    refusDuServeur(api);
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0, heure: '09:00' });
    avecBarbe(lucas.rdv[0]);
    Object.assign(lucas.rdv[0], { gift_card_amount: 25 });
    lucas.carte.remaining_balance = 75;
    const fiche = await ouvrirFicheDe(page, BARBERS.kevin, /Lucas M\./);
    await expect(fiche.getByTestId('rdv-abonnement')).toContainText('Coupe débitée, réglée par la carte.');
    await expect(fiche.getByText('Reste à encaisser')).toBeVisible();
    await expect(fiche.getByRole('button', { name: 'Carte cadeau' })).toHaveCount(0);
    await fiche.getByPlaceholder('0').first().fill('5');
    await fiche.getByRole('button', { name: 'Espèces', exact: true }).first().click();
    await fiche.getByRole('button', { name: 'CB', exact: true }).last().click();
    await fiche.getByRole('button', { name: 'Valider la prestation' }).click();
    await expect(toast(page, 'Prestation validée !')).toBeVisible();
    expect(api.requetesVers('PUT', `/entities/Appointment/${lucas.rdv[0].id}`).at(-1).corps).toMatchObject({ tip: 5, tip_method: 'especes', payment_method: 'cb', status: 'completed' });
  });

  test('un RDV d\'abonnement encaissé quand même : le message du serveur (409)', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    // L'agenda ne sait pas encore que ce RDV est d'un abonnement : le serveur a le dernier mot
    const ligne = api.tables.Appointment.find((a) => a.client_name === 'Nina Roche');
    const message = 'Ce RDV est payé par l\'abonnement : scannez la carte du client sur l\'ordinateur du salon.';
    api.surcharger('PUT', `/entities/Appointment/${ligne.id}`, () => ({ status: 409, json: { error: message, code: 'subscription_appointment' } }));
    const fiche = await ouvrirFicheDe(page, BARBERS.kevin, /Nina Roche/);
    await fiche.getByRole('button', { name: 'CB', exact: true }).last().click();
    await fiche.getByRole('button', { name: 'Valider la prestation' }).click();
    await expect(toast(page, message)).toBeVisible();
  });
});

test.describe('Scan et débit', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(ADMIN);
  });

  test('parcours complet : agenda, QR tapé par la douchette, RDV présélectionné, 1 coupe débitée', async ({ page, api }) => {
    test.slow(); // plusieurs pages à la suite : le temps de trois tests sur une machine chargée
    await sansCamera(page);
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0 });
    await page.setViewportSize({ width: 1366, height: 900 });
    const fiche = await ouvrirFicheDe(page, BARBERS.kevin, /Lucas M\./);
    await fiche.getByRole('link', { name: 'Scanner le QR de la carte' }).click();

    // Le poste du salon : pas de caméra ici, le curseur attend dans le champ
    await expect(page.getByRole('heading', { name: 'Scanner une carte' })).toBeVisible();
    await expect(page.getByText('Caméra non disponible. Entrez le code manuellement.')).toBeVisible();
    await expect(page.getByLabel('Code de la carte')).toBeFocused();
    await page.keyboard.type(qrDe(lucas.carte.code));
    await page.keyboard.press('Enter');

    const ouverte = carteOuverte(page);
    await expect(ouverte).toContainText('Abonnement');
    await expect(ouverte.getByTestId('gc-visits')).toHaveText('4 coupes restantes');
    await expect(ouverte).toContainText('4 coupes classiques · solde 100 €');
    await expect(ouverte.getByRole('img', { name: '4 coupes restantes sur 4' })).toBeVisible();
    // Il est 10 h, le RDV est à 17 h : pas « maintenant »
    await expect(ouverte.getByTestId('gc-own-title')).toHaveText('RDV du jour');
    await expect(ouverte.getByText('Maintenant', { exact: true })).toHaveCount(0);

    const rdv = ouverte.getByTestId('gc-apt-row').first();
    await expect(rdv).toContainText('Lucas M.');
    await expect(rdv).toContainText('Coupe 1 sur 4');
    await expect(rdv).toContainText('25 €');
    await expect(rdv).toHaveAttribute('aria-pressed', 'true');
    await expect(ouverte.getByRole('checkbox', { name: 'Clôturer le RDV' })).toBeChecked();
    await expect(ouverte.getByText('Après ce débit : 3 coupes restantes, solde 75 €.')).toBeVisible();

    await ouverte.getByRole('button', { name: 'Débiter 1 coupe · 25 €' }).click();
    const succes = ouverte.getByTestId('gc-visit-success');
    await expect(succes).toContainText('1 coupe débitée');
    await expect(succes).toContainText('RDV de Lucas M. clôturé · réglé par la carte');
    await expect(succes).toContainText('3 coupes restantes');
    await expect(succes).toContainText('75 €');
    await expect(succes.getByTestId('gc-next-visit')).toHaveText(`${majuscule(libelle(7))} · 17:00 · Kevin`);
    await expect(toast(page, 'Coupe débitée.')).toBeVisible();

    expect(lucas.carte.remaining_balance).toBe(75);
    expect(lucas.rdv[0]).toMatchObject({ status: 'completed', payment_method: 'carte_cadeau', gift_card_amount: 25 });
    expect(api.requetesVers('POST', `/gift-cards/${lucas.carte.id}/debit`).at(-1).corps).toMatchObject({ amount: 25, appointment_id: lucas.rdv[0].id });

    // « Retour à l'agenda » : le RDV y est encaissé
    await ouverte.getByRole('link', { name: 'Retour à l\'agenda' }).click();
    await expect(page).toHaveURL(/\/admin\/agenda/);
    await page.locator(`[data-drop-column="${BARBERS.kevin.id}"]`).getByRole('button', { name: /Lucas M\./ }).click();
    await expect(ficheRdv(page).getByTestId('rdv-abonnement')).toContainText('Coupe débitée, réglée par la carte.');
    await expect(ficheRdv(page).getByTestId('rdv-abonnement')).toContainText('Payé · 3 coupes restantes');
    await expect(ficheRdv(page).getByText('Prestation effectuée')).toBeVisible();
  });

  test('webcam : le QR de la carte lu par la caméra de l\'ordinateur ouvre la carte, RDV présélectionné', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0 });
    await cameraQuiVoit(page, qrDe(lucas.carte.code));
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`/admin/gift-cards?apt=${lucas.rdv[1].id}&open=scanner`);
    // La caméra lit le QR dès sa première image : le scanner peut déjà être refermé, on attend la carte
    const ouverte = carteOuverte(page);
    await expect.poll(async () => {
      await page.clock.runFor(200);
      return ouverte.count();
    }).toBe(1);
    await expect(ouverte).toContainText(lucas.carte.code);
    await expect(ouverte.getByTestId('gc-apt-row').filter({ hasText: 'Coupe 2 sur 4' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Scanner une carte' })).toHaveCount(0);
  });

  test('`?apt=` d\'un autre jour (la coupe oubliée d\'hier) : daté, débité en deux gestes', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: -1, heure: '17:00' });
    // Coupe d'hier oubliée : absente de la liste du jour, relue à part
    await page.goto(`/admin/gift-cards?scan=${lucas.carte.code}&apt=${lucas.rdv[0].id}`);
    const ouverte = carteOuverte(page);
    const ligne = ouverte.getByTestId('gc-apt-row').first();
    await expect(ligne).toContainText('Coupe 1 sur 4');
    await expect(ligne).toHaveAttribute('aria-pressed', 'true');
    await expect(ligne.getByTestId('gc-apt-date')).toHaveText(majuscule(libelle(-1)));
    // Les paramètres ne traînent pas dans l'adresse
    await expect(page).toHaveURL(/\/admin\/gift-cards$/);

    // Premier geste : rien ne part, la date est rappelée ; « Retour » ne débite rien
    await ouverte.getByRole('button', { name: 'Débiter 1 coupe · 25 €' }).click();
    expect(api.requetesVers('POST', /\/debit$/)).toEqual([]);
    await expect(ouverte.getByTestId('gc-confirm-day')).toContainText(libelle(-1));
    await ouverte.getByRole('button', { name: 'Retour' }).click();
    expect(lucas.carte.remaining_balance).toBe(100);

    // Second geste : la coupe est débitée, le RDV clôturé
    await ouverte.getByRole('button', { name: 'Débiter 1 coupe · 25 €' }).click();
    await ouverte.getByRole('button', { name: 'Confirmer 1 coupe · 25 €' }).click();
    await expect(ouverte.getByTestId('gc-visit-success')).toContainText('1 coupe débitée');
    expect(lucas.carte.remaining_balance).toBe(75);
    expect(lucas.rdv[0].status).toBe('completed');
  });

  test('`?apt=` d\'un RDV à venir : daté aussi, jamais en un geste', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 3, heure: '17:00' });
    await page.goto(`/admin/gift-cards?scan=${lucas.carte.code}&apt=${lucas.rdv[0].id}`);
    const ouverte = carteOuverte(page);
    await expect(ouverte.getByTestId('gc-apt-date')).toHaveText(majuscule(libelle(3)));
    await ouverte.getByRole('button', { name: 'Débiter 1 coupe · 25 €' }).click();
    expect(api.requetesVers('POST', /\/debit$/)).toEqual([]);
    await expect(ouverte.getByRole('button', { name: 'Confirmer 1 coupe · 25 €' })).toBeVisible();
  });

  test('« Le RDV de maintenant » seulement à moins d\'une heure, avec sa pastille', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0, heure: '10:30' });
    await page.goto(`/admin/gift-cards?scan=${lucas.carte.code}`);
    const ouverte = carteOuverte(page);
    await expect(ouverte.getByTestId('gc-own-title')).toHaveText('Le RDV de maintenant');
    await expect(ouverte.getByTestId('gc-apt-row').first()).toContainText('Maintenant');
  });

  test('`?apt=` périmé : oublié à la fermeture, sur une autre carte comme sur la même', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0, heure: '10:00' });
    const thomas = abonnement(api, { client: THOMAS, statut: 'active', prestation: premium, jours: 3 });
    await page.goto(`/admin/gift-cards?scan=${lucas.carte.code}&apt=${lucas.rdv[1].id}`);
    await expect(carteOuverte(page).getByTestId('gc-apt-row').filter({ hasText: 'Coupe 2 sur 4' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(carteOuverte(page)).toHaveCount(0);

    // Une autre carte ensuite : plus un mot du RDV de Lucas
    await page.getByRole('button', { name: 'Saisir le code' }).click();
    await page.getByLabel('Code de la carte').fill(thomas.carte.code);
    await page.keyboard.press('Enter');
    await expect(carteOuverte(page)).toContainText(thomas.carte.code);
    await expect(carteOuverte(page).getByTestId('gc-wrong-card')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // La carte de Lucas rouverte : son RDV du jour, plus jamais l'ancien RDV demandé
    await page.getByRole('button', { name: 'Saisir le code' }).click();
    await page.getByLabel('Code de la carte').fill(lucas.carte.code);
    await page.keyboard.press('Enter');
    await expect(carteOuverte(page).getByTestId('gc-apt-row').filter({ hasText: 'Coupe 2 sur 4' })).toHaveCount(0);
    await expect(carteOuverte(page).getByTestId('gc-apt-row').filter({ hasText: 'Coupe 1 sur 4' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('`?apt=` : le scanner fermé sans lecture l\'oublie ; une mauvaise carte le garde pour la bonne', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0, heure: '10:00' });
    api.tables.GiftCard.push({ id: 'gc-ordinaire', code: 'DHB-ORDI-TEST', amount: 50, remaining_balance: 50, status: 'validated', sender_name: 'Jules', recipient_name: 'Jules', valid_until: jour(300), validated_at: iso(jour(-3)), created_at: iso(jour(-3)) });
    await page.goto(`/admin/gift-cards?apt=${lucas.rdv[1].id}&open=code`);
    await page.getByLabel('Code de la carte').fill('DHB-ORDI-TEST');
    await page.keyboard.press('Enter');
    // Mauvaise carte : dite à l'écran, et le RDV attend la bonne
    await expect(carteOuverte(page).getByTestId('gc-wrong-card')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Saisir le code' }).click();
    await page.getByLabel('Code de la carte').fill(lucas.carte.code);
    await page.keyboard.press('Enter');
    await expect(carteOuverte(page).getByTestId('gc-apt-row').filter({ hasText: 'Coupe 2 sur 4' })).toHaveAttribute('aria-pressed', 'true');
    // Fermée sans débit : cette fois il est oublié
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Saisir le code' }).click();
    await page.getByLabel('Code de la carte').fill(lucas.carte.code);
    await page.keyboard.press('Enter');
    await expect(carteOuverte(page).getByTestId('gc-apt-row').filter({ hasText: 'Coupe 2 sur 4' })).toHaveCount(0);
  });

  test('second débit sur un RDV coupe + barbe : refusé par l\'écran, le reste s\'encaisse dans l\'agenda', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0, heure: '10:00' });
    avecBarbe(lucas.rdv[0]);
    // La coupe est déjà débitée : 25 € sur 40 €, RDV pas clôturé
    lucas.rdv[0].gift_card_amount = 25;
    lucas.carte.remaining_balance = 75;
    await page.goto(`/admin/gift-cards?scan=${lucas.carte.code}&apt=${lucas.rdv[0].id}`);
    const ouverte = carteOuverte(page);
    const message = ouverte.getByTestId('gc-visit-paid');
    await expect(message).toContainText('Coupe 1 déjà débitée');
    await expect(message).toContainText('Reste 15 € à encaisser dans l\'agenda');
    await expect(message.getByRole('link', { name: 'Ouvrir l\'agenda' })).toBeVisible();
    // Ni présélection, ni ligne à choisir, ni bouton
    await expect(ouverte.getByTestId('gc-apt-row').filter({ hasText: 'Lucas M.' })).toHaveCount(0);
    await expect(ouverte.getByRole('button', { name: /Débiter 1 coupe|Débiter 15/ })).toHaveCount(0);
    await expect(ouverte.getByTestId('gc-debit')).toBeDisabled();
    // Montant libre : pas proposé au rattachement non plus
    await ouverte.getByRole('button', { name: 'Montant libre' }).click();
    await expect(ouverte.getByTestId('gc-attach-today')).not.toContainText('Lucas M.');
    expect(api.requetesVers('POST', /\/debit$/)).toEqual([]);
  });

  test('coupe + barbe : le premier débit dit « 1 coupe débitée » et le reste à encaisser', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0, heure: '10:00' });
    avecBarbe(lucas.rdv[0]);
    await page.goto(`/admin/gift-cards?scan=${lucas.carte.code}`);
    const ouverte = carteOuverte(page);
    await ouverte.getByRole('button', { name: 'Débiter 1 coupe · 25 €' }).click();
    const succes = ouverte.getByTestId('gc-success');
    await expect(succes).toContainText('1 coupe débitée');
    await expect(succes).toContainText('Reste 15 €');
    await expect(toast(page, 'Coupe débitée.')).toBeVisible();
    expect(lucas.rdv[0].status).toBe('confirmed');
  });

  test('`?apt=` prime sur le RDV de maintenant', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0, heure: '10:00' });
    await page.goto(`/admin/gift-cards?scan=${lucas.carte.code}&apt=${lucas.rdv[1].id}`);
    const ouverte = carteOuverte(page);
    await expect(ouverte.getByTestId('gc-apt-row').filter({ hasText: 'Coupe 2 sur 4' })).toHaveAttribute('aria-pressed', 'true');
    await expect(ouverte.getByTestId('gc-apt-row').filter({ hasText: 'Coupe 1 sur 4' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('sans `?apt=` : la carte seule présélectionne son RDV du jour, sans jamais le débiter seule', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0, heure: '10:00' });
    await page.goto(`/admin/gift-cards?scan=${lucas.carte.code}`);
    const ouverte = carteOuverte(page);
    await expect(ouverte.getByTestId('gc-apt-row').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(ouverte.getByRole('button', { name: 'Débiter 1 coupe · 25 €' })).toBeVisible();
    expect(api.requetesVers('POST', /\/debit$/)).toEqual([]);
    // Les autres modes restent là
    await ouverte.getByRole('button', { name: 'Montant libre' }).click();
    await ouverte.getByPlaceholder('Montant à débiter...').fill('10');
    await expect(ouverte.getByTestId('gc-recap')).toContainText('Après ce débit : 3 coupes restantes, solde 90 €.');
  });

  test('« Saisir le code » : code tapé, adresse complète du QR, code invalide', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0 });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/admin/gift-cards');
    await page.getByRole('button', { name: 'Saisir le code' }).click();
    // Sans caméra : le navigateur ne demande aucune autorisation
    await expect(page.getByRole('heading', { name: 'Saisir le code de la carte' })).toBeVisible();
    await expect(page.locator('video')).toHaveCount(0);
    const champ = page.getByLabel('Code de la carte');
    await expect(champ).toBeFocused();

    await page.keyboard.type('pas-un-code');
    await page.keyboard.press('Enter');
    await expect(toast(page, 'Code invalide')).toBeVisible();
    await expect(toast(page, 'clavier français')).toBeVisible();

    // Le code tapé en minuscules, validé par le bouton
    await champ.fill(lucas.carte.code.toLowerCase());
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(carteOuverte(page)).toContainText(lucas.carte.code);
    // Échap ferme, comme les autres fenêtres
    await page.keyboard.press('Escape');
    await expect(carteOuverte(page)).toHaveCount(0);

    // L'adresse complète du QR, puis Entrée (douchette)
    await page.getByRole('button', { name: 'Saisir le code' }).click();
    await page.keyboard.type(qrDe(lucas.carte.code));
    await page.keyboard.press('Enter');
    await expect(carteOuverte(page)).toContainText(lucas.carte.code);
  });

  test('douchette sans fenêtre : sur la page, ou dans le champ de recherche', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0 });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/admin/gift-cards');
    await expect(page.getByText(lucas.carte.code)).toBeVisible();

    // Aucun champ actif : la page reçoit le QR tapé
    await page.keyboard.type(qrDe(lucas.carte.code));
    await page.keyboard.press('Enter');
    await expect(carteOuverte(page)).toContainText(lucas.carte.code);
    // Fenêtre ouverte : un second passage ne fait rien, surtout pas un débit
    await page.keyboard.type(qrDe(lucas.carte.code));
    await page.keyboard.press('Enter');
    expect(api.requetesVers('POST', /\/debit$/)).toEqual([]);
    await carteOuverte(page).getByRole('button', { name: 'Fermer' }).first().click();

    // Le curseur est dans la recherche
    await page.getByPlaceholder('Rechercher par nom, email, code...').click();
    await page.keyboard.type(qrDe(lucas.carte.code));
    await page.keyboard.press('Enter');
    await expect(carteOuverte(page)).toContainText(lucas.carte.code);
    await expect(page.getByPlaceholder('Rechercher par nom, email, code...')).toHaveValue('');
  });

  test('annuler le débit sous 10 s : solde rendu, RDV rouvert', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0 });
    await page.goto(`/admin/gift-cards?scan=${lucas.carte.code}&apt=${lucas.rdv[0].id}`);
    const ouverte = carteOuverte(page);
    await ouverte.getByRole('button', { name: 'Débiter 1 coupe · 25 €' }).click();
    await expect(ouverte.getByTestId('gc-visit-success')).toContainText('1 coupe débitée');
    expect(lucas.carte.remaining_balance).toBe(75);

    await toast(page, 'Coupe débitée.').getByRole('button', { name: 'Annuler' }).click();
    await expect(ouverte.getByTestId('gc-success').getByText('Débit annulé')).toBeVisible();
    await expect.poll(() => lucas.carte.remaining_balance).toBe(100);
    await expect.poll(() => lucas.rdv[0].status).toBe('confirmed');
    expect(lucas.rdv[0].gift_card_amount).toBe(0);
    expect(lucas.rdv[0].payment_method).toBeNull();
    await expect(toast(page, 'Débit annulé')).toBeVisible();
  });

  test('double clic sur « Débiter 1 coupe » : une seule coupe', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0 });
    await page.goto(`/admin/gift-cards?scan=${lucas.carte.code}`);
    await carteOuverte(page).getByRole('button', { name: 'Débiter 1 coupe · 25 €' }).dblclick();
    await expect(carteOuverte(page).getByTestId('gc-visit-success')).toContainText('1 coupe débitée');
    expect(api.requetesVers('POST', `/gift-cards/${lucas.carte.id}/debit`)).toHaveLength(1);
    expect(lucas.carte.remaining_balance).toBe(75);
  });

  test('prestation ajoutée au RDV dans l\'agenda : la carte paie une coupe, le reste s\'encaisse à part', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0 });
    lucas.rdv[0].total_price = 40; // 25 de la coupe + 15 de barbe
    await page.goto(`/admin/gift-cards?scan=${lucas.carte.code}&apt=${lucas.rdv[0].id}`);
    const ouverte = carteOuverte(page);
    await expect(ouverte.getByTestId('gc-apt-row').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(ouverte.getByTestId('gc-rest')).toContainText('Reste 15 € (prestation ajoutée) à encaisser dans l\'agenda.');
    await expect(ouverte.getByTestId('gc-close-apt')).toHaveCount(0);
    await ouverte.getByRole('button', { name: 'Débiter 1 coupe · 25 €' }).click();
    await expect.poll(() => lucas.carte.remaining_balance).toBe(75);
    expect(Number(lucas.rdv[0].gift_card_amount)).toBe(25);
    expect(lucas.rdv[0].status).toBe('confirmed');
  });

  test('moins d\'une coupe sur la carte (débit libre passé) : débit ordinaire en euros', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0 });
    lucas.carte.remaining_balance = 10;
    await page.goto(`/admin/gift-cards?scan=${lucas.carte.code}&apt=${lucas.rdv[0].id}`);
    const ouverte = carteOuverte(page);
    await expect(ouverte.getByRole('button', { name: /Débiter 1 coupe/ })).toHaveCount(0);
    await expect(ouverte.getByTestId('gc-debit')).toContainText('Débiter 10 € de la carte');
  });

  test('dernière coupe : abonnement terminé, la fiche reste sur le succès', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: -21 });
    lucas.carte.remaining_balance = 25;
    await page.goto(`/admin/gift-cards?scan=${lucas.carte.code}&apt=${lucas.rdv[3].id}`);
    const ouverte = carteOuverte(page);
    await expect(ouverte.getByTestId('gc-visits')).toHaveText('1 coupe restante');
    await ouverte.getByRole('button', { name: 'Débiter 1 coupe · 25 €' }).click();
    await expect(ouverte.getByTestId('gc-visit-success')).toContainText('Abonnement terminé');
    expect(lucas.carte.status).toBe('used');
  });

  test('carte ordinaire sur un RDV d\'abonnement : retiré de la liste, le refus du serveur est affiché', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 0, heure: '15:00' });
    api.tables.GiftCard.push({
      id: 'gc-ordinaire', code: 'DHB-ORDI-TEST', amount: 100, remaining_balance: 100, status: 'validated', sender_name: 'Jules', sender_email: 'jules@exemple.fr',
      recipient_name: 'Jules', valid_until: jour(300), validated_at: iso(jour(-3)), created_at: iso(jour(-3)),
    });
    await page.goto(`/admin/gift-cards?scan=DHB-ORDI-TEST&apt=${lucas.rdv[0].id}`);
    const ouverte = carteOuverte(page);
    await expect(ouverte.getByTestId('gc-wrong-card')).toContainText('Le RDV de Lucas M. fait partie d\'un abonnement : scannez la carte de cet abonnement.');
    const liste = ouverte.getByTestId('gc-apt-row');
    await expect(liste.filter({ hasText: 'Nina Roche' })).toBeVisible();
    await expect(liste.filter({ hasText: 'Lucas M.' })).toHaveCount(0);
    await expect(ouverte.getByRole('button', { name: /Débiter 1 coupe/ })).toHaveCount(0);

    // Montant libre : pas davantage proposé au rattachement
    await ouverte.getByRole('button', { name: 'Montant libre' }).click();
    await expect(ouverte.getByTestId('gc-attach-today')).not.toContainText('Lucas M.');

    // Devenu RDV d'abonnement entre deux lectures : le serveur refuse, son message s'affiche
    await ouverte.getByRole('button', { name: 'RDV du jour' }).click();
    const message = 'Ce RDV fait partie d\'un abonnement : scannez la carte de cet abonnement.';
    api.surcharger('POST', '/gift-cards/gc-ordinaire/debit', () => ({ status: 409, json: { error: message, code: 'wrong_card' } }));
    await liste.filter({ hasText: 'Nina Roche' }).click();
    await ouverte.getByTestId('gc-debit').click();
    await ouverte.getByTestId('gc-confirm').click();
    await expect(toast(page, message)).toBeVisible();
    await expect(liste.filter({ hasText: 'Nina Roche' })).toHaveAttribute('aria-pressed', 'false');
    expect(api.tables.GiftCard.find((c) => c.id === 'gc-ordinaire').remaining_balance).toBe(100);
  });

  test('liste des cartes : pastille « Abonnement » ; la carte s\'annule par l\'abonnement ; suppression refusée', async ({ page, api }) => {
    const lucas = abonnement(api, { client: LUCAS, statut: 'active', jours: 9 });
    api.tables.GiftCard.push({ id: 'gc-ordinaire', code: 'DHB-ORDI-TEST', amount: 50, remaining_balance: 50, status: 'validated', sender_name: 'Jules', recipient_name: 'Jules', valid_until: jour(300), validated_at: iso(jour(-3)), created_at: iso(jour(-3)) });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/admin/gift-cards');
    await expect(page.getByText('Abonnement', { exact: true })).toHaveCount(1);
    await page.getByText(lucas.carte.code).click();

    const ouverte = carteOuverte(page);
    await expect(ouverte.getByRole('button', { name: 'Annuler cette carte' })).toHaveCount(0);
    await expect(ouverte.getByTestId('gc-cancel-subscription').getByRole('link', { name: 'Abonnements' })).toBeVisible();

    const message = 'Cette carte appartient à un abonnement en cours : annulez d\'abord l\'abonnement (Abonnements).';
    api.surcharger('GET', `/gift-cards/${lucas.carte.id}/deletion`, () => ({ json: { transactions: 0, events: 0, sale: null, appointments: [] } }));
    api.surcharger('DELETE', `/gift-cards/${lucas.carte.id}`, () => ({ status: 409, json: { error: message, code: 'subscription_card' } }));
    await ouverte.getByTestId('gc-delete').click();
    await ouverte.getByTestId('gc-delete-confirm-button').click();
    const refus = ouverte.getByTestId('gc-delete-subscription');
    await expect(refus).toContainText(message);
    await refus.getByRole('link', { name: 'Ouvrir Abonnements' }).click();
    await expect(page).toHaveURL(/\/admin\/subscriptions/);
    await expect(caseDe(page, 'Lucas M.')).toBeVisible();
  });
});

test.describe('Tailles d\'écran', () => {
  for (const [largeur, hauteur] of [[1024, 768], [1366, 768], [1920, 1080], [390, 844], [320, 640]]) {
    test(`${largeur} px : aucun débordement, fenêtres dans l'écran`, async ({ page, api, connecter }) => {
      test.slow(); // toutes les pages du salon, l'une après l'autre
      await connecter(ADMIN);
      await sansCamera(page);
      await page.setViewportSize({ width: largeur, height: hauteur });
      // Noms et formules longs : le pire cas d'une ligne
      const long = { email: 'long@exemple.fr', full_name: 'Jean-Baptiste de La Rochefoucauld-Montmorency', phone: '0612345678' };
      abonnement(api, { client: long, prestation: PRESTATIONS_ABONNEMENT.barbe, jours: 1 });
      abonnement(api, { client: ENZO, prestation: premium, jours: -1 });
      const paye = abonnement(api, { client: LUCAS, statut: 'active', jours: 0 });

      const dansLEcran = async (f) => {
        const b = await f.boundingBox();
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(largeur);
      };

      await page.goto('/admin/subscriptions');
      await expect(caseDe(page, 'Enzo B.')).toBeVisible();
      await attendreSansDebordement(page, `Abonnements à ${largeur} px`);
      await caseDe(page, 'Jean-Baptiste').getByRole('button').first().click();
      await expect(fenetre(page)).toBeVisible();
      await dansLEcran(fenetre(page));
      await attendreSansDebordement(page, `fenêtre Valider à ${largeur} px`);
      await fenetre(page).getByRole('button', { name: /Annuler l'abonnement/ }).click();
      await attendreSansDebordement(page, `annulation à ${largeur} px`);
      await page.keyboard.press('Escape');

      await onglet(page, 'En cours (1)').click();
      await attendreSansDebordement(page, `En cours à ${largeur} px`);

      await page.goto(`/admin/gift-cards?scan=${paye.carte.code}&apt=${paye.rdv[0].id}`);
      await expect(carteOuverte(page).getByRole('button', { name: 'Débiter 1 coupe · 25 €' })).toBeVisible();
      await dansLEcran(carteOuverte(page));
      await attendreSansDebordement(page, `carte ouverte à ${largeur} px`);
      await carteOuverte(page).getByRole('button', { name: 'Débiter 1 coupe · 25 €' }).click();
      await expect(carteOuverte(page).getByTestId('gc-visit-success')).toBeVisible();
      await attendreSansDebordement(page, `coupe débitée à ${largeur} px`);

      await page.goto('/admin/gift-cards?open=scanner');
      await expect(page.getByRole('heading', { name: 'Scanner une carte' })).toBeVisible();
      expect(await debordementHorizontal(page)).toBeLessThanOrEqual(0);

      const fiche = await ouvrirFicheDe(page, BARBERS.kevin, /Lucas M\./);
      await dansLEcran(fiche);
      await attendreSansDebordement(page, `fiche du RDV à ${largeur} px`);
    });
  }

  test('« Abo 1/4 » tient sur une carte courte de l\'agenda à 390 px', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    abonnement(api, { client: { ...LUCAS, full_name: 'Maximilien de Saint-Exupéry' }, statut: 'active', jours: 0 });
    await page.goto(`/admin/agenda?view=day&date=${jour(0)}`);
    await expect(page.getByText('Abo 1/4').first()).toBeVisible();
    // La pastille ne prend jamais la place du nom du client
    const nom = await page.getByText('Maximilien de Saint-Exupéry').first().boundingBox();
    expect(nom.width).toBeGreaterThan(30);
    await attendreSansDebordement(page, 'l\'agenda à 390 px');
  });
});
