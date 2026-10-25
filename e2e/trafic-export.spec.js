// Admin → Trafic : « Exporter » enregistre en CSV les chiffres affichés (26 oct. 2026), pour la
// période et le périmètre choisis : une rubrique par carte de la page, décimales à la virgule,
// textes neutralisés contre les formules, jamais les chiffres de l'ancienne période pendant le
// chargement de la nouvelle. Synthèse du serveur servie par une surcharge propre à ce fichier.
import { test, expect } from './support/test.js';
import { ADMIN } from './support/donnees.js';
import { jour, instantParis } from './support/temps.js';
import { debordementHorizontal } from './support/outils.js';

const jourFr = (cle) => cle.split('-').reverse().join('/');
const ligne = (...cellules) => cellules.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';');

/** Synthèse `/analytics/overview` pour la période et le périmètre demandés. */
function synthese(req) {
  const { from, to, scope } = req.query;
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  const vu = instantParis(jour(-3), '10:30').toISOString();
  return {
    json: {
      period: { from, to, days },
      scope,
      kpis: {
        sessions: 40, visitors: 30, accounts: 12, avg_session_s: 185, median_session_s: 90, total_active_s: 7400,
        pages_per_session: 2.4, bounce_rate: 0.35, new_visitors: 18, returning_visitors: 12,
      },
      previous: {
        sessions: 32, visitors: 25, accounts: 10, avg_session_s: 150, median_session_s: 80, total_active_s: 4800,
        pages_per_session: 2, bounce_rate: 0.4, new_visitors: 15, returning_visitors: 10,
      },
      daily: [
        { day: from, sessions: 2, visitors: 2, avg_session_s: 40, page_views: 3 },
        { day: to, sessions: 5, visitors: 4, avg_session_s: 95, page_views: 12 },
      ],
      hourly: [{ dow: 2, hour: 9, sessions: 3 }, { dow: 7, hour: 23, sessions: 1 }],
      platforms: [{ platform: 'ios', sessions: 25, visitors: 18 }, { platform: 'web', sessions: 15, visitors: 12 }],
      devices: [{ device: 'mobile', sessions: 38 }],
      sources: [{ source: 'lien:instagram', sessions: 9 }],
      entries: [{ path: '/booking', sessions: 14 }],
      pages: [{ path: '/barber/:id', views: 20, visitors: 11, avg_time_s: 42 }],
      actions: [{ name: 'booking_done', count: 6, visitors: 5 }],
      funnel: [
        { key: 'open', label: 'Réservation ouverte', visitors: 8 },
        { key: 'datetime', label: 'Choix du créneau', visitors: 6 },
        { key: 'confirm', label: 'Écran de confirmation', visitors: 4 },
        { key: 'done', label: 'Rendez-vous réservé', visitors: 2 },
      ],
      posts: [{ post_id: 'p1', viewers: 7, views: 9, author_name: 'Yanis K.', excerpt: '=HYPERLINK("x")\nsuite', image_url: null, created_at: vu }],
      gallery: [{ barber_id: 'emp-kevin', barber_name: 'Kevin', opens: 6, book_clicks: 1 }],
      live: { sessions: 1 },
      errors: {
        totals: { errors: 3, sessions_with_error: 2, devices: 2, sessions: 400, error_free_rate: 0.995 },
        list: [{
          message: '-1 is not a valid index', source: 'react', count: 3, devices: 2, team_devices: 1,
          first_at: vu, last_at: vu, first_seen: vu, page: '/booking', stack: 'at x', versions: ['ios 1.0.8', 'web'],
        }],
      },
    },
  };
}

async function exporter(page) {
  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter' }).click();
  const fichier = await telechargement;
  const contenu = await (await fichier.createReadStream()).toArray().then((morceaux) => Buffer.concat(morceaux).toString('utf8'));
  return { nom: fichier.suggestedFilename(), contenu, lignes: contenu.replace(/^\uFEFF/, '').split('\n') };
}

test.describe('Trafic : export CSV', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(ADMIN);
  });

  test('30 jours, clients : toutes les rubriques, décimales à la virgule, formules neutralisées', async ({ page, api }) => {
    api.surcharger('GET', '/analytics/overview', synthese);
    await page.goto('/admin/traffic');
    await expect(page.getByText('Visiteurs uniques')).toBeVisible();

    const { nom, contenu, lignes } = await exporter(page);
    expect(nom).toBe(`trafic-${jour(-29)}-au-${jour(0)}-clients.csv`);
    expect(contenu.charCodeAt(0), 'BOM pour Excel').toBe(0xFEFF);
    expect(lignes).toContain(ligne('Période', `du ${jourFr(jour(-29))} au ${jourFr(jour(0))} (30 jours)`));
    expect(lignes).toContain(ligne('Période précédente (comparaison)', `du ${jourFr(jour(-59))} au ${jourFr(jour(-30))}`));
    expect(lignes).toContain(ligne('Visiteurs comptés', 'Clients seulement (équipe et comptes testeurs exclus)'));
    for (const titre of ['Chiffres clés', 'Évolution par jour', 'Parcours de réservation', 'Heures de pointe (débuts de session, heure de Paris)',
      'Pages les plus vues', 'Actions clés', 'Provenance des visites', 'Plateformes', 'Appareils', 'Pages d\'entrée',
      'Réalisations des barbers', 'New Gang : publications les plus vues', 'Erreurs de l\'app (tout le monde, équipe comprise)']) {
      expect(lignes, titre).toContain(ligne(titre));
    }

    // Chiffres clés : durées en clair, écart en nombre (négatif sans apostrophe), décimale « 2,4 »
    expect(lignes).toContain(ligne('Visiteurs uniques', 30, 25, 20));
    expect(lignes).toContain(ligne('Temps moyen par session', '3 min 05 s', '2 min 30 s', 23));
    expect(lignes).toContain(ligne('Pages par session', '2,4', '2', 20));
    // Même écart que la tuile de la page (deltaOf : -12,5 % en virgule flottante → -13)
    expect(lignes).toContain(ligne('Rebond : 1 page et moins de 10 s (%)', 35, 40, -13));

    // Un jour par ligne, jours sans visite à zéro
    const jours = lignes.filter((l) => /^"\d\d\/\d\d\/\d{4}";"[a-z]+";/.test(l));
    expect(jours).toHaveLength(30);
    expect(jours[0]).toBe(ligne(jourFr(jour(-29)), 'lundi', 2, 2, 40, 3));
    expect(jours[1]).toBe(ligne(jourFr(jour(-28)), 'mardi', 0, 0, 0, 0));
    expect(jours[29]).toBe(ligne(jourFr(jour(0)), 'mardi', 4, 5, 95, 12));

    expect(lignes).toContain(ligne('Choix du créneau', 6, 75));
    const mardi = Array(24).fill(0);
    mardi[9] = 3;
    expect(lignes).toContain(ligne('mardi', ...mardi, 3));
    expect(lignes).toContain(ligne('Profil d\'un barber', '/barber/:id', 20, 11, 42));
    expect(lignes).toContain(ligne('Lien « instagram »', 9));
    expect(lignes).toContain(ligne('iPhone (app)', 25, 18));
    expect(lignes).toContain(ligne('Kevin', 6, 1));
    // Texte d'un client commençant par « = » : neutralisé, sur une seule ligne, heure de Paris
    expect(lignes).toContain(ligne('\'=HYPERLINK("x") suite', 'Yanis K.', `${jourFr(jour(-3))} 10:30`, 7, 9));
    expect(lignes).toContain(ligne('Sessions sans erreur (%)', '99,5'));
    expect(lignes).toContain(ligne('Écran planté', '\'-1 is not a valid index', 3, 2, 1,
      `${jourFr(jour(-3))} 10:30`, `${jourFr(jour(-3))} 10:30`, 'Réservation', 'iPhone 1.0.8 · Site'));
    expect(contenu, 'aucune adresse email').not.toContain('@');
  });

  test('change de période et de périmètre : export bloqué pendant le chargement, puis les nouveaux chiffres', async ({ page, api }) => {
    let lacher;
    const portail = new Promise((r) => { lacher = r; });
    api.surcharger('GET', '/analytics/overview', async (req) => {
      if (req.query.from === jour(-6)) await portail;
      return synthese(req);
    });
    await page.goto('/admin/traffic');
    const bouton = page.getByRole('button', { name: 'Exporter' });
    await expect(bouton).toBeEnabled();

    await page.getByRole('button', { name: '7 jours' }).click();
    await expect(bouton, 'chiffres de l\'ancienne période encore affichés').toBeDisabled();
    lacher();
    await expect(bouton).toBeEnabled();
    await page.getByRole('button', { name: 'Tout le monde' }).click();
    await expect.poll(() => api.requetesVers('GET', '/analytics/overview').some((r) => r.query.scope === 'all')).toBe(true);
    await expect(bouton).toBeEnabled();

    const { nom, lignes } = await exporter(page);
    expect(nom).toBe(`trafic-${jour(-6)}-au-${jour(0)}-tout-le-monde.csv`);
    expect(lignes).toContain(ligne('Période', `du ${jourFr(jour(-6))} au ${jourFr(jour(0))} (7 jours)`));
    expect(lignes).toContain(ligne('Visiteurs comptés', 'Tout le monde (équipe et comptes testeurs compris)'));
    expect(lignes.filter((l) => /^"\d\d\/\d\d\/\d{4}";"[a-z]+";/.test(l))).toHaveLength(7);
  });

  test('320 px : bouton visible, aucun débordement', async ({ page, api }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    api.surcharger('GET', '/analytics/overview', synthese);
    await page.goto('/admin/traffic');
    await expect(page.getByText('Visiteurs uniques')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exporter' })).toBeInViewport();
    expect(await debordementHorizontal(page)).toBe(0);
  });
});
