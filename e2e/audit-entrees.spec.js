// Entrées vers la réservation (audit du 24 oct. 2026) : « Comme la dernière fois » de l'accueil,
// cartes Last Minute du fil, encart « News Gang » de l'accueil. Chaque cas reproduit un défaut
// corrigé ce jour-là ; le dernier vérifie les entrées de l'accueil sur un écran d'ordinateur.
import { test, expect } from './support/test.js';
import { BARBERS, CLIENT, PRESTATIONS, rendezVous } from './support/donnees.js';
import { jour } from './support/temps.js';
import { attendreSansDebordement, echapper, libelleJour } from './support/outils.js';

/** Ligne Last Minute libre (sans client) du jour. */
const lastMinute = (id, barber, debut, fin) => rendezVous({
  id, barber, prestations: [], date: jour(0), debut, statut: 'last_minute', end_time: fin,
});

/** Publication Last Minute du salon, posée par le serveur pour la ligne `ligne`. */
const publicationLastMinute = (id, ligne, minutesAvant = 1) => ({
  id,
  author_name: "D'Home Barber",
  author_role: 'admin',
  author_photo_url: null,
  content: `⚡ Last Minute aujourd'hui à ${ligne.start_time} avec ${ligne.employee_name}. Le créneau vient de se libérer : réserve-le vite depuis l'accueil !`,
  image_url: null,
  kind: 'last_minute',
  appointment_id: ligne.id,
  meta: {
    employee_id: ligne.employee_id, barber_name: ligne.employee_name, date: ligne.date,
    start_time: ligne.start_time, end_time: ligne.end_time,
  },
  created_at: new Date(Date.now() - minutesAvant * 60000).toISOString(),
});

/** Seule la visite passée chez Kevin reste : l'accueil propose « Comme la dernière fois ». */
const garderSeulementLaVisitePassee = (api) => {
  api.tables.Appointment = api.tables.Appointment.filter((r) => !['apt-proche-romain', 'apt-lointain-kevin'].includes(r.id));
};

const carteRebook = (page) => page.locator('div.glass').filter({ hasText: 'Comme la dernière fois' });

test.describe('Entrées vers la réservation', () => {
  test.beforeEach(async ({ connecter, api }) => {
    await connecter(CLIENT);
    // Le fil montre aussi le classement de la carte Gang (vide ici)
    api.surcharger('GET', '/gang-card/leaderboard', () => ({ json: { since: jour(-90), days: 90, entries: [] } }));
  });

  test('« Comme la dernière fois » avec une prestation retirée : bandeau et choix des prestations, pas de faux total', async ({ page, api }) => {
    garderSeulementLaVisitePassee(api);
    // Dernière visite : Coupe + Soin du visage ; le soin a quitté le catalogue depuis
    api.tables.Appointment.find((r) => r.id === 'apt-passe-kevin').services = [
      { service_id: PRESTATIONS.coupe.id, name: 'Coupe', duration: 30, price: 25 },
      { service_id: PRESTATIONS.soin.id, name: 'Soin du visage', duration: 30, price: 25 },
    ];
    api.tables.Service.find((s) => s.id === PRESTATIONS.soin.id).is_active = false;

    await page.goto('/');
    const carte = carteRebook(page);
    await expect(carte).toContainText('Coupe + Soin du visage · avec Kevin');
    // Le total de la seule coupe (25 € · 30 min) ne s'affiche pas sous « Coupe + Soin du visage »
    await expect(carte).not.toContainText('25 €');
    const lien = carte.getByRole('link', { name: /Réserver à nouveau/ });
    await expect(lien).toHaveAttribute('href', `/booking?barber=${BARBERS.kevin.id}&services=${PRESTATIONS.coupe.id}%2C${PRESTATIONS.soin.id}`);

    await lien.click();
    // La réservation reste sur le choix des prestations et le dit (avant : droit aux créneaux avec la coupe seule)
    await expect(page.getByRole('heading', { name: 'Choisissez votre prestation' })).toBeVisible();
    await expect(page.getByRole('status').filter({
      hasText: 'Une prestation de votre rendez-vous n\'est plus proposée : vérifiez votre sélection.',
    })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajouter Coupe à ma sélection' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toHaveCount(0);
  });

  test('« Comme la dernière fois » avec un barber parti : la réservation l\'explique au lieu d\'en choisir un autre', async ({ page, api }) => {
    garderSeulementLaVisitePassee(api);
    // Kevin n'est plus réservable (fiche inactive : absente de la liste publique)
    api.tables.Employee.find((e) => e.id === BARBERS.kevin.id).is_active = false;

    await page.goto('/');
    const carte = carteRebook(page);
    await expect(carte).toContainText('Coupe · avec Kevin');
    const lien = carte.getByRole('link', { name: /Réserver à nouveau/ });
    await expect(lien).toHaveAttribute('href', `/booking?barber=${BARBERS.kevin.id}&services=${PRESTATIONS.coupe.id}`);

    await lien.click();
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await expect(page.getByRole('status').filter({
      hasText: 'Le barber de votre lien n\'est plus disponible à la réservation',
    })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Choix du barber' }).getByRole('button', { name: 'Peu importe' }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  test('fil : la carte d\'un créneau pris pendant que le fil est ouvert disparaît dans la minute', async ({ page, api }) => {
    const ligne = lastMinute('lm-fil-1500', BARBERS.kevin, '15:00', '15:40');
    api.tables.Appointment.push(ligne);
    api.tables.Post.push(publicationLastMinute('p-fil-1500', ligne));

    await page.goto('/feed');
    const carte = page.getByRole('article', { name: 'Créneau Last Minute aujourd\'hui à 15:00 avec Kevin' });
    await expect(carte).toBeVisible();

    // Un autre client réserve ce créneau (le serveur reprend la ligne et retire la publication) ;
    // le fil, lui, n'est pas relu tant que la page reste ouverte
    Object.assign(ligne, { status: 'confirmed', client_email: 'jules.martin@exemple.fr', client_name: 'Jules Martin' });
    api.tables.Post = api.tables.Post.filter((p) => p.id !== 'p-fil-1500');
    await page.clock.fastForward(61 * 1000);

    await expect(carte).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Réserver ce créneau/ })).toHaveCount(0);
  });

  test('fil : après avoir réservé le créneau depuis sa carte, le retour au fil ne la remontre pas', async ({ page, api }) => {
    // Sans le RDV du client de 17 h ce jour-là (la confirmation demanderait « un rendez-vous en plus »)
    api.tables.Appointment = api.tables.Appointment.filter((r) => r.id !== 'apt-proche-romain');
    const ligne = lastMinute('lm-fil-1530', BARBERS.kevin, '15:30', '16:10');
    api.tables.Appointment.push(ligne);
    api.tables.Post.push(publicationLastMinute('p-fil-1530', ligne));
    // Le vrai serveur reprend la ligne Last Minute (même id) et retire sa publication du fil
    api.surcharger('POST', '/entities/Appointment', (req) => {
      if (ligne.status !== 'last_minute' || req.corps?.start_time !== '15:30') return undefined;
      Object.assign(ligne, req.corps, { status: 'confirmed', internal_notes: '[last_minute]' });
      api.tables.Post = api.tables.Post.filter((p) => p.id !== 'p-fil-1530');
      return { status: 201, json: { ...ligne, blocks_client: true } };
    });

    await page.goto('/feed');
    const carte = page.getByRole('article', { name: 'Créneau Last Minute aujourd\'hui à 15:30 avec Kevin' });
    await carte.getByRole('link', { name: 'Réserver ce créneau, aujourd\'hui à 15:30 avec Kevin' }).click();
    await page.getByRole('button', { name: 'Choisir : Coupe', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Après-midi' }).getByRole('button', { name: '15:30', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Confirmer le rendez-vous' }).click();
    await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible();
    await expect(page).toHaveURL(/\/appointments$/, { timeout: 10_000 });

    // Retour au fil dans la minute (sans recharger l'app) : sa liste en cache date d'avant la réservation
    await page.locator('nav').getByRole('link', { name: 'New\'s Gang !', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('article', { name: /Créneau Last Minute/ })).toHaveCount(0);
  });

  test('Last Minute recouvert par un RDV ou une pause posés par l\'équipe : ni sur l\'accueil ni dans le fil', async ({ page, api }) => {
    const couvertRdv = lastMinute('lm-couvert-rdv', BARBERS.kevin, '15:30', '16:10');
    const couvertPause = lastMinute('lm-couvert-pause', BARBERS.romain, '12:00', '12:40');
    const libre = lastMinute('lm-libre', BARBERS.dom, '16:00', '16:40');
    api.tables.Appointment.push(
      couvertRdv, couvertPause, libre,
      // L'équipe a posé un client chez Kevin à 15:45 et une pause de Romain à 12:00 par-dessus
      rendezVous({
        id: 'apt-equipe-kevin', client: { full_name: 'Paul Durand', email: 'paul.durand@exemple.fr', phone: '' },
        barber: BARBERS.kevin, prestations: [PRESTATIONS.coupe], date: jour(0), debut: '15:45',
      }),
      rendezVous({ id: 'pause-romain', barber: BARBERS.romain, prestations: [], date: jour(0), debut: '12:00', statut: 'break', end_time: '13:00' }),
    );
    api.tables.Post.push(
      publicationLastMinute('p-couvert-rdv', couvertRdv, 3),
      publicationLastMinute('p-couvert-pause', couvertPause, 2),
      publicationLastMinute('p-libre', libre, 1),
    );

    await page.goto('/');
    // Seul le créneau de Dom reste réservable (une seule carte, pas de carrousel)
    await expect(page.getByRole('article', { name: 'Créneau Last Minute aujourd\'hui à 16:00 avec Dom' })).toBeVisible();
    await expect(page.getByRole('article', { name: /Créneau Last Minute/ })).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Créneaux Last Minute' })).toHaveCount(0);

    await page.goto('/feed');
    await expect(page.getByRole('article', { name: 'Créneau Last Minute aujourd\'hui à 16:00 avec Dom' })).toBeVisible();
    await expect(page.getByRole('article', { name: /Créneau Last Minute/ })).toHaveCount(1);
  });

  test('accueil : « News Gang » montre la dernière actualité, pas une publication Last Minute', async ({ page, api }) => {
    const ligne = lastMinute('lm-news-1500', BARBERS.kevin, '15:00', '15:40');
    api.tables.Appointment.push(ligne);
    api.tables.Post.push(
      { id: 'p-news', author_name: 'Kevin', author_role: 'barber', content: 'Nouvelle cire mate en boutique !', image_url: null, created_at: new Date(Date.now() - 3 * 3600000).toISOString() },
      publicationLastMinute('p-news-lm', ligne),
    );

    await page.goto('/');
    await expect(page.getByText('Horaires', { exact: true })).toBeVisible();
    // Le créneau libre a sa carte en tête de l'accueil…
    await expect(page.getByRole('article', { name: 'Créneau Last Minute aujourd\'hui à 15:00 avec Kevin' })).toBeVisible();
    // … et l'encart « News Gang » garde la vraie nouvelle (avant : le texte du Last Minute)
    await expect(page.getByText('Nouvelle cire mate en boutique !')).toBeVisible();
    await expect(page.getByText(/réserve-le vite depuis l'accueil/)).toHaveCount(0);
  });

  test('« Modifier » la prestation à la confirmation : une autre coupe remplace la première au lieu de s\'y ajouter', async ({ page, api }) => {
    const JOUR_RESA = jour(2);
    await page.goto(`/booking?services=${PRESTATIONS.coupe.id}`);
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Choisissez votre prestation' })).toBeVisible();

    // Un complément s'ajoute toujours (barbe, soin) ; une seconde coupe propose de remplacer
    await expect(page.getByRole('button', { name: 'Ajouter Barbe à ma sélection' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Ajouter Soin du visage à ma sélection' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajouter Coupe + Barbe à ma sélection' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Remplacer Coupe par Coupe + Barbe' }).click();
    await expect(page.getByRole('button', { name: 'Ajouter Coupe + Barbe à ma sélection' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Remplacer Coupe + Barbe par Coupe', exact: true })).toBeVisible();
    // Ajout voulu : le soin en plus de la formule
    await page.getByRole('button', { name: 'Ajouter Soin du visage à ma sélection' }).click();
    await page.getByRole('button', { name: 'Continuer', disabled: false }).click();

    await expect(page.getByText('Coupe + Barbe + Soin du visage', { exact: true })).toBeVisible();
    await page.getByRole('region', { name: 'Choix du jour' })
      .getByRole('button', { name: new RegExp(`^${echapper(libelleJour(JOUR_RESA))} : \\d+ créneaux? libres?$`) }).click();
    await expect(page.getByRole('heading', { name: new RegExp(`^${echapper(libelleJour(JOUR_RESA))}$`, 'i') })).toBeVisible();
    const quinzeHeures = page.getByRole('group', { name: 'Après-midi' }).getByRole('button', { name: '15:00', exact: true });
    await quinzeHeures.click();
    await expect(quinzeHeures).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Confirmer le rendez-vous' }).click();
    await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible();
    // Avant : Coupe + Coupe + Barbe (+ Soin), 1 h 45 et 85 € au lieu de 1 h 15 et 60 €
    expect(api.requetesVers('POST', '/entities/Appointment')[0].corps).toMatchObject({
      start_time: '15:00', end_time: '16:15', total_duration: 75, total_price: 60,
      services: [
        { service_id: PRESTATIONS.coupeBarbe.id, name: 'Coupe + Barbe', duration: 45, price: 35 },
        { service_id: PRESTATIONS.soin.id, name: 'Soin du visage', duration: 30, price: 25 },
      ],
    });
  });

  test('puce de rubrique touchée puis « Choisir » : le catalogue quitte vraiment l\'écran, les heures répondent au tap', async ({ page }) => {
    const JOUR_RESA = jour(2);
    await page.goto('/booking');
    await page.getByRole('tab', { name: /Soins et épilation/ }).click();
    await expect(page.getByRole('tab', { name: /Soins et épilation/ })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Choisir : Soin du visage' }).click();
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    // Avant : l'étape Prestation restait dans la page, transparente, par-dessus l'écran Créneau
    await expect(page.getByRole('heading', { name: /^Coupes/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Choisir :/ })).toHaveCount(0);

    await page.getByRole('region', { name: 'Choix du jour' })
      .getByRole('button', { name: new RegExp(`^${echapper(libelleJour(JOUR_RESA))} : \\d+ créneaux? libres?$`) }).click();
    await expect(page.getByRole('heading', { name: new RegExp(`^${echapper(libelleJour(JOUR_RESA))}$`, 'i') })).toBeVisible();
    const heure = page.getByRole('group', { name: 'Après-midi' }).getByRole('button', { name: '15:00', exact: true });
    await heure.click({ timeout: 5000 });
    await expect(heure).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Continuer' })).toBeEnabled();
  });

  test('page Prestations : la formule remplace la coupe et la barbe choisies, la barbe s\'ajoute à la coupe', async ({ page }) => {
    await page.goto('/services');
    await page.getByRole('button', { name: /^Coupe\s*30 min/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Ajouter une autre prestation' }).click();
    await page.getByRole('button', { name: 'Ajouter Barbe à ma sélection' }).click();
    const barre = page.getByRole('region', { name: 'Votre sélection' });
    await expect(barre).toContainText('2 prestations');

    await page.getByRole('button', { name: 'Remplacer Coupe et Barbe par Coupe + Barbe' }).click();
    await expect(barre).toContainText('1 prestation');
    await expect(barre.getByRole('link', { name: /Réserver/ })).toHaveAttribute('href', `/booking?services=${PRESTATIONS.coupeBarbe.id}`);
    // La coupe enfant remplace aussi la formule (une seule coupe par rendez-vous)
    await expect(page.getByRole('button', { name: 'Remplacer Coupe + Barbe par Coupe enfant' })).toBeVisible();
  });

  test.describe('sur un écran d\'ordinateur (1366 px)', () => {
    test.use({ viewport: { width: 1366, height: 900 } });

    test('accueil : Last Minute, carte prestation et « Comme la dernière fois » mènent à la bonne réservation', async ({ page, api }) => {
      garderSeulementLaVisitePassee(api);
      api.tables.Appointment.push(lastMinute('lm-pc-1200', BARBERS.dom, '12:00', '12:40'), lastMinute('lm-pc-1530', BARBERS.kevin, '15:30', '16:10'));

      await page.goto('/');
      await expect(page.getByRole('region', { name: 'Créneaux Last Minute' })).toBeVisible();
      await attendreSansDebordement(page, 'l\'accueil sur ordinateur');

      await page.getByRole('region', { name: 'Prestations' }).getByRole('link').first().click();
      await expect(page).toHaveURL((url) => url.pathname === '/booking' && url.searchParams.get('services') === PRESTATIONS.coupe.id);
      await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
      await page.goBack();

      await carteRebook(page).getByRole('link', { name: /Réserver à nouveau/ }).click();
      await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Choix du barber' }).getByRole('button', { name: /\bKevin\b/ }))
        .toHaveAttribute('aria-pressed', 'true');
      await page.goBack();

      await page.getByRole('link', { name: 'Réserver ce créneau, aujourd\'hui à 12:00 avec Dom' }).click();
      await expect(page.getByText('Last Minute avec Dom, aujourd\'hui à 12:00.')).toBeVisible();
    });

    test('carrousel Last Minute à la souris : flèches précédent / suivant (le glissé et la molette n\'y font rien)', async ({ page, api }) => {
      api.tables.Appointment.push(
        lastMinute('lm-pc-a', BARBERS.dom, '12:00', '12:40'),
        lastMinute('lm-pc-b', BARBERS.kevin, '15:30', '16:10'),
        lastMinute('lm-pc-c', BARBERS.romain, '18:00', '18:40'),
      );
      await page.goto('/');
      const carrousel = page.getByRole('region', { name: 'Créneaux Last Minute' });
      await expect(carrousel).toBeVisible();
      // « Faites glisser » ne s'adresse pas à une souris
      await expect(page.getByText('Faites glisser', { exact: true })).toBeHidden();
      const precedent = page.getByRole('button', { name: 'Créneau Last Minute précédent' });
      const suivant = page.getByRole('button', { name: 'Créneau Last Minute suivant' });
      await expect(precedent).toBeDisabled();

      /** Le lien « Réserver » de cette carte tient-il entier dans la partie visible du carrousel ? */
      const dansLeCadre = async (heure) => {
        const cadre = await carrousel.boundingBox();
        const lien = await carrousel.getByRole('link', { name: new RegExp(`^Réserver ce créneau, aujourd'hui à ${heure}`) }).boundingBox();
        return lien.x >= cadre.x - 1 && lien.x + lien.width <= cadre.x + cadre.width + 1;
      };
      expect(await dansLeCadre('18:00')).toBe(false);

      await suivant.click();
      await expect.poll(() => dansLeCadre('15:30')).toBe(true);
      await expect(precedent).toBeEnabled();
      await suivant.click();
      await expect.poll(() => dansLeCadre('18:00')).toBe(true);
      await expect(suivant).toBeDisabled();
      await carrousel.getByRole('link', { name: 'Réserver ce créneau, aujourd\'hui à 18:00 avec Romain' }).click();
      await expect(page).toHaveURL((url) => url.pathname === '/booking' && url.searchParams.get('barber') === BARBERS.romain.id
        && url.searchParams.get('time') === '18:00');
    });
  });

  test('téléphone (390 px) : « Faites glisser » reste, pas de flèches', async ({ page, api }) => {
    api.tables.Appointment.push(lastMinute('lm-tel-a', BARBERS.dom, '12:00', '12:40'), lastMinute('lm-tel-b', BARBERS.kevin, '15:30', '16:10'));
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Créneaux Last Minute' })).toBeVisible();
    await expect(page.getByText('Faites glisser', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Créneau Last Minute (précédent|suivant)$/ })).toHaveCount(0);
    await attendreSansDebordement(page, 'l\'accueil à 390 px');
  });
});
