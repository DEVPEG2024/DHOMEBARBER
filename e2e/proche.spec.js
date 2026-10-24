// Réservation pour un proche sans compte (24 oct. 2026) : « Pour qui ? » de la confirmation,
// « Réserver aussi pour un proche » après le succès, affichage dans Mes rendez-vous et l'agenda.
import { test, expect } from './support/test.js';
import { ADMIN, BARBERS, CLIENT, PRESTATIONS, rendezVous } from './support/donnees.js';
import { jour } from './support/temps.js';
import { echapper, libelleJour } from './support/outils.js';

/** Jeudi (J+2) : aucun rendez-vous du client ce jour-là. */
const JOUR_RESA = jour(2);

const boutonJour = (page, cle) => page.getByRole('region', { name: 'Choix du jour' })
  .getByRole('button', { name: new RegExp(`^${echapper(libelleJour(cle))} : \\d+ créneaux? libres?$`) });
const boutonHeure = (page, nom) => page.getByRole('group', { name: 'Après-midi' }).getByRole('button', { name: nom, exact: true });
const pourQui = (page) => page.getByRole('region', { name: 'Pour qui ?' });
const confirmer = (page) => page.getByRole('button', { name: 'Confirmer le rendez-vous' });
const creations = (api) => api.requetesVers('POST', '/entities/Appointment');
/** Aujourd'hui 15 h chez Dom : coupe enfant de Léo, sur le compte du client. */
const rdvDeLeo = () => rendezVous({
  id: 'apt-leo', client: CLIENT, barber: BARBERS.dom, prestations: [PRESTATIONS.enfant],
  date: jour(0), debut: '15:00', guest_name: 'Léo',
});

/** Prestation, jour et heure choisis, jusqu'à l'écran de confirmation. */
async function jusquaConfirmation(page, { prestation = 'Coupe enfant', cle = JOUR_RESA, heure = '15:00' } = {}) {
  await page.getByRole('button', { name: `Choisir : ${prestation}`, exact: true }).click();
  await boutonJour(page, cle).click();
  await boutonHeure(page, heure).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('heading', { name: 'Vérifiez et confirmez' })).toBeVisible();
}

test.describe('Réservation pour un proche', () => {
  test('coupe enfant : « Pour qui ? » demandé, prénom contrôlé, puis enregistré avec le rendez-vous', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/booking');
    await jusquaConfirmation(page);

    // Prestation Enfants : personne n'est choisi d'office, « Confirmer » attend le choix
    await expect(pourQui(page)).toContainText('Prestation enfant : pour qui est ce rendez-vous ?');
    await expect(pourQui(page).getByRole('button', { name: 'Moi', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(confirmer(page)).toBeDisabled();

    // Nouveau proche : chiffres refusés comme par le serveur
    await pourQui(page).getByRole('button', { name: 'Ajouter un proche' }).click();
    const champ = page.getByLabel('Prénom de votre proche');
    await expect(champ).toBeFocused();
    await champ.fill('06 12');
    await champ.blur();
    await expect(pourQui(page).getByRole('alert')).toHaveText('Lettres seulement (ni chiffre ni symbole).');
    await expect(confirmer(page)).toBeDisabled();
    await champ.fill('Léo');
    await expect(pourQui(page).getByRole('alert')).toHaveCount(0);
    await expect(confirmer(page)).toBeEnabled();
    await confirmer(page).click();

    await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible();
    await expect(page.getByText('Kevin attend Léo au salon.')).toBeVisible();
    expect(creations(api)).toHaveLength(1);
    expect(creations(api)[0].corps).toMatchObject({
      client_email: CLIENT.email, employee_id: BARBERS.kevin.id, date: JOUR_RESA, start_time: '15:00', guest_name: 'Léo',
    });
  });

  test('« Réserver aussi pour un proche » : même barber, même jour, l\'heure suivante choisie d\'office', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/booking');
    await jusquaConfirmation(page);
    await pourQui(page).getByRole('button', { name: 'Ajouter un proche' }).click();
    await page.getByLabel('Prénom de votre proche').fill('Léo');
    await confirmer(page).click();

    await page.getByRole('button', { name: 'Réserver aussi pour un proche' }).click();
    await expect(page).toHaveURL(new RegExp(`/booking\\?barber=${BARBERS.kevin.id}&date=${JOUR_RESA}&after=15%3A30&chain=\\d+$`));
    await expect(page.getByRole('heading', { name: 'Choisissez votre prestation' })).toBeVisible();
    await expect(page.getByText(`Rendez-vous suivant avec Kevin, ${libelleJour(JOUR_RESA)} à partir de 15:30.`)).toBeVisible();

    await page.getByRole('button', { name: 'Choisir : Coupe enfant', exact: true }).click();
    // Kevin, le même jour, 15:30 (juste après Léo) sont déjà choisis
    await expect(page.getByRole('group', { name: 'Choix du barber' }).getByRole('button', { name: /Kevin/ }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('region', { name: 'Choix du jour' }).getByRole('button', { pressed: true, name: new RegExp(`^${echapper(libelleJour(JOUR_RESA))}`) }))
      .toBeVisible();
    await expect(boutonHeure(page, '15:30')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Continuer' }).click();

    // Rendez-vous suivant : « Pour qui ? » demandé ; Léo, déjà venu avec ce compte, est proposé
    await expect(confirmer(page)).toBeDisabled();
    await expect(pourQui(page).getByRole('button', { name: 'Léo', exact: true })).toBeVisible();
    await pourQui(page).getByRole('button', { name: 'Ajouter un proche' }).click();
    await page.getByLabel('Prénom de votre proche').fill('Tom');
    await confirmer(page).click();

    await expect(page.getByText('Kevin attend Tom au salon.')).toBeVisible();
    expect(creations(api)).toHaveLength(2);
    expect(creations(api)[1].corps).toMatchObject({
      employee_id: BARBERS.kevin.id, date: JOUR_RESA, start_time: '15:30', guest_name: 'Tom',
    });
  });

  test('rendez-vous suivant : aucun bandeau tant que « Pour qui ? » est vide, jamais « Déplacer plutôt »', async ({ page, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/booking');
    // Le parent réserve pour lui (coupe adulte : « Moi » d'office), puis enchaîne
    await jusquaConfirmation(page, { prestation: 'Coupe' });
    await confirmer(page).click();
    await page.getByRole('button', { name: 'Réserver aussi pour un proche' }).click();
    await page.getByRole('button', { name: 'Choisir : Coupe', exact: true }).click();
    await expect(boutonHeure(page, '15:30')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Continuer' }).click();

    // Personne choisie : rien à comparer, pas de lien qui annulerait le RDV du parent
    const bandeau = page.getByRole('status').filter({ hasText: 'déjà rendez-vous' });
    await expect(pourQui(page)).toContainText('Choisissez la personne de ce rendez-vous.');
    await expect(bandeau).toHaveCount(0);
    // « Moi » une seconde fois : le bandeau revient, sans « Déplacer plutôt ». Le message « Rendez-vous
    // confirmé ! » du premier RDV (en haut de l'écran) doit d'abord partir : survolé, il resterait
    await page.mouse.move(5, 5);
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 10_000 });
    await pourQui(page).getByRole('button', { name: 'Moi', exact: true }).click();
    await expect(bandeau).toContainText('Vous avez déjà rendez-vous');
    await expect(bandeau.getByRole('button', { name: /^Déplacer plutôt/ })).toHaveCount(0);
    await expect(bandeau.getByRole('checkbox')).toBeVisible();
  });

  test('RDV verrouillé du parent le même jour : un proche n\'est pas un « rendez-vous en plus »', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto(`/booking?services=${PRESTATIONS.coupe.id}`);
    // Aujourd'hui : le client a déjà 17:00 avec Romain, dans le délai de 24 h
    await boutonJour(page, jour(0)).click();
    await boutonHeure(page, '15:00').click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    const bandeau = page.getByRole('status').filter({ hasText: 'déjà rendez-vous' });
    await expect(bandeau).toContainText('Vous avez déjà rendez-vous');
    await expect(pourQui(page).getByRole('button', { name: 'Moi', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(confirmer(page)).toBeDisabled();

    await pourQui(page).getByRole('button', { name: 'Ajouter un proche' }).click();
    await page.getByLabel('Prénom de votre proche').fill('Léo');
    await expect(bandeau).toHaveCount(0);
    await confirmer(page).click();
    await expect(page.getByText('Kevin attend Léo au salon.')).toBeVisible();
    expect(creations(api)[0].corps.guest_name).toBe('Léo');
    expect(creations(api)[0].corps.confirm_second).toBeUndefined();
  });

  test('Mes rendez-vous : « Pour Léo » sur le rendez-vous pris pour lui', async ({ page, api, connecter }) => {
    api.tables.Appointment.push(rdvDeLeo());
    await connecter(CLIENT);
    await page.goto('/appointments');
    await expect(page.getByText('Pour Léo', { exact: true })).toBeVisible();
  });

  test('agenda : « Léo (Camille) » dans la colonne du barber, « Pour Léo » dans la fiche', async ({ page, api, connecter }) => {
    api.tables.Appointment.push(rdvDeLeo());
    await connecter(ADMIN);
    await page.goto(`/admin/agenda?view=day&date=${jour(0)}`);
    const colonneDom = page.locator(`[data-drop-column="${BARBERS.dom.id}"]`);
    await expect(colonneDom).toContainText('Léo (Camille)');
    await colonneDom.getByRole('button', { name: /Léo \(Camille\)/ }).click();
    const fiche = page.getByRole('dialog', { name: 'Détails du rendez-vous' });
    await expect(fiche).toContainText('Pour Léo');
    await expect(fiche).toContainText('Camille Test');
  });

  test('serveur sans le drapeau : ni « Pour qui ? » ni prénom envoyé', async ({ page, api, connecter }) => {
    api.donnees.parametresPublics.features.guestBooking = false;
    await connecter(CLIENT);
    await page.goto('/booking');
    await jusquaConfirmation(page);
    await expect(pourQui(page)).toHaveCount(0);
    await confirmer(page).click();
    await expect(page.getByText('Kevin vous attend au salon.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Réserver aussi pour un proche' })).toHaveCount(0);
    expect('guest_name' in creations(api)[0].corps).toBe(false);
  });
});
