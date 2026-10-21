// Admin « Cartes Gang » : l'admin choisit le niveau de la carte d'un client (21 oct. 2026).
// Le niveau choisi est un minimum : la carte continue de monter avec les visites, les niveaux déjà
// atteints par les visites ne se choisissent pas, un retour « Selon les visites » est possible.
// Routes de la carte Gang servies par des surcharges propres à ce fichier.
import { test, expect } from './support/test.js';
import { ADMIN } from './support/donnees.js';
import { jour } from './support/temps.js';
import { toast, debordementHorizontal } from './support/outils.js';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const NIVEAUX = {
  bronze: 'Bronze', argent: 'Argent', or: 'Or', orrare: 'Or holo', tots: 'Team of the Season', icone: 'Icône',
};
const ORDRE = Object.keys(NIVEAUX);

/** Carte de deux visites (Bronze selon les visites), au niveau affiché `tier`. */
const carte = (tier) => ({
  tier, tier_label: NIVEAUX[tier], edition: null, public_edition: null, name: 'Yanis K.', photo_url: null,
  serial: 42, pos: 'CLA', score: 61, stats: { FID: 48, REG: 70, PON: 99, STY: 51, GNG: 30, FRA: 80 },
  visits: 2, first_visit: jour(-40), last_visit: jour(-14), days_since_last: 14, barber: 'Kevin',
  favorite: 'Coupe Homme', next: tier === 'bronze' ? { tier: 'argent', label: 'Argent', visits_needed: 2, progress: 33 } : null,
  badges: [{ key: 'premiere_coupe', emoji: '🎉', label: 'Première coupe', description: 'Ta toute première visite au salon', unlocked: true, progress: null }],
});

/**
 * Serveur de la carte Gang : niveau choisi en mémoire (`etat.min`), comme `users.gang_min_tier`.
 * `ancienServeur` : fiche sans `account.min_tier` (serveur d'avant le 21 oct. 2026).
 */
function installerCarteGang(api, { ancienServeur = false } = {}) {
  const etat = { min: null };
  const affiche = () => (etat.min && ORDRE.indexOf(etat.min) > 0 ? etat.min : 'bronze');
  api.surcharger('GET', '/gang-card/admin/overview', () => ({
    json: {
      generated_at: new Date().toISOString(), season: { since: jour(-90), days: 90 },
      totals: { clients: 1, with_card: 1, by_tier: Object.fromEntries(ORDRE.map((t) => [t, t === affiche() ? 1 : 0])) },
      fading: [], top_season: [], badges: { premiere_coupe: 1 },
    },
  }));
  api.surcharger('GET', '/gang-card/admin/cards', () => ({
    json: {
      generated_at: new Date().toISOString(),
      cards: [{
        user_id: ID, email: 'yanis@exemple.fr', full_name: 'Yanis Kaddour', phone: '0611111111', nudged_at: null,
        upcoming: false, badges_unlocked: ['premiere_coupe'], card: { ...carte(affiche()), badges: undefined },
        ...(ancienServeur ? {} : { min_tier: etat.min, tier_auto: 'bronze' }),
      }],
    },
  }));
  api.surcharger('GET', new RegExp(`^/gang-card/admin/client/${ID}$`), () => ({
    json: {
      generated_at: new Date().toISOString(),
      account: {
        id: ID, email: 'yanis@exemple.fr', full_name: 'Yanis Kaddour', phone: '0611111111', birth_date: null,
        created_at: '2026-01-15T10:00:00.000Z', nudged_at: null, leaderboard_opt_in: false, leaderboard_banned_at: null,
        ...(ancienServeur ? {} : { min_tier: etat.min }),
      },
      card: carte(affiche()),
      ...(ancienServeur ? {} : { tier_auto: 'bronze' }),
      tiers: ORDRE.map((key, i) => ({
        key, label: NIVEAUX[key], min: [1, 4, 9, 18, 36, null][i], reached_on: key === 'bronze' ? jour(-40) : null,
      })),
      badges: carte('bronze').badges.map((b) => ({ ...b, unlocked_on: jour(-40) })),
      visits: [
        { date: jour(-14), start_time: '10:00', barber: 'Kevin', services: ['Coupe Homme'] },
        { date: jour(-40), start_time: '10:00', barber: 'Kevin', services: ['Coupe Homme'] },
      ],
      missed: [], upcoming: [], absences: 0, client_cancels: 0,
    },
  }));
  api.surcharger('PUT', new RegExp(`^/gang-card/admin/client/${ID}/tier$`), (req) => {
    etat.min = req.corps.tier;
    return { json: { ok: true, min_tier: etat.min, tier: affiche(), tier_label: NIVEAUX[affiche()], tier_auto: 'bronze' } };
  });
  return etat;
}

const fiche = (page) => page.getByRole('dialog');
const choix = (page) => fiche(page).getByRole('radiogroup', { name: 'Niveau de la carte' });

test.describe('Cartes Gang : niveau choisi par l\'admin', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(ADMIN);
  });

  test('monter une carte en Or puis revenir au niveau des visites', async ({ page, api }) => {
    installerCarteGang(api);
    await page.goto('/admin/gang-cards');
    await page.getByRole('button', { name: /^Yanis Kaddour : Bronze, 2 visites/ }).click();

    const groupe = choix(page);
    await expect(groupe.getByRole('radio', { name: 'Selon les visites · Bronze' })).toHaveAttribute('aria-checked', 'true');
    // Niveau déjà atteint par les visites : pas un choix
    await expect(groupe.getByRole('radio', { name: 'Bronze', exact: true })).toBeDisabled();

    // Un tap prépare, rien ne part avant « Confirmer »
    await groupe.getByRole('radio', { name: 'Or', exact: true }).click();
    await expect(fiche(page).getByText('Passer la carte de Yanis en Or ?')).toBeVisible();
    await expect(fiche(page).getByText('Révélation « Tu passes Or » à sa prochaine ouverture de l’app.')).toBeVisible();
    expect(api.requetesVers('PUT', /\/tier$/)).toHaveLength(0);
    await fiche(page).getByRole('button', { name: 'Confirmer' }).click();

    await expect(toast(page, 'Carte passée en Or')).toBeVisible();
    expect(api.requetesVers('PUT', /\/tier$/).map((r) => r.corps)).toEqual([{ tier: 'or' }]);
    // Fiche relue : Or coché, « Choisi par le salon » dans le parcours, pastille du titre à jour
    await expect(groupe.getByRole('radio', { name: 'Or', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(fiche(page).getByText('Choisi par le salon').first()).toBeVisible();
    await expect(fiche(page).getByText(/Ses visites seules lui donnent Bronze/)).toBeVisible();

    // Retour aux visites
    await groupe.getByRole('radio', { name: 'Selon les visites · Bronze' }).click();
    await expect(fiche(page).getByText('Revenir au niveau de ses visites (Bronze) ?')).toBeVisible();
    await expect(fiche(page).getByText('Sa carte redescend en Bronze.')).toBeVisible();
    await fiche(page).getByRole('button', { name: 'Confirmer' }).click();
    await expect(toast(page, 'La carte suit de nouveau les visites : Bronze')).toBeVisible();
    expect(api.requetesVers('PUT', /\/tier$/).map((r) => r.corps)).toEqual([{ tier: 'or' }, { tier: null }]);
    await expect(groupe.getByRole('radio', { name: 'Selon les visites · Bronze' })).toHaveAttribute('aria-checked', 'true');
  });

  test('« Annuler » ne change rien ; la collection marque une carte choisie ; 320 px sans débordement', async ({ page, api }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    const etat = installerCarteGang(api);
    etat.min = 'tots';
    await page.goto('/admin/gang-cards');
    const vignette = page.getByRole('button', { name: /^Yanis Kaddour : Team of the Season \(niveau choisi par le salon\), 2 visites/ });
    await expect(vignette).toBeVisible();
    await expect(vignette.getByText('Choisi', { exact: true })).toBeVisible();
    await vignette.click();

    await choix(page).getByRole('radio', { name: 'Argent', exact: true }).click();
    await expect(fiche(page).getByText('Sa carte redescend en Argent.')).toBeVisible();
    expect(await debordementHorizontal(page)).toBe(0);
    await fiche(page).getByRole('button', { name: 'Annuler' }).click();
    await expect(fiche(page).getByText('Passer la carte de Yanis en Argent ?')).toHaveCount(0);
    expect(api.requetesVers('PUT', /\/tier$/)).toHaveLength(0);
  });

  test('serveur d\'avant le 21 oct. 2026 : pas de choix du niveau dans la fiche', async ({ page, api }) => {
    installerCarteGang(api, { ancienServeur: true });
    await page.goto('/admin/gang-cards');
    await page.getByRole('button', { name: /^Yanis Kaddour : Bronze, 2 visites/ }).click();
    await expect(fiche(page).getByText('Parcours')).toBeVisible();
    await expect(fiche(page).getByText('Niveau de la carte')).toHaveCount(0);
  });
});
