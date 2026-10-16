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

Client demo account: <email / mot de passe du compte client de démonstration déjà fourni dans App Store Connect>
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

## Carte cadeau dans Apple Wallet (à coller seulement une fois le Wallet configuré sur le serveur)

Avant le collage : déployer `docs/backend-wallet.md`, et donner au compte client de démonstration une
carte cadeau validée de 10 € (à supprimer après la revue, règle « Nettoyage » de CLAUDE.md).

```
[Gift cards in Apple Wallet]
A client who has bought a gift card can add it to Apple Wallet: Home screen → "Carte Cadeau" block (page "Cartes Cadeau") → tap an active gift card (status "Validée", not expired, with a remaining balance) → "Ajouter à Apple Wallet". The button only appears for active cards, and only once the salon's server has a Wallet pass certificate (it is configured for this review). The app requests a link from our server; the server checks that the card belongs to the signed-in account and returns a short-lived (10 minutes) link to a signed .pkpass, which opens in Safari View Controller and shows the standard Wallet "Add" sheet. The pass is a store card showing the card code, the balance at the time it was added (the up-to-date balance stays in the app), the recipient, the expiry date and the same QR code as in the app; the salon scans it at the counter to deduct services. It contains no payment and no in-app purchase: gift cards are paid in person at the salon (3.1.3(e)). The pass uses the salon's address so Wallet can suggest it on the Lock Screen near the salon. On Android the same button adds the card to Google Wallet. The demo client account has an active 10 € gift card for testing.
```
