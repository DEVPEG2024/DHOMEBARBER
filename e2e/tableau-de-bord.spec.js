// Tableau de bord, « CA à venir · tous les mois » (demande du salon, 31 oct. 2026) : le bloc du mois
// ne compte que le mois en cours ; celui-ci additionne tous les RDV confirmés pas encore encaissés,
// d'aujourd'hui au dernier RDV confirmé de la base (24 mois au plus), avec un pavé par mois.
// Données de base : aujourd'hui (mardi, 10 h) Dom 11 h Coupe 25 €, Kevin 14 h Coupe + Barbe 35 €,
// Romain 17 h Barbe 15 € ; dans 6 jours Kevin Coupe + Barbe 35 €.
// Montants au format « 205 € » (espace insécable avant €) : une chaîne attendue est comparée après
// normalisation des espaces, une expression régulière les écrit `\s`. Les autres blocs du tableau
// de bord (refonte du 1er nov. 2026) : tableau-de-bord-blocs.spec.js.
import { test, expect, RESEAU_COUPE } from './support/test.js';
import { ADMIN, BARBERS, PRESTATIONS, RDV } from './support/donnees.js';
import { jour } from './support/temps.js';
import { debordementHorizontal } from './support/outils.js';

const bloc = (page) => page.getByRole('region', { name: 'CA à venir, tous les mois' });
/** Bloc du mois en cours, titré du nom du mois (« Novembre »). */
const blocDuMois = (page) => {
  const m = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(new Date(`${jour(0).slice(0, 7)}-01T12:00:00Z`));
  return page.getByRole('region', { name: m.charAt(0).toUpperCase() + m.slice(1), exact: true });
};
/** « 0 € » seul (pas « 10 € » ni « 1 000 € ») : jamais à la place d'un chiffre manquant. */
const ZERO_EURO = /(^|[^\d,\s])\s*0\s€/;
const moisDe = (cle) => cle.slice(0, 7);
const libelleMois = (cle) => new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(`${moisDe(cle)}-01T12:00:00Z`));

/** Rendez-vous simulé de plus (copie d'un RDV connu, autre date, autre prestation). */
function ajouter(api, { id, date, prestation, ...reste }) {
  api.tables.Appointment.push({
    ...RDV.lointainKevin(),
    id, date,
    services: [{ id: prestation.id, name: prestation.name, price: prestation.price, duration: prestation.duration }],
    total_price: prestation.price,
    ...reste,
  });
}

test.describe('Tableau de bord : CA à venir, tous les mois', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(ADMIN);
  });

  test('total de tous les mois, un pavé par mois, hors annulés, encaissés, pauses et part déjà débitée par carte cadeau', async ({ page, api }) => {
    ajouter(api, { id: 'apt-avenir-40', date: jour(40), prestation: PRESTATIONS.coupe });
    // Part déjà payée par carte cadeau : seul le reste (25 €) est à venir
    ajouter(api, { id: 'apt-avenir-42', date: jour(42), prestation: PRESTATIONS.coupeBarbe, gift_card_amount: 10 });
    ajouter(api, { id: 'apt-avenir-400', date: jour(400), prestation: PRESTATIONS.couleur });
    // Hors compte : annulé, déjà encaissé, pause
    ajouter(api, { id: 'apt-annule-45', date: jour(45), prestation: PRESTATIONS.rasage, status: 'cancelled', cancellation_reason: 'Client : Empêchement' });
    ajouter(api, { id: 'apt-paye-50', date: jour(50), prestation: PRESTATIONS.coupe, payment_status: 'paid', payment_method: 'cb' });
    ajouter(api, { id: 'apt-pause-41', date: jour(41), prestation: PRESTATIONS.contours, status: 'break', client_name: 'Pause', client_email: null });

    // 25 + 35 + 15 (aujourd'hui) + 35 (dans 6 jours) + 25 + 25 + 45
    const comptes = [[jour(0), 25], [jour(0), 35], [jour(0), 15], [jour(6), 35], [jour(40), 25], [jour(42), 25], [jour(400), 45]];
    const parMois = new Map();
    for (const [date, montant] of comptes) {
      const m = parMois.get(moisDe(date)) || { montant: 0, n: 0 };
      parMois.set(moisDe(date), { montant: m.montant + montant, n: m.n + 1 });
    }

    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/admin');
    const b = bloc(page);
    await expect(b).toContainText('205 €');
    await expect(b).toContainText('7 RDV confirmés, pas encore encaissés');
    await expect(b.getByRole('listitem')).toHaveCount(parMois.size);
    for (const [mois, { montant, n }] of parMois) {
      const pave = b.getByRole('listitem').filter({ hasText: new RegExp(libelleMois(`${mois}-01`), 'i') });
      await expect(pave).toContainText(`${montant} €`);
      await expect(pave).toContainText(`${n} RDV`);
    }
    // Le pavé du mois en cours vaut la part « RDV à venir » de la fin de mois prévue (bloc du mois)
    const ceMois = parMois.get(moisDe(jour(0)));
    await expect(b.getByRole('listitem').filter({ hasText: 'ce mois' })).toContainText(`${ceMois.montant} €`);
    await expect(blocDuMois(page)).toContainText(`+ ${ceMois.montant} € de RDV à venir`);
    await expect(b.getByText(/au-delà du/)).toHaveCount(0);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(0);

    // Un pavé ouvre la vue Mois de l'agenda
    await b.getByRole('button', { name: new RegExp(libelleMois(jour(400)), 'i') }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/agenda\\?view=month&date=${moisDe(jour(400))}-01$`));
  });

  test('RDV confirmé au-delà de 24 mois : signalé, pas compté', async ({ page, api }) => {
    ajouter(api, { id: 'apt-tres-loin', date: jour(800), prestation: PRESTATIONS.couleur });
    await page.goto('/admin');
    const b = bloc(page);
    await expect(b).toContainText('110 €');
    await expect(b).toContainText('4 RDV confirmés');
    await expect(b.getByText(/Des RDV confirmés vont au-delà du .+ : non comptés ici\./)).toBeVisible();
  });

  test('lecture impossible : « Pas de connexion » dans le bloc, jamais « 0 € », le reste du tableau de bord s\'affiche', async ({ page, api }) => {
    api.surcharger('GET', '/entities/Appointment', (req) => (req.query.sort === '-date' ? RESEAU_COUPE : undefined));
    await page.goto('/admin');
    const b = bloc(page);
    await expect(b.getByRole('alert')).toBeVisible({ timeout: 15_000 });
    await expect(b.getByRole('alert')).toContainText('Pas de connexion internet');
    await expect(b).toContainText('—');
    await expect(b).not.toContainText(ZERO_EURO);
    // Le reste : RDV du jour et fin de mois prévue (25 + 35 + 15 à venir aujourd'hui), sans bandeau
    await expect(page.getByRole('region', { name: 'Aujourd\'hui', exact: true }).getByRole('list', { name: 'Rendez-vous du jour' })).toBeVisible();
    await expect(blocDuMois(page)).toContainText('Fin de mois prévue');
    await expect(page.getByText('Impossible de charger les rendez-vous du tableau de bord')).toHaveCount(0);
  });

});

test.describe('Tableau de bord d\'un barber : CA à venir', () => {
  const KEVIN = {
    id: 'user-kevin', email: 'kevin.compte@dhomebarber.fr', full_name: 'Kevin Barber', phone: '',
    role: 'barber', employee_id: BARBERS.kevin.id, permissions: ['dashboard'],
  };

  test('barber avec le tableau de bord sans l\'agenda : total affiché, pavés non cliquables', async ({ page, api, connecter }) => {
    api.comptes.push({ ...KEVIN, motDePasse: 'x', birth_date: null, photo_url: null, created_date: '2026-01-15T10:00:00.000Z' });
    await connecter(KEVIN);
    await page.goto('/admin');
    const b = bloc(page);
    await expect(b).toContainText('110 €');
    await expect(b.getByRole('listitem').first()).toBeVisible();
    await expect(b.getByRole('button')).toHaveCount(0);
  });
});
