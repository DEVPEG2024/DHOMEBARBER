// Tableau de bord de l'admin, refonte du 1er nov. 2026 (et corrections de la contre-expertise du même
// jour) : « À faire », « Aujourd'hui », « Ce mois » (nom du mois), « Encaissements » (tableau
// Aujourd'hui | Ce mois + « Caisse du soir »), Last Minute, remplissage des 7 prochains jours (« Privé »,
// heures libres à partir de maintenant), jour et mois de Paris, relecture chaque minute, erreurs et
// coupure réseau, droits d'un barber, compteur « N clients sur l'app », largeurs d'écran.
//
// Chaque test remplace les rendez-vous simulés par les siens : les montants attendus sont calculés à
// la main, en commentaire. Rappel des règles (src/lib/dashboardStats.js) : encaissé = payé ou validé
// (`completed`) ; CA = prestations + produit, hors pourboire et HORS PART CARTE CADEAU ; CB / espèces
// par moyen de paiement (« CB + Espèces » : `cash_amount` en espèces, le reste en CB). Montants au
// format « 1 234,50 € » (espaces insécables) : `toHaveText` / `toContainText` avec une chaîne
// ramènent ces espaces à des espaces simples, une expression régulière doit les écrire `\s`.
//
// L'horloge est figée sur le mardi de référence à 10 h (Paris) : `jour(0)` = aujourd'hui. Ce mardi
// peut tomber le 1er du mois : les données « d'un autre jour du mois » et « du mois précédent » sont
// choisies pour que les montants attendus restent les mêmes quel que soit le jour du lancement.
import { test, expect, RESEAU_COUPE } from './support/test.js';
import { ADMIN, BARBERS, PRESTATIONS as P, rendezVous } from './support/donnees.js';
import { jour, ajouterJours, instantParis } from './support/temps.js';
import { attendreSansDebordement, toast } from './support/outils.js';

const AUJ = jour(0);
const MOIS = AUJ.slice(0, 7);
const PREMIER_DU_MOIS = `${MOIS}-01`;
const memeMois = (cle) => cle.startsWith(MOIS);
/** Un autre jour du mois en cours : hier, ou demain si aujourd'hui est le 1er. */
const AUTRE_JOUR_DU_MOIS = memeMois(jour(-1)) ? jour(-1) : jour(1);
const DERNIER_DU_MOIS_PRECEDENT = ajouterJours(PREMIER_DU_MOIS, -1);
const MOIS_PRECEDENT = DERNIER_DU_MOIS_PRECEDENT.slice(0, 7);
/** Toujours dans le mois précédent, et plus ancien qu'hier. */
const AVANT_LE_1ER = ajouterJours(PREMIER_DU_MOIS, -3);

const MOIS_LONG = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' });
const JOUR_COURT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const JOUR_SEMAINE = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' });
const dateUtc = (cle) => new Date(`${cle.slice(0, 10)}T12:00:00Z`);
const numeroDuJour = (cle) => (Number(cle.slice(8, 10)) === 1 ? '1er' : String(Number(cle.slice(8, 10))));
/** « jeudi 5 novembre », « dimanche 1er novembre » (libellés des cases du remplissage). */
const jourLong = (cle) => `${JOUR_SEMAINE.format(dateUtc(cle))} ${numeroDuJour(cle)} ${MOIS_LONG.format(dateUtc(cle))}`;
/** « 31 oct. » (précision des RDV à clôturer des jours d'avant). */
const jourCourt = (cle) => JOUR_COURT.format(dateUtc(cle));
/** Instant ISO de `cle` à `heure`, heure de Paris (`paid_at`, `validated_at`…). */
const iso = (cle, heure) => instantParis(cle, heure).toISOString();
/** « 1 234 € », « 28,29 € » : montant écrit à la main, espaces simples (comparé après normalisation). */
function euros(n) {
  const [entier, dec] = (Math.round(n * 100) / 100).toFixed(2).split('.');
  return `${entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${dec === '00' ? '' : `,${dec}`} €`;
}
/** 1er du mois qui suit celui de `cle`. */
const moisSuivant = (cle) => {
  const [a, m] = cle.split('-').map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
};
/** Nom du mois de `cle`, en minuscules (« octobre »). */
const nomDuMois = (cle) => MOIS_LONG.format(dateUtc(cle));
/** « mardi 3 novembre 2026 » : date de l'en-tête (date-fns `EEEE d MMMM yyyy`, sans « 1er »). */
const dateEnTete = (cle) => `${JOUR_SEMAINE.format(dateUtc(cle))} ${Number(cle.slice(8, 10))} ${nomDuMois(cle)} ${cle.slice(0, 4)}`;
/** « 0 € » seul (pas « 10 € », « 1 000 € » ni « 0,50 € ») : jamais à la place d'un chiffre manquant. */
const ZERO_EURO = /(^|[^\d,\s])\s*0\s€/;

const client = (prenom, nom) => ({
  full_name: `${prenom} ${nom}`, email: `${prenom.toLowerCase()}.${nom.toLowerCase()}@exemple.fr`.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), phone: '',
});

/** Rendez-vous simulé (colonnes de la table `appointments`). */
const rdv = (id, { de = client('Client', id), barber = BARBERS.dom, prestations = [P.coupe], date = AUJ, debut, statut = 'confirmed', ...reste }) =>
  rendezVous({ id, client: de, barber, prestations, date, debut, statut, ...reste });
/** Pause d'un barber (`status = 'break'`). */
const pause = (id, { barber = BARBERS.dom, date = AUJ, debut, fin }) => ({
  ...rendezVous({ id, client: null, barber, prestations: [], date, debut, statut: 'break' }),
  client_name: 'Pause', end_time: fin, total_duration: 60,
});
/** Encaissé, comme après « Valider la prestation ». */
const encaisse = (moyen, extra = {}) => ({ statut: 'completed', payment_method: moyen, payment_status: 'paid', ...extra });

const bloc = (page, nom) => page.getByRole('region', { name: nom, exact: true });

/**
 * Bloc « Chiffres » (en haut de la page) : deux grands chiffres, puis quatre tableaux « Aujourd'hui |
 * Ce mois », nommés par leur légende (`<caption>`).
 */
const chiffres = (page) => bloc(page, 'Chiffres');
const TABLEAUX = {
  ventes: /^Ventes/, rdv: /^Rendez-vous/, encaissements: /^Encaissements des rendez-vous/, pourboires: /^Pourboires$/,
};
/** Cellules CB, Espèces et Total d'un barber dans un tableau de pourboires (hors « Chiffres » aussi). */
const pourboiresDe = (conteneur, tableau, barber) => conteneur.getByRole('table', { name: tableau }).getByRole('row')
  .filter({ has: conteneur.page().getByRole('rowheader', { name: new RegExp(`^${barber}`) }) }).getByRole('cell');
/** Cellules « Aujourd'hui » et « Ce mois » d'une ligne d'un tableau de « Chiffres ». */
function ligneChiffres(page, tableau, libelle) {
  const nom = typeof libelle === 'string' ? { name: libelle, exact: true } : { name: libelle };
  const ligne = chiffres(page).getByRole('table', { name: tableau }).getByRole('row')
    .filter({ has: page.getByRole('rowheader', nom) });
  return { ligne, aujourdhui: ligne.getByRole('cell').nth(0), mois: ligne.getByRole('cell').nth(1) };
}
const ligneEncaissements = (page, libelle) => ligneChiffres(page, TABLEAUX.encaissements, libelle);

/** Vérifie les deux colonnes d'une ligne (par défaut du tableau « Encaissements des rendez-vous »). */
async function verifierLigne(page, libelle, aujourdhui, mois, tableau = TABLEAUX.encaissements) {
  const l = ligneChiffres(page, tableau, libelle);
  await expect(l.aujourdhui, `${libelle} · Aujourd'hui`).toHaveText(aujourdhui);
  await expect(l.mois, `${libelle} · Ce mois`).toHaveText(mois);
}
/** Grand chiffre de « Chiffres » (« CA aujourd'hui », « CA novembre ») : libellé, montant, comparaison. */
const grandChiffre = (page, libelle) => chiffres(page).getByText(libelle, { exact: true }).locator('xpath=..');
const caDuJour = (page) => grandChiffre(page, 'CA aujourd\'hui');
const caDuMois = (page, cle = AUJ) => grandChiffre(page, `CA ${nomDuMois(cle)}`);
/** Bloc « Fin de novembre » : fin de mois prévue et objectif (titre accepté avec ou sans élision). */
const blocFin = (page) => page.getByRole('region', { name: /^Fin d/ });

/** « Caisse du soir » : son bloc. */
const caisseDuSoir = (page) => bloc(page, 'Caisse du soir');
/** Montant en face d'un libellé de la caisse (« CB attendue », « Espèces attendues »). */
const montantCaisse = (page, libelle) => caisseDuSoir(page).getByText(libelle, { exact: false }).first()
  .locator('xpath=..').locator(':scope > span').nth(1);

/** Valeur d'un chiffre `<dt>` / `<dd>` dans un conteneur. */
const chiffre = (conteneur, libelle) => conteneur.locator('dt', { hasText: new RegExp(`^${libelle}$`) }).locator('xpath=following-sibling::dd[1]');

/** Barber connecté (fiche de Kevin) avec ces permissions. */
function compteBarber(api, permissions) {
  const compte = {
    id: `user-kevin-${permissions.join('-')}`, email: `kevin.${permissions.join('.')}@dhomebarber.fr`, full_name: 'Kevin Barber', phone: '',
    role: 'barber', employee_id: BARBERS.kevin.id, permissions,
  };
  api.comptes.push({ ...compte, motDePasse: 'x', birth_date: null, photo_url: null, created_date: '2026-01-15T10:00:00.000Z' });
  return compte;
}

/**
 * Journée chargée, avec quelque chose dans chaque bloc : RDV à clôturer (aujourd'hui, hier, avant le
 * 1er du mois), encaissés, à venir, absent, annulé, pause, Last Minute ; carte cadeau à valider,
 * commande à préparer, demande de congé, devis à envoyer, précommande textile à payer.
 */
function journeeChargee(api) {
  const long = client('Maximilien-Alexandre', 'de La Fontaine-Beaumarchais');
  api.tables.Appointment = [
    rdv('ch-ancien', { barber: BARBERS.kevin, prestations: [P.coupeBarbe], date: AVANT_LE_1ER, debut: '11:00' }),
    rdv('ch-hier', { date: jour(-1), debut: '15:00' }),
    rdv('ch-paye', { de: long, debut: '08:00', ...encaisse('cb', { tip: 5, tip_method: 'cb' }) }),
    rdv('ch-mixte', { barber: BARBERS.romain, prestations: [P.couleur, P.soin], debut: '08:00', ...encaisse('mixte', { cash_amount: 30, gift_card_amount: 10 }) }),
    rdv('ch-a-cloturer', { barber: BARBERS.kevin, prestations: [P.barbe], debut: '08:30' }),
    rdv('ch-absent', { barber: BARBERS.romain, debut: '09:00', statut: 'no_show' }),
    rdv('ch-annule', { debut: '09:00', statut: 'cancelled', cancellation_reason: 'Client : Empêchement' }),
    rdv('ch-a-venir', { de: long, barber: BARBERS.kevin, prestations: [P.coupeBarbe, P.soin, P.contours], debut: '11:00' }),
    rdv('ch-lm-pris', { barber: BARBERS.romain, debut: '15:00', internal_notes: '[last_minute] Créneau libre publié automatiquement' }),
    { ...rdv('ch-lm-libre', { de: null, barber: BARBERS.romain, debut: '17:00', statut: 'last_minute' }), client_name: '' },
    pause('ch-pause', { debut: '13:00', fin: '14:00' }),
  ];
  api.tables.GiftCard = [{ id: 'gc-attente', code: 'DHB-0001', amount: 50, remaining_balance: 50, status: 'pending', created_at: iso(AUJ, '09:00') }];
  api.tables.Order = [{ id: 'cmd-1', status: 'pending', total_price: 18, items: [], client_name: long.full_name, created_date: iso(AUJ, '08:00') }];
  api.tables.TimeOff = [{ id: 'conge-1', employee_id: BARBERS.romain.id, start_date: jour(20), end_date: jour(22), status: 'pending', created_at: iso(AUJ, '07:00') }];
  api.tables.Event = [{ id: 'priv-1', status: 'pending', date: jour(30), price: null, client_name: long.full_name, created_at: iso(AUJ, '07:30') }];
  api.tables.TextileReservation = [{ id: 'tx-1', status: 'reserved', unit_price: 30, quantity: 1, created_at: iso(AUJ, '07:45') }];
}

test.describe('Tableau de bord : encaissements', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(ADMIN);
  });

  test('tableau Aujourd\'hui | Ce mois : CB, espèces, CB + Espèces réparti, carte cadeau à part, pourboires, panier moyen', async ({ page, api }) => {
    api.tables.Appointment = [
      // Aujourd'hui
      rdv('e1', { debut: '08:00', ...encaisse('cb', { tip: 5, tip_method: 'cb' }) }), //                 CB 25, pourboire CB 5
      rdv('e2', { barber: BARBERS.kevin, prestations: [P.coupeBarbe], debut: '08:30', ...encaisse('especes', { tip: 3, tip_method: 'especes' }) }), // espèces 35, pourboire espèces 3
      rdv('e3', { barber: BARBERS.romain, prestations: [P.couleur], debut: '08:00', ...encaisse('mixte', { cash_amount: 20 }) }), // 45 : espèces 20 + CB 25
      rdv('e4', { prestations: [P.coupeBarbe], debut: '09:00', ...encaisse('cb', { gift_card_amount: 15 }) }), // 35 dont 15 par carte : CB 20
      rdv('e5', { barber: BARBERS.kevin, prestations: [P.barbe], debut: '09:15', ...encaisse('cb', { product_sold: 'Cire coiffante', product_price: 18 }) }), // 15 + produit 18 : CB 33
      rdv('e6', { barber: BARBERS.romain, debut: '09:00', statut: 'cancelled', cancellation_reason: 'Client : Empêchement' }), // pas compté
      rdv('e7', { barber: BARBERS.kevin, debut: '08:00', statut: 'no_show' }), //                                  pas compté
      rdv('e8', { debut: '14:00' }), //                                                                            à venir, pas compté
      // 15 + produit 15 = 30, dont 10 par carte : CB 20 ; produit hors carte au prorata 15 × 20 / 30 = 10
      rdv('e9', { barber: BARBERS.kevin, prestations: [P.barbe], debut: '09:30', ...encaisse('cb', { product_sold: 'Huile à barbe', product_price: 15, gift_card_amount: 10 }) }),
      // Un autre jour du mois
      rdv('f1', { date: AUTRE_JOUR_DU_MOIS, debut: '11:00', ...encaisse('especes', { tip: 2, tip_method: 'cb' }) }), // espèces 25, pourboire CB 2
      rdv('f2', { barber: BARBERS.romain, prestations: [P.barbe], date: AUTRE_JOUR_DU_MOIS, debut: '16:00', statut: 'completed' }), // non renseigné 15
    ];
    await page.goto('/admin');

    // Aujourd'hui : CB 25 + 25 + 20 + 33 + 20 = 123 ; espèces 35 + 20 = 55 ; total 178 ; carte cadeau 15 + 10 = 25
    // Ce mois : CB 123 ; espèces 55 + 25 = 80 ; non renseigné 15 ; total 218
    await verifierLigne(page, 'CB', '123 €', '123 €');
    await verifierLigne(page, 'Espèces', '55 €', '80 €');
    await verifierLigne(page, /^Non renseigné/, '0 €', '15 €');
    // Produits hors part carte cadeau : 18 + 10 = 28
    await verifierLigne(page, /^dont produits vendus en RDV/, '28 €', '28 €');
    // Part carte cadeau : hors CA, rappelée à part
    await verifierLigne(page, /^Réglé par carte cadeau/, '25 €', '25 €');
    // Rendez-vous (prestations + produits, hors carte cadeau) : 178 / 218 ; aucun autre canal
    await verifierLigne(page, 'Rendez-vous', '178 €', '218 €', TABLEAUX.ventes);
    await verifierLigne(page, 'Total tous canaux', '178 €', '218 €', TABLEAUX.ventes);
    await expect(caDuJour(page)).toContainText('CA aujourd\'hui178 €');
    await expect(caDuMois(page)).toContainText(`CA ${nomDuMois(AUJ)}218 €`);
    // Pourboires : CB 5 / 5 + 2 ; espèces 3 ; aucun sans moyen noté (ligne cachée) ; total 8 / 10
    await verifierLigne(page, 'CB', '5 €', '7 €', TABLEAUX.pourboires);
    await verifierLigne(page, 'Espèces', '3 €', '3 €', TABLEAUX.pourboires);
    await expect(ligneChiffres(page, TABLEAUX.pourboires, 'Non renseignés').ligne).toHaveCount(0);
    await verifierLigne(page, 'Total pourboires', '8 €', '10 €', TABLEAUX.pourboires);
    // RDV encaissés 6 / 8 ; panier moyen (CA hors carte ÷ RDV encaissés) : 178 / 6 = 29,666… = 29,67 € ;
    // ce mois 218 / 8 = 27,25 €
    await verifierLigne(page, 'RDV encaissés', '6', '8', TABLEAUX.rdv);
    await verifierLigne(page, /^Panier moyen/, '29,67 €', '27,25 €', TABLEAUX.rdv);
  });

  test('pourboires par barber : CB et espèces de chacun, aujourd\'hui et ce mois, moyen non noté rappelé, plus dans la carte du barber', async ({ page, api }) => {
    api.tables.Appointment = [
      rdv('p1', { debut: '08:00', ...encaisse('cb', { tip: 5, tip_method: 'cb' }) }),
      rdv('p2', { debut: '08:30', ...encaisse('especes', { tip: 3, tip_method: 'especes' }) }),
      // Le moyen du pourboire compte, pas celui du RDV
      rdv('p3', { barber: BARBERS.kevin, debut: '09:00', ...encaisse('cb', { tip: 4, tip_method: 'especes' }) }),
      rdv('p4', { barber: BARBERS.kevin, date: AUTRE_JOUR_DU_MOIS, debut: '11:00', ...encaisse('cb', { tip: 2, tip_method: 'cb' }) }),
      rdv('p5', { barber: BARBERS.kevin, date: AUTRE_JOUR_DU_MOIS, debut: '12:00', ...encaisse('cb', { tip: 1 }) }),
      // Romain : un RDV encaissé, aucun pourboire
      rdv('p6', { barber: BARBERS.romain, debut: '09:30', ...encaisse('cb') }),
    ];
    await page.goto('/admin');

    const tableaux = chiffres(page);
    const JOUR = /^Pourboires par barber · aujourd/;
    const MOIS_EN_COURS = /^Pourboires par barber · ce mois/;
    await expect(pourboiresDe(tableaux, JOUR, 'Dom')).toHaveText(['5 €', '3 €', '8 €']);
    await expect(pourboiresDe(tableaux, JOUR, 'Kevin')).toHaveText(['0 €', '4 €', '4 €']);
    await expect(pourboiresDe(tableaux, JOUR, 'Romain')).toHaveCount(0);
    await expect(pourboiresDe(tableaux, MOIS_EN_COURS, 'Dom')).toHaveText(['5 €', '3 €', '8 €']);
    await expect(pourboiresDe(tableaux, MOIS_EN_COURS, 'Kevin')).toHaveText(['2 €', '4 €', '7 €']);
    await expect(tableaux.getByRole('table', { name: MOIS_EN_COURS }).getByRole('rowheader', { name: /^Kevin/ })).toContainText('dont 1 € sans moyen noté');
    await expect(pourboiresDe(tableaux, MOIS_EN_COURS, 'Romain')).toHaveCount(0);
    // Les barbers additionnés redonnent le total du salon
    await verifierLigne(page, 'Total pourboires', '12 €', '15 €', TABLEAUX.pourboires);
    // Un chiffre une seule fois : plus de ligne « Pourboires » dans la carte du barber
    await expect(bloc(page, 'Barbers').getByText('Kevin', { exact: true })).toBeVisible();
    await expect(chiffre(bloc(page, 'Barbers'), 'Pourboires')).toHaveCount(0);
  });

  test('pourboires par barber : aucun tableau sans pourboire, et 320 px tiennent avec de gros montants', async ({ page, api }) => {
    api.tables.Appointment = [rdv('p1', { debut: '08:00', ...encaisse('cb') })];
    await page.goto('/admin');
    await expect(ligneChiffres(page, TABLEAUX.pourboires, 'Total pourboires').aujourdhui).toHaveText('0 €');
    await expect(chiffres(page).getByRole('table', { name: /^Pourboires par barber/ })).toHaveCount(0);
    await expect(caisseDuSoir(page).getByRole('table')).toHaveCount(0);

    api.tables.Appointment = [
      rdv('p2', { debut: '08:00', ...encaisse('cb', { tip: 12345.5, tip_method: 'cb' }) }),
      rdv('p3', { debut: '08:30', ...encaisse('cb', { tip: 23456.75, tip_method: 'especes' }) }),
    ];
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/admin');
    await expect(pourboiresDe(chiffres(page), /· aujourd/, 'Dom')).toHaveText(['12 345,50 €', '23 456,75 €', '35 802,25 €']);
    await attendreSansDebordement(page, 'pourboires par barber à 320 px');
  });

  test('« Caisse du soir » avec features.paidAt : un RDV d\'hier encaissé ce matin compte ce soir, cartes cadeau vendues en CB ajoutées, pourboires par barber en CB et en espèces', async ({ page, api }) => {
    api.tables.Appointment = [
      // Hier, encaissé ce matin à 9 h 15 : dans la caisse du soir, pas dans la colonne « Aujourd'hui »
      rdv('y1', { barber: BARBERS.kevin, prestations: [P.coupeBarbe], date: jour(-1), debut: '15:00', ...encaisse('cb', { tip: 4, tip_method: 'cb', paid_at: iso(AUJ, '09:15') }) }),
      rdv('t1', { debut: '08:00', ...encaisse('cb', { tip: 2, tip_method: 'cb', paid_at: iso(AUJ, '08:40') }) }),
      rdv('t2', { barber: BARBERS.romain, prestations: [P.barbe], debut: '08:30', ...encaisse('especes', { tip: 1, tip_method: 'especes', paid_at: iso(AUJ, '09:00') }) }),
      // Avant-hier, encaissé avant-hier : pas ce soir
      rdv('o1', { date: jour(-2), debut: '12:00', ...encaisse('cb', { tip: 10, tip_method: 'cb', paid_at: iso(jour(-2), '12:40') }) }),
    ];
    api.tables.GiftCard = [
      { id: 'gc-cb', code: 'DHB-1', amount: 50, remaining_balance: 50, status: 'validated', payment_method: 'cb', validated_at: iso(AUJ, '09:30'), created_at: iso(jour(-3), '10:00') },
      { id: 'gc-esp', code: 'DHB-2', amount: 30, remaining_balance: 30, status: 'validated', payment_method: 'especes', validated_at: iso(AUJ, '09:45'), created_at: iso(AUJ, '09:40') },
      { id: 'gc-hier', code: 'DHB-3', amount: 100, remaining_balance: 100, status: 'validated', payment_method: 'cb', validated_at: iso(jour(-1), '17:00'), created_at: iso(jour(-1), '16:00') },
    ];
    await page.goto('/admin');

    const caisse = caisseDuSoir(page);
    await expect(caisse).toContainText('Encaissements faits aujourd\'hui, quel que soit le jour du rendez-vous');
    // CB attendue : RDV 35 (hier) + 25 = 60, pourboires 4 + 2 = 6, cartes vendues en CB 50 → 116
    await expect(montantCaisse(page, 'CB attendue')).toHaveText('116 €');
    await expect(caisse).toContainText('RDV 60 € · pourboires 6 € · cartes cadeau vendues 50 €');
    // Espèces attendues : RDV 15, pourboire 1, carte vendue en espèces 30 → 46
    await expect(montantCaisse(page, 'Espèces attendues')).toHaveText('46 €');
    await expect(caisse).toContainText('RDV 15 € · pourboires 1 € · cartes cadeau vendues 30 €');
    await expect(caisse).toContainText('dont 35 € de rendez-vous des jours précédents encaissés aujourd\'hui');
    // Pourboires encaissés aujourd'hui : Kevin CB 4 (RDV d'hier encaissé ce matin), Dom CB 2, Romain espèces 1
    await expect(caisse.getByRole('table', { name: /^Pourboires par barber/ })).toContainText('CB à reverser ce soir');
    await expect(pourboiresDe(caisse, /^Pourboires par barber/, 'Kevin')).toHaveText(['4 €', '0 €', '4 €']);
    await expect(pourboiresDe(caisse, /^Pourboires par barber/, 'Dom')).toHaveText(['2 €', '0 €', '2 €']);
    await expect(pourboiresDe(caisse, /^Pourboires par barber/, 'Romain')).toHaveText(['0 €', '1 €', '1 €']);
    // Tableau, au jour du RDV : le RDV d'hier n'est pas dans « Aujourd'hui » ; ce mois, CB 25 + 35
    // (hier) + 25 (avant-hier), chacun seulement s'il tombe dans le mois en cours
    await verifierLigne(page, 'CB', '25 €', euros(25 + (memeMois(jour(-1)) ? 35 : 0) + (memeMois(jour(-2)) ? 25 : 0)));
  });

  test('« Caisse du soir » sans features.paidAt (serveur d\'avant) : au jour du rendez-vous', async ({ page, api }) => {
    api.donnees.parametresPublics.features.paidAt = false;
    api.tables.Appointment = [
      rdv('y1', { barber: BARBERS.kevin, prestations: [P.coupeBarbe], date: jour(-1), debut: '15:00', ...encaisse('cb', { tip: 4, tip_method: 'cb' }) }),
      rdv('t1', { debut: '08:00', ...encaisse('cb', { tip: 2, tip_method: 'cb' }) }),
      rdv('t2', { barber: BARBERS.romain, prestations: [P.barbe], debut: '08:30', ...encaisse('especes', { tip: 1, tip_method: 'especes' }) }),
    ];
    api.tables.GiftCard = [
      { id: 'gc-cb', code: 'DHB-1', amount: 50, remaining_balance: 50, status: 'validated', payment_method: 'cb', validated_at: iso(AUJ, '09:30'), created_at: iso(AUJ, '09:00') },
    ];
    await page.goto('/admin');

    const caisse = caisseDuSoir(page);
    await expect(caisse).toContainText('Rendez-vous du jour encaissés');
    // CB attendue : RDV 25 + pourboire 2 + carte vendue en CB 50 = 77 (le RDV d'hier compte hier)
    await expect(montantCaisse(page, 'CB attendue')).toHaveText('77 €');
    await expect(montantCaisse(page, 'Espèces attendues')).toHaveText('16 €');
    await expect(pourboiresDe(caisse, /^Pourboires par barber/, 'Dom')).toHaveText(['2 €', '0 €', '2 €']);
    await expect(pourboiresDe(caisse, /^Pourboires par barber/, 'Romain')).toHaveText(['0 €', '1 €', '1 €']);
    await expect(pourboiresDe(caisse, /^Pourboires par barber/, 'Kevin')).toHaveCount(0);
    await expect(caisse).not.toContainText('jours précédents');
  });

  test('« Caisse du soir » avec features.paidAt et le mois précédent illisible : « — » (un RDV du mois dernier encaissé ce soir manquerait)', async ({ page, api }) => {
    api.tables.Appointment = [
      rdv('t1', { debut: '08:00', ...encaisse('cb', { paid_at: iso(AUJ, '08:40') }) }),
      rdv('q1', { date: AVANT_LE_1ER, debut: '11:00', ...encaisse('cb', { paid_at: iso(AUJ, '09:10') }) }),
    ];
    // Lectures des jours du mois précédent en échec (paquets de jours : toutes leurs dates y sont)
    api.surcharger('GET', '/entities/Appointment', (req) => (Array.isArray(req.q?.date) && req.q.date.some((d) => d.startsWith(MOIS_PRECEDENT))
      ? { status: 500, json: { error: 'Erreur serveur' } } : undefined));
    await page.goto('/admin');

    // Le mois en cours est lu : tableau rempli ; la caisse ne peut pas être complète
    await verifierLigne(page, 'CB', '25 €', '25 €');
    await expect(montantCaisse(page, 'CB attendue')).toHaveText('—');
    await expect(montantCaisse(page, 'Espèces attendues')).toHaveText('—');
    await expect(caisseDuSoir(page)).not.toContainText(ZERO_EURO);
    await expect(page.getByText('Impossible de charger les rendez-vous du tableau de bord')).toHaveCount(0);
  });
});

test.describe('Tableau de bord : À faire', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(ADMIN);
  });

  test('prestations à clôturer (aujourd\'hui, hier, mois précédent), moyen de paiement à noter, carte cadeau, commande, devis, précommande, congé : une ligne et un lien chacun', async ({ page, api }) => {
    api.tables.Appointment = [
      rdv('a1', { barber: BARBERS.kevin, prestations: [P.coupeBarbe], date: AVANT_LE_1ER, debut: '11:00' }), // 35, mois précédent
      rdv('a2', { date: jour(-1), debut: '15:00' }), //                                                         25, hier
      rdv('a3', { barber: BARBERS.romain, prestations: [P.barbe], debut: '08:00' }), //                        15, fini à 8 h 20
      rdv('a4', { debut: '14:00' }), //                                                                         à venir : pas à clôturer
      rdv('a5', { barber: BARBERS.kevin, debut: '08:00', ...encaisse('cb') }), //                               encaissé
      // Validé par le barber sans moyen de paiement (avant-hier) : compté encaissé, moyen à noter
      rdv('a6', { barber: BARBERS.romain, prestations: [P.barbe], date: jour(-2), debut: '16:00', statut: 'completed' }),
    ];
    api.tables.Event = [
      { id: 'priv-devis', status: 'pending', date: jour(30), price: null, created_at: iso(AUJ, '07:30') },
      { id: 'priv-accepte', status: 'accepted', date: jour(40), price: 300, created_at: iso(jour(-4), '07:30') },
    ];
    api.tables.TextileReservation = [{ id: 'tx-1', status: 'reserved', unit_price: 30, quantity: 2, created_at: iso(AUJ, '07:45') }];
    api.tables.GiftCard = [{ id: 'gc-attente', code: 'DHB-0001', amount: 50, remaining_balance: 50, status: 'pending', created_at: iso(AUJ, '09:00') }];
    api.tables.Order = [{ id: 'cmd-1', status: 'pending', total_price: 18, items: [], created_date: iso(AUJ, '08:00') }];
    api.tables.TimeOff = [{ id: 'conge-1', employee_id: BARBERS.romain.id, start_date: jour(20), end_date: jour(22), status: 'pending', created_at: iso(AUJ, '07:00') }];
    await page.goto('/admin');

    const aFaire = bloc(page, 'À faire');
    // 35 + 25 + 15 = 75 € ; le plus ancien jour en premier dans l'agenda
    const cloturer = aFaire.getByRole('link', { name: /^3 prestations à clôturer · 75\s€/ });
    await expect(cloturer).toContainText(`dont 2 des jours précédents (depuis le ${jourCourt(AVANT_LE_1ER)})`);
    await expect(cloturer).toHaveAttribute('href', `/admin/agenda?view=day&date=${AVANT_LE_1ER}`);
    await expect(aFaire.getByRole('link', { name: /^1 carte cadeau à valider · 50\s€$/ })).toHaveAttribute('href', '/admin/gift-cards');
    await expect(aFaire.getByRole('link', { name: '1 commande à préparer' })).toHaveAttribute('href', '/admin/orders');
    await expect(aFaire.getByRole('link', { name: '1 demande de congé à valider' })).toHaveAttribute('href', '/admin/leave');
    const moyen = aFaire.getByRole('link', { name: /^1 moyen de paiement à noter · 15\s€/ });
    await expect(moyen).toContainText('Prestation validée sans moyen de paiement');
    await expect(moyen).toHaveAttribute('href', `/admin/agenda?view=day&date=${jour(-2)}`);
    await expect(aFaire.getByRole('link', { name: /^1 devis à envoyer/ })).toHaveAttribute('href', '/admin/events');
    await expect(aFaire.getByRole('link', { name: /^1 devis accepté à encaisser · 300\s€/ })).toHaveAttribute('href', '/admin/events');
    // 2 × 30 €
    await expect(aFaire.getByRole('link', { name: /^1 précommande textile à payer · 60\s€/ })).toHaveAttribute('href', '/admin/textile?tab=reservations');
    await expect(aFaire.getByRole('listitem')).toHaveCount(8);

    await cloturer.click();
    await expect(page).toHaveURL(new RegExp(`/admin/agenda\\?view=day&date=${AVANT_LE_1ER}`));
  });

  test('rien à faire : pas de bloc « À faire »', async ({ page }) => {
    // Données de base : RDV du jour à venir, rien à clôturer, ni carte, ni commande, ni congé
    await page.goto('/admin');
    await expect(bloc(page, 'Rendez-vous du jour').getByRole('list', { name: 'Rendez-vous du jour' })).toBeVisible();
    // Ventes lues (« … » tant qu'elles arrivent) : le bloc ne peut plus apparaître plus tard
    const ventes = bloc(page, 'Ventes hors rendez-vous');
    await expect(ventes.getByRole('button', { name: /^Boutique/ })).toContainText('Aucune commande en cours');
    await expect(ventes.getByRole('button', { name: /^Cartes cadeau/ })).toContainText('Reste à utiliser : 0 €');
    await expect(bloc(page, 'À faire')).toHaveCount(0);
  });
});

test.describe('Tableau de bord : Aujourd\'hui', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(ADMIN);
  });

  test('statut de chaque RDV, déplacement du client absent, lien vers l\'agenda du jour et du barber', async ({ page, api }) => {
    api.tables.Appointment = [
      rdv('b1', { de: client('Alice', 'Payée'), debut: '08:00', ...encaisse('cb') }),
      rdv('b2', { de: client('Bruno', 'Fini'), barber: BARBERS.kevin, prestations: [P.barbe], debut: '08:30' }), // fini à 8 h 50
      rdv('b3', { de: client('Chloé', 'Absente'), barber: BARBERS.romain, debut: '09:00', statut: 'no_show' }),
      rdv('b4', { de: client('David', 'Annulé'), debut: '09:00', statut: 'cancelled', cancellation_reason: 'Salon : fermeture exceptionnelle' }),
      // Déplacé par le client à un autre jour : ni annulation, ni RDV de plus dans la liste du jour
      rdv('b5', {
        de: client('Émile', 'Déplacé'), barber: BARBERS.kevin, debut: '09:30', statut: 'cancelled',
        cancellation_reason: `Client : déplacé au ${jour(2)} à 15:00`, rescheduled_to: 'b5-suite',
      }),
      rdv('b5-suite', { de: client('Émile', 'Déplacé'), barber: BARBERS.kevin, date: jour(2), debut: '15:00' }),
      // Pour un proche (Léo), réservé par Fanny
      rdv('b6', { de: client('Fanny', 'Avenir'), barber: BARBERS.kevin, prestations: [P.coupeBarbe], debut: '11:00', guest_name: 'Léo' }),
      rdv('b7', { de: client('Gaston', 'Encours'), barber: BARBERS.romain, debut: '09:45' }), // 9 h 45 – 10 h 15
      rdv('b8', { de: client('Hugo', 'Empêché'), barber: BARBERS.romain, debut: '12:00', statut: 'cancelled', cancellation_reason: 'Client : Empêchement' }),
      pause('b-pause', { debut: '13:00', fin: '14:00' }),
      // Hier : 20 € finis avant 10 h (comparés), 45 € à 15 h (pas encore « à la même heure »), 15 € finis
      // à 8 h 50 mais encaissés le soir (`paid_at` 18 h : pas encore encaissés à la même heure)
      rdv('y-matin', { date: jour(-1), debut: '08:00', prestations: [P.contours, P.contours], ...encaisse('cb') }),
      rdv('y-aprem', { date: jour(-1), debut: '15:00', prestations: [P.couleur], ...encaisse('cb') }),
      rdv('y-soir', { date: jour(-1), debut: '08:30', prestations: [P.barbe], ...encaisse('cb', { paid_at: iso(jour(-1), '18:00') }) }),
    ];
    await page.goto('/admin');

    const jourBloc = bloc(page, 'Rendez-vous du jour');
    const liste = jourBloc.getByRole('list', { name: 'Rendez-vous du jour' });
    const ligne = (prenom) => liste.getByRole('listitem').filter({ hasText: prenom });
    await expect(ligne('Alice')).toContainText('Payé · CB');
    await expect(ligne('Bruno')).toContainText('À clôturer');
    await expect(ligne('Chloé')).toContainText('Absent');
    await expect(ligne('David')).toContainText('Annulé');
    await expect(ligne('Fanny')).toContainText('Léo (Fanny Avenir)');
    await expect(ligne('Fanny')).toContainText('À venir');
    await expect(ligne('Gaston')).toContainText('En cours');
    await expect(ligne('Pause')).toContainText('Pause 13:00–14:00 · Dom');
    await expect(ligne('Hugo')).toContainText('Annulé');
    await expect(liste).not.toContainText('Émile');
    await expect(liste.getByRole('listitem')).toHaveCount(8);
    // Ordre : heure, puis barber
    await expect(liste.getByRole('listitem')).toHaveText([/Alice/, /Bruno/, /David/, /Chloé/, /Gaston/, /Fanny/, /Hugo/, /Pause/]);
    // Résumé : 4 RDV non annulés, 1 encaissé, 1 à clôturer (15 €), 2 à venir (25 + 35 = 60 €), 1 absent,
    // 2 annulés (le salon, Hugo) ; le déplacement d'Émile n'est pas une annulation
    await expect(jourBloc).toContainText('4 RDV');
    await expect(jourBloc).toContainText('1 encaissé');
    await expect(jourBloc).toContainText('1 à clôturer (15 €)');
    await expect(jourBloc).toContainText('2 à venir (60 €)');
    await expect(jourBloc).toContainText('1 absent');
    await expect(jourBloc).toContainText('2 annulés');
    // Annulations par les clients : Hugo seul (ni le salon, ni le déplacement)
    await verifierLigne(page, /^Annulations par les clients/, '1', '1', TABLEAUX.rdv);
    // Encaissé aujourd'hui 25 € contre 20 € hier à la même heure (RDV finis avant 10 h) : +25 %
    await expect(caDuJour(page)).toContainText('+25 %RDV vs hier même heure (20 €)');
    // Tableau « Rendez-vous » de « Chiffres » : aujourd'hui 1 encaissé ; ce mois, plus les 3 d'hier s'il
    // est dans le mois
    await verifierLigne(page, 'RDV encaissés', '1', memeMois(jour(-1)) ? '4' : '1', TABLEAUX.rdv);
    await expect(ligneChiffres(page, TABLEAUX.rdv, /^À clôturer/).aujourdhui).toHaveText(/^15\s€\s*1 RDV$/);
    await expect(ligneChiffres(page, TABLEAUX.rdv, /^À venir/).aujourdhui).toHaveText(/^60\s€\s*2 RDV$/);
    await verifierLigne(page, 'Absents', '1', '1', TABLEAUX.rdv);
    // RDV en cours mis en avant
    await expect(jourBloc.getByRole('link', { name: /^En cours · 09:45–10:15/ })).toBeVisible();

    await ligne('Fanny').getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/admin/agenda\\?view=day&date=${AUJ}&barber=${BARBERS.kevin.id}`));
  });

  test('plus de 8 lignes : liste repliée, « Voir toute la liste (10 lignes) », puis « Réduire »', async ({ page, api }) => {
    const barbers = [BARBERS.dom, BARBERS.kevin, BARBERS.romain];
    api.tables.Appointment = [
      ...Array.from({ length: 9 }, (_, i) => rdv(`n${i + 1}`, {
        de: client(`Client${i + 1}`, 'Liste'), barber: barbers[i % 3], debut: `${String(11 + Math.floor(i / 3)).padStart(2, '0')}:${['00', '15', '30'][i % 3]}`,
      })),
      pause('n-pause', { barber: BARBERS.kevin, debut: '16:00', fin: '17:00' }),
    ];
    await page.goto('/admin');

    const jourBloc = bloc(page, 'Rendez-vous du jour');
    const liste = jourBloc.getByRole('list', { name: 'Rendez-vous du jour' });
    await expect(liste.getByRole('listitem')).toHaveCount(8);
    const voir = jourBloc.getByRole('button', { name: 'Voir toute la liste (10 lignes)' });
    await expect(voir).toHaveAttribute('aria-expanded', 'false');
    await voir.click();
    await expect(liste.getByRole('listitem')).toHaveCount(10);
    await expect(jourBloc.getByRole('button', { name: 'Réduire' })).toHaveAttribute('aria-expanded', 'true');
    await jourBloc.getByRole('button', { name: 'Réduire' }).click();
    await expect(liste.getByRole('listitem')).toHaveCount(8);
  });
});

test.describe('Tableau de bord : le mois et son objectif', () => {
  /**
   * Ce mois : encaissé 25 + (45 − 10 par carte) = 60 € ; à clôturer 15 € ; à venir 35 €.
   * Mois précédent : 35 € le 1er à 9 h (toujours avant « la même date »), 45 € le dernier jour à
   * 15 h (jamais avant : même le 31, 15 h est après 10 h) → 35 € à la même date, 80 € en tout.
   */
  function moisConnu(api) {
    api.tables.Appointment = [
      rdv('p1', { debut: '08:00', ...encaisse('cb') }),
      rdv('p2', { barber: BARBERS.kevin, prestations: [P.couleur], debut: '08:30', ...encaisse('especes', { gift_card_amount: 10 }) }),
      rdv('u1', { barber: BARBERS.romain, prestations: [P.barbe], debut: '08:45' }), // fini à 9 h 05 : à clôturer
      rdv('u2', { prestations: [P.coupeBarbe], debut: '15:00' }), //                    à venir
      rdv('q1', { barber: BARBERS.kevin, prestations: [P.coupeBarbe], date: `${MOIS_PRECEDENT}-01`, debut: '09:00', ...encaisse('cb') }),
      rdv('q2', { barber: BARBERS.romain, prestations: [P.couleur], date: DERNIER_DU_MOIS_PRECEDENT, debut: '15:00', ...encaisse('cb') }),
    ];
  }
  // Mois précédent « au même jour » : le jour d'aujourd'hui, ramené au dernier jour du mois précédent
  const JOUR_DE_COUPURE = numeroDuJour(`${MOIS_PRECEDENT}-${String(Math.min(Number(AUJ.slice(8, 10)), Number(DERNIER_DU_MOIS_PRECEDENT.slice(8, 10)))).padStart(2, '0')}`);

  test('CA du mois hors carte cadeau, comparaison au mois précédent à la même date, fin de mois prévue', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    moisConnu(api);
    await page.goto('/admin');

    // CA du mois 60 € ; la part carte cadeau (10 €) à part, jamais ajoutée
    await expect(caDuMois(page)).toContainText(`CA ${nomDuMois(AUJ)}60 €`);
    await verifierLigne(page, /^Réglé par carte cadeau/, '10 €', '10 €');
    if (AUJ.endsWith('-01')) {
      // Le 1er : pas de comparaison (« −100 % » chaque 1er au matin)
      await expect(chiffres(page)).not.toContainText(' au 1er : ');
    } else {
      // (60 − 35) / 35 = +71,4 % → « +71 % »
      await expect(caDuMois(page)).toContainText(`+71 %${MOIS_LONG.format(dateUtc(DERNIER_DU_MOIS_PRECEDENT))} au ${JOUR_DE_COUPURE} : 35 €`);
    }
    // 60 + 15 + 35 = 110 €
    const fin = blocFin(page);
    await expect(fin).toContainText('Fin de mois prévue110 €');
    await expect(fin).toContainText('CA encaissé 60 € + 15 € à clôturer + 35 € de RDV à venir · mois dernier : 80 €');
  });

  test('CA de tous les canaux : boutique retirée, carte vendue, précommande payée, privatisation confirmée, répartition par canal', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    api.tables.Appointment = [rdv('c1', { debut: '08:00', ...encaisse('cb') })]; //                         25
    api.tables.Order = [
      { id: 'cmd-retiree', status: 'delivered', total_price: 18, delivered_at: iso(AUJ, '09:00'), created_date: iso(jour(-3), '10:00') }, // 18
      { id: 'cmd-en-cours', status: 'ready', total_price: 22, created_date: iso(AUJ, '08:00') }, //            pas encore retirée
    ];
    api.tables.GiftCard = [{ id: 'gc-1', code: 'DHB-1', amount: 50, remaining_balance: 50, status: 'validated', payment_method: 'cb', validated_at: iso(AUJ, '09:30'), created_at: iso(AUJ, '09:00') }]; // 50
    api.tables.TextileReservation = [{ id: 'tx-paye', status: 'paid', unit_price: 30, quantity: 1, created_at: iso(AUJ, '08:30') }]; // 30
    api.tables.Event = [{ id: 'priv-1', status: 'confirmed', price: 200, date: AUJ, created_at: iso(jour(-20), '10:00') }]; //          200
    await page.goto('/admin');

    // 25 + 18 + 50 + 30 + 200 = 323 €, aujourd'hui comme ce mois
    await expect(caDuJour(page)).toContainText('CA aujourd\'hui323 €');
    await expect(caDuMois(page)).toContainText(`CA ${nomDuMois(AUJ)}323 €`);
    const ventes = chiffres(page).getByRole('table', { name: TABLEAUX.ventes });
    await expect(ventes.getByRole('rowheader')).toHaveText([
      'Rendez-vous', 'Boutique (commandes retirées)', 'Cartes cadeau vendues', 'Privatisations', 'Textile (précommandes payées)', 'Total tous canaux',
    ]);
    for (const [ligne, montant] of [['Rendez-vous', '25 €'], ['Boutique (commandes retirées)', '18 €'], ['Cartes cadeau vendues', '50 €'],
      ['Privatisations', '200 €'], ['Textile (précommandes payées)', '30 €'], ['Total tous canaux', '323 €']]) {
      await verifierLigne(page, ligne, montant, montant, TABLEAUX.ventes);
    }
    // Caisse du soir : CB = RDV 25 + carte 50 ; boutique et textile à part (moyen non noté)
    await expect(montantCaisse(page, 'CB attendue')).toHaveText('75 €');
    await expect(caisseDuSoir(page)).toContainText('Boutique retirée et précommandes textile (au jour de la commande) : 48 € (moyen de paiement non noté)');
    await expect(chiffres(page)).toContainText('Achats payés par carte cadeau hors rendez-vous (boutique, textile, privatisations) : pas déduits.');
  });

  test('privatisation confirmée : comptée au CA du mois une fois passée, à venir dans la fin de mois prévue seulement', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    // Le 10 du mois prochain à 10 h : une privatisation le 5 (passée), une autre le 20 (à venir)
    const dixDuMois = `${moisSuivant(AUJ).slice(0, 7)}-10`;
    await page.clock.setSystemTime(instantParis(dixDuMois, '10:00'));
    api.tables.Appointment = [rdv('pv1', { date: dixDuMois, debut: '08:00', ...encaisse('cb') })]; //                     25
    api.tables.Event = [
      { id: 'priv-passee', status: 'confirmed', price: 200, date: `${dixDuMois.slice(0, 7)}-05`, time_slot: 'full_day', created_at: iso(jour(-20), '10:00') },
      { id: 'priv-a-venir', status: 'confirmed', price: 300, date: `${dixDuMois.slice(0, 7)}-20`, time_slot: 'afternoon', created_at: iso(jour(-10), '10:00') },
      { id: 'priv-devis', status: 'quoted', price: 500, date: `${dixDuMois.slice(0, 7)}-25`, created_at: iso(jour(-2), '10:00') }, // pas payée
    ];
    await page.goto('/admin');

    // CA du mois : 25 + 200 (passée) = 225 ; fin de mois prévue : 225 + 300 (à venir) = 525
    await expect(caDuMois(page, dixDuMois)).toContainText(`CA ${nomDuMois(dixDuMois)}225 €`);
    await verifierLigne(page, 'Privatisations', '0 €', '200 €', TABLEAUX.ventes);
    const fin = blocFin(page);
    await expect(fin).toContainText('Fin de mois prévue525 €');
    await expect(fin).toContainText('CA encaissé 225 € + 300 € de privatisations à venir');
    await expect(bloc(page, 'Ventes hors rendez-vous').getByRole('button', { name: /^Privatisations/ })).toContainText('À venir : 300 €');
  });

  test('objectif : l\'admin le fixe (seul champ envoyé), la barre et le % s\'affichent, il le retire', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    moisConnu(api);
    await page.goto('/admin');

    const mois = blocFin(page);
    await expect(mois.getByText('Aucun objectif fixé.')).toBeVisible();
    await mois.getByRole('button', { name: 'Fixer un objectif' }).click();
    const fenetre = page.getByRole('dialog', { name: 'Objectif du mois' });
    const champ = fenetre.getByLabel('Montant (€)');
    // Montant refusé : rien n'est envoyé
    await champ.fill('0');
    await fenetre.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(fenetre.getByRole('alert')).toContainText('Montant invalide');
    expect(api.requetesVers('PUT', '/entities/SalonSettings/settings-1')).toHaveLength(0);

    // Refus du serveur : son message, la fenêtre reste ouverte ; le second essai passe
    let refus = true;
    api.surcharger('PUT', '/entities/SalonSettings/settings-1', () => {
      if (!refus) return undefined;
      refus = false;
      return { status: 400, json: { error: 'Objectif de CA du mois invalide : un montant de 0,01 à 1 000 000 €, ou vide pour aucun objectif.' } };
    });
    await champ.fill('200');
    await fenetre.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(fenetre.getByRole('alert')).toContainText('Objectif de CA du mois invalide');
    await fenetre.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(toast(page, 'Objectif enregistré')).toContainText('200 € par mois');
    await expect(fenetre).toHaveCount(0);
    expect(api.requetesVers('PUT', '/entities/SalonSettings/settings-1').at(-1).corps).toEqual({ monthly_revenue_goal: 200 });

    // 60 / 200 = 30 % ; fin de mois prévue 110 / 200 = 55 %
    const barre = mois.getByRole('progressbar', { name: 'Objectif du mois' });
    await expect(barre).toHaveAttribute('aria-valuenow', '30');
    await expect(mois).toContainText('30 % de 200 €');
    await expect(mois).toContainText('fin de mois prévue : 55 %');

    await mois.getByRole('button', { name: 'Modifier' }).click();
    await expect(fenetre.getByLabel('Montant (€)')).toHaveValue('200');
    await fenetre.getByRole('button', { name: 'Retirer l\'objectif' }).click();
    await expect(toast(page, 'Objectif retiré')).toBeVisible();
    expect(api.requetesVers('PUT', '/entities/SalonSettings/settings-1').at(-1).corps).toEqual({ monthly_revenue_goal: null });
    await expect(mois.getByText('Aucun objectif fixé.')).toBeVisible();
    await expect(barre).toHaveCount(0);
  });

  test('objectif jamais montré à un barber (le serveur ne le lui renvoie pas)', async ({ page, api, connecter }) => {
    moisConnu(api);
    api.tables.SalonSettings[0].monthly_revenue_goal = 200;
    await connecter(compteBarber(api, ['dashboard']));
    await page.goto('/admin');

    const mois = blocFin(page);
    await expect(mois).toContainText('Fin de mois prévue110 €');
    await expect(mois.getByText('Objectif du mois')).toHaveCount(0);
    await expect(mois.getByRole('progressbar')).toHaveCount(0);
    await expect(mois.getByRole('button', { name: /Modifier|Fixer un objectif/ })).toHaveCount(0);
  });

  test('serveur sans features.revenueGoal : aucun objectif, même enregistré', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    moisConnu(api);
    api.tables.SalonSettings[0].monthly_revenue_goal = 200;
    api.donnees.parametresPublics.features.revenueGoal = false;
    await page.goto('/admin');

    const mois = blocFin(page);
    await expect(mois).toContainText('Fin de mois prévue110 €');
    await expect(mois.getByText('Objectif du mois')).toHaveCount(0);
    await expect(mois.getByRole('button', { name: /Modifier|Fixer un objectif/ })).toHaveCount(0);
  });
});

test.describe('Tableau de bord : Last Minute et remplissage', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(ADMIN);
  });

  test('Last Minute : un automatique pris compte en « Comblés », un de l\'équipe pris en « Pris par un client »', async ({ page, api }) => {
    api.tables.Appointment = [
      // Équipe : un pris (encaissé 25 €), un encore libre
      rdv('lm-equipe-pris', { de: client('Alice', 'Rapide'), debut: '08:00', internal_notes: '[last_minute]', ...encaisse('cb') }),
      { ...rdv('lm-equipe-libre', { de: null, barber: BARBERS.kevin, debut: '16:00', statut: 'last_minute' }), client_name: '' },
      // Automatiques : un pris par un client (pas encore encaissé), un encore libre
      rdv('lm-auto-pris', { de: client('Bruno', 'Malin'), barber: BARBERS.romain, debut: '15:00', internal_notes: '[last_minute] Créneau libre publié automatiquement' }),
      { ...rdv('lm-auto-libre', { de: null, barber: BARBERS.romain, debut: '17:00', statut: 'last_minute', internal_notes: 'Créneau libre publié automatiquement' }), client_name: '' },
      // Libre mais déjà passé (8 h) : publié, plus à prendre
      { ...rdv('lm-auto-passe', { de: null, barber: BARBERS.kevin, debut: '08:00', statut: 'last_minute', internal_notes: 'Créneau libre publié automatiquement' }), client_name: '' },
    ];
    await page.goto('/admin');

    const lm = bloc(page, 'Last Minute et absences du mois');
    // Encore à prendre : 16 h et 17 h (pas celui de 8 h)
    await expect(lm).toContainText('2 créneaux libres encore à prendre aujourd\'hui');
    const equipe = lm.getByText('Publiés par l\'équipe').locator('xpath=..');
    await expect(chiffre(equipe, 'Publiés')).toHaveText('2');
    await expect(chiffre(equipe, 'Pris par un client')).toHaveText('1');
    await expect(chiffre(equipe, 'Taux de prise')).toHaveText('50 %');
    await expect(chiffre(equipe, 'CA encaissé')).toHaveText('25 €');
    const auto = lm.getByText(/^Automatiques/).locator('xpath=..');
    await expect(chiffre(auto, 'Publiés')).toHaveText('3');
    await expect(chiffre(auto, 'Comblés')).toHaveText('1');
    await expect(chiffre(auto, 'CA encaissé')).toHaveText('0 €');
  });

  test('remplissage : « Congé », jour non travaillé « — », % juste sur une journée connue, heures libres de la semaine', async ({ page, api }) => {
    // Romain ne travaille pas le jeudi (jour(2) : le mardi de référence + 2)
    api.tables.Employee.find((e) => e.id === BARBERS.romain.id).working_hours.thursday.closed = true;
    // Kevin en congé approuvé demain
    api.tables.TimeOff = [{ id: 'conge-kevin', employee_id: BARBERS.kevin.id, start_date: jour(1), end_date: jour(1), status: 'approved', created_at: iso(jour(-5), '10:00') }];
    // Dom aujourd'hui, 9 h – 19 h (600 min) moins une pause d'une heure : 540 min de travail.
    // Réservé : 10:00–10:30 (30), 11:00–12:00 et 11:30–12:00 qui se chevauchent (60, une fois),
    // 18:30–19:30 coupé à 19 h (30) = 120 min ; annulé et Last Minute libre non comptés.
    // 120 / 540 = 22,2 % → « 22 ». Libre à partir de maintenant (10 h) : 540 − 60 de pause − 120 = 360 min
    // = « 6 h libres à partir de maintenant »
    api.tables.Appointment = [
      pause('r-pause', { debut: '13:00', fin: '14:00' }),
      rdv('r1', { debut: '10:00' }),
      rdv('r2', { prestations: [P.couleur], debut: '11:00' }),
      rdv('r3', { debut: '11:30' }),
      rdv('r4', { prestations: [P.couleur], debut: '15:00', statut: 'cancelled', cancellation_reason: 'Client : Empêchement' }),
      { ...rdv('r5', { de: null, debut: '16:00', statut: 'last_minute' }), client_name: '' },
      rdv('r6', { prestations: [P.couleur], debut: '18:30' }),
    ];
    await page.goto('/admin');

    const grille = bloc(page, 'Remplissage des 7 prochains jours');
    const dom = grille.getByRole('link', { name: `Dom, aujourd'hui, ${jourLong(AUJ)} : 22 % réservé, 6 h libres à partir de maintenant` });
    await expect(dom).toHaveText('22');
    await expect(dom).toHaveAttribute('href', `/admin/agenda?view=day&date=${AUJ}&barber=${BARBERS.dom.id}`);
    await expect(grille.getByRole('link', { name: `Dom, ${jourLong(jour(1))} : 0 % réservé, 10 h libres` })).toHaveText('0');
    await expect(grille.getByRole('link', { name: `Kevin, aujourd'hui, ${jourLong(AUJ)} : 0 % réservé, 9 h libres à partir de maintenant` })).toHaveText('0');
    await expect(grille.getByRole('link', { name: `Kevin, ${jourLong(jour(1))} : en congé` })).toHaveText('Congé');
    await expect(grille.getByRole('link', { name: `Romain, ${jourLong(jour(2))} : repos` })).toHaveText('—');
    // Heures libres, aujourd'hui à partir de 10 h : Dom 360 + 6 × 600 ; Kevin 540 + 5 × 600 (congé hors
    // compte) ; Romain 540 + 5 × 600 (repos) = 3960 + 3540 + 3540 = 11 040 min = 184 h
    await expect(grille).toContainText('Heures libres sur les 7 jours, tous barbersà partir de maintenant184 h');
  });

});

test.describe('Tableau de bord : privatisations au remplissage', () => {
  /**
   * Privatisations : journée entière (9 h – 20 h) dans 3 jours, après-midi (14 h – 20 h) dans 4 jours,
   * confirmées ; une demande seulement acceptée (pas payée) dans 5 jours ne bloque rien.
   */
  function privatisations(api) {
    api.tables.Appointment = [];
    api.tables.Event = [
      { id: 'priv-jour', status: 'confirmed', date: jour(3), time_slot: 'full_day', price: 900, client_name: 'Société Dupont', client_email: 'contact@dupont.fr', created_at: iso(jour(-10), '10:00') },
      { id: 'priv-aprem', status: 'confirmed', date: jour(4), time_slot: 'afternoon', price: 500, client_name: 'Anniversaire Léa', client_email: 'lea@exemple.fr', created_at: iso(jour(-10), '10:00') },
      { id: 'priv-acceptee', status: 'accepted', date: jour(5), time_slot: 'full_day', price: 700, client_email: 'autre@exemple.fr', created_at: iso(jour(-3), '10:00') },
    ];
  }
  /** Libellés d'un barber : journée privatisée, demi-journée (5 h restent), journée seulement acceptée. */
  const libellesPrives = (b) => ({
    prive: `${b}, ${jourLong(jour(3))} : salon privatisé`,
    demi: `${b}, ${jourLong(jour(4))} : 0 % réservé, 5 h libres`,
    libre: `${b}, ${jourLong(jour(5))} : 0 % réservé, 10 h libres`,
  });
  // Heures libres : chaque barber 540 (aujourd'hui dès 10 h) + 600 × 4 (jours 1, 2, 5, 6) + 300 (matin
  // du jour 4) = 3240 ; × 3 barbers = 9720 min = 162 h
  const LIBRES_AVEC_PRIVATISATIONS = 'à partir de maintenant162 h';

  test('remplissage, admin : salon privatisé toute la journée « Privé », une demi-journée déduite des heures', async ({ page, api, connecter }) => {
    privatisations(api);
    await connecter(ADMIN);
    await page.goto('/admin');

    const grille = bloc(page, 'Remplissage des 7 prochains jours');
    for (const b of ['Dom', 'Kevin', 'Romain']) {
      const l = libellesPrives(b);
      await expect(grille.getByRole('link', { name: l.prive })).toHaveText('Privé');
      await expect(grille.getByRole('link', { name: l.demi })).toHaveText('0');
      await expect(grille.getByRole('link', { name: l.libre })).toHaveText('0');
    }
    await expect(grille).toContainText(LIBRES_AVEC_PRIVATISATIONS);
  });

  test('remplissage, barber : « Privé » aussi, en ne lisant que les privatisations confirmées réduites au créneau', async ({ page, api, connecter }) => {
    privatisations(api);
    await connecter(compteBarber(api, ['dashboard']));
    await page.goto('/admin');

    // Sans l'agenda : cases sans lien, libellé pour lecteur d'écran à côté du mot affiché
    const grille = bloc(page, 'Remplissage des 7 prochains jours');
    for (const b of ['Dom', 'Kevin', 'Romain']) {
      const l = libellesPrives(b);
      await expect(grille.getByText(l.prive, { exact: true }).locator('xpath=..')).toHaveText(`Privé${l.prive}`);
      await expect(grille.getByText(l.demi, { exact: true })).toHaveCount(1);
      await expect(grille.getByText(l.libre, { exact: true })).toHaveCount(1);
    }
    await expect(grille).toContainText(LIBRES_AVEC_PRIVATISATIONS);
    await expect(grille.getByRole('link')).toHaveCount(0);
    // Seulement `Event.filter({ status: 'confirmed' })` (jamais la liste des ventes), sans prix ni client
    const lectures = api.requetesVers('GET', '/entities/Event');
    expect(lectures.length).toBeGreaterThan(0);
    for (const r of lectures) expect(r.q).toEqual({ status: 'confirmed' });
    await expect(page.getByRole('main')).not.toContainText('Dupont');
  });
});

test.describe('Tableau de bord : jour et mois de Paris', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(ADMIN);
  });

  test('après minuit, sans recharger : le jour suivant, et le RDV de la veille resté ouvert passe « D\'hier » dans « À faire »', async ({ page, api }) => {
    api.tables.Appointment = [
      rdv('v1', { de: client('Vincent', 'Veille'), debut: '15:00' }),
      rdv('d1', { de: client('Diane', 'Demain'), barber: BARBERS.kevin, date: jour(1), debut: '10:00' }),
    ];
    await page.goto('/admin');
    const liste = bloc(page, 'Rendez-vous du jour').getByRole('list', { name: 'Rendez-vous du jour' });
    await expect(liste).toContainText('Vincent');
    await expect(page.getByRole('main')).toContainText(dateEnTete(AUJ));

    // 10 h → 0 h 05 le lendemain
    await page.clock.fastForward((14 * 60 + 5) * 60_000);
    await expect(page.getByRole('main')).toContainText(dateEnTete(jour(1)));
    await expect(liste).toContainText('Diane');
    await expect(liste).not.toContainText('Vincent');
    await expect(liste.getByRole('listitem').filter({ hasText: 'Diane' })).toContainText('À venir');
    const cloturer = bloc(page, 'À faire').getByRole('link', { name: /^1 prestation à clôturer · 25\s€/ });
    await expect(cloturer).toContainText('D\'hier');
    await expect(cloturer).toHaveAttribute('href', `/admin/agenda?view=day&date=${AUJ}`);
  });

  test('dernier jour du mois : les jours suivants sont lus dans le mois d\'après (remplissage, CA à venir)', async ({ page, api }) => {
    const fin = ajouterJours(moisSuivant(AUJ), -1);
    const apres = ajouterJours(fin, 2); // toujours dans le mois suivant
    await page.clock.setSystemTime(instantParis(fin, '10:00'));
    api.tables.Appointment = [
      rdv('x1', { date: fin, debut: '08:00', ...encaisse('cb') }),
      rdv('x2', { prestations: [P.couleur], date: apres, debut: '10:00' }), // 60 min sur 600 : 10 %
    ];
    await page.goto('/admin');

    await expect(caDuMois(page, fin)).toContainText(`CA ${nomDuMois(fin)}25 €`);
    const grille = bloc(page, 'Remplissage des 7 prochains jours');
    await expect(grille.getByRole('link', { name: `Dom, ${jourLong(apres)} : 10 % réservé, 9 h libres` })).toHaveText('10');
    await expect(grille.getByRole('link', { name: `Dom, aujourd'hui, ${jourLong(fin)} : 0 % réservé, 9 h libres à partir de maintenant` })).toBeVisible();
    const moisApres = nomDuMois(apres);
    await expect(page.getByRole('region', { name: 'CA à venir, tous les mois' }).getByRole('listitem'))
      .toHaveText([new RegExp(`^${moisApres} ${apres.slice(0, 4)}45\\s€1 RDV$`, 'i')]);
  });

  test('le 1er du mois : la veille à clôturer « D\'hier », pas encore de comparaison au mois précédent', async ({ page, api }) => {
    const premier = moisSuivant(AUJ);
    const hier = ajouterJours(premier, -1);
    const premierPrecedent = `${hier.slice(0, 7)}-01`;
    await page.clock.setSystemTime(instantParis(premier, '10:00'));
    api.tables.Appointment = [
      rdv('h1', { date: hier, debut: '15:00' }), //                                                          25 à clôturer, d'hier
      rdv('p1', { barber: BARBERS.kevin, prestations: [P.coupeBarbe], date: premier, debut: '08:00', ...encaisse('cb') }), // 35
      rdv('u1', { date: premier, debut: '15:00' }), //                                                       25 à venir
      rdv('q1', { barber: BARBERS.romain, date: premierPrecedent, debut: '09:00', ...encaisse('cb') }), //   25
      rdv('q2', { barber: BARBERS.romain, prestations: [P.couleur], date: premierPrecedent, debut: '11:00', ...encaisse('cb') }), // 45
    ];
    await page.goto('/admin');

    const cloturer = bloc(page, 'À faire').getByRole('link', { name: /^1 prestation à clôturer · 25\s€/ });
    await expect(cloturer).toContainText('D\'hier');
    await expect(cloturer).toHaveAttribute('href', `/admin/agenda?view=day&date=${hier}`);
    const mois = blocFin(page);
    // Le 1er au matin, une comparaison dirait « −100 % » ou presque : masquée ; le mois dernier reste
    // rappelé dans la fin de mois prévue (35 + 25 à venir = 60 ; mois dernier 25 + 45 = 70)
    await expect(caDuMois(page, premier)).toContainText(`CA ${nomDuMois(premier)}35 €`);
    await expect(caDuMois(page, premier)).not.toContainText(`${nomDuMois(hier)} au 1er`);
    await expect(caDuMois(page, premier).getByText(/^[+−]\d+ %$/)).toHaveCount(0);
    await expect(mois).toContainText('Fin de mois prévue60 €');
    await expect(mois).toContainText('CA encaissé 35 € + 25 € de RDV à venir · mois dernier : 70 €');
  });

  // Élision devant une voyelle (« Fin de octobre » avant le 1er nov. 2026 au soir)
  test('en octobre : « Fin d\'octobre », « Chiffres d\'octobre » (élision devant une voyelle)', async ({ page, api }) => {
    const annee = Number(AUJ.slice(0, 4)) + (Number(AUJ.slice(5, 7)) > 10 ? 1 : 0);
    const octobre = `${annee}-10-13`;
    await page.clock.setSystemTime(instantParis(octobre, '10:00'));
    api.tables.Appointment = [];
    await page.goto('/admin');

    await expect(caDuMois(page, octobre)).toContainText('CA octobre');
    await expect(page.getByRole('region', { name: 'Fin d\'octobre', exact: true })).toBeVisible({ timeout: 3_000 });
    await expect(bloc(page, 'Last Minute et absences du mois')).toContainText(`Chiffres d'octobre ${annee}`, { timeout: 3_000 });
  });

  test('le 31 après un mois de 30 jours : le mois précédent, fini, compte en entier', async ({ page, api }) => {
    // Prochain 31 qui suit un mois de 30 jours (décembre, mai, juillet, octobre), à partir d'aujourd'hui
    let jour31 = null;
    for (let debut = `${MOIS}-01`; !jour31; debut = moisSuivant(debut)) {
      const fin = ajouterJours(moisSuivant(debut), -1);
      if (fin.endsWith('-31') && ajouterJours(debut, -1).endsWith('-30') && fin >= AUJ) jour31 = fin;
    }
    const trente = ajouterJours(jour31.slice(0, 7) + '-01', -1);
    await page.clock.setSystemTime(instantParis(jour31, '10:00'));
    api.tables.Appointment = [
      rdv('t1', { date: jour31, debut: '08:00', ...encaisse('cb') }), //                                        25
      rdv('t2', { prestations: [P.coupeBarbe], date: trente, debut: '09:00', ...encaisse('cb') }), //          35
      rdv('t3', { prestations: [P.couleur], date: trente, debut: '15:00', ...encaisse('cb') }), //             45, après 10 h mais compté
    ];
    await page.goto('/admin');


    // Le mois précédent n'a pas de 31 : il est fini, compté en entier (35 + 45 = 80).
    // (25 − 80) / 80 = −68,75 % → « −69 % » (signe moins typographique)
    await expect(caDuMois(page, jour31)).toContainText(`\u221269 %${nomDuMois(trente)} au 30 : 80 €`);
  });

  test.describe('appareil réglé sur un autre fuseau (Pago Pago, la veille au soir)', () => {
    test.use({ timezoneId: 'Pacific/Pago_Pago' });

    test('jour, heures et statuts restent ceux de Paris', async ({ page, api }) => {
      api.tables.Appointment = [
        rdv('z1', { de: client('Alice', 'Payée'), debut: '08:00', ...encaisse('cb') }),
        rdv('z2', { de: client('Bruno', 'Fini'), barber: BARBERS.kevin, prestations: [P.barbe], debut: '08:30' }), // fini à 8 h 50 (Paris)
        rdv('z3', { de: client('Fanny', 'Avenir'), barber: BARBERS.kevin, prestations: [P.coupeBarbe], debut: '11:00' }),
        rdv('z4', { de: client('Hier', 'Soir'), date: jour(-1), debut: '18:00', ...encaisse('cb') }),
      ];
      await page.goto('/admin');

      await expect(page.getByRole('main')).toContainText(dateEnTete(AUJ));
      const liste = bloc(page, 'Rendez-vous du jour').getByRole('list', { name: 'Rendez-vous du jour' });
      await expect(liste.getByRole('listitem')).toHaveCount(3);
      await expect(liste.getByRole('listitem').filter({ hasText: 'Bruno' })).toContainText('À clôturer');
      await expect(liste.getByRole('listitem').filter({ hasText: 'Fanny' })).toContainText('À venir');
      await expect(ligneEncaissements(page, 'CB').aujourdhui).toHaveText('25 €');
      // Kevin, aujourd'hui (Paris) : 11:00–11:45 sur 600 min = 7,5 % → 8 (08:30 est avant l'ouverture) ;
      // libre à partir de 10 h (Paris) : 540 − 45 = 495 min = 8 h 15
      await expect(bloc(page, 'Remplissage des 7 prochains jours')
        .getByRole('link', { name: `Kevin, aujourd'hui, ${jourLong(AUJ)} : 8 % réservé, 8 h 15 libres à partir de maintenant` })).toHaveText('8');
    });
  });
});

test.describe('Tableau de bord : relecture et erreurs', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(ADMIN);
  });

  test('relu chaque minute : un encaissement fait ailleurs apparaît sans recharger la page', async ({ page, api }) => {
    api.tables.Appointment = [
      rdv('m1', { debut: '08:00', ...encaisse('cb') }),
      rdv('m2', { barber: BARBERS.kevin, prestations: [P.coupeBarbe], debut: '08:30' }),
    ];
    await page.goto('/admin');
    const cb = ligneEncaissements(page, 'CB').aujourdhui;
    await expect(cb).toHaveText('25 €');
    const lectures = api.requetesVers('GET', '/entities/Appointment').length;

    // Encaissé sur un autre appareil (35 € en CB)
    Object.assign(api.tables.Appointment.find((a) => a.id === 'm2'), { status: 'completed', payment_method: 'cb', payment_status: 'paid' });
    await expect(cb).toHaveText('25 €');
    await page.clock.runFor(60_000);
    await expect(cb).toHaveText('60 €');
    expect(api.requetesVers('GET', '/entities/Appointment').length).toBeGreaterThan(lectures);
    await expect(bloc(page, 'Rendez-vous du jour').getByRole('list', { name: 'Rendez-vous du jour' }).getByRole('listitem').filter({ hasText: 'm2' }))
      .toContainText('Payé · CB');
  });

  test('rendez-vous illisibles : un seul bandeau, « — » partout, jamais « 0 € »', async ({ page, api }) => {
    api.surcharger('GET', '/entities/Appointment', () => ({ status: 500, json: { error: 'Erreur serveur' } }));
    await page.goto('/admin');

    await expect(page.getByRole('alert').filter({ hasText: 'Impossible de charger les rendez-vous du tableau de bord' })).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByText('Impossible de charger les rendez-vous du tableau de bord')).toHaveCount(1);
    await expect(ligneEncaissements(page, 'CB').aujourdhui).toHaveText('—');
    await expect(montantCaisse(page, 'CB attendue')).toHaveText('—');
    for (const nom of ['Rendez-vous du jour', 'Caisse du soir', '7 derniers jours', 'Barbers', 'Last Minute et absences du mois']) {
      await expect(bloc(page, nom), `bloc « ${nom} »`).toBeVisible();
      await expect(bloc(page, nom), `bloc « ${nom} »`).not.toContainText(ZERO_EURO);
    }
    // « Chiffres » : tout ce qui vient des RDV ; les autres canaux, lus, valent vraiment 0 € (lignes à part)
    for (const tableau of [TABLEAUX.rdv, TABLEAUX.encaissements, TABLEAUX.pourboires]) {
      await expect(chiffres(page).getByRole('table', { name: tableau })).not.toContainText(ZERO_EURO);
    }
    await verifierLigne(page, 'Rendez-vous', '—', '—', TABLEAUX.ventes);
    await verifierLigne(page, 'Boutique (commandes retirées)', '0 €', '0 €', TABLEAUX.ventes);
    await expect(blocFin(page)).not.toContainText(ZERO_EURO);
    await expect(page.getByRole('region', { name: 'CA à venir, tous les mois' })).not.toContainText(ZERO_EURO);
    await expect(caDuJour(page)).toContainText('CA aujourd\'hui—');
    await expect(caDuMois(page)).toContainText(`CA ${nomDuMois(AUJ)}—`);
    await verifierLigne(page, 'Total tous canaux', '—', '—', TABLEAUX.ventes);
    await verifierLigne(page, 'RDV encaissés', '—', '—', TABLEAUX.rdv);
    await expect(blocFin(page)).toContainText('Fin de mois prévue—');
  });

  test('boutique illisible : total partiel « incomplet », rien qui s\'en tire (comparaison, fin de mois, %), « — » sur la boutique', async ({ page, api }) => {
    api.tables.Appointment = [
      rdv('s1', { debut: '08:00', ...encaisse('cb') }), //                                                     25
      rdv('s2', { debut: '15:00' }), //                                                                         à venir
      rdv('s3', { date: AVANT_LE_1ER, debut: '09:00', ...encaisse('cb') }), //                                  mois précédent
    ];
    api.tables.GiftCard = [{ id: 'gc-1', code: 'DHB-1', amount: 40, remaining_balance: 40, status: 'validated', payment_method: 'cb', validated_at: iso(AUJ, '09:30'), created_at: iso(AUJ, '09:00') }];
    api.tables.SalonSettings[0].monthly_revenue_goal = 3000;
    api.surcharger('GET', '/entities/Order', () => ({ status: 500, json: { error: 'Erreur serveur' } }));
    await page.goto('/admin');

    await expect(page.getByRole('alert').filter({ hasText: 'Impossible de charger les ventes de : Boutique' })).toBeVisible({ timeout: 15_000 });
    const ventes = bloc(page, 'Ventes hors rendez-vous');
    await expect(ventes.getByRole('button', { name: /^Boutique/ })).toContainText('En cours : —');
    await expect(ventes.getByRole('button', { name: /^Boutique/ })).not.toContainText(ZERO_EURO);
    await expect(ventes.getByRole('button', { name: /^Cartes cadeau/ })).toContainText('Reste à utiliser : 40 €');
    // Aujourd'hui et ce mois : 25 + 40 = 65, partiels, marqués ; « — » sur la boutique
    await expect(caDuJour(page)).toContainText('CA aujourd\'hui65 €incomplet');
    await expect(caDuMois(page)).toContainText(`CA ${nomDuMois(AUJ)}65 €incomplet`);
    await expect(chiffres(page)).toContainText('Ventes non chargées : boutique.');
    await verifierLigne(page, 'Boutique (commandes retirées)', '—', '—', TABLEAUX.ventes);
    await verifierLigne(page, 'Total tous canaux', '65 €incomplet', '65 €incomplet', TABLEAUX.ventes);
    // Ni comparaison au mois précédent (un mois précédent existe pourtant)
    await expect(caDuMois(page).getByText(/^[+−=]/)).toHaveCount(0);
    await expect(chiffres(page)).not.toContainText(' : 25 €');
    // Fin de mois : ni montant ni % d'objectif tirés d'un total incomplet
    const fin = blocFin(page);
    await expect(fin).toContainText('Fin de mois prévue—');
    await expect(fin).toContainText('Ventes non chargées : boutique.');
    await expect(fin).toContainText('— de 3 000 € (total incomplet)');
    await expect(fin).not.toContainText(/\d\s%/);
    await expect(fin.getByRole('progressbar')).toHaveCount(0);
    // Le reste : les rendez-vous, sans bandeau
    await verifierLigne(page, 'CB', '25 €', '25 €');
    await expect(page.getByText('Impossible de charger les rendez-vous du tableau de bord')).toHaveCount(0);
  });

  test('coupure réseau : un seul bandeau « Pas de connexion internet », « Réessayer » relit tout', async ({ page, api }) => {
    api.tables.Appointment = [rdv('w1', { debut: '08:00', ...encaisse('cb') })];
    // Toutes les lectures du tableau de bord échouent faute de réseau, sauf la liste des barbers (déjà en
    // cache dans l'app en vrai : voir le test suivant)
    let coupe = true;
    const sansReseau = () => (coupe ? RESEAU_COUPE : undefined);
    for (const nom of ['Appointment', 'Order', 'GiftCard', 'Event', 'TextileReservation', 'TimeOff', 'SalonSettings']) {
      api.surcharger('GET', `/entities/${nom}`, sansReseau);
    }
    api.surcharger('GET', '/textile/overview', sansReseau);
    api.surcharger('GET', '/analytics/live', sansReseau);
    await page.goto('/admin');

    const alertes = page.getByRole('main').getByRole('alert');
    await expect(alertes.first()).toContainText('Pas de connexion internet', { timeout: 15_000 });
    await expect(alertes).toHaveCount(1);
    await expect(ligneEncaissements(page, 'CB').aujourdhui).toHaveText('—');
    for (const nom of ['Chiffres', 'Rendez-vous du jour', 'Caisse du soir', 'Ventes hors rendez-vous']) {
      await expect(bloc(page, nom), `bloc « ${nom} »`).not.toContainText(ZERO_EURO);
    }
    await expect(blocFin(page)).not.toContainText(ZERO_EURO);

    coupe = false;
    await alertes.getByRole('button', { name: 'Réessayer' }).click();
    await expect(alertes).toHaveCount(0);
    await verifierLigne(page, 'CB', '25 €', '25 €');
    await expect(bloc(page, 'Ventes hors rendez-vous').getByRole('button', { name: /^Boutique/ })).toContainText('Aucune commande en cours');
    await expect(page.getByRole('region', { name: 'CA à venir, tous les mois' })).toContainText('Aucun RDV confirmé à venir');
  });

  // Au premier chargement sans réseau, la liste des barbers échoue aussi : « Barbers » et
  // « Remplissage » se taisent derrière le bandeau de la page (trois bandeaux avant le 1er nov. 2026)
  test('coupure réseau dès l\'ouverture, liste des barbers comprise : toujours un seul bandeau', async ({ page, api }) => {
    api.surcharger('GET', /^\/entities\/(?!User)/, () => RESEAU_COUPE);
    api.surcharger('GET', '/textile/overview', () => RESEAU_COUPE);
    api.surcharger('GET', '/analytics/live', () => RESEAU_COUPE);
    await page.goto('/admin');

    const alertes = page.getByRole('main').getByRole('alert');
    await expect(alertes.first()).toContainText('Pas de connexion internet', { timeout: 15_000 });
    await expect(bloc(page, 'Barbers')).toBeVisible();
    await expect(alertes).toHaveCount(1, { timeout: 3_000 });
  });
});

test.describe('Tableau de bord d\'un barber : droits', () => {
  const liens = (page, debut) => page.getByRole('main').locator(`a[href^="${debut}"]`);

  test('permission « Tableau de bord » seule : ni privatisations, ni liens vers les commandes, les cartes cadeau ou l\'agenda', async ({ page, api, connecter }) => {
    journeeChargee(api);
    await connecter(compteBarber(api, ['dashboard']));
    await page.goto('/admin');

    await expect(bloc(page, 'Rendez-vous du jour').getByRole('list', { name: 'Rendez-vous du jour' })).toBeVisible();
    // Ses chiffres ne contiennent pas les privatisations (non lues) : dit dans le total et les titres
    const ventes = chiffres(page).getByRole('table', { name: TABLEAUX.ventes });
    await expect(ventes.getByRole('rowheader')).toHaveText([
      'Rendez-vous', 'Boutique (commandes retirées)', 'Cartes cadeau vendues', 'Textile (précommandes payées)', 'Total tous canaux, hors privatisations',
    ]);
    await expect(chiffres(page)).toContainText('Aujourd\'hui et ce mois · tous canaux, hors privatisations');
    await expect(chiffres(page)).toContainText('Achats payés par carte cadeau hors rendez-vous (boutique, textile) : pas déduits.');
    await expect(blocFin(page)).toContainText('tous les canaux, hors privatisations');
    // Aucune tâche qu'il pourrait ouvrir (clôturer = agenda, commandes, cartes…) : pas de bloc du tout
    await expect(bloc(page, 'Ventes hors rendez-vous').getByRole('button', { name: /^Boutique/ })).toContainText('En cours : 18 €');
    await expect(bloc(page, 'À faire')).toHaveCount(0);
    await expect(bloc(page, 'Ventes hors rendez-vous').getByRole('button', { name: /^Privatisations/ })).toHaveCount(0);
    for (const debut of ['/admin/agenda', '/admin/orders', '/admin/gift-cards', '/admin/events', '/admin/leave', '/admin/traffic', '/admin/textile']) {
      await expect(liens(page, debut), `liens vers ${debut}`).toHaveCount(0);
    }
    // Privatisations : jamais la liste des ventes, seulement les confirmées (remplissage)
    for (const r of api.requetesVers('GET', '/entities/Event')) expect(r.q).toEqual({ status: 'confirmed' });
    expect(api.requetesVers('GET', '/analytics/live')).toHaveLength(0);
  });

  test('avec l\'agenda : les liens vers l\'agenda apparaissent, toujours rien vers les commandes ni les cartes cadeau', async ({ page, api, connecter }) => {
    journeeChargee(api);
    await connecter(compteBarber(api, ['dashboard', 'agenda']));
    await page.goto('/admin');

    // « À faire » : seulement ce qu'il peut ouvrir (l'agenda), ni commande, ni carte, ni précommande
    const aFaire = bloc(page, 'À faire');
    await expect(aFaire.getByRole('link', { name: /^3 prestations à clôturer/ }))
      .toHaveAttribute('href', `/admin/agenda?view=day&date=${AVANT_LE_1ER}`);
    await expect(aFaire.getByRole('listitem')).toHaveCount(1);
    await expect(bloc(page, 'Rendez-vous du jour').getByRole('link', { name: 'Ouvrir l\'agenda' })).toHaveAttribute('href', `/admin/agenda?view=day&date=${AUJ}`);
    await expect(liens(page, '/admin/agenda').first()).toBeVisible();
    for (const debut of ['/admin/orders', '/admin/gift-cards', '/admin/events', '/admin/leave']) {
      await expect(liens(page, debut), `liens vers ${debut}`).toHaveCount(0);
    }
    for (const r of api.requetesVers('GET', '/entities/Event')) expect(r.q).toEqual({ status: 'confirmed' });
  });
});

test.describe('Tableau de bord : clients sur l\'app en ce moment', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(ADMIN);
  });

  test('avec features.analyticsLive : « N clients sur l\'app », lien vers Trafic, jamais de WebSocket /ws/live', async ({ page, api }) => {
    api.enCeMoment = 1;
    await page.goto('/admin');
    const compteur = page.getByRole('link', { name: '1 client sur l\'app' });
    await expect(compteur).toHaveAttribute('href', '/admin/traffic');

    // Relu chaque minute (5 dernières minutes côté serveur)
    api.enCeMoment = 4;
    await page.clock.runFor(60_000);
    await expect(page.getByRole('link', { name: '4 clients sur l\'app' })).toBeVisible();
    expect(api.requetesVers('GET', '/analytics/live').length).toBeGreaterThanOrEqual(2);
    expect(api.websockets.filter((chemin) => /\/ws\/live$/.test(chemin))).toEqual([]);
  });

  test('serveur sans features.analyticsLive : aucun compteur, aucune requête', async ({ page, api }) => {
    api.donnees.parametresPublics.features.analyticsLive = false;
    await page.goto('/admin');
    await expect(bloc(page, 'Rendez-vous du jour').getByRole('list', { name: 'Rendez-vous du jour' })).toBeVisible();
    await page.clock.runFor(60_000);
    await expect(page.getByText(/sur l'app$/)).toHaveCount(0);
    expect(api.requetesVers('GET', '/analytics/live')).toHaveLength(0);
    expect(api.websockets.filter((chemin) => /\/ws\/live$/.test(chemin))).toEqual([]);
  });
});

test.describe('Tableau de bord : largeurs d\'écran', () => {
  for (const largeur of [320, 390, 1024, 1920]) {
    test(`${largeur} px : aucun défilement horizontal ni erreur dans la console, journée chargée, panneaux ouverts`, async ({ page, api, connecter, journal }) => {
      await connecter(ADMIN);
      journeeChargee(api);
      api.tables.SalonSettings[0].monthly_revenue_goal = 12500.5;
      await page.setViewportSize({ width: largeur, height: 900 });
      await page.goto('/admin');

      await expect(bloc(page, 'À faire')).toContainText('3 prestations à clôturer');
      await expect(page.getByRole('link', { name: '3 clients sur l\'app' })).toBeVisible();
      await expect(blocFin(page).getByRole('progressbar', { name: 'Objectif du mois' })).toBeVisible();
      // Panneaux des ventes fermés sur téléphone : tous ouverts pour la mesure
      const ventes = bloc(page, 'Ventes hors rendez-vous');
      const fermes = ventes.getByRole('button', { expanded: false });
      for (let i = 0; i < 6 && await fermes.count() > 0; i++) await fermes.first().click();
      await expect(fermes).toHaveCount(0);
      await attendreSansDebordement(page, `tableau de bord à ${largeur} px`);
      expect(journal.console, 'Erreurs dans la console').toEqual([]);
    });
  }
});
