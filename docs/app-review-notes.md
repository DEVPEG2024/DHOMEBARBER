# Notes de revue App Store : mise à jour pour les directives d'octobre 2026

> Apple a mis à jour ses directives. Ce qui concerne D'Home Barber :
>
> - **1.2** (contenus publiés par les utilisateurs) : filtre avant publication, signalement, blocage
>   et coordonnées publiées sont obligatoires. Ne pas traiter un manquement signalé enfreint le Code
>   de conduite.
> - **2.5.19** (nouvelle) : aucune fonction cachée, dormante ou non documentée. Tout doit être clair
>   pour l'utilisateur **et pour App Review**.
> - **2.3.1(a)** : toute nouveauté doit être décrite précisément dans les notes de revue. Une
>   description générique est refusée.
> - **2.3.14** (nouvelle) : les « creative assets » de la fiche (visuels mis en avant hors captures)
>   ne doivent montrer ni prix, ni remise, ni promesse invérifiable.
> - **Avant de soumettre** : backend en ligne, compte de démonstration, explication des fonctions
>   peu visibles.
> - **3.1.1(a)** et **5** : rien à faire. L'app ne vend aucun contenu numérique : les cartes cadeau,
>   commandes et précommandes se règlent au salon, pour des services et produits physiques
>   (3.1.3(e)).
>
> **À faire par la session du Mac, au prochain envoi (build 12)** : coller le bloc ci-dessous **en
> tête** des notes de revue de la version (la 1.0.5, build 11, était déjà approuvée le 16 oct. 2026 :
> rien à y changer). Garder sous ce bloc les paragraphes des versions précédentes.
>
> **Avant ce collage :**
> - Déployer le filtre serveur de `docs/backend-content-filter.md`. Sinon, retirer « and on the
>   server » du point 1.
> - Remplir les deux lignes `<…>` des comptes de démonstration.
> - Point 4 (Wallet, collé le 17 oct. 2026 : Apple Wallet est configuré sur le serveur) : donner au
>   compte client de démonstration une carte cadeau **validée** de 10 € (Admin → Cartes cadeau), sinon
>   retirer sa dernière phrase. La supprimer après la revue, sans supprimer le compte. Si Google Wallet
>   est allumé d'ici là, remplacer l'avant-dernière phrase par « On Android the same button adds the
>   card to Google Wallet. ».

## Bloc à coller (anglais, lu par App Review)

```
[Guideline compliance — October 2026 update]

1. User-generated content (Guideline 1.2)
The community feed ("Ca dit quoi le Gang ?"), its comments, the reviews and the display name are user-generated content. Safeguards:
- Filtering: an automatic filter refuses insults, hate speech, sexually explicit terms and threats before anything is posted (in the app and on the server). Try commenting "connard" on any feed post: it is refused with an explanation.
- Reporting: "···" menu on every post, "Signaler" under every comment. Each report notifies the salon admins by push and email; reports are reviewed within 24 hours and offending content is removed (Admin → Fil → "Signalements en attente").
- Blocking: "···" → "Bloquer" hides all content from that user; manage blocked users in Paramètres → "Utilisateurs bloqués".
- Contact: Paramètres → "Nous contacter" (contact@dhomebarber.fr, +33 6 66 08 36 05); also section 14 of the Terms (cgu.html). Zero-tolerance rules are in section 7 of the Terms and are accepted at sign-up.

2. No hidden or dormant features (Guideline 2.5.19)
Every feature is reachable from the visible navigation. Features that depend on the account role or on a server setting:
- Staff area (/admin): visible only to salon staff accounts (admin, barbers). It contains the salon's management tools: agenda, sales dashboard, clients, products, gift cards, notifications to clients (with an AI writing assistant that drafts the text; the admin reviews it before sending), customer activity feed, moderation of the feed. Clients never see it. Staff demo account: <email / mot de passe d'un compte barber de démonstration, ou retirer cette ligne et le paragraphe>.
- Snap camera filters (Snap Camera Kit SDK, page "Filtres Snap"): present in the binary but switched OFF for all users. While off, the page only says "bientôt disponibles" and the camera is never requested. We will not switch it on without first describing it in the review notes of a submitted version.
- "Nouvelle tête" hair colour try-on: works on-device. The optional "AI ULTRA" mode (server-side image editing) appears only when the server enables it. Photos are not stored.
- Order cancellation options and cancellation reasons are enabled server-side; they are visible in "Mes commandes" and "Mes rendez-vous".
No code obfuscation is used.

3. Payments (Guideline 3.1)
The app sells no digital content. Appointments, shop orders, gift cards and clothing pre-orders are paid in person at the salon for physical services and goods (3.1.3(e)). There is no in-app payment and no external purchase link.

4. [Gift cards in Apple Wallet]
A client who has bought a gift card can add it to Apple Wallet: Home screen → "Carte Cadeau" block (page "Cartes Cadeau") → tap an active gift card (status "Validée", not expired, with a remaining balance) → "Ajouter à Apple Wallet". The button only appears for active cards, and only once the salon's server has a Wallet pass certificate (it is configured for this review). The app requests a link from our server; the server checks that the card belongs to the signed-in account and returns a short-lived (10 minutes) link to a signed .pkpass, which opens in Safari View Controller and shows the standard Wallet "Add" sheet. The pass is a store card showing the card code, the balance at the time it was added (the up-to-date balance stays in the app), the recipient, the expiry date and the same QR code as in the app; the salon scans it at the counter to deduct services. It contains no payment and no in-app purchase: gift cards are paid in person at the salon (3.1.3(e)). The pass uses the salon's address so Wallet can suggest it on the Lock Screen near the salon. Google Wallet (Android) is not enabled yet: no Wallet button is shown on Android. The demo client account has an active 10 € gift card for testing.

Client demo account: <email / mot de passe du compte client de démonstration déjà fourni dans App Store Connect>
```

## Dernier bloc approuvé : iOS 1.0.12, build 20 (3 nov. 2026)

Celui de la 1.0.13 (soumise le 5 nov. 2026) est dans `~/store-watch/envoi/notes-113.txt` : le recopier ici à son approbation. `<MDP2>` = mot de passe du second compte, posé à l'envoi (`~/.appstoreconnect/dist/review-account-2.txt`).

```
[Version 1.0.12 — build 20] No new permission, no new third-party SDK, no in-app purchase. New: a second mini-game, "Snake du Gang" (point 7), and new match rules for "La Coupe du Gang" (point 5). The staff dashboard (/admin) is redesigned.

[Guideline compliance — November 2026 update]
1. User-generated content (1.2). Feed posts (photos, polls, before/after, looks), comments, replies, reviews and display names are user content. Filtering: insults, hate speech, sexual terms and threats are refused before posting, in the app and on the server (try commenting "connard"). Reporting: "···" on every post, "Signaler" under every comment and reply; admins are notified and act within 24 h. Blocking: "···" → "Bloquer"; Paramètres → "Utilisateurs bloqués". Contact: Paramètres → "Nous contacter" (contact@dhomebarber.fr, +33 6 66 08 36 05). Zero tolerance: Terms section 7, accepted at sign-up.
2. No hidden or dormant features (2.5.19). Everything is reachable from the visible navigation. The staff area (/admin) is for salon staff only (agenda, sales, clients, gift cards, notifications with an AI writing assistant whose drafts the admin reviews, moderation). Snap camera filters (Camera Kit) are in the binary but OFF for everyone: the page says "bientôt disponibles", the camera is never requested; we will describe them in a submitted version before switching them on. "Nouvelle tête" colour try-on runs on-device; its "AI ULTRA" mode appears only when enabled by the server; photos are not stored.
3. Payments (3.1). No digital content is sold. Appointments, shop orders, gift cards and clothing pre-orders are paid in person at the salon (3.1.3(e)). No in-app payment, no external purchase link.
4. Apple Wallet. Home → "Carte Cadeau" → an active card → "Ajouter à Apple Wallet": a signed .pkpass (recipient, validity, balance, code, QR scanned at the counter), kept up to date by a PassKit web service. No payment inside.
5. "La Coupe du Gang" mini-game (approved in 1.0.10). Home → "Jeux" → "La Coupe du Gang" → "Jouer". New rules in this version, explained in "Règles du match" on the game home screen: first to 5 goals, fire ball (+1), electric ball (+2), fouls and penalties, golden goal, random stadium events (foam, slippery gel, storm, moving goals, sprinklers, smoke). "Contre le salon" (vs the computer, on-device, no points) is the quickest test. Online wins earn "Points de Coupe" only for clients with a real salon visit; no prize or real-world value; no chat, only 3 preset reactions; "Signaler" and "Bloquer" on the end screen, the leaderboard and the "Joueurs" list. To test online: 2nd device signed in as reviewer2@dhomebarber.fr / <MDP2>; "En ligne" → "Un ami" → "Créer un match" on one, type the code → "Rejoindre" on the other.
6. Feed ("New's Gang !" tab). Reactions, comments with one level of replies. "Quoi de neuf ?" opens the composer: photos, poll, before/after, "Mon look" (one of the client's own past visits, no price). "Moments du Gang" are posted by the server only for members who opted into the "Team of the Season" leaderboard. Bell icon → "Activité" with optional feed notifications (never 21:00-08:00). All user content covered by point 1.
7. "Snake du Gang" mini-game. The classic snake game on a drawn retro phone: swipe anywhere on the phone to turn (2/4/6/8 keys can be turned on in "Vitesse et options"), eat dots to grow, catch the bonus critters, do not bite your own tail (no walls). Home → "Jeux" → "Snake du Gang". Free, no purchase, no prize. Scores are checked by our server, which replays the moves. Optional monthly leaderboard (first name + initial only, opt-in in "Vitesse et options"). Offline games are not ranked.
```

## Creative assets (2.3.14) : fiche App Store

- Les visuels de mise en avant et les captures (`screenshots/app-store-2026-10/`) ne doivent montrer
  ni prix (« 25 € »), ni remise (« -20 % »), ni promesse invérifiable (« le meilleur barber de
  France »).
- Avant d'ajouter un creative asset dans App Store Connect, vérifier qu'aucune capture ne montre la
  page Prestations ou Bons plans avec des prix ou des pourcentages visibles. Sinon, en choisir une
  autre (accueil, carte FUT d'un barber, agenda, fil).
- Les textes de `docs/store-listing.md` sont conformes : ils ne citent aucun prix.

## Filtres Snap : règle à garder (2.5.19)

L'interrupteur d'Admin → Filtres Snap permet d'allumer les filtres **sans nouvelle version**. Avec la
2.5.19, allumer une fonction absente des notes de revue serait une « fonction dormante ».

**Règle :**
1. Avant d'allumer les filtres, envoyer une version dont les notes de revue décrivent la page Filtres
   Snap allumée : comment l'ouvrir, l'écran des CGU Camera Kit et la caméra.
2. Allumer l'interrupteur seulement une fois cette version approuvée.

## Carte cadeau dans Apple Wallet (paragraphe d'origine du § 8 de `docs/backend-wallet.md`)

> **Collé le 17 oct. 2026 dans le bloc du build 12 ci-dessus (point 4)**, Apple Wallet étant configuré
> sur le serveur (Heroku v118). Seule différence : Google Wallet n'étant pas encore allumé, la phrase
> sur Android y dit qu'aucun bouton n'apparaît. Le texte ci-dessous reste pour mémoire.

Avant le collage : déployer `docs/backend-wallet.md`, et donner au compte client de démonstration une
carte cadeau validée de 10 € (à supprimer après la revue, règle « Nettoyage » de CLAUDE.md).

```
[Gift cards in Apple Wallet]
A client who has bought a gift card can add it to Apple Wallet: Home screen → "Carte Cadeau" block (page "Cartes Cadeau") → tap an active gift card (status "Validée", not expired, with a remaining balance) → "Ajouter à Apple Wallet". The button only appears for active cards, and only once the salon's server has a Wallet pass certificate (it is configured for this review). The app requests a link from our server; the server checks that the card belongs to the signed-in account and returns a short-lived (10 minutes) link to a signed .pkpass, which opens in Safari View Controller and shows the standard Wallet "Add" sheet. The pass is a store card showing the card code, the balance at the time it was added (the up-to-date balance stays in the app), the recipient, the expiry date and the same QR code as in the app; the salon scans it at the counter to deduct services. It contains no payment and no in-app purchase: gift cards are paid in person at the salon (3.1.3(e)). The pass uses the salon's address so Wallet can suggest it on the Lock Screen near the salon. On Android the same button adds the card to Google Wallet. The demo client account has an active 10 € gift card for testing.
```
