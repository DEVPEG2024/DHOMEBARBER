# D'Home Barber - Guide Projet

## Comment lire ce fichier

Ce fichier est chargé au début de chaque session. Il ne garde que ce qu'il faut savoir **avant** de toucher au code : architecture, déploiement, état des stores, structure, entités, et surtout les **règles** (une ligne chacune) qu'une session casserait sans les connaître. Le détail de chaque fonction et tout l'historique (envois aux stores, vérifications, audits, incidents) sont dans `docs/` : ouvrir le document du domaine **avant de modifier une fonction**, pas à chaque session.

- **Règle de mise à jour** : une session qui ajoute une fonction ou fait un tour de vérification écrit le détail dans `docs/fonctions/<sujet>.md` (ou dans un nouveau `docs/historique/<date>-<sujet>.md`) et n'ajoute ici que les **règles nouvelles** (une ligne, dans le bon groupe) et l'état utile (versions des stores, prochains numéros). Jamais de compte rendu daté ni de liste de correctifs dans ce fichier. Un reste à faire va dans `docs/historique/restes-a-faire.md`.
- Réécrit le 20 oct. 2026 : l'ancienne version (336 Ko, commit 7738a11) est conservée mot pour mot, découpée par sujet, dans `docs/fonctions/` et `docs/historique/`.
- Réponses, commits et documents en français, phrases courtes, dates absolues. L'envoi aux stores demande toujours le feu vert explicite de l'utilisateur.

## Index des documents

Les documents de `docs/fonctions/` et `docs/historique/` sont des extraits mot pour mot : un renvoi « voir « Titre » » à l'intérieur désigne une section de l'ancien fichier, à retrouver avec `grep -rn "### Titre" docs/`. Index pour un humain : `docs/LISEZMOI.md`.

### `docs/fonctions/` : comment marche une fonction (à lire avant de la modifier)

| Document | À lire quand on touche à… |
|---|---|
| `architecture-deploiement.md` | Heroku, Vercel, sauvegardes, texte complet des variables d'environnement |
| `structure-code.md` | n'importe quel fichier : rôle de chaque fichier du frontend et du backend |
| `entites-api-auth.md` | une entité ou une colonne (tableau complet), le client API, les endpoints hors CRUD, l'auth et les sessions |
| `securite-moderation-nettoyage.md` | la politique d'accès par rôle, CORS, quotas, la modération du fil, le nettoyage après un test en production |
| `notifications-jobs.md` | push web / APNs / FCM, emails, fenêtre d'activation, jobs node-cron |
| `reservation-rendez-vous.md` | réservation et prestations (refonte du 19 oct.), déplacer / annuler, délai de 24 h, Last Minute, produits liés à un RDV, favoris |
| `agenda-menage.md` | l'agenda de l'équipe (vues, glisser-déposer, pauses, fiche RDV), le planning, le ménage |
| `barbers.md` | créer un barber et son compte, fiche de test, profil public, carte FUT, galerie, « Mon espace » |
| `admin-pilotage.md` | tableau de bord (règles du CA), Bugs et suggestions, Trafic, Activité clients et alertes admin |
| `boutique-commandes-bons-plans.md` | Boutique, commandes et leur annulation, fiche produit, bons plans du Gang |
| `cartes-cadeau-wallet.md` | cartes cadeau (débit, historique, suppression) et Apple / Google Wallet |
| `carte-gang.md` | carte Gang des clients (niveaux, stats, écussons, saisons, effets, admin) |
| `fil-new-gang.md` | le fil « New Gang » v2 (30 oct. 2026) : où est quoi, règles, coupure d'urgence ; `fil-new-gang-contrat.md` (schéma, API, formes des réponses, tâches) |
| `coupe-du-gang.md` | La Coupe du Gang (mini-jeu de foot façon air hockey en ligne, points, classement) : où est quoi, décisions, mesures ; `coupe-du-gang-contrat.md` (schéma, API, protocole v2) ; `coupe-du-gang-stade.md` (thème stade : image, caméra, palette) ; `coupe-du-gang-stores.md` (textes stores) |
| `textile.md` | drops textile, Labo, précommandes |
| `evenements-privatisation.md` | Privatiser le salon (devis, suivi) et événements du salon (invitations, RSVP) |
| `snap-essayage.md` | filtres Snap (Camera Kit, Lens Studio, revue Snap) et essayage couleur « Nouvelle tête » |
| `interface-accueil-animations.md` | accueil, animations, fenêtres, défilement horizontal, gyroscope |
| `natif-ios-android.md` | Capacitor, `android:release`, recette d'archive iOS, clavier (règle et pièges du simulateur), langue des projets natifs |

### `docs/historique/` : ce qui s'est passé (à lire pour comprendre une règle ou un incident)

| Document | Contenu |
|---|---|
| `restes-a-faire.md` | **tous les restes à faire, limites connues et points non corrigés**, dédoublonnés, datés, avec leur source |
| `stores.md` | chaque envoi aux stores (iOS 1.0 → 1.0.9, Android → 1.0.17), refus Google, DSA, identifiants de soumission |
| `2026-09-05-revue-securite-et-bugs.md` | revue de sécurité et de charge, bugs du 5 sept. |
| `2026-10-07-verification-complete.md` | vérification par 7 agents du 7 oct. |
| `2026-10-14-revue-et-2026-10-16-audit.md` | revue du 14 oct. (listes en échec), audit du 16 oct. (décisions du salon) |
| `2026-10-17-verification-complete.md` | 10 auditeurs, 80 défauts |
| `2026-10-18-verification-tours-2-a-4.md` | tours 2 à 4 du 18 oct. |
| `2026-10-18-verification-tours-5-a-7.md` | tours 5 à 7 du 18 oct. et arbitrage du tour 6 |
| `2026-10-18-verification-tours-8-et-9.md` | tours 8 et 9 du 18 oct. |

Incidents notables : 6 images perdues par le ramasse-miettes (25 sept., `notifications-jobs.md`) ; `events.date` comparé en `::date`, toute réservation aurait répondu 500 (tour 3) ; aucun iPhone abonné aux pushs faute des méthodes d'`AppDelegate.swift` (17 oct., `notifications-jobs.md`) ; refus Google pour fiche trompeuse (10 sept., `stores.md`) ; refus Apple pour le clavier sur iPad (9 sept., `natif-ios-android.md`).

### Notices et textes déjà dans `docs/`

- `docs/app-review-notes.md` : notes de revue à coller dans App Store Connect (UGC, fonctions selon le rôle ou un réglage serveur, paiements, Wallet) ; paragraphe « [Version x — build n] » à ajouter en tête à chaque envoi.
- `docs/store-listing.md` : textes des fiches App Store et Google Play, alignés sur ce que l'app fait vraiment.
- `docs/lens-studio-couleur-cheveux.md` : pas à pas Lens Studio pour la lentille couleur du salon.
- Notices serveur (contrats écrits avant le code de `dhomebarber-api`, toutes appliquées, gardées comme référence) : `backend-admin-alerts.md` (alertes push admin ; v2 « table d'audit » non faite), `backend-content-filter.md`, `backend-feedback.md`, `backend-gift-card-debit.md`, `backend-last-minute-push.md`, `backend-orders-cancellation.md`, `backend-partners.md`, `backend-session-lastminute.md`, `backend-wallet.md`.

## Architecture

- **Frontend** : React + Vite + TailwindCSS, sur **Vercel** (https://dhomebarber.fr). Dépôt GitHub https://github.com/DEVPEG2024/DHOMEBARBER (frontend seul), branche `main`. Ici : `/Users/zoomproject/Downloads/puzzling-sharp-edge-book`.
- **Backend** : Express.js + PostgreSQL, sur **Heroku**, app `dhomebarber-api` (https://dhomebarber-api-3aabb8313cb6.herokuapp.com). Dépôt local `/Users/zoomproject/Downloads/dhomebarber-api/` (aucun CLAUDE.md côté backend : ce fichier sert aux deux).
- **Client API** maison `src/api/apiClient.js` (`api.entities.<Entity>`, `api.auth`, `api.integrations.Core.UploadFile`), toujours importé via `@/api/apiClient`. Le SDK `@base44/sdk` est retiré ; `appId` = `prod`.
- **Apps natives** : Capacitor 8 (`capacitor.config.ts`, appId iOS `fr.dhomebarber.app`, paquet Play `fr.dhomebarber.mobile`). Dossiers `ios/` et `android/` **hors git** (réglages natifs locaux, voir la recette d'envoi). Les apps embarquent le bundle web (`dist/` copié par `cap sync`) : une modification frontend n'arrive dans les apps qu'avec un nouveau build store.
- **Salon** : D'Home Barber, sur le côté gauche du bâtiment Odyssée, 3 Rue du Bois Arquet, 74140 Douvaine ; téléphone **06 66 08 36 05** (repli partout quand `settings.phone` est vide) ; barbers réservables Dom, Kevin, Romain au 24 oct. 2026 (Denis n'y figure plus ; Sacha : fiche supprimée).

## Déploiement

- **Frontend** : push sur `main` → Vercel déploie seul ; hard refresh (Cmd+Shift+R) ensuite. `vercel.json` porte les en-têtes de sécurité et sert `/assets/*` en `immutable` sans réécriture (un fichier disparu répond 404 : `curl -s -o /dev/null -w '%{http_code}' https://dhomebarber.fr/assets/Inexistant-abc123.js` → 404).
- **Backend** : `git push heroku main` depuis `dhomebarber-api`. Après chaque déploiement : journaux de démarrage sans erreur ni « migration ignorée » (`DB migration check done`), API 200, bundle servi par dhomebarber.fr. Quand le frontend dépend d'un changement serveur, **déployer Heroku avant Vercel**.
- **Le frontend doit marcher avant et après le déploiement serveur** : tout ce qui dépend d'une règle serveur nouvelle passe par un drapeau `features.*` des paramètres publics (ex. `useCancelFeatures()`), qui ne rejette jamais. Paramètres publics en cache 30 s côté serveur, vidé quand l'admin les enregistre.
- **Le serveur reste compatible avec les apps déjà publiées** (elles ne changent qu'avec un build, et des clients ne mettent pas à jour) : ne jamais casser un contrat d'API existant (ex. `GiftCard.update` admin gardé en repli, `snap.apiToken` / `lensGroupId` gardés, email renvoyé sur les lignes du demandeur dans le fil).
- **Base** : addon `postgresql-deep-70510` (essential-0, 1 Go au plus, ni rollback ni fork). Sauvegarde quotidienne à **03h00 Paris** (avant le ramasse-miettes de 03h30). Pour récupérer des données : `heroku pg:backups:download` puis extraire les lignes voulues ; **jamais `pg:backups:restore`** (il écrase tout ce qui a changé depuis).
- La session Heroku CLI expire : relancer `heroku login` si une commande répond `Invalid credentials` (tenter la commande d'abord).
- **Variables Heroku obligatoires** : `NODE_ENV=production` (sans elle CORS accepte `localhost` et un `JWT_SECRET` de repli), `DATABASE_URL`, `JWT_SECRET` (le serveur refuse de démarrer sans), `API_PUBLIC_URL` (base des URL d'images), `FRONTEND_URL`, `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL`, `SMTP_HOST` (défaut smtp.hostinger.com) / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS`.
- **Variables facultatives** (chacune allume une fonction, sans elle la fonction répond 503 `not_configured` ou reste cachée) : `FAL_KEY` (+ `HAIR_ULTRA_EDIT_MODEL`) AI ULTRA ; `ANTHROPIC_API_KEY` (+ `AI_WRITER_MODEL`, défaut `claude-opus-5`) assistant IA des notifications, posée ; `SNAP_CAMERA_KIT_API_TOKEN` + `SNAP_LENS_GROUP_ID` (la saisie de l'admin dans `snap_config` prime) ; `APNS_KEY_P8` + `APNS_KEY_ID` + `APNS_TEAM_ID` + `APNS_BUNDLE_ID` (posées, pas d'`APNS_ENV` = production) ; `FCM_SERVICE_ACCOUNT` (posée) ; `APPLE_PASS_TYPE_ID` + `APPLE_TEAM_ID` + `APPLE_PASS_CERT_PEM` + `APPLE_PASS_KEY_PEM` + `APPLE_WWDR_PEM` (posées) ; `GOOGLE_WALLET_ISSUER_ID` + `GOOGLE_WALLET_SERVICE_ACCOUNT` (**pas encore posées** : attendre l'accès en publication de Google) ; `GIFT_CARD_DEBIT_NOTIFY_OWNER=true` (posée : push à l'acheteur après chaque débit de carte cadeau, décision du 21 oct. 2026 ; la valeur était déjà `true` depuis le 17 oct., v116) ; `LAST_MINUTE_AUTO=off` coupe les Last Minute automatiques et leurs publications (absente = allumés) ; `FEED_V2=off` éteint le fil v2 (`features.feedV2` faux : l'app relit l'ancien fil par les entités). Texte complet : `docs/fonctions/architecture-deploiement.md`.

### Commandes utiles

```bash
# Frontend
cd /Users/zoomproject/Downloads/puzzling-sharp-edge-book
npm run dev                         # serveur de dev
npm run build && npm run lint       # contrôle avant push
git add -A && git commit -m "message" && git push      # déploie sur Vercel
npm run cap:sync                    # build + sync iOS / Android
npm run cap:ios                     # build + sync + ouvre Xcode
npm run cap:android                 # build + sync + ouvre Android Studio
npm run android:release             # build, sync, versionCode +1, .aab signé, test interne (--dry-run, --no-upload, --track=production)

# Backend
cd /Users/zoomproject/Downloads/dhomebarber-api
npm test                            # harnais sans base réelle (105 au 29 oct. 2026)
git add -A && git commit -m "message" && git push heroku main   # npm test lancé avant l'envoi (.githooks/pre-push)
heroku run "node scripts/app-errors.js --days=7" --app dhomebarber-api   # erreurs remontées par l'app (--stack)
heroku run "node scripts/coupe-mesures.js --days=7" --app dhomebarber-api  # latence des vrais matchs de la Coupe
heroku logs --tail --app dhomebarber-api
heroku pg:psql --app dhomebarber-api
heroku run node init-db.js --app dhomebarber-api        # tables de base + index
heroku run "node cleanup-media.js" --app dhomebarber-api  # simulation ; --apply pour supprimer
heroku run "node jobs/comebackReminder.js --dry-run" --app dhomebarber-api  # guillemets obligatoires

# L'API répond ?
curl -s -o /dev/null -w "%{http_code}\n" https://dhomebarber-api-3aabb8313cb6.herokuapp.com/api/apps/public/prod/public-settings/by-id/prod
```

### Clés, comptes et identifiants (où c'est rangé)

- **App Store Connect** : app id `6791332174`, équipe `3NXH4CTJM3`, clé API `K79WY8DX6N` (`~/.appstoreconnect/private_keys/AuthKey_K79WY8DX6N.p8`). Signature : trousseau `dhomebarber-build`, profil « D Home Barber App Store ».
- **APNs** : Key ID `9Q52VPGNPL` (Sandbox & Production, Team Scoped), `~/.appstoreconnect/apns/AuthKey_9Q52VPGNPL.p8` (chmod 600) + copies dans `DHomeBarber-keystore-backup/apns/` (Documents et iCloud Drive) : Apple ne la laisse télécharger qu'une fois.
- **Apple Wallet** : Pass Type ID `pass.fr.dhomebarber.giftcard`, certificat **valable jusqu'au 16 nov. 2027** (le renouveler avant : passé cette date le serveur éteint seul `features.appleWallet`) ; clé, certificat et WWDR dans `~/.appstoreconnect/wallet/` (ne jamais les afficher). Google Wallet : accès en publication demandé le 17 oct. 2026.
- **Google Play** : compte de service `play-publisher@d-home-barber.iam.gserviceaccount.com`, clé `~/.play-console/dhomebarber-play.json` (chmod 600, ou `PLAY_SERVICE_ACCOUNT_FILE` / `_JSON`) ; il publie jusqu'en production mais ne valide pas une fiche modifiée (console). **FCM** : `fcm-sender@d-home-barber.iam.gserviceaccount.com`, copie `~/.fcm-key/dhomebarber-fcm.json`.
- **Keystore Android** : `android/dhomebarber-release.keystore` + `android/keystore.properties`, dans aucun git, copies dans ~/Documents et iCloud Drive : **sans eux, plus aucune mise à jour Play Store**.
- **Anthropic** : clé `dhomebarber-notifications` (organisation « Nova's Individual Org »), crédit prépayé **sans rechargement automatique** : recharger quand l'admin voit « Crédit de l'assistant IA épuisé ».
- **Snap** : app Camera Kit `d1e96176-c662-4cb8-8b06-eb91e6e54873`, groupe du salon `7c603de2-5d64-4d22-84e7-6dcfe63f2621`, lentille « DHB Couleur » `d7dd254c-7188-4dde-87fb-572a85a3c501`, projet Lens Studio `~/Documents/DHB Lenses/HairColor/` (hors git, piloté par le serveur MCP local de Lens Studio).
- **Portails sans API** : Chrome dédié piloté en CDP, port 9333, sessions connectées.
- **Comptes à ne jamais supprimer** : `reviewer@dhomebarber.fr` (démonstration des stores), `reviewer2@dhomebarber.fr` (second appareil du mode en ligne de la Coupe, créé le 30 oct. 2026, mot de passe dans `~/.appstoreconnect/dist/review-account-2.txt`), `snap.review@dhomebarber.fr` (revue Snap), barber de test `adminb@dhomebarber.com` (fiche « adminb » cachée des clients). Mots de passe hors git.

## Apps natives et stores

### État au 30 oct. 2026

- **En ligne** : iOS **1.0.9 (build 17)** depuis le 27 oct. 2026 à 03:56 et Android **1.0.17 (code 18)** depuis le 26 oct. 2026 à 21:56 (constaté par `~/store-watch`), envoyées le 26 oct. (disponibles dans l'UE, France comprise, depuis la validation DSA du 12 oct.). Contenu : réservation pour un proche, l'admin au nom de « D'Home Barber » (étoile bleue), Last Minute dans le fil, « CB + Espèces », export du Trafic, correctifs de la réservation et du scanner QR.
- **Envoi du 30 oct. 2026 (La Coupe du Gang)** : Android **1.0.18 (code 19)** en production, en examen chez Google ; iOS **1.0.10 (build 18)** envoyé et rattaché à sa version, **pas encore soumis** (contrôle clavier iPad et étiquette « Contenu de jeu » à faire, Mac verrouillé et session App Store Connect déconnectée) : `node ~/store-watch/envoi/submit110.mjs submit` ensuite. Détail : `docs/historique/stores.md`.
- **Prochains numéros : iOS build 19, Android versionCode 20.**
- **iPhone Duo : le build 17 est encore compilé avec Xcode 26.3 (kit iOS 26.2)**, l'app reste réduite avec des bandes noires sur l'écran intérieur déplié. Pour le remplir : macOS ≥ 26.6 (ce Mac : 26.5.1 au 26 oct., la mise à jour redémarre le Mac), puis Xcode 27.1, puis un build 18 vérifié sur le simulateur iPhone Duo (plié, déplié, clavier). Détail : `docs/historique/restes-a-faire.md`.
- **Scripts d'envoi** (client de l'API App Store Connect, soumission, mise en production Play, `exportOptions.plist`) : `~/store-watch/envoi/`, hors du dossier temporaire des sessions (effacé à chaque redémarrage). Copier `submit109.mjs` / `play-promote-18.mjs` en changeant les numéros.
- **Remontée des erreurs déclarée aux deux stores le 21 oct. 2026** : App Store « Données de plantage » (fonctionnement de l'app, liées, publiée) ; Play « Journaux de plantage » (collectés, non partagés, facultatifs, fonctionnement de l'appli et analyse). Toute nouvelle donnée collectée suit la même voie (règle des stores plus bas).
- **Compte de démonstration** : contrôlé le 29 oct. 2026 après la revue de la 1.0.9, rien à nettoyer (règle de nettoyage plus bas, à refaire après chaque revue).
- **Surveillance** : LaunchAgent `~/store-watch` (toutes les 3 h, se décharge seul, messages tirés de `IOS_VERSION` / `ANDROID_VERSION`) : terminée le 27 oct. 2026 (les deux versions en ligne), à relancer au prochain envoi. Rien ne tourne quand le Mac dort.
- **Chrome dédié aux consoles** (Apple et Google, pilotable par CDP, port 9333) : `open -na "Google Chrome" --args --remote-debugging-port=9333 --user-data-dir="$HOME/Library/Application Support/DHB Chrome Consoles"` ; sessions App Store Connect et Play Console ouvertes par l'utilisateur le 21 oct. 2026 (profil hors dossier temporaire : il survit aux redémarrages).
- **Snap** : revue approuvée ; reste *Push to Production* dans le portail puis le jeton de production dans Admin → Filtres Snap → Camera Kit (sans déploiement). Les filtres restent éteints tant que la lentille n'a pas d'effet.
- Apps gratuites : contrat « applications payantes », compte bancaire et questionnaire fiscal américain inutiles.

### Recette d'envoi (seulement sur feu vert explicite de l'utilisateur)

1. Frontend poussé et bundle identique à dhomebarber.fr ; le backend dont il dépend déjà en ligne.
2. `npm run cap:sync`, puis vérifier que `capacitor-swift-pm` est **à la version de `@capacitor/ios`** dans `ios/App/CapApp-SPM/Package.swift` et `Package.resolved` (8.5.3 au 18 oct. ; sinon l'app embarque un ancien Capacitor iOS vulnérable).
3. **Contrôles iOS** (fichiers hors git, à reporter si `ios/` est régénéré) : `AppDelegate.swift` avec les **deux méthodes push** (`didRegisterForRemoteNotificationsWithDeviceToken` → `NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)`, `didFailToRegisterForRemoteNotificationsWithError` → `.capacitorDidFailToRegisterForRemoteNotifications` : sans elles aucun iPhone ne s'abonne) ; `Info.plist` : `NSCameraUsageDescription`, `NSPhotoLibraryAddUsageDescription` (sinon « Enregistrer l'image » plante), `CFBundleDevelopmentRegion = fr`, `CFBundleLocalizations = (fr, en)`, `UIBackgroundModes` avec `remote-notification` et **sans** `audio` ; `project.pbxproj` : `knownRegions = (en, fr, Base)`, `developmentRegion = fr` ; `PrivacyInfo.xcprivacy` (FileTimestamp `C617.1`) dans la cible ; `aps-environment = production`.
4. **Clavier** sur le simulateur **iPad Air 11-inch (M3)** : Email, Mot de passe, Téléphone de l'inscription et message de la demande de privatisation, capture clavier ouvert (`xcrun simctl io <udid> screenshot`, taps par `osascript`). Pièges : `docs/fonctions/natif-ios-android.md`.
5. **iOS** : `CURRENT_PROJECT_VERSION` + 1 ; `security unlock-keychain` (trousseau `dhomebarber-build`) ; `xcodebuild archive` Release avec `OTHER_CODE_SIGN_FLAGS="--keychain …"` ; `-exportArchive` (`exportOptions.plist` : `app-store-connect`, `upload`, signature `manual`, profil « D Home Barber App Store », options `-authenticationKey*`) ; VALID en ~3 min. Puis par l'API : version (la même si la précédente attend encore l'examen), `PATCH appStoreVersions/{id}/relationships/build`, nouveautés fr-FR, notes de revue (« [Version x — build n] » + bloc de conformité de `docs/app-review-notes.md`), `reviewSubmission` créée **après** que l'ancienne soit COMPLETE (sinon « Item is already present »), item version, `PATCH submitted=true`, `AFTER_APPROVAL`.
6. **Android** : `npm run android:release` (incrémente `versionCode` et `versionName`, vérifie la signature, test interne ; s'il échoue après l'incrément, remettre le numéro avant de relancer) ; wrapper `android/gradle/wrapper/gradle-wrapper.properties` sur **Gradle 8.14.3** (9.7.1, posé le 20 oct., casse AGP 8.13 : « InternalProblems … removed in Gradle 9.6.0 ») ; vérifier que le `.aab` contient `res/drawable/ic_stat_icon.xml` et les plugins Filesystem / Share ; puis production par l'API (`edits` → `tracks/production` → `commit`, notes de version). `AndroidManifest.xml` (hors git) : `android.hardware.camera` **optionnelle** (sinon 428 appareils exclus), `android:allowBackup="false"` (sinon le jeton de session part dans la sauvegarde Google).
7. Après l'envoi : relancer `~/store-watch`, mettre à jour l'état et les prochains numéros ici, le récit dans `docs/historique/stores.md`.

### Règles des stores

- Ne jamais annuler une revue Apple en cours pour joindre un build (retour en fin de file), sauf si le build précédent n'est pas encore examiné : retirer la soumission, rattacher le nouveau build à la même version, re-soumettre.
- **Règle Apple 2.5.19** : ne jamais allumer une fonction dormante (filtres Snap, AI ULTRA, Google Wallet…) sans l'avoir décrite dans les notes de revue d'une version approuvée.
- **Règle Apple 4.5.4** : notifications jamais obligatoires (toujours « Plus tard »).
- **Fiches** : ne promettre que ce que l'app fait vraiment (refus Google du 10 sept. 2026 pour une vidéo et des avis promis absents) ; galerie des réalisations seulement une fois remplie ; « creative assets » sans prix ni remise. Texte : `docs/store-listing.md`.
- Toute nouvelle donnée collectée = mise à jour de l'étiquette « Confidentialité de l'app » (App Store, API interne iris) et de « Sécurité des données » (Play Console), et de `public/privacy.html`.
- L'app est iPhone seulement mais Apple la teste aussi sur iPad (mode compatibilité) : d'où le contrôle clavier sur iPad.

### Clavier (règle, iOS et Android)

- `Keyboard.resize = 'native'` dans `capacitor.config.ts`, **jamais `body`** (sur iPad en mode compatibilité le clavier recouvrait les champs : refus Apple du 9 sept. 2026).
- `initKeyboardHandling()` (`src/lib/capacitor.js`) pose `--keyboard-overlap` (en `padding-bottom` via `body.keyboard-open`) seulement si la fenêtre n'a pas rétréci ; **jamais la hauteur du clavier en plus d'une fenêtre déjà réduite** (iPad simulateur : réduite après `keyboardDidShow` ; Android : avant `keyboardWillShow`). Le champ actif est ramené au centre de la zone visible.
- Fenêtres du bas en `.kb-sheet` / `.kb-sheet-92` ; barres fixées en bas masquées clavier ouvert (`body.keyboard-open .booking-bar`) ; `.login-logo` se replie.

## Structure (condensée)

Détail fichier par fichier : `docs/fonctions/structure-code.md`.

- **Frontend `src/`** : `api/apiClient.js` ; `App.jsx` (routes, layouts client / admin, admin en lazy, `ScrollToTop`, `GuestOnly`, `AnalyticsTracker`) ; `lib/` (contextes, `capacitor.js`, `slots.js`, `availability.js`, `reschedule.js`, `cancellation.js`, `giftCardDebit.js`, `analytics.js`, `contentFilter.js`, `pushNotifications.js`, `query-client.js`…) ; `components/` par domaine (`ui/` = shadcn) ; `pages/` et `pages/admin/`.
- **Backend** : `server.js` (CORS, helmet, quotas, **auto-migrations**, WebSocket `/ws/live`), `routes/entities.js` (CRUD générique + règles d'accès) et routes dédiées, `lib/` (`accessControl.js`, `pushHelper.js`, `nativePush.js`, `emailHelper.js`, `wallet.js`…), `jobs/`, `scripts/`, `test/`.
- **Routes client** : `/`, `/services`, `/booking`, `/shop`, `/appointments`, `/orders`, `/reviews`, `/settings`, `/notifications`, `/profile`, `/barber/:id`, `/feed`, `/events`, `/gift-cards`, `/gang-card`, `/textile`, `/partners`, `/favorites`, `/try-on`, `/snap`, `/jeux`, `/coupe`, `/coupe/classement`, `/login`.
- **Routes admin** : `/admin`, `/admin/me` (arrivée des barbers), `/admin/activity`, `/admin/traffic`, `/admin/agenda`, `/admin/smart-agenda`, `/admin/services`, `/admin/team`, `/admin/clients`, `/admin/products`, `/admin/stock`, `/admin/orders`, `/admin/reviews`, `/admin/stats`, `/admin/settings`, `/admin/my-settings`, `/admin/notifications`, `/admin/my-notifications`, `/admin/cleaning`, `/admin/my-cleaning`, `/admin/barber-accounts`, `/admin/leave`, `/admin/my-leave`, `/admin/feed`, `/admin/events` (privatisations), `/admin/gift-cards`, `/admin/gang-cards`, `/admin/textile`, `/admin/salon-events`, `/admin/snap`, `/admin/partners`, `/admin/feedback`.

## Entités

Mapping entité → table dans `routes/entities.js` ; tableau complet des champs : `docs/fonctions/entites-api-auth.md`.

- User `users` · ServiceCategory `service_categories` · Service `services` · Employee `employees` · SkillCategory `skill_categories` · Appointment `appointments` · Product `products` · Order `orders` · Review `reviews` · Post / PostLike / PostComment `posts` / `post_likes` / `post_comments` · PostReport `post_reports` · UserBlock `user_blocks` · Event `events` (**privatisations**) · SalonEvent / SalonEventInvite `salon_events` / `salon_event_invites` · GiftCard `gift_cards` · TextileDrop / TextileConcept / TextileReservation · Partner `partners` · Feedback `feedbacks` · SalonSettings `salon_settings` · PushSubscription `push_subscriptions` · TimeOff `time_offs` · CleaningTask / CleaningSchedule.
- Tables sans entité (routes dédiées) : `media`, `gift_card_transactions`, `gift_card_events`, `apple_passes` / `apple_pass_registrations`, `textile_votes`, `textile_alerts`, `snap_config` (ligne unique), `snap_events`, `analytics_sessions` / `analytics_events` / `post_views`, `revoked_tokens`, `email_optouts`, `app_migrations`, `last_minute_auto_slots` / `last_minute_feed_posts` / `last_minute_auto_pushes` (Last Minute automatiques, purgés après 30 jours).
- Pièges de champs : la vidéo d'un barber est **dans `employees.bio`** après `\n%%VIDEO%%url` (ne jamais écraser la bio sans garder ce suffixe) ; `events.date` est un **VARCHAR(20)** (comparer en texte, `LEFT(date, 10) = $1`, jamais `::date`) ; `appointments.status` ∈ `confirmed`, `completed`, `cancelled`, `no_show`, `break` (pause), `last_minute`, `pending` ; le salon n'utilise presque pas `completed` (une visite = `confirmed` passé) ; `gift_cards.status = 'expired'` = **annulée par le salon** ; `partners` (et d'autres tables récentes) triées par `created_at`, pas `created_date` ; ids employé comparés en chaîne (`String(a) === String(b)`).
- `normalizeRow()` : `decimal` → nombre, `date` → `YYYY-MM-DD`, JSONB parsé.

### Ajouter une entité, une colonne ou une route (check-list)

1. Table ou colonne dans le bloc d'**auto-migration** de `server.js` (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) ; une écriture de données à n'exécuter qu'une fois passe par `app_migrations` (marqueur posé dans la même transaction).
2. Mapping dans `routes/entities.js`, puis **`applyReadPolicy` + `CREATE_RULES` / `UPDATE_RULES`** (lecture, création, modification, suppression par rôle), chaque champ validé et borné.
3. Colonne qui stocke une URL d'image → **`jobs/mediaCleanup.js`** (sinon le ramasse-miettes efface les images ; `test-cleanup-media.js` échoue).
4. Données d'un client → suppression de compte (`DELETE /auth/delete-account`, `purgeClientContent` / `collectClientMedia` de `routes/auth.js`) **et** suppression d'un client par l'admin (effacer ou anonymiser).
5. Colonne secrète de `users` → `USER_SECRET_COLUMNS` (jamais renvoyée, ni filtrable ni triable).
6. Route staff : déclarer la permission exigée (`requireStaffPermission`), sinon c'est admin seul.
7. **`EXPLAIN` de chaque nouvelle requête sur la base de production, dans une transaction `READ ONLY`, avant le déploiement** : les tests à faux pool ne voient pas les erreurs de type SQL.
8. Harnais dans `test/` (sans base réelle : pool, `http2` et `fetch` remplacés) et `npm test` ; vérifier qu'un test mord par une mutation ciblée.
9. Si l'app en dépend : drapeau `features.*`, l'app marche avec et sans.

## Règles par domaine

Chaque ligne est un invariant : la casser réintroduit un bug déjà corrigé ou trahit une décision du propriétaire.

### Sécurité et politique d'accès

- Rôles `admin`, `barber`, `user` ; staff = admin + barber ; gardes `requireAuth`, `optionalAuth`, `requireStaff`, `requireAdmin`, `requireStaffPermission`.
- **Identité jamais lue dans le corps** : `client_*`, `author_*`, `sender_email`, `reporter_email`, `blocker_email` viennent du jeton et de `users`. **Prix, durées, heures de fin et statuts recalculés ou forcés par le serveur**.
- Clés de filtre, de tri et du corps ramenées au nom de colonne (minuscules) **avant** toute règle (`normColumn`, `sanitizeColumn`, `normalizeBodyKeys`) ; deux clés pour une colonne → 400. Hors staff, filtre ou tri sur l'email d'un autre ignoré (jamais d'oracle email → identité).
- Lecture : `employees` sans `email` / `phone` / `permissions` hors admin ; `internal_notes` jamais à un client ; un client ne lit que ses RDV, commandes, cartes, privatisations, et des autres RDV seulement les colonnes de créneau ; avis sans `client_email` hors staff ; fil sans email (`author_key` / `user_key` HMAC) ; cartes cadeau sans code ni coordonnées pour un barber ; `promo_code` des bons plans réservé aux connectés.
- Erreurs : `HttpError` → son statut ; colonne inconnue, UUID mal formé, 22003, 22021 (octet nul) → 400 ; doublon → 409 ; `sendError` transmet `publicCode` en `code` ; messages en français.
- CORS fermé (dhomebarber.fr, `capacitor://localhost`, `http(s)://localhost` Android, localhost:5173 en dev), `maxAge` 600 ; seule exception `/email/unsubscribe` (`skipCorsForEmailUnsubscribe`, `Origin: null`, protégé par jeton HMAC).
- Quotas : 400 req / min global (`/api/media/` exempté), auth 30 / 15 min par IP, inscriptions 10 / h par IP, uploads 60 / 15 min par compte, emails groupés 5 / h. Toute route qui notifie quelqu'un a un quota par compte.
- Une image n'est acceptée que si c'est un média de l'app (`<API_PUBLIC_URL>/api/media/<uuid>`, `profilePhotoOrNull`, `galleryOrEmpty`) : `data:` et domaines tiers refusés.
- **Ne jamais changer `JWT_SECRET`** : il signe les sessions et dérive les clés publiques du fil (`lib/publicKey.js`, `author_key`, `blocked_key`) ; le changer déconnecte tout le monde et casse les blocages.
- WebSocket `/ws/live` : origine vérifiée, 2000 connexions au plus, messages entrants ignorés, `ping` toutes les 30 s (le routeur Heroku coupe une connexion muette à 55 s).
- Détail : `docs/fonctions/securite-moderation-nettoyage.md`.

### Comptes, sessions, mots de passe

- **Personne n'est jamais déconnecté** : jeton d'un an pour tous, renouvelé par `GET /me` (`access_token` au-delà de 12 h) et relu au retour au premier plan après 6 h.
- Le jeton porte `sv` (`users.session_version`), rôle, fiche barber, `jti`, `did` ; session coupée si le mot de passe, le rôle, la fiche ou l'email changent, si le compte est supprimé ou la fiche barber inactive ; **une panne de base ne déconnecte personne**.
- Déconnexion du staff = révocation de ce jeton et de l'appareil (`revoked_tokens`), **jamais `session_version` + 1** ; rien côté serveur pour un client.
- L'app n'efface le jeton que sur un 401 / 403 **du serveur**, jamais sur une panne réseau ; premier 401 hors `/auth/` → `dhb:unauthorized` → `/login?expired=1`.
- Mot de passe oublié : code `crypto.randomInt` jamais journalisé, effacé au 5e faux ; par compte 1 email / min, 5 / h, 10 codes et 15 faux par jour de Paris (5 faux par IP et par compte) ; `UPDATE … RETURNING` conditionnel ; même réponse si le compte n'existe pas ; verrou → 429 `{ locked: true }` ; « Renvoyer le code » après 60 s.
- Connexion : verrou à 20 échecs en 15 min (8 par IP et par compte), 429 `{ locked: true }` ; remise à zéro gardée par le verrou ; réinitialiser le mot de passe déverrouille.
- Un compte de l'équipe ne réserve jamais pour lui-même, n'est jamais rattaché à un RDV client, ne se supprime pas par `delete-account` (403 `staff_account`).
- Suppression de compte, par le client ou par l'admin : fil, avis, blocages, bugs, votes, invitations, abonnements push et médias effacés ; RDV à venir non encaissés et commandes ouvertes annulés (stock rendu) ; par l'admin, `client_email = NULL` sur l'historique ; refus des offres → `email_optouts`. **Toute nouvelle donnée client doit y entrer.**
- Inscription : email validé, nom non vide ≤ 120 et filtré (`hasObjectionableName`), téléphone ≤ 30 ; email non vérifié ; push admin 3 / h ; au-delà de 500 en 24 h, ni email de bienvenue ni push. Cache React Query vidé au login et à l'inscription.

### Permissions des barbers

- Permissions (`employees.permissions`) limitées à Dashboard, Agenda, Clients, Textile (réservations, clé `products`), Commandes, Avis, Statistiques ; le reste est **admin seul** (Agenda IA, Notifications, Prestations, Produits, Stock, Équipe, Entretien, Paramètres, événements du salon, privatisations, cartes cadeau, bons plans, Activité clients, Trafic, Cartes Gang, Snap).
- Le serveur les applique **en lecture et en écriture**, effet immédiat (illisibles = on laisse passer) ; toute nouvelle route staff déclare la sienne.
- Fiche inactive ou supprimée : accès coupé, pushs arrêtés (`sendPushToEmployee` = fiches actives), tâches de ménage à venir retirées ; passer Inactif avec des RDV clients à venir → 409 (`force_inactive`, jamais écrit).
- Créer un barber = la fiche dans Équipe, puis le compte dans Comptes barbers (mot de passe ≥ 8, une fiche = un compte).
- Fiche de test (`employees.is_hidden`) invisible des clients sauf des comptes testeurs (`users.is_tester`, lu en base, jamais dans le jeton) ; ses RDV comptent dans le CA. Détail : `docs/fonctions/barbers.md`.

### Réservation et créneaux

- Les règles de créneaux existent deux fois, **identiques** : `src/lib/slots.js` (`analyzeDay`, `generateTimeSlots`, `isOnLeave`, `workingHoursOf`) porte `assertSlotAvailable` (`routes/entities.js`) : passé, horaires, congé, chevauchement, fermeture (finir pile OK), privatisation confirmée.
- **Toujours l'heure de Paris** (`parisInstant`, `parisToUtc` en deux passes, `parisDay`, `parisClock`, `ac.parisToday()`) ; jamais `toISOString()` pour une date du jour ; jamais `timeZoneName: 'shortOffset'` (iOS 15).
- RDV chargés par jour ou semaine **sans filtre de statut**, triés par `blocks_client` du serveur (`blocksClient`) ; clés `['appointments-day', …]` ; jamais de `list()` global.
- Réservation client en transaction avec `pg_advisory_xact_lock` par barber et jour ; index `idx_appointments_unique_slot_v2` (hors `cancelled`, `last_minute`, `no_show`) → 409.
- Plafonds client : 6 RDV à venir (recomptés sous verrou), 12 créations / 24 h (429), 10 prestations sans doublon, 600 min ; réservation identique de moins de 10 min rendue telle quelle (`duplicate: true`). Prestations : `validateService` (durée 5–600 min, prix 0–10 000 €).
- `STEPS = ['services', 'datetime', 'confirm']` : **ne pas renommer** (lus par Admin → Trafic). Paramètres d'URL : `barber` (seulement s'il est actif), `services`, `date`, `time`, `reschedule`, `from=gallery`, `look=<clé de la photo>`.
- **Looks de la galerie** (21 oct. 2026) : une photo = 1 à 5 prestations (`service_ids` ; `service_id` = la première, pour les apps publiées ; fusion par `galleryOrEmpty(value, previous)` côté serveur) ; prix et durées **jamais rangés dans la galerie** (relus dans le catalogue) ; l'éditeur relit la galerie du serveur avant chaque écriture et n'écrit que `gallery`. Détail : `docs/fonctions/barbers.md`.
- « Les plus demandées » = `popular_services` du serveur, **jamais de repli sur `sort_order`**.
- **Pour un proche** (24 oct. 2026) : `appointments.guest_name` = prénom du proche sans compte (NULL = le titulaire) ; `client_*` restent le parent (rappels, annulation, carte Gang comptée, CA) ; règles du prénom en **deux copies identiques** (`lib/guestName.js`, `src/lib/guest.js`) ; `assertNoLockedAppointment` et le bandeau de `Booking.jsx` ne comparent que **la même personne** ; un déplacement sans `guest_name` garde le proche (apps publiées) ; « Réserver aussi pour un proche » = `/booking?barber&date&after&chain` (`chain` remonte la page) ; drapeau `features.guestBooking` ; jamais lu par un autre client. Détail : `docs/fonctions/reservation-rendez-vous.md`.
- **Ajouter au calendrier** : les RDV du client portent `calendar_url` (lien signé id + email, `https://dhomebarber.fr/agenda/rdv/<id>/<sig>`, `lib/calendarIcs.js`), seule voie qui marche dans les apps ; **jamais d'extension `.ics` dans le lien** (iOS en ferait un abonnement à un calendrier) ; dans l'app iPhone `window.open` (Safari), pas `Browser.open` ; rien sur le client dans le fichier. Détail : `docs/fonctions/reservation-rendez-vous.md`.
- 409 : relire créneaux et privatisations, revenir à l'heure ; réponse perdue : l'heure reste choisie ; une coupure réseau n'invite jamais à choisir une autre heure.
- **Retour du navigateur = étape précédente** de la réservation (une entrée d'historique posée au premier passage à l'étape suivante, remplacée au succès) ; un déplacement (`reschedule`) reste acquis jusqu'à « Ne pas déplacer ». Déplacer vers exactement son créneau : jamais son propre doublon ; même heure, autres prestations : l'ancien est annulé dans la transaction de la réservation (`CANCEL_MOVED_SQL`).
- Une privatisation **confirmée** bloque sa fenêtre (9h-14h, 14h-20h, 9h-20h ; `EVENT_SLOT_WINDOWS` / `PRIVATE_WINDOWS`) pour les clients. Détail : `docs/fonctions/reservation-rendez-vous.md`.

### Rendez-vous : déplacer, annuler, délai

- **Dans le délai `cancellation_hours` (24 h), ni annulation ni déplacement en ligne** : le client appelle le salon (décision du 18 oct. 2026). RDV commencé ou passé : jamais (409, même délai 0).
- Réserver à côté d'un RDV verrouillé (même jour non accolé, ou mêmes prestations à moins de 72 h) → 409 `locked_appointment`, sauf `confirm_second: true`.
- Déplacer = créer avec `reschedule_of` : vérifié **avant** la création ; le serveur annule l'ancien (« Client : déplacé au … »), pose `rescheduled_to`, l'exclut des contrôles (`excludeId`) ; produits liés, note et durée imposée suivent.
- Motifs : « Client : … », « Salon » / « Salon : … », `LAST_MINUTE_EXPIRED_REASON` ; `cancelled_by` prime ; un motif libre qui imite un déplacement devient `Client : « … »`. **Un déplacement n'est pas une annulation** (carte Gang, taux, emails).
- Annulation client : produits liés `pending` / `confirmed` annulés, stock rendu. Annulation salon : commandes intactes, push + email sauf RDV passé ou « Prévenir le client » décoché (`notify_client`, jamais écrit).
- RDV client à venir ou payé en partie par carte (`gift_card_amount > 0`) : jamais supprimé (l'annuler / rendre d'abord).
- Déplacé par le salon : rappels remis à faux. « Rétablir » revérifie le créneau et rouvre les produits liés. « Absent » seulement après le début ; « Client venu ? » pose `attended_at`.

### Last Minute

- Ligne `status = 'last_minute'` sans client ; le client qui réserve dessus la **reprend** (même id, `[last_minute]` en tête d'`internal_notes`) ; un Last Minute attribué par le staff n'est jamais repris.
- `[last_minute]` **n'est jamais recopié** sur le RDV d'un déplacement : il reste sur l'ancienne ligne et `rescheduled_to` sert au CA (`lastMinuteRevenueOf`). Serveur, `Dashboard.jsx` et `test-t7-3-dashboard.js` changent ensemble.
- **Un Last Minute libre ne bloque jamais l'équipe** (`slotIssues`) : recouvert par un RDV ou une pause de l'équipe, il est retiré par l'agenda (`removeCoveredLastMinutes`, après `if_free_last_minute`) et par le ménage serveur de 5 min (Last Minute de l'équipe compris) ; l'accueil et le fil n'affichent jamais un Last Minute recouvert (requête des lignes du jour sans filtre de statut).
- Écriture du staff sur une ligne qu'il croit libre : `if_free_last_minute: true` (409 si reprise) ; « Annuler » / « Supprimer » font d'abord ce `PUT` seul ; tout 409 recharge l'agenda.
- `POST /last-minute` : staff, 6 / h par compte, barber obligatoire, passé → 400, créneau pris ou privatisé → 409, doublon de 15 min → `already`, `url` seulement `/booking?…`, réponse `{ sent, failed, total, skippedNative }` ; succès affiché seulement si `sent > 0` ; note l'heure d'annonce (`appointments.last_minute_notified_at`, `markAnnounced`). L'agenda ne propose que des demi-heures réservables.
- **Last Minute automatiques** (demande du propriétaire, 22 oct. 2026, `lib/lastMinuteAuto.js`, début de chaque passage de `jobs/lastMinuteAutoPush.js`, la nuit aussi) : les plages libres de chaque barber actif et visible (sans congé approuvé ni en attente) deviennent des Last Minute de **40 min calés sur la grille des demi-heures** (14:00–16:00 → 14:00 et 15:00 ; jamais 14:40 : ni l'app ni `isSlotOnGrid` ne l'accepteraient) quand leur début tombe **dans les 6 h** ; création **sous le verrou `appointment-slot:<barber>:<jour>`** avec relecture ; **jamais deux fois la même heure** (`last_minute_auto_slots` : supprimé par l'équipe = jamais recréé) ; automatique encore libre devenu impossible (RDV posé dessus, congé, privatisation) supprimé. Sans réglage ; coupure d'urgence `LAST_MINUTE_AUTO=off` (ni création ni publication, publications retirées, automatiques plus annoncés). Détail : `docs/fonctions/reservation-rendez-vous.md`.
- **Fil** : une publication du salon **sans email d'auteur** (une adresse réelle serait usurpable : l'inscription ne vérifie pas l'email) par Last Minute libre et réservable du jour (`posts.kind = 'last_minute'`, `appointment_id`, `meta` : **écrits par le serveur seulement**), retirée dès que le créneau n'est plus libre (reprise : `removePostsFor` tout de suite), jamais republiée après suppression par l'admin (`last_minute_feed_posts`) ; l'app y montre la carte orange de l'accueil (`LastMinuteCard`, `lastMinuteSlotOfPost`), le texte sert aux apps plus anciennes.
- **Annonces automatiques** (`jobs/lastMinuteAutoPush.js`, toutes les 5 min) : un Last Minute automatique est dû dès sa création : envois déclenchés par les seuls automatiques limités à **3 par jour, à 3 h d'écart** (`last_minute_auto_pushes`, compteur pris avant l'envoi), chacun emporte ce qui deviendrait dû avant le suivant ; un Last Minute **de l'équipe garde son annonce à début − 3 h, hors compteur** (promise par l'agenda) ; **jamais avant 08:00 ni après 21:00**, jamais à moins de 15 min du début ; créneau du jour encore libre, barber actif et public, pas repris, pas privatisé ; une annonce (manuelle ou automatique) faite jusqu'à 30 min avant l'heure prévue en tient lieu ; flag posé avant l'envoi ; « Prévenir tout de suite » de l'agenda hors compteur. L'agenda ne prévient plus tout de suite un créneau à plus de 3 h (« Bloquer le créneau », heure d'annonce affichée, case « Prévenir aussi les clients tout de suite »). Détail : `docs/fonctions/reservation-rendez-vous.md`.
- **Sur l'accueil** (20 oct. 2026) : section `last-minute` (en tête par défaut, déplaçable), **créneaux du jour seulement** (filtre de date aussi dans `selectOpenLastMinutes`), **cartes compactes** (~133 px : photo, heure, barber, compte à rebours, « Réserver » et « Envoyer à un ami » ; ne pas revenir à la grande carte), `src/lib/lastMinute.js` + `components/home/LastMinuteSection.jsx` ; clé `['appointments', 'last-minute', jour]`, **sous le préfixe `appointments`** (toute invalidation de la réservation ou de l'agenda la relit) ; après une réservation, `forgetBookedLastMinute` **avant** l'invalidation (après, la liste ne serait plus relue). Détail : `docs/fonctions/interface-accueil-animations.md`.

### Agenda, équipe, ménage

- Agenda chargé par jours affichés (`fetchAppointmentsForDates`), position dans l'adresse (`?view=&date=&barber=`). Après une modification : `invalidateAppointmentQueries`.
- Produit vendu au fauteuil = `appointments.product_id` (stock décompté) ; produit **commandé avec le RDV** encaissé par sa commande, **jamais** recopié dans `product_sold` (double comptage). « Carte cadeau » refusé tant que le débit ne couvre pas tout.
- **« CB + Espèces »** (23 oct. 2026) : `payment_method = 'mixte'` + `cash_amount` (part en espèces ; le reste de l'encaissé hors carte cadeau et hors pourboire en CB), contrôlée par le serveur (`applySplitPayment`, avant le stock ; part > 0 et < encaissé ; effacée pour tout autre moyen) ; choix affiché seulement avec `features.splitPayment`. **Tout calcul CB / espèces passe par `paymentSplitOf`** (`src/lib/revenue.js`), jamais par un filtre `payment_method === 'cb'` ; toute liste « déjà encaissé en CB / espèces » inclut `mixte`. Détail : `docs/fonctions/agenda-menage.md`.
- Ménage (`lib/cleaningPlan.js`) sur la présence réelle ; régénérer ne touche qu'aux tâches à faire à partir d'aujourd'hui. Congés : statut changé par l'admin (`PATCH /leave/:id/status`), conflits listés. Détail : `docs/fonctions/agenda-menage.md`.

### Commandes, boutique, stock

- Stock suivi décompté **à la création** (sous verrou), rendu à l'annulation ; `stock` NULL = non suivi, 0 = rupture ; entiers ≥ 0 ; Stock et Produits envoient `expected_stock` (409 si le stock a bougé).
- Produits `stock_type ≠ boutique` jamais en vente (`isShopProduct`).
- Client : 20 unités par produit, 5 commandes ouvertes, 10 / 24 h ; clé d'essai `client_ref` (index unique, 409 `order_ref_cancelled`) ; prix envoyé ≠ base → 409.
- Annulation client par `POST /orders/:id/cancel` (`features.orderCancelStatuses`) ; le staff ne modifie que `status`, `cancellation_reason`, `notes` ; commande en cours d'un client : jamais supprimée. `completed` ancien = `delivered`. Détail : `docs/fonctions/boutique-commandes-bons-plans.md`.

### Cartes cadeau et Wallet

- Code serveur (`crypto.randomInt`), 10–500 € entiers, statut `pending`, validité d'un an **à partir de la validation** ; 3 en attente et 10 / 24 h par compte.
- `expired` côté serveur = **annulée par le salon** ; l'expiration réelle se calcule sur l'appareil (`test-t2-8` veille).
- Le solde ne bouge **que** par les routes de débit (`…/debit`, `…/undo` sous 24 h, `…/credit`, `…/attach`), sous `FOR UPDATE` ; **toutes leurs erreurs portent un `code`** (404 sans `code` = route absente → repli `GiftCard.update`).
- `appointments.gift_card_amount` écrit par le débit seulement ; le CA ne recompte jamais la part carte (`src/lib/revenue.js`, `giftPartOf`) ; prix d'un RDV ramené sous le débit → 409.
- Toute écriture de solde ou de statut appelle `refreshWallets(db, cardId)` (pass Apple par push vide APNs signé avec le certificat du pass, objet Google patché).
- Boutons Wallet seulement si `features.appleWallet` / `googleWallet` (Google faux) et sur une carte validée, non expirée, avec solde. Détail : `docs/fonctions/cartes-cadeau-wallet.md`.

### Carte Gang

- Visite = RDV `completed` (validé par le barber) **dès le jour même**, ou `confirmed` dont l'heure de fin (Paris) est passée ; jamais un jour à venir ; **une par jour** ; déplacement ≠ annulation ; absence = `no_show`. Même règle dans `pastVisits` (serveur) et `isVisit` (`profileUtils.js` : Profil, Clients).
- Seuils dans `lib/gangCard.js` **et** `TIER_MIN` de `GangCardPage.jsx` : changer des deux côtés. **Aucun avantage lié aux niveaux** ; carte publique réduite (`publicCard`) ; numéro figé (`users.gang_serial`).
- Niveau choisi par l'admin (`users.gang_min_tier`, fiche client des Cartes Gang, 21 oct. 2026) = un **minimum**, la carte continue de monter avec les visites ; `computeCard` le lit sur le compte : **toute requête qui charge un compte pour une carte sélectionne la colonne** ; sans visite, pas de carte (409 `no_card`).
- Effets en grand seulement, arrivée spectaculaire une fois par ouverture, **aucun bandeau écrit sur la carte**, photo fondue en ovale. Détail : `docs/fonctions/carte-gang.md`.

### Textile, événements, privatisations

- Textile : un drop est une **précommande payée au salon** ; le délai porte sur le paiement (jamais « retrait avant le… ») ; stock sous `FOR UPDATE`, taille absente = non suivie ; pièce sans prix non réservable ; dates `datetime-local` en heure de Paris.
- Événements du salon : **admin seul** ; publier n'invite personne ; jamais de push entre 21h et 8h ; publié à venir avec des invités = l'annuler, pas le supprimer.
- Privatisations : seule `confirmed` bloque ; confirmée jamais supprimée (l'annuler) ; prix figé après acceptation ; seule la confirmation (après règlement) réserve la date. Erreurs de la demande plein écran en bandeau `role="alert"`, **jamais en toast** (Toaster sous `#root` rendu `inert`). Détail : `docs/fonctions/evenements-privatisation.md`, `textile.md`.

### Notifications push, emails, jobs

- Tout envoi passe par `lib/pushHelper.js` (`sendPushToRole`, `sendPushToEmail`, `sendPushToEmployee`, `sendToSubscriptions`) ; `native://<platform>/<token>` part vers APNs ou FCM v1 (`lib/nativePush.js`).
- **Jamais de push la nuit** (21:00–08:00 Paris) : rappels, avis, textile, événements.
- Durée de vie 24 h par défaut ; périssable = `ttlSeconds: pushHelper.PERISHABLE_TTL_SECONDS` (1 h : Last Minute, rappel du jour, avis) ; invitations 3 j ; `/push/send` 7 j.
- `tag` : seul `review-reminder` (`COLLAPSIBLE_TAGS`) part vers les appareils ; `admin-<type>` reste interne.
- Abonnement supprimé seulement sur un jeton mort : web 410 / 404 (jamais 400 / 403), FCM `fcmTokenIsStale`, APNs 410 / `Unregistered` / `BadDeviceToken`. Abonnement web : services connus seulement, 10 par compte, jamais d'IP ni d'http.
- Titre ≤ 100, texte ≤ 1000, `title` / `body` aussi dans `data`. **Pushs au tutoiement** (ton voulu) ; réservation, prestations, écrans du staff, bugs et messages d'erreur au vouvoiement (tours du 18 oct.) : suivre le ton de l'écran modifié.
- Alertes admin par `notifyAdminsOfClientAction` : jamais pour une action du staff, préférences `salon_settings.admin_alerts`.
- Emails : texte libre par `emailHelper.escapeHtml` ; « Rendez-vous confirmé » seulement pour `confirmed` ; les offres respectent `users.marketing_emails` et `email_optouts` (lien signé, `List-Unsubscribe`) ; `GET /email/unsubscribe` **n'écrit jamais**, seul le `POST` désinscrit ; email à tous = `POST /notifications/broadcast-email`.
- Jobs node-cron à l'heure de Paris, flag posé **avant** l'envoi (`UPDATE … RETURNING`), rattrapage au démarrage.
- App : fenêtre d'activation jamais obligatoire ; `dhb-push-optout` rangé **par compte** ; jeton natif d'avant connexion envoyé ensuite (`syncPushSubscription`). Les envois réussis ne sont pas journalisés : tester par Admin → Notifications → « Client spécifique » vers son compte. Détail : `docs/fonctions/notifications-jobs.md`.

### Fil, avis, filtre des contenus

- Filtre en deux copies identiques, `src/lib/contentFilter.js` et `dhomebarber-api/lib/contentFilter.js` : **toute modification de la liste se fait dans les deux** (`test-content-filter.js` compare) ; noms par `hasObjectionableName` ; jamais pour le staff ni les textes privés.
- Choix du propriétaire : « pd » seul **reste refusé**, `dick` retiré (prénom), « cock » bloqué mais « De Cock » accepté ; jurons courants et mots ordinaires (« retard », « con », « Niger ») jamais bloqués.
- Signaler, bloquer, modérer (App Store 1.2) ne se retirent pas ; chacun ne lit que ses blocages, **admin compris** ; `blocked_email` peut valoir `key:<clé>` (garder le `NOT NULL`).
- **Avis publiés d'office** : tout client connecté, `is_visible = true`, 5 par compte, suppression par le staff ; ni condition de visite ni modération préalable. « Publier aussi sur Google » proposé après **tout** avis.
- Fil : 3 publications / min et 20 / jour, 10 commentaires / min et 100 / jour ; doublon rendu tel quel 10 min (30 s pour un commentaire) ; 5000 / 1000 caractères ; réactions ❤️ 🔥 💪 😂 👏 💈 ; auteur sans nom = « Membre du Gang », jamais l'email.
- **Fil v2** (30 oct. 2026, `docs/fonctions/fil-new-gang.md`) : `GET /feed` en une requête (curseur `(created_at, id)`), formats look / sondage / avant-après / Moment (`posts.kind` + `meta`, écrits par `POST /feed/posts` ou par le serveur), réponses (`parent_id`, un niveau), ❤️ de commentaire, activité et pushs groupés ; drapeau `features.feedV2` (sans lui : ancien fil par les entités, sans les nouveautés). **CRUD `Post` / `PostLike` / `PostComment` inchangé pour les apps publiées** : chaque format écrit un texte de repli (`content`) et sa première photo (`image_url`), le mot de l'auteur dans `meta.caption` ; `post_likes` garde l'email tel que le CRUD l'écrit, les nouvelles tables en minuscules ; `posts.subject_user_id` jamais renvoyé (`FEED_INTERNAL_COLUMNS`).
- Fil v2, règles : sondages **salon seul** ; look = une visite du client relue en base, jamais de prix, « Réserver ce look » relu à la lecture ; Moments du Gang **seulement pour les membres du classement Team of the Season** (premier passage, arrivée ou retour au classement = niveau noté sans publication ; quitter le classement efface ses Moments) ; **tous les comptes admin = une seule identité, le salon** (pas d'activité entre admins) ; un auteur bloqué disparaît aussi des réponses sous sa racine et de l'activité.
- Pushs du fil (`jobs/feedDigest.js`) : jamais 21:00–08:00, **un par compte et par passage, 30 min entre deux, 2 h par publication, 8 par jour** ; réglages `feed_prefs` (réactions, commentaires, `salon` éteint par défaut = nouveautés seulement sur accord, `visit`) ; invitation « Ta coupe est toute fraîche » 2 h à 6 h après la fin, une fois, jamais un proche ni le staff ; pastille = groupes non lus ; `since` de « N nouvelles publications » comparé avec 1 ms de plus (colonne à la microseconde, Date JS à la milliseconde).
- **L'admin parle au nom du salon** (26 oct. 2026) : ses publications et commentaires = « D'Home Barber » + logo (`lib/salonAuthor.js`, appliqué par le serveur dans `authorFields`), jamais son nom ni sa photo ; petite étoile bleue à côté du nom (jamais de badge écrit), d'après `author_role` (écrit par le serveur seulement) ; nom « D'Home Barber » et variantes refusés à un client (inscription, profil). Toute nouvelle façon pour l'admin d'écrire à un client parle aussi au nom du salon. Détail : `docs/fonctions/securite-moderation-nettoyage.md`.

### La Coupe du Gang (mini-jeu)

- Moteur en **deux copies identiques** octet pour octet : `src/lib/coupe/engine.js` et `lib/coupeEngine.mjs` (`test/test-coupe-engine.js` compare) ; le serveur le charge par `import()`.
- **Thème stade (29 oct. 2026)** : l'image `src/assets/coupe/stade.webp` **est** le terrain, tracé aux mesures du moteur (place dans `src/lib/coupe/stadium.js`) ; le canvas n'y pose que joueurs, ballon, score et effets (`renderer.setStadium(true)`), **jamais un second terrain** ; la caméra ne transforme que l'image (canvas caché pendant les zooms) ; terrain dessiné seulement si l'image ne charge pas. Aucune marque de club sur l'image (règle Apple 5.2.1) ; une nouvelle image garde les mesures (`docs/prototypes/stade-coupe/`). Couleurs : `COUPE_COLORS` (`src/components/coupe/palette.js`). Premier coup d'envoi 4,5 s (`FIRST_COUNT_MS`, `start.cd` et `state.cd`), 3 s après un but ou un retour ; **l'avant-match (stade entier, affiche) une fois par match**, jamais après un but ni au retour d'une coupure.
- **Le serveur recalcule chaque choc** (`collidePaddle`) à partir de la position et de la vitesse du joueur ; jamais un ballon envoyé par le téléphone (triche démontrée en v1). `auth` porte `v` (2) : toute évolution incompatible du protocole passe par une nouvelle version, les téléphones gardent un build des mois.
- **Un seul aiguillage `upgrade`** (`lib/wsRouter.js`) pour `/ws/live` et `/ws/coupe` ; jamais de quota par IP sur `/ws/live`.
- Points : +3 / −1 jamais sous 0 ; **tous les matchs comptent** (décision du 29 oct.) ; ligne `salon` unique pour les admins ; abandon avant 20 s de jeu = annulé (rien d'écrit), match fini en moins de 10 s = amical, 5 min de jeu au plus. Droits aux points relus en base à la fin du match (carte Gang pour un client).
- Musique de tribune pendant le jeu (`src/assets/coupe/tribune.mp3`), **jouée en boucle sans couture par le contexte audio des bruitages**, jamais par un lecteur audio (trou à chaque tour) : le fichier sort de `docs/prototypes/musique-coupe/boucle_tribune.py` et va avec `MUSIC_GUARD_S` / `MUSIC_LOOP_S` d'`audioUnlock.js` (changer les deux ensemble) ; **son débloqué pendant le clic qui ouvre une partie** (`audioUnlock.js`, un seul contexte partagé) pour que musique et bruitages partent ensemble au coup d'envoi, qui arrive sans geste ; coupure d'urgence `COUPE_MUSIC=off` (drapeau `features.coupeMusic`, sans nouveau build) ; enregistrement de supporters de l'AC Milan choisi par le propriétaire, **droits non acquis** : à trancher avant le build 18.
- **Chant de l'accueil** (30 oct. 2026) : sur les pages de la Coupe, la musique de l'app joue `accueil-chant.mp3` au lieu de l'ambiance (`TRACKS` et `MusicRouteSync` de `MusicContext.jsx`, même lecteur, même bouton, même `dhb-music-off`) ; il continue en salle d'attente et se tait du coup d'envoi à la sortie de l'écran de jeu (`useSalonMusicPaused(tribuneOn || !soundOn)`), la tribune jouant seule pendant le match.
- Coupure d'urgence `COUPE_WS=off` (drapeau `features.coupe`, `/ws/coupe` 503, routes 404) ; tout l'affichage du jeu dans l'app dépend du drapeau, qui **rejette** sur une panne (jamais « jeu fermé » sur un 503).
- Section « Jeux » de l'accueil et entrée « Jeux » du fil → page `/jeux` (une carte par jeu ouvert, `src/lib/games.js`) ; **un nouveau jeu = une entrée dans `GAMES` et son drapeau dans `useGames`** ; l'entrée du fil disparaît avec la catégorie « Jeux » masquée par l'admin.
- **Carte de la Coupe de la page « Jeux »** (30 oct. 2026) : le logo détouré `src/assets/coupe/logo-coupe.webp` **est** le titre (`alt` « La Coupe du Gang » = nom de l'article, lu par les tests ; titre écrit si l'image ne charge pas) ; le lien « Jouer » couvre tout le haut de la carte (`after:inset-0`) : **rien d'autre de cliquable dans le haut** ; animations `.coupe-*` de `src/index.css`, transform et opacité, toutes coupées par « réduire les animations ».
- Défi d'un barber : joignable seulement s'il a le jeu ouvert (salle d'attente ou écran de fin) ou, **de jour** et sous 20 pushs de l'heure, un abonnement web (`reachableUsers`, `lib/coupeHours.js`) ; push de défi en urgence haute. Photos dans le jeu : clients seulement (`start.photos`), jamais un barber ni le salon. Défi à un ami : image (`challengeImage.js`, code écrit dessus) **préparée dès l'ouverture de la salle d'attente, jamais au tap** (partage refusé sur iPhone), lien dans le texte. Mesures de chaque match gardées (`coupe_matches.metrics`, nombres seulement).
- `/coupe-test` n'existe que sur le site (`COUPE_TEST_ROUTE` d'`App.jsx` : aucune route dans les apps, règle 2.5.19).
- Tant que les apps publiées n'ont pas le jeu (build 18) : push de défi **web seulement**, alerte admin d'un signalement vers `/admin`, `/coupe-test` jamais dans un build store sans description (règle 2.5.19). Signaler / Bloquer obligatoires (App Store 1.2).
- **Défier un joueur** (29 oct. 2026) : seulement les clients volontaires (`users.coupe_challenge_opt_in`, « Me proposer aux défis », à part du classement, jamais l'équipe), liste `GET /coupe/players` et `challenge {key_hash}` (`player_unavailable`) ; une clé de la liste est **relue en base, jamais dans la mémoire des clés** (un joueur sorti ou exclu n'est plus trouvé) ; jamais de recherche d'un client par son nom ; drapeau `features.coupePlayers`. Doigt posé sur son joueur : il ne bouge pas (`src/lib/coupe/finger.js`).
- Données de jeu purgées avec le compte (client, admin, compte barber : `purgeAccount`) ; purge quotidienne 04:15 ; un compte exclu du classement Gang l'est aussi de la Coupe. Détail : `docs/fonctions/coupe-du-gang.md`.

### Médias et ramasse-miettes

- Toujours `UploadFile` ; compression sur l'appareil (`src/lib/imageCompress.js`) ; type lu dans les octets, SVG refusé ; HEIC refusé avec la consigne iPhone. Images en table `media`, servies par `GET /api/media/:id` : jamais de base64 en colonne.
- Clients : 20 envois / 24 h, 1,5 Mo par fichier, 30 Mo / 24 h, 50 Mo par IP et par jour ; plafonds globaux 100 Mo / 24 h et 400 Mo de table (`MEDIA_TABLE_MAX_BYTES`, base de 1 Go).
- **Toute nouvelle colonne d'URL d'image va dans `jobs/mediaCleanup.js`** (6 images perdues le 25 sept. 2026). `cleanup-media.js` simule par défaut.

### Base et requêtes

- Pas de `LIKE` dans `buildConditions` : recherche de comptes par `GET /clients/search` (staff, 2 lettres ou 3 chiffres, sans accents). `skip` ≤ 1 000 000 ; listes admin lourdes plafonnées avec mention à l'écran.
- `events.date` est un texte ; toute requête nouvelle passe un `EXPLAIN` en `READ ONLY` avant le déploiement.

### Frontend : hors connexion, erreurs, cache

- **Avant tout état vide, `queryFailed(q)`** (`LoadError.jsx`) : échec sans données ou requête en pause → `LoadError` (« Pas de connexion internet » + Réessayer). Toute nouvelle liste.
- Jamais « Load failed » / « Failed to fetch » à l'écran (`friendlyError`, `adminErrorMessage`) ; message du serveur affiché tel quel.
- Toasts : `sonner` seulement (le `<Toaster />` shadcn n'est plus monté).
- **Envois React Query en `networkMode: 'always'`** (défaut de `src/lib/query-client.js`) : hors connexion, jamais un bouton qui tourne sans fin ; la coupure arrive dans `onError` (« Pas de connexion »).
- React Query : `staleTime` 60 s, 5 min sur les catalogues ; clés partagées (`['employees']` = `fetchPublicBarbers`) ; listes admin sous clés préfixées (`['employees','all']`).
- Après un déploiement, `chunkReload.js` recharge une fois. `public/sw.js` ne met jamais en cache une requête avec `Authorization`, `/auth/`, `/User/me`, `/api/media/`.
- Écritures rejouables : clés d'essai (`client_ref`, `request_key`, `send_key`) gardées après une erreur réseau. Exports CSV neutralisés contre les formules, enregistrés par `saveTextFile` ; décimales d'un nouvel export écrites à la virgule (« 2.4 » devient une date dans Excel en français). Admin → Trafic → « Exporter » : les chiffres affichés, jamais ceux de l'ancienne période pendant un chargement (`trafficExport.js`).
- Lien envoyé à quelqu'un (partage, message) : toujours l'adresse publique `https://dhomebarber.fr`, **jamais `window.location.origin`** (capacitor://localhost dans les apps). Un Last Minute se partage par `dhomebarber.fr/lm/<id>` : page d'aperçu Open Graph + image dessinée par le serveur (`routes/share.js`, `lib/shareCard.js`, réécritures de `vercel.json` **avant** la règle générale), jamais rien sur un client dans un aperçu. Partage : `@capacitor/share` dans les apps (pas de `navigator.share` dans la WebView Android), `navigator.share` sans attente avant lui sur le web, puis copie du lien (`shareLastMinute`, `src/lib/lastMinute.js`).
- Admin → Paramètres n'envoie que les champs de sa page (jamais `homepage_order`, `homepage_hidden`, `admin_alerts`, `comeback_weeks`) ; une seule ligne `salon_settings` (une seconde → 409).

### Fenêtres, mise en page mobile, animations

- **Fenêtres fermées par la croix uniquement** : pas de fermeture au tap à côté (`DialogContent` neutralise `onPointerDownOutside`), Échap au clavier ; toujours une croix ou un bouton Fermer. Exceptions : volet de navigation admin, cloche d'Activité clients.
- **Retour Android** : `AndroidBackClose` (shadcn) ; toute fenêtre maison appelle `useAndroidBack(ouverte, fermer)`.
- **Ordinateur** : toute rangée qui défile se pilote à la souris (`useMouseScroll`, `SnapCarousel`, flèches quand `(hover: hover) and (pointer: fine)`) ; vérifier aussi 1024, 1366 et 1920 px (nos tests tournent à 390 px).
- **Toujours `overflow-x-clip`, jamais `overflow-x-hidden`** sur les conteneurs de `ClientLayout` / `AdminLayout` (`hidden` casse les éléments collants) ; aucun défilement horizontal à 320, 390 et 430 px.
- Fenêtre dans un parent animé ou flouté : portail dans `body` ; fenêtre plein écran avec `data-app-overlay` (`NotificationPrompt`, `MotionPrompt` ne s'y superposent pas). Zones sûres en `env(safe-area-inset-*)`.
- Animations : `transform` et `opacity` seulement, `useReducedMotion` respecté ; classe CSS animée sur un conteneur, **jamais sur un `motion.*`** ; `.glow-breathe` en `pointer-events: none`, liens dessous en `relative z-10` ; réutiliser `src/components/motion/`. Carrousel aimanté : transformer un élément intérieur, **jamais l'élément `snap-*`** (l'aimantation suit le cadre transformé : `SnapCarousel` s'arrêtait 12 px trop loin).
- Photos des barbers en portrait **1748 × 2480** (`src/lib/barberPhoto.js`), jamais rondes ni carrées ; avatars clients ronds.
- Accueil : **jamais de bouton flottant** ; hero en deux lignes fixes ; ordre des sections dans `salon_settings.homepage_order`, catégories masquées par l'admin dans `homepage_hidden` (« Organiser l'accueil », 29 oct. 2026 : jamais rendues hors du mode édition, les sections attendent les paramètres pour ne pas apparaître puis disparaître ; apps d'avant le build 18 : tout visible) ; parallaxe sans hachures ni bord net ; bouton musique 32 px en haut à droite (en-têtes en `pr-10`). Sections dans un conteneur `flex flex-col gap-8`, **jamais `space-y-*`** : une section vide cachée (`.auto-section:empty`) y gardait sa marge (32 px de vide).
- Gyroscope iPhone : WebKit oublie l'autorisation à chaque lancement, la redemander (`startMotionPermission()`) ; sur Safari, `MotionPrompt` avec « Plus tard ». La présence de `DeviceOrientationEvent.requestPermission` ne prouve pas iOS (Chromium l'expose aussi) : tester `isAppleTouchDevice()` (`src/lib/motion.js`).
- Titres et blocs qui changent avec l'étape : pas d'`AnimatePresence mode="wait"` (l'ancien contenu pouvait rester affiché après des changements rapprochés, titre de la réservation, 20 oct. 2026) ; une simple apparition sur `key`.
- Tailwind : `theme.extend.opacity` ajoute 2, 3, 4, 6, 8, 12 (sinon `bg-white/4` disparaît sans erreur). Détail : `docs/fonctions/interface-accueil-animations.md`.

### Snap, IA, fonctions dormantes

- Filtres Snap **éteints par défaut** (`snap_config.enabled`) ; éteints, la caméra n'est jamais demandée. L'écran d'acceptation des CGU Camera Kit est **obligatoire** (revue Snap). Palette seulement si la lentille déclare la vendor data `dhb`.
- AI ULTRA (`FAL_KEY`) et assistant IA (`ANTHROPIC_API_KEY`, admin, 40 / h) : 503 `not_configured` sans clé, bouton masqué. Rappel : règle 2.5.19 avant d'allumer quoi que ce soit.

### Tests, vérifications, nettoyage en production

- Backend : `npm test` (105 harnais au 29 oct. 2026, sans base) ; un correctif sérieux = un test, et une mutation ciblée qui le fait échouer. **Lancé automatiquement avant chaque `git push heroku main`** (`.githooks/pre-push`, activé par `git config core.hooksPath .githooks`, à refaire sur un nouveau clone ; `--no-verify` en urgence seulement).
- **Jamais de date écrite en dur qui finira dans le passé, jamais l'heure réelle dans un cas qui dépend de l'heure** : six harnais allaient échouer entre le 21 oct. 2026 et 2028. Dates relatives (« l'an prochain », `Date.now() + …`) ou horloge simulée `test/fake-clock.js` (`install()`, `set(instant)` : `Date.now()` **et** `new Date()`, car le code lit l'heure de Paris par `new Date()`). Contrôle : `npm run test:futur` (suite complète avec l'horloge avancée de 400 jours, `SHIFT_DAYS=30 npm run test:futur` pour un autre écart ; `test/shift-clock.js`).
- Frontend : `npm run lint` et **`npm run test:e2e`** (build puis 274 vérifications Playwright de bout en bout au 30 oct. 2026, ~4 min à trois navigateurs ; `test:e2e:fast` sans rebuild ; plusieurs séries en parallèle : `E2E_DIST` / `E2E_PORT`) : connexion, réservation, Mes rendez-vous, ajout au calendrier, agenda, encaissement « CB + Espèces » (fiche, correction, tableau de bord), Last Minute de l'accueil et son partage, Last Minute dans le fil, niveau choisi des cartes Gang, looks de la galerie (profil, éditeur, réservation), réservation pour un proche (« Pour qui ? », rendez-vous suivant, agenda), scanner QR des cartes cadeau (image vide de Safari), export du Trafic, l'admin au nom du salon dans le fil, La Coupe du Gang (jeu, thème stade, faux serveur `e2e/support/fauxCoupe.js`), page « Jeux » et catégories masquées de l'accueil, 320 / 390 px, console, hors connexion, fenêtre du gyroscope (iPhone seulement). **API simulée en mémoire** (`e2e/support/mockApi.js`), proxy injoignable en second filet : rien n'atteint la production. Un test échoue sur une route API non simulée (répondue 501), une erreur JS non rattrapée ou une erreur remontée par `reportError`. Horloge du navigateur figée (mardi 10 h Paris), animations réduites. Mode d'emploi : `e2e/LISEZMOI.md`. Toute nouvelle fonction importante = un test ici ; une route nouvelle = une réponse dans le faux serveur.
- **Vérification automatique sur GitHub** (`.github/workflows/verifications.yml`, en service depuis le 20 oct. 2026) à chaque push sur `main` : `npm ci`, lint, Chromium, `npm run test:e2e`, rapport en artefact si échec. Elle **ne bloque pas Vercel** (qui déploie seul) : regarder le résultat (`gh run list --limit 3`) après chaque push, et corriger tout de suite un échec. Publier ou modifier un fichier de `.github/workflows/` demande le droit `workflow` du jeton GitHub (`gh auth refresh -h github.com -s workflow`, validation dans le navigateur par l'utilisateur).
- Vérifications ponctuelles plus larges (autres écrans, captures) : Playwright sur un build local avec API simulée (`page.route`), même règle.
- Un audit **n'écrit jamais en production**.
- **Toute session qui teste en production efface ce qu'elle a créé** (avis, publications, commentaires, réactions, RDV, commandes, cartes cadeau, précommandes, réponses aux événements, bugs, comptes `qa.<tag>.<horodatage>@dhomebarber.fr`) ; les RDV de test comptent dans le CA.
- **Après chaque revue Apple / Google** : effacer avis, publications, commentaires, réactions et RDV des comptes de démonstration (`reviewer@`, `reviewer2@` : leurs matchs de la Coupe aussi), **sans supprimer les comptes** ; lister d'abord, supprimer par email exact, RDV passés en `cancelled` ; noter le nombre de lignes par table. Requêtes : `docs/fonctions/securite-moderation-nettoyage.md`.

### Chiffres

- CA des RDV **hors pourboire** (`total_price + product_price`), CB / espèces séparés des pourboires ; part payée par carte cadeau jamais recomptée ; « À encaisser » = RDV du mois seulement.
- Mesure d'audience interne : aucun service tiers, aucun parcours individuel affiché, 13 mois, refus dans Paramètres ; équipe et testeurs exclus par défaut. Détail : `docs/fonctions/admin-pilotage.md`.
- **Erreurs de l'app** (20 oct. 2026) : remontées par le même circuit (`reportError`, événements `error`), nettoyées sur l'appareil **et** sur le serveur (jamais d'email, téléphone, jeton ni identifiant dans un message), coupées par le même refus ; Admin → Trafic → « Erreurs de l'app » (tout le monde, équipe comprise), journaux Heroku `[ErreurApp]`, `scripts/app-errors.js`. Une nouvelle source d'erreurs passe par `reportError`, jamais par un envoi à part. `scrubErrorText` existe en **deux copies identiques** (app et serveur, `test-app-errors.js` compare) : toute règle de nettoyage change des deux côtés et doit laisser lisible une pile Safari (`fonction@fichier.js:ligne:colonne`) nettoyée deux fois.

## Décisions du propriétaire (ne pas changer sans nouvelle demande)

- Avis publiés tout de suite, sans visite exigée ni validation (7 oct. 2026).
- Moins de 24 h avant un RDV : appeler le salon (18 oct. 2026).
- Personne n'est jamais déconnecté (15 oct. 2026).
- Carte de fidélité **retirée** le 3 sept. 2026 (version dans le commit 815d581) : ne pas la réintroduire.
- Carte Gang : aucun avantage lié aux niveaux, une visite par jour, aucun bandeau écrit.
- Filtre : « pd » seul refusé.
- Fenêtres fermées par la croix ; pas de bouton flottant sur l'accueil ; parallaxe sans hachures ni bords nets ; raccourcis du Profil en style B (une seule couleur).
- Réservation : pas d'écran de chargement à la confirmation, succès en pluie de lames de rasoir, jours en bande qui défile (pas de flèches de semaine).
- Pass Apple Wallet : haut vide, bande = grand logo du salon seul.
- Push à l'acheteur après chaque débit de carte cadeau : **oui** (21 oct. 2026).
- Pas de vérification de l'email à l'inscription (21 oct. 2026).
- Export comptable des cartes cadeau : format à voir plus tard (21 oct. 2026).
- Réservation pour un proche : libellé « Un proche », visite comptée sur la carte Gang du parent, plafond de 6 RDV à venir gardé, pas de réservation groupée en un passage (24 oct. 2026).
- L'admin s'adresse aux clients sous le nom « D'Home Barber », marqué d'une petite étoile bleue, sans badge écrit (26 oct. 2026).
- Une section « Jeux » qui ouvre la page des jeux (La Coupe du Gang, puis les jeux à venir) ; l'admin rend visible ou invisible chaque catégorie de l'accueil (29 oct. 2026).
- La Coupe du Gang, thème stade (29 oct. 2026) : stade rouge et noir style Milan **sans les marques du club** (logo D'Home Barber et « La Coupe du Gang » à leur place), rouge, noir et blanc avec une touche d'or, avant-match (stade entier puis zoom sur le terrain), terrain seul pendant le match, stade au débrief, ton pion rouge contre l'adversaire blanc, un seul terrain (jamais deux superposés), premier coup d'envoi en 4,5 s ; l'entrée « Jeux » du fil et la carte « Jeux » de l'accueil au vert de l'app (stade en gris sous un voile vert sur l'accueil).
- Accueil de la Coupe (29 oct. 2026 au soir, planche validée) : une question à la fois, « 1. Comment tu joues ? » (En ligne, Contre le salon, À deux) puis « 2. Contre qui ? » (onglets Barbers, Joueurs, Un ami) ; barbers en liste comme les joueurs ; points en une bande ; réglages regroupés en bas ; rond central du terrain sans point ni ligne dedans.
- Musique de la Coupe (30 oct. 2026) : « On t'oublie pas » (chant du propriétaire, Suno) sur les pages de la Coupe et en salle d'attente, la tribune pendant les matchs.
- Carte de la Coupe sur la page « Jeux » (30 oct. 2026) : le logo « La Coupe du Gang » du propriétaire (couronne, ballon, tondeuses) en grand, une carte moderne « qui donne envie de cliquer » (logo qui flotte et brille, projecteurs, étincelles, liseré or et rouge, gros « Jouer »).
- Fil « New Gang » v2 (30 oct. 2026, « lance le chantier », recommandations de la planche https://claude.ai/artifact/R8re91ruSRri2pJ7YFxV9b) : sondages réservés au salon ; Moments du Gang seulement pour les membres du classement Team of the Season ; push « Ta coupe est toute fraîche » 2 h après la visite, une fois ; l'auteur voit le nombre de membres qui ont vu sa publication (le nombre seulement) ; halo vert animé sous les cartes retiré.
- La Coupe du Gang (28 oct. 2026) : foot façon air hockey en temps réel, premier à 3 buts ; victoire +3, défaite −1 en Points de Coupe **séparés du niveau Gang** ; l'admin joue sous « D'Home Barber » (une seule ligne au classement pour tous les comptes admin) ; barbers « Dispo pour un match » ; aucun lot, seulement un classement ; **tous les matchs comptent** (ni limite par adversaire ni par jour, 29 oct.) ; interrupteur à part pour figurer au classement de la Coupe ; saison = un mois. Détail : `docs/fonctions/coupe-du-gang.md`.

## Restes à faire (les plus importants)

Liste complète, dédoublonnée et datée : `docs/historique/restes-a-faire.md`.

1. La Coupe du Gang (ouverte sur le site le 29 oct. 2026) : essai réel à deux téléphones du jeu complet, barbers à rendre joignables (notifications web), liste du build 18 et choix du chef à faire valider (5 min, 10 s / 20 s). Voir `docs/historique/restes-a-faire.md`.
2. Fil « New Gang » v2 (en ligne sur le site le 30 oct. 2026) : il arrive dans les apps avec les prochains builds (iOS 19, Android 20) ; à leur envoi, décrire les formats (look, sondage, avant / après, Moments) et l'écran Activité dans les notes de revue, revoir les étiquettes de confidentialité (votes, activité). Essai réel des pushs du fil sur un téléphone. Voir `docs/historique/restes-a-faire.md`.
3. Snap : *Push to Production* et jeton de production ; la lentille « DHB Couleur » est vide, à refaire.
4. Activité clients : retirer la seconde requête des annulations sans auteur vers le 27 oct. 2026.
5. Dom et Romain sans notifications sur leur téléphone, Kevin sur le web seulement : leur faire activer l'app.
6. Compte barber « Sacha » (fiche supprimée) à supprimer dans Comptes barbers.
7. Google Wallet : variables à poser à l'accès en publication ; badges officiels avant la production.
8. Achats hors RDV payés par carte cadeau sans `gift_card_amount` ; export comptable : format à voir plus tard avec le propriétaire.
9. Dépendances : `node-forge` sans correctif ; `quill` / `react-router` en majeures non montées.
10. Échéances : certificat Apple Wallet avant le 16 nov. 2027 ; crédit Anthropic sans rechargement automatique.