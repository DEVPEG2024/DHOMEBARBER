# Fiches App Store et Google Play

Textes et ressources utilisés pour la publication de l'app D'Home Barber. Les captures et visuels sont dans `~/Documents/DHomeBarber-store-assets/`.

## Commun

- **Nom** : D'Home Barber
- **Sous-titre / phrase courte** : Barbier à Douvaine
- **Catégorie** : Style de vie (Lifestyle)
- **Prix** : gratuit
- **Politique de confidentialité** : https://dhomebarber.fr/privacy.html
- **CGU** : https://dhomebarber.fr/cgu.html
- **Site / support** : https://dhomebarber.fr
- **Contact review** : Anthony Saldi, contact@zoom-project.com, +33 6 66 08 36 05
- **Compte de démonstration pour les testeurs** : reviewer@dhomebarber.fr (mot de passe dans `~/.appstoreconnect/dist/review-account.txt`)
- **Classification** : 4+ / Tout public. Contenu généré par les utilisateurs déclaré (fil du salon).

## App Store (fr-FR)

- **Mots-clés** (100 caractères max) : `barbier,coiffeur,barbe,rendez-vous,réservation,douvaine,haute-savoie,homme,coupe,salon`
- **Copyright** : 2026 D'Home Barber
- **Captures 6,9 pouces** (1320 × 2868) : home, booking, services, shop, feed, gift-cards
- **Nouvelles captures (12 oct. 2026)** : `screenshots/app-store-2026-10/` (1320 × 2868, 6,9 pouces) — accroche + iPhone mis en scène, app actuelle avec les vraies prestations, prix et photos produits (données de démonstration pour le client et les créneaux) : 01 accueil « Ton barber, dans ta poche », 02 prestations, 03 créneaux, 04 confirmation, 05 boutique, 06 mes rendez-vous. Générées par Playwright (build local + API simulée) puis composées en HTML. **Posées sur l'App Store le 13 oct. 2026 avec la version 1.0.3** (jeu 6,9 pouces, à la place des 6 captures du 2 sept.). Google Play ne les accepte pas telles quelles (rapport hauteur / largeur de 2,17, le maximum est 2)
- **Chiffrement** : `ITSAppUsesNonExemptEncryption = false` dans Info.plist (HTTPS uniquement)
- **Appareils** : iPhone uniquement (`TARGETED_DEVICE_FAMILY = 1`)

## Google Play

- **Description courte** (80 caractères max) : `Votre barbier à Douvaine : réservez votre coupe en quelques secondes.`
- **Captures téléphone** : `android/screenshot-*.png` (1320 × 2640, ratio 2:1 respecté)
- **Icône** : `android/icon-512.png`
- **Bannière (feature graphic)** : `android/feature-graphic-1024x500.png`
- **Bundle à envoyer** : `android/app/build/outputs/bundle/release/app-release.aab` (version 1.0.1, versionCode 2)
- **Formulaires à remplir dans la console** : sécurité des données (collecte email, nom, téléphone, photos facultatives ; pas de publicité), classification du contenu, accès à l'app (fournir le compte de démonstration), public cible (18 ans et plus recommandé, pas d'enfants).

## Lien de téléchargement et QR code (2 nov. 2026)

- **Lien unique** : `https://dhomebarber.fr/app`, imprimé sur l'affiche du salon : ne jamais le retirer ni le renommer.
  - `redirects` de `vercel.json`, par user-agent (307, pas de cache) : iPhone, iPad, iPod → `https://apps.apple.com/fr/app/id6791332174` ; Android → `https://play.google.com/store/apps/details?id=fr.dhomebarber.mobile`.
  - Sinon (ordinateur, iPad qui se présente comme un Mac) : `public/app.html` (réécriture `/app` → `/app.html` avant la règle générale), logo, deux badges, et le même tri refait par le script de la page.
- **Badges officiels** dans `public/badges/` : `app-store-fr.svg` (« Télécharger dans l'App Store », noir, outil marketing d'Apple `toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/fr-fr`) et `google-play-fr.png` (« Disponible sur Google Play », `play.google.com/intl/fr/badges/static/images/badges/fr_badge_web_generic.png`). Ne pas les redessiner ni les recolorer (règles des deux marques). Le PNG de Google a 29 px de marge transparente en haut et en bas sur 250 : pour une même hauteur visible que le badge Apple, il est affiché 250/192 fois plus haut avec une marge négative.
- **QR code et affiche A4** : `docs/prototypes/qr-app/` (`affiche.html`, `rendu.mjs`). `node docs/prototypes/qr-app/rendu.mjs <dossier>` écrit `qr-code-app.svg`, `qr-code-app.png` (2048 px, fond transparent autour du carré blanc), `affiche-A4.pdf` (imprimeur : l’image 300 dpi sur une page A4, car les halos flous exportés en PDF vectoriel sortaient en rectangles dans Aperçu) et `affiche-A4.png` (300 dpi). Il n'écrit qu'après avoir relu le QR avec jsQR (QR seul de 100 à 1600 px, affiche entière de 800 à 2480 px).
  - QR : version 4 (33 × 33), correction H (30 %). L'icône de l'app au centre masque 9 × 9 modules.
  - Modules arrondis **qui se touchent**. Des points séparés (90 % du module) n'étaient plus lus en grand format (1000 px).
  - Yeux aux pupilles vert et rouge du drapeau, assez foncées pour être lues comme noires.
- Fichiers remis le 2 nov. 2026 : `~/Downloads/DHB-QR-app/`.

## Description longue (les deux stores)

D'Home Barber, votre barbier à Douvaine, dans votre poche.

Réservez votre coupe ou votre taille de barbe en quelques secondes, choisissez votre barbier préféré et recevez un rappel avant votre rendez-vous.

FONCTIONNALITÉS
• Prise de rendez-vous en ligne 24h/24 : choix du barbier, de la prestation et du créneau
• Rappels automatiques avant chaque rendez-vous
• Vos rendez-vous passés et à venir, annulables à tout moment
• Boutique : commandez vos produits de soin et retirez-les au salon
• Cartes cadeau à offrir, avec QR code à présenter au salon
• Privatisation du salon pour vos événements : anniversaires, enterrements de vie de garçon, team building
• Le fil du salon : actualités, photos et réactions de la communauté
• Profils des barbers avec leur carte de présentation
• Créneaux de dernière minute : soyez prévenu quand une place se libère

LE SALON
D'Home Barber est situé à Douvaine, en Haute-Savoie, au 3 rue du Bois Arquet, sur le côté gauche du bâtiment Odyssée.

Un compte gratuit suffit pour réserver.

## Notes pour la review Apple (anglais)

D'Home Barber is the booking app of a single barber shop located in Douvaine, France. Log in with the demo account to browse services, book an appointment with a barber, view past bookings, the product shop, gift cards, salon privatisation requests and the salon feed. Appointments created with the demo account are test data and will be cleaned by the salon. Push notification permission is optional. Admin features are reserved to salon staff and not part of the customer experience.
