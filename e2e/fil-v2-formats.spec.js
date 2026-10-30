// Fil « New Gang » v2 (30 oct. 2026) : le fil lui-même. Contrat : docs/fonctions/fil-new-gang-contrat.md.
// Réactions (pastilles, retour en arrière), commentaires (fenêtre, réponses, ❤️, suppression,
// Signaler), composeur (Publication, Mon look, Avant/Après, Sondage du salon et des clients), formats (look →
// réservation, sondage, Moment du Gang, avant / après), liens (`?post=`, `&comments=1`,
// `?compose=look`), « N nouvelles publications », filtres, modération, Signaler / Bloquer, et
// l'ancien fil (serveur sans `features.feedV2`). Faux serveur : `FauxFil` (e2e/support/mockApi.js) ;
// horloge figée : mardi 10:00, Paris.
import { test, expect } from './support/test.js';
import {
  ADMIN, CLIENT, MEMBRES, PRESTATIONS, media, publicationFil, sondageFil, lookFil, avantApresFil,
  momentFil, reactionFil, commentaireFil, signalementFil,
} from './support/donnees.js';
import { toast, attendreSansDebordement } from './support/outils.js';

/** Plus petite image PNG valable (1 × 1) : la photo envoyée par le composeur. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** Une publication de chaque format, des réactions, trois commentaires et des votes. */
function remplirFil(api) {
  api.tables.Post.push(
    publicationFil({ id: 'p-yanis', auteur: MEMBRES.yanis, content: 'Merci Kevin pour la coupe !', image_url: media(51), minutes: 20 }),
    publicationFil({ id: 'p-salon', auteur: MEMBRES.salon, content: 'Le salon sera fermé lundi pour travaux.', minutes: 40 }),
    lookFil({ id: 'p-look', auteur: MEMBRES.sarah, mot: 'Frais pour le week-end', prestations: [PRESTATIONS.coupe, PRESTATIONS.barbe], minutes: 60 }),
    sondageFil({ id: 'p-sondage', question: 'Quelle couleur pour le hoodie ?', reponses: ['Noir', 'Vert', 'Blanc'], minutes: 80 }),
    avantApresFil({ id: 'p-avant-apres', mot: 'Gros changement', minutes: 100 }),
    momentFil({ id: 'p-moment', membre: 'Mehdi', minutes: 120 }),
  );
  api.tables.PostLike.push(
    reactionFil('p-yanis', MEMBRES.lucas, '🔥'),
    reactionFil('p-yanis', MEMBRES.sarah, '🔥'),
    reactionFil('p-yanis', MEMBRES.mehdi, '❤️'),
  );
  api.tables.PostComment.push(
    commentaireFil({ id: 'c-lucas', post_id: 'p-yanis', de: MEMBRES.lucas, content: 'Trop frais !', minutes: 15 }),
    commentaireFil({ id: 'c-kevin', post_id: 'p-yanis', de: MEMBRES.kevin, content: 'Merci à toi 🙏', minutes: 12 }),
    commentaireFil({ id: 'c-sarah', post_id: 'p-yanis', de: MEMBRES.sarah, content: 'Le dégradé est parfait', minutes: 10 }),
  );
  api.fil.votes.push(
    { post_id: 'p-sondage', user_email: MEMBRES.lucas.email, option_id: 'a' },
    { post_id: 'p-sondage', user_email: MEMBRES.sarah.email, option_id: 'a' },
    { post_id: 'p-sondage', user_email: MEMBRES.mehdi.email, option_id: 'b' },
  );
}

const carte = (page, id) => page.locator(`[data-post-id="${id}"]`);
const corpsVers = (api, methode, chemin) => api.requetesVers(methode, chemin).map((r) => r.corps);

/**
 * Geste envoyé au serveur (réaction, vote, ❤️) : attend la réponse et deux images. Un second geste
 * sur la même publication pendant l'envoi est ignoré par l'app (pas de doublon) : on attend donc
 * que le premier soit terminé.
 */
async function gesteEtReponse(page, motif, geste) {
  const reponse = page.waitForResponse((r) => r.request().method() !== 'OPTIONS' && motif.test(new URL(r.url()).pathname));
  await geste();
  await reponse;
  await page.evaluate(() => new Promise((fin) => requestAnimationFrame(() => requestAnimationFrame(() => fin()))));
}

/** Choisit une photo dans le sélecteur de fichiers ouvert par `bouton`. */
async function ajouterPhoto(page, bouton, nom = 'coupe.png') {
  const [choix] = await Promise.all([page.waitForEvent('filechooser'), bouton.click()]);
  await choix.setFiles({ name: nom, mimeType: 'image/png', buffer: PNG });
}

test.describe('Fil v2 : réactions', () => {
  test('posée, changée puis retirée : pastilles, nombres, aria-pressed et serveur', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed');

    const barre = carte(page, 'p-yanis').getByRole('group', { name: 'Réactions' });
    await expect(barre.getByRole('button', { name: 'Feu, 2', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(barre.getByRole('button', { name: 'Cœur, 1', exact: true })).toBeVisible();

    await gesteEtReponse(page, /\/feed\/p-yanis\/react$/, () => barre.getByRole('button', { name: 'Feu, 2', exact: true }).click());
    await expect(barre.getByRole('button', { name: 'Ma réaction : Feu, 3', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(api.tables.PostLike.filter((l) => l.post_id === 'p-yanis' && l.user_email === CLIENT.email).map((l) => l.reaction)).toEqual(['🔥']);

    // Changer : le choix des 6 réactions
    await barre.getByRole('button', { name: 'Autre réaction', exact: true }).click();
    await gesteEtReponse(page, /\/feed\/p-yanis\/react$/, () => barre.getByRole('button', { name: 'Rire', exact: true }).click());
    await expect(barre.getByRole('button', { name: 'Ma réaction : Rire, 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(barre.getByRole('button', { name: 'Feu, 2', exact: true })).toHaveAttribute('aria-pressed', 'false');

    // Retirer : un tap sur ma pastille
    await gesteEtReponse(page, /\/feed\/p-yanis\/react$/, () => barre.getByRole('button', { name: 'Ma réaction : Rire, 1', exact: true }).click());
    await expect(barre.getByRole('button', { name: /Rire/ })).toHaveCount(0);
    await expect(barre.getByRole('button', { name: 'Feu, 2', exact: true })).toBeVisible();

    expect(corpsVers(api, 'POST', '/feed/p-yanis/react')).toEqual([{ reaction: '🔥' }, { reaction: '😂' }, { reaction: null }]);
    expect(api.tables.PostLike.filter((l) => l.post_id === 'p-yanis' && l.user_email === CLIENT.email)).toEqual([]);
  });

  test('refusée par le serveur : la pastille revient et le message s\'affiche', async ({ page, api, connecter }) => {
    remplirFil(api);
    api.surcharger('POST', '/feed/p-yanis/react', () => ({ status: 500, json: { error: 'Erreur du serveur, réessayez dans un instant.' } }));
    await connecter(CLIENT);
    await page.goto('/feed');

    const barre = carte(page, 'p-yanis').getByRole('group', { name: 'Réactions' });
    await barre.getByRole('button', { name: 'Feu, 2', exact: true }).click();
    await expect(toast(page, 'Erreur du serveur, réessayez dans un instant.')).toBeVisible();
    await expect(barre.getByRole('button', { name: 'Feu, 2', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(barre.getByRole('button', { name: /Ma réaction/ })).toHaveCount(0);
  });
});

test.describe('Fil v2 : commentaires', () => {
  test('fenêtre : aperçu, envoi, réponse « Réponse à … », ❤️ et suppression en deux taps', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed');

    // Aperçu : les 2 derniers commentaires, puis « Voir les 3 commentaires »
    const pub = carte(page, 'p-yanis');
    await expect(pub.getByText('Merci à toi 🙏')).toBeVisible();
    await expect(pub.getByText('Le dégradé est parfait')).toBeVisible();
    await expect(pub.getByText('Trop frais !')).toHaveCount(0);
    await pub.getByRole('button', { name: 'Voir les 3 commentaires' }).click();

    const fenetre = page.getByRole('dialog', { name: /^Commentaires · / });
    await expect(fenetre).toHaveAccessibleName('Commentaires · 3');
    await expect(fenetre.locator('[data-comment-id]')).toHaveCount(3);
    // Kevin écrit en barber (badge), jamais de « Supprimer » sur les commentaires des autres
    await expect(fenetre.locator('[data-comment-id="c-kevin"]').getByText('Barber', { exact: true })).toBeVisible();
    await expect(fenetre.locator('[data-comment-id="c-kevin"]').getByRole('button', { name: 'Supprimer' })).toHaveCount(0);
    await expect(fenetre.locator('[data-comment-id="c-kevin"]').getByRole('button', { name: 'Signaler' })).toBeVisible();

    // Envoyer
    const champ = fenetre.getByPlaceholder('Écris un commentaire…');
    await champ.fill('Grave stylé');
    await fenetre.getByRole('button', { name: 'Envoyer', exact: true }).click();
    await expect(fenetre.getByText('Grave stylé')).toBeVisible();
    await expect(fenetre).toHaveAccessibleName('Commentaires · 4');
    await expect(champ).toHaveValue('');

    // Répondre à Lucas : un seul niveau, sous son commentaire
    await fenetre.locator('[data-comment-id="c-lucas"]').getByRole('button', { name: 'Répondre', exact: true }).click();
    await expect(fenetre.getByText('Réponse à Lucas M.')).toBeVisible();
    await champ.fill('Carrément');
    await fenetre.getByRole('button', { name: 'Envoyer', exact: true }).click();
    await expect(fenetre.getByRole('list', { name: 'Réponses à Lucas M.' }).getByText('Carrément')).toBeVisible();
    await expect(fenetre.getByText('Réponse à Lucas M.')).toHaveCount(0);
    expect(corpsVers(api, 'POST', '/feed/p-yanis/comments')).toEqual([
      { content: 'Grave stylé' },
      { content: 'Carrément', reply_to: 'c-lucas' },
    ]);

    // ❤️ sur le commentaire de Lucas
    const lucas = fenetre.locator('[data-comment-id="c-lucas"]');
    await gesteEtReponse(page, /\/feed\/comments\/c-lucas\/like$/, () => lucas.getByRole('button', { name: 'Aimer ce commentaire', exact: true }).click());
    await expect(lucas.getByRole('button', { name: 'Retirer mon cœur, 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(corpsVers(api, 'POST', '/feed/comments/c-lucas/like')).toEqual([{ liked: true }]);

    // Supprimer mon commentaire : deux taps
    const id = api.tables.PostComment.find((c) => c.content === 'Grave stylé').id;
    const mien = fenetre.locator(`[data-comment-id="${id}"]`);
    await mien.getByRole('button', { name: 'Supprimer', exact: true }).click();
    await expect(mien.getByText('Supprimer ?')).toBeVisible();
    expect(api.requetesVers('DELETE', `/entities/PostComment/${id}`)).toEqual([]);
    await mien.getByRole('button', { name: 'Oui', exact: true }).click();
    await expect(toast(page, 'Commentaire supprimé')).toBeVisible();
    await expect(fenetre.getByText('Grave stylé')).toHaveCount(0);
    expect(api.requetesVers('DELETE', `/entities/PostComment/${id}`)).toHaveLength(1);

    // La carte suit : 4 commentaires (dont la réponse), les 2 derniers en aperçu
    await fenetre.getByRole('button', { name: 'Fermer' }).click();
    await expect(fenetre).toHaveCount(0);
    await expect(pub.getByRole('button', { name: 'Voir les 4 commentaires' })).toBeVisible();
    await expect(pub.getByText('Carrément')).toBeVisible();
  });

  test('Signaler le commentaire d\'un autre : menu, motif, envoi', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed');

    await carte(page, 'p-yanis').getByRole('button', { name: 'Commenter', exact: true }).click();
    const fenetre = page.getByRole('dialog', { name: /^Commentaires · / });
    await fenetre.locator('[data-comment-id="c-kevin"]').getByRole('button', { name: 'Signaler', exact: true }).click();

    const menu = page.getByRole('dialog', { name: 'Commentaire de Kevin' });
    await menu.getByRole('button', { name: 'Signaler ce commentaire' }).click();
    const formulaire = page.getByRole('dialog', { name: 'Signaler' });
    await formulaire.getByRole('radio', { name: 'Harcèlement ou propos haineux' }).click();
    await formulaire.getByRole('button', { name: 'Envoyer le signalement' }).click();
    await expect(toast(page, 'Signalement envoyé')).toBeVisible();
    await expect(formulaire).toHaveCount(0);
    expect(corpsVers(api, 'POST', '/entities/PostReport')).toEqual([
      expect.objectContaining({ post_id: null, comment_id: 'c-kevin', reason: 'Harcèlement ou propos haineux' }),
    ]);
    // L'auteur du signalement vient du jeton
    expect(api.tables.PostReport[0].reporter_email).toBe(CLIENT.email);
  });
});

test.describe('Fil v2 : composeur', () => {
  test('Publication avec photo (client : quatre onglets) : en tête du fil', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed');
    await expect(carte(page, 'p-yanis')).toBeVisible();

    await page.getByRole('button', { name: 'Nouvelle publication' }).click();
    const composeur = page.getByRole('dialog', { name: 'Nouvelle publication' });
    await expect(composeur.getByRole('tab')).toHaveText(['Publication', 'Mon look', 'Avant/Après', 'Sondage']);
    await expect(composeur.getByRole('tab', { name: 'Publication' })).toHaveAttribute('aria-selected', 'true');
    const publier = composeur.getByRole('button', { name: 'Publier', exact: true });
    await expect(publier).toBeDisabled();

    await composeur.getByPlaceholder('Quoi de neuf ? Partage un moment, une photo…').fill('Nouvelle coupe, nouveau moi');
    await ajouterPhoto(page, composeur.getByRole('button', { name: 'Ajouter une photo' }));
    await expect(composeur.getByRole('img', { name: 'Photo 1' })).toBeVisible();
    await publier.click();

    await expect(toast(page, 'Publication envoyée')).toBeVisible();
    await expect(composeur).toHaveCount(0);
    const [envoi] = corpsVers(api, 'POST', '/feed/posts');
    expect(envoi).toMatchObject({ kind: 'post', content: 'Nouvelle coupe, nouveau moi' });
    expect(envoi.images).toHaveLength(1);
    expect(envoi.images[0]).toMatch(/\/api\/media\//);
    const premiere = page.locator('[data-post-id]').first();
    await expect(premiere).toContainText('Nouvelle coupe, nouveau moi');
    await expect(premiere).toContainText(CLIENT.full_name);
    // Ma publication : la corbeille, pas « Signaler ou bloquer »
    await expect(premiere.getByRole('button', { name: 'Supprimer la publication' })).toBeVisible();
    await expect(premiere.getByRole('button', { name: 'Signaler ou bloquer' })).toHaveCount(0);
  });

  test('clavier de l\'app ouvert : le toucher qui ferme le clavier ne ferme pas la fenêtre par la croix, le suivant oui', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed');
    await page.getByRole('button', { name: 'Nouvelle publication' }).click();
    const composeur = page.getByRole('dialog', { name: 'Nouvelle publication' });
    const champ = composeur.getByPlaceholder('Quoi de neuf ? Partage un moment, une photo…');
    await champ.fill('Nouvelle coupe');
    // Clavier ouvert (classe posée par src/lib/capacitor.js dans les apps) : le champ perd la main,
    // puis le toucher arrive sur la croix (iPad, 30 oct. 2026)
    await page.evaluate(() => document.body.classList.add('keyboard-open'));
    await champ.focus();
    await composeur.getByRole('button', { name: 'Fermer' }).click();
    await page.evaluate(() => document.body.classList.remove('keyboard-open'));
    await page.waitForTimeout(800);
    await expect(composeur).toBeVisible();
    await expect(champ).toHaveValue('Nouvelle coupe');
    await composeur.getByRole('button', { name: 'Fermer' }).click();
    await expect(composeur).toHaveCount(0);
  });

  test('sans clavier de l\'app (ordinateur) : la croix ferme au premier clic, même pendant la saisie', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed');
    await page.getByRole('button', { name: 'Nouvelle publication' }).click();
    const composeur = page.getByRole('dialog', { name: 'Nouvelle publication' });
    await composeur.getByPlaceholder('Quoi de neuf ? Partage un moment, une photo…').fill('Nouvelle coupe');
    await composeur.getByRole('button', { name: 'Fermer' }).click();
    await expect(composeur).toHaveCount(0);
  });

  test('Mon look : ma dernière visite, photo, interrupteur « Réserver ce look » coupé', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed');

    await page.getByRole('button', { name: 'Mon look', exact: true }).click();
    const composeur = page.getByRole('dialog', { name: 'Nouvelle publication' });
    await expect(composeur.getByRole('tab', { name: 'Mon look' })).toHaveAttribute('aria-selected', 'true');
    // Seule visite commencée du client : la coupe avec Kevin, il y a deux semaines
    await expect(composeur.getByText('Ta dernière visite')).toBeVisible();
    await expect(composeur.getByText('Coupe', { exact: true })).toBeVisible();
    await expect(composeur.getByText(/ · avec Kevin$/)).toBeVisible();
    const publier = composeur.getByRole('button', { name: 'Publier mon look' });
    await expect(publier).toBeDisabled();

    await ajouterPhoto(page, composeur.getByRole('button', { name: 'Ajouter une photo' }));
    await expect(composeur.getByRole('img', { name: 'Photo 1' })).toBeVisible();
    await composeur.getByRole('textbox', { name: /Un mot/ }).fill('Dégradé tout frais');
    const interrupteur = composeur.getByRole('switch', { name: /Bouton « Réserver ce look »/ });
    await expect(interrupteur).toHaveAttribute('aria-checked', 'true');
    await interrupteur.click();
    await expect(interrupteur).toHaveAttribute('aria-checked', 'false');
    await publier.click();

    await expect(toast(page, 'Publication envoyée')).toBeVisible();
    const [envoi] = corpsVers(api, 'POST', '/feed/posts');
    expect(envoi).toMatchObject({ kind: 'look', content: 'Dégradé tout frais', visit_id: 'apt-passe-kevin', bookable: false });
    expect(envoi.images).toHaveLength(1);
    const look = page.locator('[data-post-id]').first();
    await expect(look).toContainText('Dégradé tout frais');
    await expect(look).toContainText('Mon look');
    await expect(look).toContainText('avec Kevin');
    // Interrupteur coupé : pas de bouton de réservation
    await expect(look.getByRole('link', { name: /Réserver ce look/ })).toHaveCount(0);
  });

  test('Avant/Après : deux photos, puis le curseur de comparaison sur la carte', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed');

    await page.getByRole('button', { name: 'Nouvelle publication' }).click();
    const composeur = page.getByRole('dialog', { name: 'Nouvelle publication' });
    await composeur.getByRole('tab', { name: 'Avant/Après' }).click();
    const publier = composeur.getByRole('button', { name: 'Publier', exact: true });
    await ajouterPhoto(page, composeur.getByRole('button', { name: 'Ajouter la photo avant' }), 'avant.png');
    await expect(composeur.getByRole('img', { name: 'Photo avant' })).toBeVisible();
    await expect(publier).toBeDisabled();
    await ajouterPhoto(page, composeur.getByRole('button', { name: 'Ajouter la photo après' }), 'apres.png');
    await expect(composeur.getByRole('img', { name: 'Photo après' })).toBeVisible();
    await publier.click();

    await expect(toast(page, 'Publication envoyée')).toBeVisible();
    const [envoi] = corpsVers(api, 'POST', '/feed/posts');
    expect(envoi.kind).toBe('before_after');
    expect(envoi.before).toMatch(/\/api\/media\//);
    expect(envoi.after).toMatch(/\/api\/media\//);
    expect(envoi.before).not.toBe(envoi.after);
    expect(envoi).not.toHaveProperty('visit_id');

    const curseur = page.locator('[data-post-id]').first().getByRole('slider', { name: 'Comparer avant et après' });
    await expect(curseur).toHaveValue('50');
    await curseur.focus();
    await page.keyboard.press('ArrowRight');
    await expect(curseur).not.toHaveValue('50');
  });

  test('Sondage d\'un client (30 oct. 2026) : à son nom, résultats visibles par lui sans voter', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed');
    await expect(carte(page, 'p-yanis')).toBeVisible();

    await page.getByRole('button', { name: 'Sondage', exact: true }).click();
    const composeur = page.getByRole('dialog', { name: 'Nouvelle publication' });
    await expect(composeur.getByRole('tab', { name: 'Sondage' })).toHaveAttribute('aria-selected', 'true');
    // Quatre onglets lisibles en entier (une ligne à 390 px, deux à 320 px)
    for (const largeur of [390, 320]) {
      await page.setViewportSize({ width: largeur, height: 760 });
      for (const tab of await composeur.getByRole('tab').all()) {
        expect(await tab.evaluate((el) => el.scrollWidth <= el.clientWidth), `${await tab.textContent()} à ${largeur} px`).toBe(true);
      }
    }
    await composeur.getByRole('textbox', { name: 'Question' }).fill('Dégradé bas ou mi-haut ?');
    await composeur.getByRole('textbox', { name: 'Réponse 1' }).fill('Bas');
    await composeur.getByRole('textbox', { name: 'Réponse 2' }).fill('Mi-haut');
    await composeur.getByRole('button', { name: 'Publier', exact: true }).click();

    await expect(toast(page, 'Publication envoyée')).toBeVisible();
    expect(corpsVers(api, 'POST', '/feed/posts')).toEqual([
      { kind: 'poll', content: '', poll: { question: 'Dégradé bas ou mi-haut ?', options: ['Bas', 'Mi-haut'], days: 3 } },
    ]);
    const sondage = page.locator('[data-post-id]').first();
    await expect(sondage).toContainText('Dégradé bas ou mi-haut ?');
    await expect(sondage).toContainText(CLIENT.full_name);
    await expect(sondage).not.toContainText("D'Home Barber");
    // L'auteur voit les résultats sans voter, et peut voter quand même
    await expect(sondage.locator('[data-poll-option="a"]')).toContainText('0 %');
    await expect(sondage).toContainText(/0 vote · encore [23] jours/);
  });

  test('Sondage d\'un client : pas d\'onglet avec un serveur plus ancien (`feedMemberPolls` absent)', async ({ page, api, connecter }) => {
    remplirFil(api);
    delete api.donnees.parametresPublics.features.feedMemberPolls;
    await connecter(CLIENT);
    await page.goto('/feed?compose=poll');
    await expect(carte(page, 'p-yanis')).toBeVisible();
    // `?compose=poll` ignoré, pas de raccourci Sondage
    await expect(page.getByRole('dialog', { name: 'Nouvelle publication' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sondage', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Nouvelle publication' }).click();
    const composeur = page.getByRole('dialog', { name: 'Nouvelle publication' });
    await expect(composeur.getByRole('tab')).toHaveText(['Publication', 'Mon look', 'Avant/Après']);
  });

  test('Sondage du salon : question, trois réponses, 7 jours', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(ADMIN);
    await page.goto('/feed');

    await page.getByRole('button', { name: 'Sondage', exact: true }).click();
    const composeur = page.getByRole('dialog', { name: 'Nouvelle publication' });
    await expect(composeur.getByRole('tab')).toHaveText(['Publication', 'Sondage']);
    await expect(composeur.getByRole('tab', { name: 'Sondage' })).toHaveAttribute('aria-selected', 'true');
    await composeur.getByRole('textbox', { name: 'Question' }).fill('On ouvre le dimanche ?');
    await composeur.getByRole('textbox', { name: 'Réponse 1' }).fill('Oui');
    await composeur.getByRole('textbox', { name: 'Réponse 2' }).fill('Non');
    await composeur.getByRole('button', { name: 'Ajouter une réponse' }).click();
    await composeur.getByRole('textbox', { name: 'Réponse 3' }).fill('Une fois par mois');
    await composeur.getByRole('radio', { name: '7 jours' }).click();
    await composeur.getByRole('button', { name: 'Publier', exact: true }).click();

    await expect(toast(page, 'Publication envoyée')).toBeVisible();
    expect(corpsVers(api, 'POST', '/feed/posts')).toEqual([
      { kind: 'poll', content: '', poll: { question: 'On ouvre le dimanche ?', options: ['Oui', 'Non', 'Une fois par mois'], days: 7 } },
    ]);
    const sondage = page.locator('[data-post-id]').first();
    await expect(sondage).toContainText('On ouvre le dimanche ?');
    await expect(sondage).toContainText("D'Home Barber");
    // Le salon voit les résultats sans voter
    await expect(sondage.locator('[data-poll-option="a"]')).toContainText('0 %');
    await expect(sondage).toContainText(/0 vote · encore [67] jours/);
  });
});

test.describe('Fil v2 : formats', () => {
  test('look : « Réserver ce look avec Kevin » ouvre la réservation de ces prestations', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed');

    const look = carte(page, 'p-look');
    await expect(look).toContainText('Frais pour le week-end');
    await expect(look).toContainText('Mon look');
    await expect(look).toContainText('Coupe + Barbe');
    await expect(look).toContainText('avec Kevin');
    // Le texte de repli (pour les apps publiées) n'est pas doublé
    await expect(look.getByText(/✂️/)).toHaveCount(0);
    const lien = look.getByRole('link', { name: 'Réserver ce look avec Kevin' });
    await expect(lien).toHaveAttribute('href', `/booking?barber=emp-kevin&services=${PRESTATIONS.coupe.id},${PRESTATIONS.barbe.id}&from=feed-look`);

    await lien.click();
    await expect(page).toHaveURL((url) => url.pathname === '/booking'
      && url.searchParams.get('barber') === 'emp-kevin'
      && url.searchParams.get('services') === `${PRESTATIONS.coupe.id},${PRESTATIONS.barbe.id}`);
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
  });

  test('sondage : voter, changer d\'avis ; un sondage terminé ne se vote plus', async ({ page, api, connecter }) => {
    remplirFil(api);
    api.tables.Post.push(sondageFil({ id: 'p-sondage-fini', question: 'Barbe ou pas barbe ?', reponses: ['Barbe', 'Rasé'], jours: 1, minutes: 3 * 24 * 60 }));
    api.fil.votes.push({ post_id: 'p-sondage-fini', user_email: MEMBRES.lucas.email, option_id: 'a' });
    await connecter(CLIENT);
    await page.goto('/feed');

    const sondage = carte(page, 'p-sondage');
    await expect(sondage).toContainText('Quelle couleur pour le hoodie ?');
    await expect(sondage).toContainText('3 votes · encore 2 jours');
    // Pas de résultats avant mon vote
    await expect(sondage.getByText(/\d+ %/)).toHaveCount(0);

    const vert = sondage.locator('[data-poll-option="b"]');
    await gesteEtReponse(page, /\/feed\/p-sondage\/vote$/, () => vert.click());
    await expect(vert).toHaveAttribute('aria-pressed', 'true');
    await expect(vert).toContainText('50 %');
    await expect(sondage.locator('[data-poll-option="a"]')).toContainText('50 %');
    await expect(sondage).toContainText('4 votes · encore 2 jours · tu peux changer ton vote');

    const noir = sondage.locator('[data-poll-option="a"]');
    await gesteEtReponse(page, /\/feed\/p-sondage\/vote$/, () => noir.click());
    await expect(noir).toHaveAttribute('aria-pressed', 'true');
    await expect(vert).toHaveAttribute('aria-pressed', 'false');
    await expect(noir).toContainText('75 %');
    await expect(vert).toContainText('25 %');
    expect(corpsVers(api, 'POST', '/feed/p-sondage/vote')).toEqual([{ option_id: 'b' }, { option_id: 'a' }]);

    // Terminé : résultats visibles, réponses désactivées
    const fini = carte(page, 'p-sondage-fini');
    await expect(fini).toContainText('1 vote · terminé');
    await expect(fini.locator('[data-poll-option="a"]')).toBeDisabled();
    await expect(fini.locator('[data-poll-option="a"]')).toContainText('100 %');
    expect(api.requetesVers('POST', '/feed/p-sondage-fini/vote')).toEqual([]);
  });

  test('Moment du Gang : « Féliciter » pose 👏, « Félicité » la retire', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed');

    const moment = carte(page, 'p-moment');
    await expect(moment).toContainText('Moment du Gang');
    await expect(moment).toContainText('Mehdi passe Or sur sa carte Gang');
    await expect(moment).toContainText('0 👏');

    await gesteEtReponse(page, /\/feed\/p-moment\/react$/, () => moment.getByRole('button', { name: 'Féliciter', exact: true }).click());
    const felicite = moment.getByRole('button', { name: 'Félicité', exact: true });
    await expect(felicite).toHaveAttribute('aria-pressed', 'true');
    await expect(moment).toContainText('1 👏');

    await gesteEtReponse(page, /\/feed\/p-moment\/react$/, () => felicite.click());
    await expect(moment.getByRole('button', { name: 'Féliciter', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(moment).toContainText('0 👏');
    expect(corpsVers(api, 'POST', '/feed/p-moment/react')).toEqual([{ reaction: '👏' }, { reaction: null }]);
  });

  for (const largeur of [320, 390, 430]) {
    test(`tous les formats sans défilement horizontal à ${largeur} px`, async ({ page, api, connecter }) => {
      await page.setViewportSize({ width: largeur, height: 800 });
      remplirFil(api);
      await connecter(CLIENT);
      await page.goto('/feed');
      await expect(carte(page, 'p-moment')).toBeVisible();
      await expect(carte(page, 'p-look').getByRole('link', { name: 'Réserver ce look avec Kevin' })).toBeVisible();
      await attendreSansDebordement(page, `le fil à ${largeur} px`);
    });
  }
});

test.describe('Fil v2 : liens vers une publication', () => {
  test('?post= : publication chargée seule, en tête, entourée ; l\'adresse est nettoyée', async ({ page, api, connecter }) => {
    remplirFil(api);
    // Une publication bien plus ancienne que la première page du fil (20 publications)
    for (let i = 0; i < 22; i += 1) {
      api.tables.Post.push(publicationFil({ id: `p-remplissage-${i}`, auteur: MEMBRES.mehdi, content: `Publication ${i}`, minutes: 200 + i }));
    }
    api.tables.Post.push(publicationFil({ id: 'p-ancienne', auteur: MEMBRES.lucas, content: 'Souvenir de l\'ouverture', minutes: 40 * 24 * 60 }));
    await connecter(CLIENT);
    await page.goto('/feed?post=p-ancienne');

    const premiere = page.locator('[data-post-id]').first();
    await expect(premiere).toHaveAttribute('data-post-id', 'p-ancienne');
    await expect(premiere).toContainText('Souvenir de l\'ouverture');
    // Liseré vert de la publication ouverte par un lien
    await expect(premiere).toHaveClass(/border-primary/);
    await expect(carte(page, 'p-ancienne')).toHaveCount(1);
    await expect(carte(page, 'p-yanis')).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === '/feed' && !url.searchParams.has('post'));
    expect(api.requetesVers('GET', '/feed/p-ancienne')).toHaveLength(1);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('?post=…&comments=1 : la fenêtre des commentaires s\'ouvre', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed?post=p-yanis&comments=1');
    const fenetre = page.getByRole('dialog', { name: 'Commentaires · 3' });
    await expect(fenetre).toBeVisible();
    await expect(fenetre.locator('[data-comment-id]')).toHaveCount(3);
    await expect(page).toHaveURL((url) => !url.searchParams.has('comments'));
  });

  test('?post= d\'une publication supprimée : « Cette publication n\'existe plus », le fil reste', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed?post=p-disparue');
    await expect(toast(page, 'Cette publication n\'existe plus')).toBeVisible();
    await expect(page.locator('[data-post-id]').first()).toHaveAttribute('data-post-id', 'p-yanis');
  });

  test('?compose=look&visit= (push « Ta coupe est toute fraîche ») : composeur « Mon look » sur cette visite', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed?compose=look&visit=apt-passe-kevin');

    const composeur = page.getByRole('dialog', { name: 'Nouvelle publication' });
    await expect(composeur.getByRole('tab', { name: 'Mon look' })).toHaveAttribute('aria-selected', 'true');
    await expect(composeur.getByText('Ta dernière visite')).toBeVisible();
    await expect(composeur.getByText('Coupe', { exact: true })).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === '/feed' && !url.searchParams.has('compose') && !url.searchParams.has('visit'));
    expect(api.requetesVers('GET', '/feed/visits').length).toBeGreaterThan(0);
  });
});

test.describe('Fil v2 : nouvelles publications et filtres', () => {
  test('« 1 nouvelle publication » apparaît dans la minute ; un tap remonte le fil relu', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed');
    await expect(carte(page, 'p-yanis')).toBeVisible();
    await expect.poll(() => api.requetesVers('GET', '/feed/unread').filter((r) => r.query.since).length).toBeGreaterThan(0);
    await expect.poll(() => api.requetesVers('POST', '/feed/seen').length).toBe(1);

    api.tables.Post.push(publicationFil({ id: 'p-nouvelle', auteur: MEMBRES.lucas, content: 'Je passe demain matin !', minutes: 1 }));
    await page.clock.fastForward(61 * 1000);
    const bouton = page.getByRole('button', { name: '1 nouvelle publication' });
    await expect(bouton).toBeVisible();
    await bouton.click();

    await expect(page.locator('[data-post-id]').first()).toHaveAttribute('data-post-id', 'p-nouvelle');
    await expect(bouton).toHaveCount(0);
    await expect.poll(() => api.requetesVers('POST', '/feed/seen').length).toBe(2);
  });

  test('filtres : Le salon, Les looks, Sondages, Tout', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed');
    const filtres = page.getByRole('group', { name: 'Filtrer le fil' });
    await expect(filtres.getByRole('button', { name: 'Tout', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-post-id]')).toHaveCount(6);

    const ids = () => page.locator('[data-post-id]').evaluateAll((els) => els.map((e) => e.dataset.postId));
    await filtres.getByRole('button', { name: 'Les looks', exact: true }).click();
    await expect(filtres.getByRole('button', { name: 'Les looks', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(ids).toEqual(['p-look', 'p-avant-apres']);

    await filtres.getByRole('button', { name: 'Le salon', exact: true }).click();
    // Publications du salon : la sienne, le sondage et le Moment du Gang
    await expect.poll(ids).toEqual(['p-salon', 'p-sondage', 'p-moment']);

    await filtres.getByRole('button', { name: 'Sondages', exact: true }).click();
    await expect.poll(ids).toEqual(['p-sondage']);

    await filtres.getByRole('button', { name: 'Tout', exact: true }).click();
    await expect(page.locator('[data-post-id]')).toHaveCount(6);
    const demandes = api.requetesVers('GET', '/feed').map((r) => r.query.filter || 'all');
    expect(new Set(demandes)).toEqual(new Set(['all', 'looks', 'salon', 'polls']));
  });
});

test.describe('Fil v2 : modération', () => {
  test('admin : signalement en attente, « Supprimer le contenu » en deux taps', async ({ page, api, connecter }) => {
    remplirFil(api);
    api.tables.PostReport.push(signalementFil({ id: 'rep-1', post_id: 'p-yanis', extrait: 'Merci Kevin pour la coupe !' }));
    await connecter(ADMIN);
    await page.goto('/admin/feed');

    await expect(page.getByText('Signalements en attente (1)')).toBeVisible();
    await expect(page.getByText('Spam ou publicité')).toBeVisible();
    await page.getByRole('button', { name: 'Supprimer le contenu' }).click();
    await page.getByRole('button', { name: 'Oui, supprimer' }).click();
    await expect(toast(page, 'Contenu supprimé')).toBeVisible();
    await expect(page.getByText(/Signalements en attente/)).toHaveCount(0);
    await expect(carte(page, 'p-yanis')).toHaveCount(0);
    expect(api.requetesVers('DELETE', '/entities/Post/p-yanis')).toHaveLength(1);
    expect(corpsVers(api, 'PUT', '/entities/PostReport/rep-1')).toEqual([expect.objectContaining({ status: 'handled', handled_by: ADMIN.email })]);
  });

  test('Signaler une publication : motif et envoi', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed');

    await carte(page, 'p-yanis').getByRole('button', { name: 'Signaler ou bloquer' }).click();
    const menu = page.getByRole('dialog', { name: 'Publication de Yanis K.' });
    await menu.getByRole('button', { name: 'Signaler cette publication' }).click();
    const formulaire = page.getByRole('dialog', { name: 'Signaler' });
    const envoyer = formulaire.getByRole('button', { name: 'Envoyer le signalement' });
    await expect(envoyer).toBeDisabled();
    await formulaire.getByRole('radio', { name: 'Spam ou publicité' }).click();
    await envoyer.click();
    await expect(toast(page, 'Signalement envoyé')).toBeVisible();
    expect(corpsVers(api, 'POST', '/entities/PostReport')).toEqual([
      expect.objectContaining({ post_id: 'p-yanis', comment_id: null, reason: 'Spam ou publicité' }),
    ]);
  });

  test('Bloquer l\'auteur d\'une publication : elle disparaît du fil', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed');

    await carte(page, 'p-yanis').getByRole('button', { name: 'Signaler ou bloquer' }).click();
    await page.getByRole('dialog', { name: 'Publication de Yanis K.' }).getByRole('button', { name: 'Bloquer Yanis K.' }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Bloquer Yanis K. ?' });
    await confirmation.getByRole('button', { name: 'Bloquer', exact: true }).click();

    await expect(toast(page, 'Yanis K. bloqué')).toBeVisible();
    await expect(carte(page, 'p-yanis')).toHaveCount(0);
    await expect(carte(page, 'p-salon')).toBeVisible();
    // Bloqué par sa clé publique, jamais par son email (le fil n'en donne aucun à un client)
    expect(corpsVers(api, 'POST', '/entities/UserBlock')).toEqual([
      { blocked_key: api.filRest.cleDeEmail(MEMBRES.yanis.email), blocked_name: 'Yanis K.' },
    ]);
  });
});

test.describe('Ancien fil (serveur sans `features.feedV2`)', () => {
  test('réagir et commenter par les entités, sans appeler les routes du fil v2', async ({ page, api, connecter }) => {
    api.donnees.parametresPublics.features.feedV2 = false;
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed');

    const pub = carte(page, 'p-yanis');
    await expect(pub).toContainText('Merci Kevin pour la coupe !');
    // Ni cloche de l'activité, ni filtres, ni « Mon look »
    await expect(page.getByRole('link', { name: /^Activité/ })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Filtrer le fil' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mon look', exact: true })).toHaveCount(0);

    const barre = pub.getByRole('group', { name: 'Réactions' });
    await gesteEtReponse(page, /\/entities\/PostLike$/, () => barre.getByRole('button', { name: 'Feu, 2', exact: true }).click());
    await expect(barre.getByRole('button', { name: 'Ma réaction : Feu, 3', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(corpsVers(api, 'POST', '/entities/PostLike')).toEqual([{ post_id: 'p-yanis', user_email: CLIENT.email, reaction: '🔥' }]);

    await pub.getByRole('button', { name: 'Commenter', exact: true }).click();
    const fenetre = page.getByRole('dialog', { name: /^Commentaires · / });
    await expect(fenetre).toHaveAccessibleName('Commentaires · 3');
    // Ancien fil : ni réponses ni ❤️ de commentaire
    await expect(fenetre.getByRole('button', { name: 'Répondre' })).toHaveCount(0);
    await expect(fenetre.getByRole('button', { name: /Aimer ce commentaire/ })).toHaveCount(0);
    await fenetre.getByPlaceholder('Écris un commentaire…').fill('Top du top');
    await fenetre.getByRole('button', { name: 'Envoyer', exact: true }).click();
    await expect(fenetre.getByText('Top du top')).toBeVisible();
    expect(corpsVers(api, 'POST', '/entities/PostComment')).toEqual([{ post_id: 'p-yanis', content: 'Top du top' }]);

    expect(api.requetes.filter((r) => r.chemin === '/feed' || r.chemin.startsWith('/feed/'))).toEqual([]);
  });
});
