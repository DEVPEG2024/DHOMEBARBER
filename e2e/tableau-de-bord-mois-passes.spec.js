// Tableau de bord, bloc « Mois passés » (4 nov. 2026) : une ligne par mois passé, tous ses chiffres au
// toucher, mêmes règles que le mois en cours (CA hors pourboire et hors part carte cadeau). Les 6 derniers
// mois seulement sont lus, les autres avec « Voir les N mois plus anciens ».
//
// Montants attendus calculés à la main, en commentaire. L'horloge est figée sur le mardi de référence :
// les mois sont comptés à partir de `jour(0)`.
import { test, expect, RESEAU_COUPE } from './support/test.js';
import { ADMIN, BARBERS, PRESTATIONS as P, rendezVous } from './support/donnees.js';
import { jour, instantParis } from './support/temps.js';
import { attendreSansDebordement } from './support/outils.js';

const AUJ = jour(0);
const MOIS_LONG = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' });

/** `yyyy-MM`, `n` mois avant le mois en cours. */
function moisAvant(n) {
  const [a, m] = AUJ.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1 - n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}
const nomDuMois = (cle) => MOIS_LONG.format(new Date(`${cle}-15T12:00:00Z`));
const titreDuMois = (cle) => `${nomDuMois(cle)} ${cle.slice(0, 4)}`;
const iso = (cle, heure) => instantParis(cle, heure).toISOString();

const CLIENT = { full_name: 'Client Test', email: 'client.test@exemple.fr', phone: '' };
const rdv = (id, { barber = BARBERS.dom, prestations = [P.coupe], date, debut = '10:00', statut = 'confirmed', ...reste }) =>
  rendezVous({ id, client: CLIENT, barber, prestations, date, debut, statut, ...reste });
const encaisse = (moyen, extra = {}) => ({ statut: 'completed', payment_method: moyen, payment_status: 'paid', ...extra });

const bloc = (page) => page.getByRole('region', { name: 'Mois passés', exact: true });
const lignes = (page) => bloc(page).getByRole('listitem');
const boutonDuMois = (page, cle) => bloc(page).getByRole('button', { name: new RegExp(`^${titreDuMois(cle)}`) });
/** Cellule d'une ligne d'un tableau du détail (« Ventes », « Pourboires »…). */
const cellule = (page, tableau, libelle) => bloc(page).getByRole('table', { name: tableau }).getByRole('row')
  .filter({ has: page.getByRole('rowheader', { name: libelle }) }).getByRole('cell');

/** Le mois passé `M1` a quelque chose dans chaque canal, `M2` un seul RDV encaissé. */
function deuxMois(api) {
  const M1 = moisAvant(1);
  const M2 = moisAvant(2);
  api.tables.Appointment = [
    rdv('cours', { date: AUJ, debut: '08:00', ...encaisse('cb') }), //                        mois en cours : jamais compté ici
    rdv('a1', { date: `${M1}-10`, ...encaisse('cb', { tip: 5, tip_method: 'cb' }) }), //       CB 25, pourboire CB 5
    rdv('a2', { barber: BARBERS.kevin, prestations: [P.coupeBarbe], date: `${M1}-11`, ...encaisse('especes', { tip: 2, tip_method: 'especes' }) }), // espèces 35
    rdv('a3', { date: `${M1}-12`, ...encaisse('carte_cadeau', { gift_card_amount: 25 }) }), // tout par carte : CA 0, part carte 25
    rdv('a4', { date: `${M1}-13`, statut: 'no_show' }), //                                     absent
    rdv('a5', { date: `${M1}-14`, statut: 'cancelled', cancellation_reason: 'Client : Empêchement' }),
    rdv('a6', { barber: BARBERS.romain, date: `${M1}-15` }), //                                confirmé, jamais encaissé : à clôturer 25
    rdv('b1', { date: `${M2}-05`, ...encaisse('cb') }), //                                     25
  ];
  api.tables.Order = [{ id: 'cmd-1', status: 'delivered', total_price: 18, items: [], delivered_at: iso(`${M1}-10`, '12:00'), created_date: iso(`${M1}-09`, '12:00') }];
  api.tables.GiftCard = [{ id: 'gc-1', code: 'DHB-0001', amount: 50, remaining_balance: 50, status: 'validated', payment_method: 'especes', validated_at: iso(`${M1}-08`, '12:00'), created_at: iso(`${M1}-08`, '11:00') }];
  api.tables.Event = [{ id: 'priv-1', status: 'confirmed', date: `${M1}-20`, price: 300, created_at: iso(`${M1}-01`, '11:00') }];
  api.tables.TextileReservation = [{ id: 'tx-1', status: 'paid', unit_price: 30, quantity: 1, created_at: iso(`${M1}-05`, '11:00') }];
  return { M1, M2 };
}

test.describe('Tableau de bord : mois passés', () => {
  test('une ligne par mois, tous canaux, écart avec le mois d\'avant ; le mois en cours n\'y est pas', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    const { M1, M2 } = deuxMois(api);
    await page.goto('/admin');

    await expect(lignes(page)).toHaveCount(2, { timeout: 15_000 });
    // RDV 25 + 35 + 0 = 60 ; boutique 18 ; carte 50 ; privatisation 300 ; textile 30 : 458
    await expect(lignes(page).nth(0)).toContainText(titreDuMois(M1));
    await expect(lignes(page).nth(0)).toContainText('458 €');
    await expect(lignes(page).nth(0)).toContainText('3 RDV encaissés · panier 20 €'); // 60 ÷ 3
    await expect(lignes(page).nth(0)).toContainText('1 à clôturer');
    await expect(lignes(page).nth(0)).toContainText(`+1732 % vs ${nomDuMois(M2)}`); // (458 − 25) ÷ 25
    await expect(lignes(page).nth(1)).toContainText(titreDuMois(M2));
    await expect(lignes(page).nth(1)).toContainText('25 €');
    await expect(lignes(page).nth(1)).toContainText('1 RDV encaissé · panier 25 €');
    // Mois le plus ancien : pas d'écart, il n'a rien à quoi se comparer
    await expect(lignes(page).nth(1)).not.toContainText(' vs ');
    await expect(bloc(page)).not.toContainText(titreDuMois(AUJ.slice(0, 7)));
  });

  test('toucher un mois ouvre tous ses chiffres, un seul mois ouvert à la fois', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    const { M1, M2 } = deuxMois(api);
    await page.goto('/admin');

    await boutonDuMois(page, M1).click({ timeout: 15_000 });
    await expect(boutonDuMois(page, M1)).toHaveAttribute('aria-expanded', 'true');
    await expect(cellule(page, /^Ventes/, 'Rendez-vous')).toHaveText('60 €');
    await expect(cellule(page, /^Ventes/, 'Boutique')).toHaveText('18 €');
    await expect(cellule(page, /^Ventes/, 'Cartes cadeau vendues')).toHaveText('50 €');
    await expect(cellule(page, /^Ventes/, 'Privatisations')).toHaveText('300 €');
    await expect(cellule(page, /^Ventes/, 'Textile')).toHaveText('30 €');
    await expect(cellule(page, /^Ventes/, 'Total tous canaux')).toHaveText('458 €');
    await expect(bloc(page).getByRole('rowheader', { name: 'Cartes cadeau vendues' })).toContainText('espèces 50 €');

    await expect(cellule(page, /^Rendez-vous/, /^RDV encaissés/)).toHaveText('3');
    await expect(cellule(page, /^Rendez-vous/, 'Panier moyen')).toHaveText('20 €');
    await expect(cellule(page, /^Rendez-vous/, 'Restés à clôturer')).toContainText('25 €');
    await expect(cellule(page, /^Rendez-vous/, 'Absents')).toHaveText('1');
    await expect(cellule(page, /^Rendez-vous/, 'Annulations par les clients')).toHaveText('1');

    await expect(cellule(page, /^Encaissements/, /^CB$/)).toHaveText('25 €');
    await expect(cellule(page, /^Encaissements/, /^Espèces$/)).toHaveText('35 €');
    await expect(cellule(page, /^Encaissements/, 'Réglé par carte cadeau')).toHaveText('25 €');
    await expect(cellule(page, /^Pourboires$/, 'Total pourboires')).toHaveText('7 €');
    await expect(cellule(page, /^Pourboires par barber/, BARBERS.dom.name)).toHaveText(['5 €', '0 €', '5 €']);
    await expect(cellule(page, /^Pourboires par barber/, BARBERS.kevin.name)).toHaveText(['0 €', '2 €', '2 €']);
    await expect(cellule(page, /^Pourboires par barber/, BARBERS.romain.name)).toHaveCount(0);
    await expect(cellule(page, /^Barbers/, BARBERS.kevin.name)).toContainText('35 €');
    await expect(cellule(page, /^Barbers/, BARBERS.dom.name)).toContainText('2 RDV');

    await boutonDuMois(page, M2).click();
    await expect(boutonDuMois(page, M1)).toHaveAttribute('aria-expanded', 'false');
    await expect(cellule(page, /^Ventes/, 'Rendez-vous')).toHaveText('25 €');
    await boutonDuMois(page, M2).click();
    await expect(bloc(page).getByRole('table')).toHaveCount(0);
  });

  test('un barber : ni privatisations ni leur montant', async ({ page, api, connecter }) => {
    const compte = {
      id: 'user-kevin', email: 'kevin.dashboard@dhomebarber.fr', full_name: 'Kevin Barber', phone: '',
      role: 'barber', employee_id: BARBERS.kevin.id, permissions: ['dashboard'],
    };
    api.comptes.push({ ...compte, motDePasse: 'x', birth_date: null, photo_url: null, created_date: '2026-01-15T10:00:00.000Z' });
    await connecter(compte);
    const { M1 } = deuxMois(api);
    await page.goto('/admin');

    // 458 − 300 de privatisation
    await expect(lignes(page).nth(0)).toContainText('158 €', { timeout: 15_000 });
    await boutonDuMois(page, M1).click();
    await expect(bloc(page).getByRole('rowheader', { name: 'Privatisations', exact: true })).toHaveCount(0);
    await expect(cellule(page, /^Ventes/, 'Total tous canaux, hors privatisations')).toHaveText('158 €');
  });

  test('6 mois lus d\'emblée, les plus anciens seulement avec « Voir les N mois plus anciens »', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    const mois = Array.from({ length: 8 }, (_, i) => moisAvant(i + 1));
    api.tables.Appointment = mois.map((m) => rdv(`m-${m}`, { date: `${m}-10`, ...encaisse('cb') }));
    const lus = [];
    page.on('request', (r) => { if (r.url().includes('/entities/Appointment')) lus.push(decodeURIComponent(r.url())); });
    await page.goto('/admin');

    await expect(lignes(page)).toHaveCount(6, { timeout: 15_000 });
    await expect(lignes(page).nth(5)).toContainText(titreDuMois(mois[5]));
    await expect(lignes(page).nth(5)).toContainText('25 €');
    expect(lus.some((u) => u.includes(`${mois[6]}-01`)), 'mois non montré : pas lu').toBe(false);

    await bloc(page).getByRole('button', { name: 'Voir les 2 mois plus anciens' }).click();
    await expect(lignes(page)).toHaveCount(8);
    await expect(lignes(page).nth(7)).toContainText(titreDuMois(mois[7]));
    await expect(lignes(page).nth(7)).toContainText('25 €');
    await expect(bloc(page).getByRole('button', { name: /plus ancien/ })).toHaveCount(0);
  });

  test('aucun mois passé : le dit, sans chiffre', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    api.tables.Appointment = [rdv('cours', { date: AUJ, debut: '08:00', ...encaisse('cb') })];
    api.tables.Order = [];
    api.tables.GiftCard = [];
    api.tables.Event = [];
    api.tables.TextileReservation = [];
    await page.goto('/admin');

    await expect(bloc(page)).toContainText('Pas encore de mois passé', { timeout: 15_000 });
    await expect(lignes(page)).toHaveCount(0);
  });

  test('mois illisible : « — » et Réessayer, jamais « 0 € » ; le mois revient après Réessayer', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    const M1 = moisAvant(1);
    const M2 = moisAvant(2);
    const M3 = moisAvant(3);
    api.tables.Appointment = [
      rdv('c', { date: `${M1}-10`, ...encaisse('cb') }),
      rdv('d', { date: `${M2}-10`, ...encaisse('cb') }),
      rdv('e', { date: `${M3}-10`, ...encaisse('especes') }),
    ];
    let panne = true;
    api.surcharger('GET', '/entities/Appointment', (req) => (panne && JSON.stringify(req.q || {}).includes(`${M3}-1`)
      ? { status: 500, json: { error: 'Erreur serveur' } } : undefined));
    await page.goto('/admin');

    await expect(lignes(page)).toHaveCount(3, { timeout: 15_000 });
    await expect(lignes(page).nth(1)).toContainText('25 €');
    await expect(lignes(page).nth(2)).toContainText('—', { timeout: 15_000 });
    await expect(lignes(page).nth(2)).not.toContainText('0 €');
    await expect(boutonDuMois(page, M3)).toBeDisabled();
    const alerte = bloc(page).getByRole('alert');
    await expect(alerte).toContainText('Impossible de charger les mois passés');

    panne = false;
    await alerte.getByRole('button', { name: 'Réessayer' }).click();
    await expect(lignes(page).nth(2)).toContainText('25 €');
    await expect(bloc(page).getByRole('alert')).toHaveCount(0);
  });

  test('coupure réseau dès l\'ouverture : pas de second bandeau dans le bloc', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    api.surcharger('GET', /^\/entities\/(?!User)/, () => RESEAU_COUPE);
    api.surcharger('GET', '/textile/overview', () => RESEAU_COUPE);
    api.surcharger('GET', '/analytics/live', () => RESEAU_COUPE);
    await page.goto('/admin');

    await expect(page.getByRole('alert').first()).toContainText('Pas de connexion internet', { timeout: 15_000 });
    await expect(bloc(page).getByRole('alert')).toHaveCount(0);
    await expect(bloc(page)).not.toContainText('Pas encore de mois passé');
  });

  for (const largeur of [320, 390]) {
    test(`${largeur} px : mois ouvert sans défilement horizontal`, async ({ page, api, connecter }) => {
      await page.setViewportSize({ width: largeur, height: 780 });
      await connecter(ADMIN);
      const { M1 } = deuxMois(api);
      await page.goto('/admin');
      await boutonDuMois(page, M1).click({ timeout: 15_000 });
      await expect(cellule(page, /^Ventes/, 'Rendez-vous')).toHaveText('60 €');
      await attendreSansDebordement(page, `Mois passés à ${largeur} px`);
    });
  }
});
