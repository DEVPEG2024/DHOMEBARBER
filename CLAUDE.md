# D'Home Barber - Guide Projet

## Architecture

- **Frontend** : React + Vite + TailwindCSS, déployé sur **Vercel** (https://dhomebarber.fr)
- **Backend** : Express.js + PostgreSQL, déployé sur **Heroku** (https://dhomebarber-api-3aabb8313cb6.herokuapp.com)
- **Client API** : le frontend utilise un client HTTP maison `src/api/apiClient.js` (le SDK `@base44/sdk` a été retiré). Il expose `api.entities.<Entity>`, `api.auth` et `api.integrations.Core.UploadFile`. Tous les imports se font via `@/api/apiClient`.
- **Apps natives** : iOS et Android via **Capacitor 8** (`capacitor.config.ts`, appId `fr.dhomebarber.app`). Les dossiers `ios/` et `android/` sont **hors git** (gitignorés).
- **Repo GitHub** : https://github.com/DEVPEG2024/DHOMEBARBER (frontend uniquement)
- **Backend repo** : /Users/zoomproject/Downloads/dhomebarber-api/ (push vers Heroku via `git push heroku main`)

## Déploiement

### Frontend (Vercel)
- Push sur `main` → déploiement automatique sur Vercel
- Domaine : dhomebarber.fr
- Hard refresh (Cmd+Shift+R) après chaque déploiement pour vider le cache

### Backend (Heroku)
- App : `dhomebarber-api`
- Déployer : `git push heroku main`
- Logs : `heroku logs --tail --app dhomebarber-api`
- Init DB : `heroku run node init-db.js --app dhomebarber-api`
- PostgreSQL addon : `postgresql-deep-70510` (plan essential-0)
- La session Heroku CLI expire régulièrement : relancer `heroku login` si les commandes renvoient `Invalid credentials`
- Variables d'environnement attendues : `NODE_ENV=production` (**obligatoire** : sans elle les origines `localhost` restent autorisées par CORS, et le serveur accepte un `JWT_SECRET` de repli), `DATABASE_URL`, `JWT_SECRET` (le serveur **refuse de démarrer** en production sans), `API_PUBLIC_URL` (base des URL d'images renvoyées par l'upload), `FRONTEND_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, `SMTP_HOST` (défaut smtp.hostinger.com), `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` ; optionnelles : `FAL_KEY` (active le mode AI ULTRA de l'essayage couleur, release v69), `HAIR_ULTRA_EDIT_MODEL`, `SNAP_CAMERA_KIT_API_TOKEN` + `SNAP_LENS_GROUP_ID` (activent les filtres Snap), `APNS_KEY_P8` + `APNS_KEY_ID` + `APNS_TEAM_ID` + `APNS_BUNDLE_ID` (push natif iOS) et `FCM_SERVICE_ACCOUNT` (push natif Android)

### Apps natives (Capacitor)
- Scripts : `npm run cap:sync` (build + sync), `npm run cap:ios`, `npm run cap:android` (build + sync + ouverture Xcode / Android Studio)
- **`npm run android:release`** (ajouté le 5 sept. 2026) : build web → sync Capacitor → incrément de `versionCode` et du dernier segment de `versionName` → bundle signé → téléversement sur la piste **test interne** du Play Console. Options : `--dry-run` (n'écrit rien), `--no-upload` (s'arrête au bundle), `--track=alpha`. Aucune dépendance npm — le JWT du compte de service est signé avec `node:crypto` puis échangé contre un jeton OAuth, comme `lib/nativePush.js`. La signature du `.aab` est vérifiée avant l'envoi. **Identifiants en place depuis le 5 sept. 2026** : compte de service `play-publisher@d-home-barber.iam.gserviceaccount.com` (projet Cloud `d-home-barber`, API *Google Play Android Developer* activée), clé dans `~/.play-console/dhomebarber-play.json` (hors git, chmod 600), invité au Play Console avec **trois autorisations seulement** : afficher les informations de l'app, afficher la qualité de l'app, et « Déployer les applications sur des canaux de test » — il ne peut donc **pas** publier en production. Pour refaire l'opération ailleurs : un compte de service Google Play (Google Cloud → activer *Google Play Android Developer API* → IAM → compte de service → clé JSON ; puis Play Console → Utilisateurs et autorisations → inviter cette adresse avec le droit « Gérer les versions »), déposé dans `~/.play-console/dhomebarber-play.json` (ou via `PLAY_SERVICE_ACCOUNT_FILE` / `PLAY_SERVICE_ACCOUNT_JSON`). Sans lui, le bundle est construit et le script explique la marche à suivre
- Le build web (`dist/`) est copié dans les projets natifs par `cap sync` ; les apps chargent le bundle local, pas dhomebarber.fr
- Android : `android/dhomebarber-release.keystore` + `android/keystore.properties` servent à signer les releases Play Store. **Ils ne sont dans aucun git : à sauvegarder ailleurs, sans eux aucune mise à jour Play Store n'est possible.**
- Dernier état connu (5 septembre 2026) : **Android 1.0.3 (versionCode 4) publiée sur la piste de test interne** le 5 sept. 2026 par `npm run android:release` (tous les correctifs de la journée, filtres Snap éteints ; release « 1.0.3 », statut `completed`, vérifiée via l'API) ; iOS 1.0 (build 5, soumis à la review Apple le 2 sept. 2026 au soir, reviewSubmission 50bedf7e-ee85-4050-82cc-a5a7fbeb5566, mise en ligne manuelle après approbation). Incrémenter `versionCode` / `CURRENT_PROJECT_VERSION` avant chaque envoi aux stores. Les builds natifs embarquent le bundle web : après une modification frontend, refaire `npm run cap:sync` puis un nouveau build store pour que les apps l'aient (le web dhomebarber.fr, lui, est à jour dès le push).
- **Stratégie de sortie décidée le 5 sept. 2026** : ne pas annuler la revue Apple en cours pour y joindre un nouveau build (on repartirait en fin de file). La version 1.0 est en **mise en ligne manuelle**, donc son approbation ne publie rien : à l'approbation, ne pas la mettre en ligne, envoyer 1.0.1 avec les correctifs, et publier celle-là. Les utilisateurs ne verront jamais le bundle du 4 sept., qui a trois défauts connus (déconnexion à l'ouverture hors ligne, créneaux proposés que le serveur refuse, session expirée invisible). Ne pas non plus attendre Snap : son approbation ne fera rien fonctionner tant que la lentille est vide, d'où l'interrupteur des filtres.
- Plugins utilisés : push-notifications, haptics, browser, status-bar, splash-screen, keyboard, app (wrapper dans `src/lib/capacitor.js` : `isNative`, `platform`, `initCapacitor`, `hapticFeedback`, `openExternalUrl`)

## Structure Frontend

```
src/
├── api/apiClient.js          # Client HTTP maison (entities, auth, upload) → Heroku
├── App.jsx                   # Routing (react-router), layouts client/admin, lazy loading admin, ScrollToTop (haut de page à chaque route)
├── lib/
│   ├── AuthContext.jsx        # Auth réelle (token localStorage, /me endpoint)
│   ├── ThemeContext.jsx       # Gestion du thème clair/sombre
│   ├── MusicContext.jsx       # Musique d'ambiance (/ambiance.mp3, volume 1 %)
│   ├── capacitor.js           # Wrapper Capacitor (natif vs web)
│   ├── useLiveCount.js        # Hook WebSocket → compteur d'utilisateurs connectés (/ws/live)
│   ├── barberPhoto.js         # Format des photos de barbers (portrait 1748 × 2480, ratio + fond sombre)
│   ├── calendarLinks.js       # Ajout au calendrier : URL Google Agenda, fichier .ics (VTIMEZONE Europe/Paris), openCalendar web / natif
│   ├── hairColor.js           # Essayage couleur : MediaPipe (cheveux + visage), palette Oklab, masques barbe / racines, repli canvas 2D
│   ├── hairGl.js              # Essayage couleur : shader WebGL Oklab (mode FAST)
│   ├── hairUltra.js           # Essayage couleur : appel du mode AI ULTRA (backend)
│   ├── app-params.js          # Paramètres app (appId, token, etc.)
│   ├── pushNotifications.js   # Service Worker push notifications (web)
│   ├── query-client.js        # React Query config
│   ├── utils.js               # Utilitaires (cn, etc.)
│   └── PageNotFound.jsx       # Page 404
├── components/
│   ├── agenda/                # DayView, WeekView, MonthView, AgendaToolbar, AppointmentDetailModal, BreakModal
│   ├── layout/                # ClientLayout, AdminLayout, BottomNav
│   ├── shared/                # ServiceCard, EmployeeCard, BarberCard (carte style FUT), StarRating, SectionHeader, ImageCropDialog, MusicToggle
│   ├── home/                  # RebookCard (« Comme la dernière fois »), OpenStatusBadge (Ouvert / Fermé heure de Paris)
│   ├── BackgroundMusic.jsx
│   ├── ErrorBoundary.jsx
│   ├── UserNotRegisteredError.jsx
│   └── ui/                    # Composants shadcn/ui (dialog, button, etc.)
├── pages/
│   ├── Home.jsx               # Page d'accueil (hero centré, logo, "Premium Barber Shop", pastille Ouvert / Fermé en direct, bouton Réserver à anneau orbital, bloc « Comme la dernière fois », carrousel barbers avec parallaxe, bloc Carte Cadeau pulsant). Ordre des sections lu depuis salon_settings.homepage_order (pas d'éditeur UI, modifier en DB)
│   ├── Booking.jsx            # Réservation en 4 étapes (étapes glissantes, récap animé, carte « Peu importe » = premier créneau dispo tous barbers, créneau qui se loge dans le résumé, écran de succès pluie de lames + boutons calendrier)
│   ├── Services.jsx           # Liste des prestations
│   ├── Shop.jsx               # Boutique produits
│   ├── Orders.jsx             # Commandes client
│   ├── Appointments.jsx       # Mes rendez-vous (client) : lien « Ajouter au calendrier » (Google / .ics) sur les RDV à venir
│   ├── MyReviews.jsx          # Mes avis (client)
│   ├── BarberProfile.jsx      # Profil public d'un barber (/barber/:id) : carte style FUT (BarberCard, holographique, stats qui montent, transition partagée depuis l'accueil) + vidéo de présentation ; swipe gauche/droite (ou flèches, boutons, points) pour passer aux autres barbers sans quitter la page
│   ├── Feed.jsx               # Fil social "Ca dit quoi le Gang ?" (posts, réactions emoji, commentaires, menu Signaler / Bloquer, panneau admin des signalements) — aussi /admin/feed
│   ├── Events.jsx             # Privatisation du salon : demande d'événement, acceptation/refus du devis
│   ├── GiftCards.jsx          # Cartes cadeau : achat (code DHB + QR), affichage
│   ├── TryOn.jsx              # « Nouvelle tête » (/try-on, lazy) : essayage couleur cheveux / barbe, FAST sur l'appareil + AI ULTRA serveur
│   ├── SnapLenses.jsx         # « Filtres Snap » (/snap, lazy) : lentilles Snapchat du salon via Camera Kit
│   ├── Profile.jsx            # Profil utilisateur
│   ├── Settings.jsx           # Paramètres client (date de naissance, utilisateurs bloqués, suppression de compte, liens CGU / confidentialité)
│   ├── Login.jsx              # Connexion, inscription, mot de passe oublié (code à 6 chiffres par email)
│   ├── ClientNotifications.jsx # Notifications client
│   └── admin/
│       ├── Dashboard.jsx      # Tableau de bord (CA, CB/Espèces, pourboires séparés, compteur live)
│       ├── Agenda.jsx         # Agenda admin avec DayView/WeekView/MonthView + envoi push "Last Minute" sur un créneau libre
│       ├── SmartAgenda.jsx    # Agenda intelligent
│       ├── Clients.jsx        # Gestion clients
│       ├── AdminServices.jsx  # Gestion des prestations
│       ├── AdminProducts.jsx  # Gestion des produits
│       ├── AdminStock.jsx     # Stock produits (ref, seuil critique, type boutique/salon)
│       ├── AdminOrders.jsx    # Gestion des commandes
│       ├── AdminReviews.jsx   # Gestion des avis
│       ├── AdminEvents.jsx    # Événements / privatisations : devis, statut, notes admin
│       ├── AdminGiftCards.jsx # Cartes cadeau : validation (scan QR ou code), solde restant
│       ├── AdminSettings.jsx  # Paramètres du salon
│       ├── BarberSettings.jsx # Paramètres du barber connecté (/admin/my-settings) : photo, vidéo, compétences
│       ├── AdminLeave.jsx     # Gestion congés (admin)
│       ├── BarberLeave.jsx    # Congés (vue barber)
│       ├── BarberAccounts.jsx # Comptes barbers
│       ├── BarberCleaning.jsx # Nettoyage (vue barber)
│       ├── Cleaning.jsx       # Gestion nettoyage (admin)
│       ├── Notifications.jsx  # Notifications admin
│       ├── Team.jsx           # Gestion équipe
│       └── Stats.jsx          # Statistiques
└── utils/
    ├── serviceColors.js       # Couleurs par service pour l'agenda
    └── exportCSV.js           # Export CSV
public/
├── ambiance.mp3               # Musique d'ambiance
├── cgu.html, privacy.html     # Pages légales (exigées par les stores)
├── manifest.json, sw.js       # PWA + service worker push
```

Routes client : `/`, `/services`, `/booking`, `/shop`, `/appointments`, `/orders`, `/reviews`, `/settings`, `/notifications`, `/profile`, `/barber/:id`, `/feed`, `/events`, `/gift-cards`, `/try-on`, `/snap`, `/login`.
Routes admin : `/admin`, `/admin/agenda`, `/admin/smart-agenda`, `/admin/services`, `/admin/team`, `/admin/clients`, `/admin/products`, `/admin/stock`, `/admin/orders`, `/admin/reviews`, `/admin/stats`, `/admin/settings`, `/admin/my-settings`, `/admin/notifications`, `/admin/cleaning`, `/admin/my-cleaning`, `/admin/barber-accounts`, `/admin/leave`, `/admin/my-leave`, `/admin/feed`, `/admin/events`, `/admin/gift-cards`.

## Structure Backend

```
dhomebarber-api/
├── server.js          # Express server, CORS restreint, helmet, rate limiting, auto-migrations, WebSocket /ws/live, endpoint last-minute
├── db.js              # Pool PostgreSQL (DATABASE_URL)
├── init-db.js         # Création des tables de base + indexes
├── migrate.js         # Migrations DB
├── seed-admin.js      # Seed admin user
├── Procfile           # web: node server.js
├── migrate-media.js   # Convertit les anciennes URL `data:` en lignes `media` (idempotent, --dry-run)
├── lib/
│   ├── accessControl.js # Politique de lecture par rôle (applyReadPolicy), validation, identité du compte, code carte cadeau, disponibilité des créneaux
│   ├── publicKey.js   # Identifiant public d'un compte (HMAC de l'email) : le fil ne diffuse plus d'emails
│   ├── nativePush.js  # Push natif APNs (iOS) + FCM HTTP v1 (Android)
│   ├── emailHelper.js # Nodemailer SMTP : bienvenue, confirmation/rappel/annulation RDV, commande, événements, avis, anniversaire, relance
│   ├── pushHelper.js  # sendPushToRole, sendPushToEmail, sendPushToEmployee, sendToSubscriptions (Web Push, lots de 50)
│   └── hairUltra.js   # AI ULTRA : SAM 3 + FLUX Kontext (fal.ai) + fusion gardée par le masque (sharp)
├── jobs/
│   ├── appointmentReminder.js  # Toutes les 30 min : rappel RDV (push + email)
│   ├── reviewReminder.js       # Toutes les 30 min : demande d'avis après prestation (review_reminder_sent)
│   ├── birthdayReminder.js     # Tous les jours 8h : notif + email anniversaire (users.birth_date)
│   └── comebackReminder.js     # Tous les jours 10h Paris : relance « il est temps de revenir » (comeback_reminder_sent), --dry-run
└── routes/
    ├── media.js       # GET /api/media/:id : sert une image stockée en base (cache 1 an, ETag / 304)
    ├── hairUltra.js   # POST /ai/hair-ultra : recoloration HD (lib/hairUltra.js, fal.ai, FAL_KEY)
    ├── entities.js    # CRUD générique : politique d'accès par rôle (CREATE_RULES / UPDATE_RULES), emails sur création RDV / commande / événement
    ├── auth.js        # register, login, /me, forgot-password, reset-password, delete-account, logout
    ├── public.js      # Public settings endpoint
    ├── push.js        # Web Push (vapid-key, subscribe, unsubscribe, send, subscribers) + subscribe-native (token FCM/APNs)
    ├── upload.js      # Upload fichiers (images)
    ├── barberAccounts.js  # Gestion comptes barbers
    ├── cleaning.js    # generate-schedule, notify-today, toggle, history
    └── leave.js       # PATCH /leave/:id/status : admin approuve/refuse un congé + push au barber
```

## Entités (Tables PostgreSQL)

Mapping entité → table dans `routes/entities.js`.

| Entité | Table | Champs clés |
|--------|-------|-------------|
| User | users | email, full_name, phone, password_hash, role, employee_id, photo_url, birth_date, reset_code, reset_code_expires, reset_attempts |
| ServiceCategory | service_categories | name, sort_order, is_active |
| Service | services | name, price, duration, description, category_id, sort_order, is_active |
| Employee | employees | name, title, bio (contient l'URL vidéo après le marqueur `%%VIDEO%%`), email, phone, photo_url, color, working_hours (JSONB), permissions (JSONB), skills (JSONB), experience_level, sort_order, is_active |
| SkillCategory | skill_categories | name, emoji, color, sort_order, is_active |
| Appointment | appointments | client_name, client_email, client_phone, employee_id, employee_name, date, start_time, end_time, services (JSONB), status, payment_method, tip, tip_method, product_sold, product_price, grand_total, deposit_amount, reminder_sent, review_reminder_sent, comeback_reminder_sent, internal_notes, cancellation_reason |
| Product | products | name, price, description, image_url, brand, category, stock, ref, critical_stock, stock_type (boutique/salon), is_active |
| Order | orders | client_email, client_name, client_phone, items (JSONB), total_price, status, notes |
| Review | reviews | client_name, client_email, rating, comment, employee_name, is_visible |
| Post | posts | author_email, author_name, author_role, author_photo_url, content, image_url, likes_count |
| PostLike | post_likes | post_id, user_email, reaction (emoji) |
| PostComment | post_comments | post_id, author_email, author_name, author_role, author_photo_url, content |
| Event | events | client_name, client_email, client_phone, event_type, date, time_slot, guest_count, employees (JSONB), message, status, admin_notes, price |
| PostReport | post_reports | post_id / comment_id (SET NULL à la suppression), reporter_email (forcé serveur), reporter_name, reported_email, reported_name, reason, details, content_snapshot (copie serveur), status (pending / handled / dismissed), handled_by, handled_at |
| UserBlock | user_blocks | blocker_email (forcé serveur), blocked_email, blocked_name, UNIQUE(blocker, blocked) |
| GiftCard | gift_cards | code (DHB…, généré côté serveur), amount, remaining_balance, sender_*, recipient_name, recipient_message, status (pending → validé par admin), valid_until, validated_at, validated_by, used_at |
| SalonSettings | salon_settings | salon_name, tagline, description, phone, email, address, city, opening_hours (JSONB), social_*, cancellation_hours, require_deposit, deposit_percentage, homepage_order (JSONB), comeback_weeks (défaut 5) |
| PushSubscription | push_subscriptions | user_id, user_email, endpoint, keys_p256dh, keys_auth (+ tokens natifs via subscribe-native) |
| TimeOff | time_offs | employee_id, employee_name, start_date, end_date, reason, type, status (pending/approved/declined), requested_at |
| CleaningTask | cleaning_tasks | name, description, frequency, is_active, sort_order |
| CleaningSchedule | cleaning_schedules | task_id, task_name, employee_id, employee_name, date, status, week_start, completed_at |

## Points importants

### Sécurité Backend
- **CORS** restreint aux origines autorisées (dhomebarber.fr, `capacitor://localhost` iOS, `http://localhost` et `https://localhost` Android, localhost:5173 en dev)
- **Helmet** pour les headers de sécurité, **compression** gzip des réponses
- **Rate limiting** : 400 req/min global, 30 req/15min pour auth (login, register, forgot/reset-password), 20 uploads/15min
- **Trust proxy** activé (Heroku reverse proxy)
- Body parser limité à 10mb
- WebSocket `/ws/live` : origine vérifiée (mêmes origines que CORS, ou sans en-tête Origin), 2000 connexions max, messages entrants ignorés
- **Politique d'accès des entités** (`routes/entities.js` + `lib/accessControl.js`, revue de sécurité du 2 sept. 2026). Rôles : `admin`, `barber` (staff = admin + barber), `user` (client). Toute nouvelle entité doit être ajoutée à `applyReadPolicy` et aux `CREATE_RULES` / `UPDATE_RULES`.
  - Lecture : `users` → jamais `password_hash` / `reset_code*` ; admin tout, barber colonnes agenda (id, email, nom, téléphone, rôle, photo, anniversaire), client sa propre fiche. `employees` (public) sans `email` / `phone` / `permissions` hors admin. Client : ses RDV / commandes / cartes cadeau / événements (filtre `client_email` ou `sender_email` forcé) ; disponibilités = RDV projetés sur les colonnes de créneau (id, employee_id, date, start_time, end_time, status, total_duration), congés approuvés, événements confirmés (id, date, time_slot, status), avec filtres limités à ces colonnes. Avis : visibles uniquement et sans `client_email` sauf pour le staff ou ses propres avis. Fil : `author_email` / `user_email` masqués en anonyme. Nettoyage : staff seulement.
  - Création : `client_email`, `client_name`, `client_phone`, `author_*`, `sender_email` viennent du jeton et de la table `users`, jamais du corps ; `total_price` / `total_duration` / `end_time` des RDV recalculés depuis `services`, `total_price` des commandes depuis `products` ; statuts forcés (`confirmed`, `pending`) ; champs whitelistés et bornés ; `image_url` d'un post ≤ 1,5 M caractères ; congés : un barber ne demande que pour lui-même, un client ne peut pas
  - Modification : `orders` / `reviews` staff, `gift_cards` / `time_offs` / `post_reports` / `user_blocks` admin, fil propriétaire ou admin (contenu / réaction seulement). Un client ne peut qu'annuler son propre RDV (`status: 'cancelled'`, refusé dans le délai `salon_settings.cancellation_hours`, heure de Paris) ou accepter / refuser son devis
  - Suppression : RDV / commandes / avis staff ; cartes cadeau, événements, signalements, congés admin ; fil propriétaire ou admin
  - Erreurs : `HttpError` → son statut, colonne inconnue ou UUID mal formé → 400, doublon → 409
- Gift cards : code généré côté serveur (`crypto.randomInt`), montant validé, statut forcé à `pending`, suppression admin uniquement
- Auth : code de réinitialisation `crypto.randomInt`, jamais loggé, invalidé après 5 essais (`users.reset_attempts`), réponse identique que le compte existe ou non ; inscription : email validé, nom ≤ 120, téléphone ≤ 30
- Congés : changement de statut réservé à l'admin (`routes/leave.js`)

### Modération du fil (exigence App Store 1.2)
- **Signaler** : menu « ··· » d'une publication ou lien « Signaler » sous un commentaire → `PostReport.create` (motif + précisions). Le serveur copie le contenu et l'auteur, puis envoie push + email à tous les admins (`notifyAdminsOfReport` dans `routes/entities.js`, `sendContentReportAdmin` dans `lib/emailHelper.js`)
- **Bloquer** : `UserBlock.create` ; les posts et commentaires de l'utilisateur bloqué sont filtrés côté serveur (`handleList`) et côté client. Déblocage dans Paramètres → « Utilisateurs bloqués »
- **Admin** : sur `/admin/feed`, panneau « Signalements en attente » (supprimer le contenu ou ignorer, statut `handled` / `dismissed`)
- Les CGU (`public/cgu.html`, section 7) décrivent tolérance zéro, signalement, blocage et modération sous 24 h ; acceptation rappelée à l'inscription et dans le composeur

### Client API (`src/api/apiClient.js`)
- **list** → `GET /api/apps/:appId/entities/:entityName?sort=X&limit=N`
- **filter** → `GET /api/apps/:appId/entities/:entityName?q=JSON&sort=X&limit=N`
- **create** → `POST /api/apps/:appId/entities/:entityName` (les champs d'identité et les prix sont recalculés côté serveur, voir Sécurité Backend)
- **update** → `PUT /api/apps/:appId/entities/:entityName/:id`
- **delete** → `DELETE /api/apps/:appId/entities/:entityName/:id`
- **auth.me** → `GET /api/apps/:appId/entities/User/me`
- **auth.loginViaEmailPassword** → `POST /api/apps/:appId/auth/login`
- **auth.register** → `POST /api/apps/:appId/auth/register`
- **UploadFile** → `POST /api/apps/:appId/integration-endpoints/Core/UploadFile`. Depuis le 5 sept. 2026 (backend v76) le serveur **stocke le fichier dans la table `media`** et renvoie une **URL absolue** vers `GET /api/media/<id>` : les listes ne transportent plus d'images. Le type est déduit des **octets magiques**, pas du `Content-Type` déclaré, et le SVG est refusé. Les images restent **compressées côté client avant l'envoi** (`src/lib/imageCompress.js` : côté ≤ 1280 px, JPEG, cible 400 Ko). Ne jamais appeler l'endpoint sans passer par `UploadFile`
- `appId` est fixé à `prod`
- **Cache React Query** (`src/lib/query-client.js`) : `staleTime` 60 s par défaut, 5 min sur les catalogues (Employee, Service, ServiceCategory, Product, SalonSettings, SkillCategory). Les listes admin complètes utilisent des clés préfixées (`['employees','all']`, `['products','all']`, `['services','all']`…) distinctes des listes client filtrées `is_active`, mais invalidées par le même préfixe. Le cache est vidé au login / à l'inscription (réponses différentes selon le rôle)

### Endpoints spécifiques (hors CRUD)
- `POST /auth/forgot-password` → envoie un code à 6 chiffres par email ; `POST /auth/reset-password` le vérifie
- `DELETE /auth/delete-account` → transaction : supprime l'utilisateur, ses abonnements push, ses avis, ses posts / commentaires / réactions et blocages ; anonymise ses RDV, commandes, événements, cartes cadeau envoyées et signalements ("Compte supprimé") (exigence App Store / Play Store)
- `POST /last-minute` (**staff uniquement**, quota 6/heure par compte) → push « Créneau Last Minute » à tous les clients (rôle `user`). Était ouvert à tout compte connecté jusqu'au 5 sept. 2026 : n'importe quel client pouvait notifier tout le salon avec un texte libre. Les champs repris dans le texte sont bornés et nettoyés
- `GET /api/media/:id` (public) → sert une image stockée en base : `Cache-Control` d'un an, `ETag`, `If-None-Match` → 304, type MIME filtré par liste blanche. Exempté du quota global (ouvrir le fil = une centaine de requêtes depuis la même IP)
- `POST /push/subscribe-native` → enregistre un token FCM/APNs (iOS/Android)
- `PATCH /leave/:id/status` → admin approuve/refuse un congé, push au barber
- `GET /apps/public/prod/public-settings/by-id/:appId` → paramètres publics du salon (utile pour vérifier que l'API répond)
- WebSocket `/ws/live` → diffuse le nombre d'utilisateurs connectés (hook `useLiveCount`)

### Revue de sécurité et de charge du 5 septembre 2026 (backend v76, frontend c6ce8c7)
Rapport complet : https://claude.ai/code/artifact/406820a6-13b7-43f2-bd32-65cd3e376f1b
- **Images hors du chemin critique** : elles vivaient en base64 dans les colonnes et repartaient en entier dans chaque liste (183 ko par photo de profil, 418 ko par image de publication ; le fil demandait 100 publications, soit ~42 Mo de JSON par ouverture). Elles sont désormais dans la table `media` (BYTEA, ~25 % plus compact que le base64) et servies par URL. Mesuré après migration : la liste des barbers est passée de ~310 ko à **3,4 ko**, celle des publications à **810 octets**. Les anciennes URL `data:` restent affichables ; `migrate-media.js` a converti l'existant (10 lignes, 9 médias, 1 image dédupliquée)
- **Réservation vérifiée côté serveur** (`assertSlotAvailable` dans `routes/entities.js`) : créneau passé (heure de Paris), horaires du barber, congé approuvé, chevauchement — les règles sont un portage fidèle de `computeSlots` de `Booking.jsx`, validé par une équivalence sur 4 000 cas aléatoires. Index unique partiel `idx_appointments_unique_slot` contre la course entre deux clients (409 « Ce créneau vient d'être réservé »). Plafond de 3 RDV `confirmed` à venir par compte. `Booking.jsx` filtre maintenant les créneaux passés du jour, sinon le serveur les refuse
- **Avis** : exigent un RDV `completed` (403) et sont plafonnés à 5 par compte
- **Le fil ne diffuse plus d'emails** : `posts` / `post_comments` portent `author_key`, `post_likes` porte `user_key` (`lib/publicKey.js`, HMAC du `JWT_SECRET`), l'email n'est renvoyé qu'au staff. Le compte connecté reçoit sa clé dans `public_key` (`/me` **et** la réponse de `register`). Les blocages passent par `blocked_key` (colonne ajoutée), avec repli sur l'email pour les lignes antérieures. Quand la cible n'est connue que par sa clé, `blocked_email` reçoit le repère interne `key:<clé>`, jamais renvoyé par l'API — ne pas lever le `NOT NULL` sans revoir ce point
- **Rappels** : `appointmentReminder` et `reviewReminder` comparaient une heure de Paris à `NOW()` en UTC, les rappels partaient avec 1 à 2 h de décalage. La fenêtre est calculée en instants réels et la requête filtre par `date = ANY(...)` (indexable). `reviewReminder` filtrait en plus sur `CURRENT_DATE` en UTC, ce qui privait de demande d'avis **toutes les prestations de fin de soirée** — corrigé, ces demandes partent donc désormais entre minuit et 4 h. `parisToUtc` se trompait d'une heure autour des bascules d'heure d'été (deux passes maintenant)
- Divers : `requireStaff` ajouté et exporté ; historique de ménage et `toggle` réservés au staff (le contrôle de rôle arrivait après le `SELECT`, oracle d'existence) ; `SendEmail` échappe `subject` et `body` ; compteur WebSocket regroupé (une diffusion par seconde max) ; `qs` forcé en 6.16.0 par `overrides` (Express 4.22.2 épingle une version vulnérable) → `npm audit` : 0 vulnérabilité
- **Restes connus** : pas de ramasse-miettes sur `media` (supprimer une publication laisse la ligne orpheline) ; `Clients.jsx` charge encore 1 000 RDV ; la recherche client complète la liste côté client faute d'opérateur `LIKE` dans `buildConditions` ; `POST /cleaning/notify-today` utilise la date UTC ; frontend `quill` et `react-router` restent en majeures non montées

### Bugs déclenchables par l'utilisateur, corrigés le 5 septembre 2026 (backend v78, frontend 479dd6f)
- **Ouvrir l'app sans réseau déconnectait définitivement** : `AuthContext.checkAuth` effaçait le jeton sur *toute* erreur, panne réseau comprise (métro, avion, sous-sol → mot de passe à retaper). Le jeton n'est plus effacé que sur un `401` / `403` du serveur ; hors ligne, la session est simplement inactive jusqu'au prochain lancement
- **Session expirée en cours d'usage** : le JWT vit 24 h et n'était vérifié qu'au démarrage. Passé ce délai tout répondait 401 alors que l'interface se croyait connectée. `apiClient` émet `dhb:unauthorized` sur le premier 401 (hors routes `/auth/`, où un mot de passe erroné répond 401 aussi), `AuthContext` referme la session et renvoie vers `/login?expired=1`, où un message explique
- **Réservation : message du serveur affiché** au lieu d'« Erreur lors de la création ». Le serveur refuse maintenant pour cinq raisons distinctes ; sur un `409` les créneaux sont rechargés et l'horaire désélectionné, sinon le client retentait le même en boucle
- **Créneaux passés** : la comparaison se fait sur l'instant réel (`parisInstant` dans `Booking.jsx`, même calcul à deux passes que `parisToUtc` côté serveur), donc juste depuis n'importe quel fuseau
- **Photo HEIC** : refusée avec le réglage iPhone à changer (Réglages → Appareil photo → Formats → « Le plus compatible »), au lieu du « Fichier non reconnu comme image » du serveur
- **Apps natives déjà publiées** : leur bundle reconnaît ses contenus par l'email. Retirer sa réaction retombait sur une création, refusée par `UNIQUE(post_id, user_email)`. Le serveur renvoie de nouveau l'email **sur les lignes du demandeur uniquement** — ce n'est pas une fuite, c'est le sien — et elles refonctionnent sans nouveau build. `npm run cap:sync` a tout de même été fait
- **Avis** : un rendez-vous passé et non annulé suffit désormais. Exiger `completed` faisait dépendre l'avis du bouton « Valider la prestation », que le salon n'utilise pas (0 RDV `completed` en base) : plus personne n'aurait pu publier
- **Plafond de rendez-vous à venir** porté de 3 à 6 : une famille réserve depuis un seul compte
- **Une prestation ne peut plus déborder l'heure de fermeture** (backend v79, frontend 7bd8694) : une coupe d'une heure à 18h30 pour une fermeture à 19h faisait finir le barber à 19h30 sans qu'il l'ait choisi. `assertSlotAvailable` refuse avec un message qui donne la durée, l'heure de fermeture et l'heure de fin (« Vos prestations durent 2 h et Romain ferme à 19:00 : commencer à 18:00 finirait à 20:00. Choisissez un créneau plus tôt. ») ; `computeSlots` ne les propose plus, et quand une sélection longue ne laisse aucun créneau la page explique que la durée est en cause. Une prestation qui finit **pile** à la fermeture reste acceptée. Le staff n'est pas concerné
- **Battement de cœur WebSocket** (backend v80) : le routeur Heroku ferme toute connexion sans trafic au bout de 55 s. Le compteur `/ws/live` n'envoyant rien quand le nombre de connectés ne bouge pas, la socket était tuée (`H15 Idle connection`, visible dans les journaux depuis au moins le 3 sept.) et `useLiveCount` se reconnectait 3 s plus tard, en boucle — une poignée de main par client et par minute. Un `ws.ping()` toutes les 30 s la maintient ouverte ; le `pong` (renvoyé automatiquement par les navigateurs, aucun code client) sert à terminer les sockets réellement mortes. Minuteur annulé dans `gracefulShutdown`
- **`POST /cleaning/notify-today`** utilise désormais `ac.parisToday()` : avec `toISOString()` il notifiait le ménage de la veille entre minuit et 2 h du matin à Paris
- **Ramasse-miettes des médias** : `cleanup-media.js` supprime les images que plus aucune colonne ne cite (une image est référencée par une URL dans du texte, aucune clé étrangère ne peut le faire). **Simulation par défaut**, suppression avec `--apply`, délai de grâce de 7 jours (`--days=N`) pour ne pas emporter un fichier envoyé mais pas encore rattaché à une entité. `heroku run "node cleanup-media.js" --app dhomebarber-api`. La logique vit dans `jobs/mediaCleanup.js` et tourne **automatiquement le dimanche à 03h30 heure de Paris** (backend v81) ; le script en ligne de commande reste disponible pour un passage à la demande
- **Tests dans le dépôt** : `cd dhomebarber-api && npm test` — 9 harnais, 268 vérifications, sans dépendance ni accès à la base de production (le pool, `http2` et `fetch` sont remplacés avant le chargement du code testé)

### Types de données
- Les colonnes `decimal` de PostgreSQL sont converties en nombres dans `normalizeRow()`
- Les colonnes `date` sont converties en format `YYYY-MM-DD` (pas ISO timestamp)
- Les colonnes JSONB (services, working_hours, opening_hours, items, permissions, skills, employees, homepage_order) sont auto-parsées

### Auth
- L'authentification est **réelle** avec login/register et tokens JWT
- Token stocké dans `localStorage` (`base44_access_token`, dupliqué sous `token`)
- L'endpoint `/me` retourne l'utilisateur connecté avec son rôle et permissions
- Rôles : `user`, `barber`, `admin`
- Les barbers ont un `employee_id` lié à leur profil employé
- Les permissions barber sont stockées dans `employees.permissions` (JSONB)

### Auto-migration au démarrage
Le `server.js` exécute des migrations automatiques au démarrage (`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`). Les tables `skill_categories`, `posts`, `post_likes`, `post_comments`, `events`, `gift_cards`, `post_reports` et `user_blocks` sont créées ici, pas dans `init-db.js`. Pour ajouter une colonne ou une table : ajouter la requête dans ce bloc, puis déployer.

### Notifications
- **Push web** : Web Push (VAPID) via `lib/pushHelper.js` (`sendToSubscriptions` : lots de 50 en parallèle, timeout 10 s, abonnements 410/404 supprimés), service worker `public/sw.js`. VAPID est configuré une seule fois dans `pushHelper.js` : les routes et jobs passent par ses fonctions
- **Push natif** (`dhomebarber-api/lib/nativePush.js`, ajouté le 5 sept. 2026, release v74) : token enregistré via `subscribe-native` (endpoint `native://<platform>/<token>`), déclenché par `src/lib/pushNotifications.js` sur iOS/Android. `sendToSubscriptions` route désormais ces endpoints vers **APNs** (iOS, le jeton de `@capacitor/push-notifications` est un jeton APNs brut) et **FCM HTTP v1** (Android). Aucune dépendance npm ajoutée : `node:http2`, `node:crypto` et `fetch` suffisent.
  - APNs : JWT ES256 signé avec la clé `.p8`, mis en cache 40 min (Apple refuse un rafraîchissement plus fréquent que 20 min et un jeton de plus d'1 h), une session HTTP/2 par lot, en-têtes `apns-topic` = bundle id et `apns-push-type: alert`. Un `410`, `Unregistered` ou `BadDeviceToken` supprime l'abonnement
  - FCM : JWT RS256 du compte de service échangé contre un jeton OAuth mis en cache jusqu'à expiration, envoi par lots de 50 en parallèle. Un `404`, `UNREGISTERED` ou `INVALID_ARGUMENT` supprime l'abonnement
  - **Android : activé le 5 sept. 2026** (Heroku v83). Compte de service dédié `fcm-sender@d-home-barber.iam.gserviceaccount.com`, avec le seul rôle *Administrateur de l'API Firebase Cloud Messaging* — il ne peut rien faire d'autre dans le projet. Clé posée en `FCM_SERVICE_ACCOUNT` (copie locale hors git : `~/.fcm-key/dhomebarber-fcm.json`, chmod 600). Vérifié avant déploiement : l'échange OAuth aboutit et FCM traite la requête (un faux jeton revient en `UNREGISTERED`, pas en 401). **Aucun appareil Android n'est encore abonné** : la réception réelle reste à confirmer avec un téléphone sur lequel l'app est installée et les notifications acceptées
  - **Variables à poser sur Heroku pour l'activer** — iOS : `APNS_KEY_P8` (contenu de la clé, les `\n` littéraux sont acceptés), `APNS_KEY_ID`, `APNS_TEAM_ID` (`3NXH4CTJM3`), `APNS_BUNDLE_ID` (`fr.dhomebarber.app`), optionnel `APNS_ENV=sandbox` pour tester en développement ; Android : `FCM_SERVICE_ACCOUNT` (le JSON du compte de service sur une ligne) ou `FCM_PROJECT_ID` + `FCM_CLIENT_EMAIL` + `FCM_PRIVATE_KEY`. **Sans ces variables le comportement est strictement identique à avant** : les endpoints natifs sont comptés dans `skippedNative`, rien n'est envoyé. La clé APNs se crée dans Apple Developer → Certificates, Identifiers & Profiles → Keys (type *Apple Push Notifications service*) ; elle n'a rien à voir avec la clé App Store Connect K79WY8DX6N
  - `isConfigured()` de `pushHelper` est vrai dès qu'**un** transport est disponible (VAPID, APNs ou FCM), ce qui débloque les jobs même sans VAPID
- **Email** : Nodemailer SMTP (`lib/emailHelper.js`), silencieux si `SMTP_*` absents (`isConfigured`). Envoyé à l'inscription, création/rappel/annulation de RDV, commande, demande/devis/acceptation/refus d'événement, demande d'avis, anniversaire

### Jobs automatiques (node-cron)
- **appointmentReminder** : toutes les 30 min, rappel des RDV à venir (push + email), flag `reminder_sent`
- **reviewReminder** : toutes les 30 min, demande d'avis après prestation terminée, flag `review_reminder_sent`
- **birthdayReminder** : tous les jours à 8h, push + email aux clients dont c'est l'anniversaire
- **mediaCleanup** (déployé le 5 sept. 2026, release v81) : tous les dimanches à 3h30 heure de Paris, supprime les images de la table `media` que plus aucune colonne ne cite (délai de grâce de 7 jours). Voir `jobs/mediaCleanup.js` et `cleanup-media.js`
- **comebackReminder** (déployé le 3 sept. 2026, release v68) : tous les jours à 10h heure de Paris, relance « Ça fait N semaines, on te refait ça ? » (push `sendPushToEmail` + email `sendComebackReminder`, lien `/booking?barber=<employee_id>`) aux clients `role = user` dont le dernier RDV `completed` date de plus de `salon_settings.comeback_weeks` semaines (défaut 5, modifiable par l'admin via `SalonSettings.update`) et qui n'ont aucun RDV `confirmed` à venir. Une seule relance par visite : flag `appointments.comeback_reminder_sent` sur ce dernier RDV. Une requête SQL (CTE `DISTINCT ON`), rattrapage au démarrage entre 10h et 12h. Test : `heroku run "node jobs/comebackReminder.js --dry-run" --app dhomebarber-api` (l'argument doit être entre guillemets, sinon la CLI Heroku avale `--dry-run`). Le tutoiement est voulu (ton du push)

### Agenda - Modal de détail RDV
- Le champ pourboire utilise un **input non contrôlé** (ref + defaultValue) pour éviter les problèmes de re-render
- Le bouton "Valider la prestation" sauvegarde : payment_method, tip, tip_method, product_sold, product_price, grand_total, status='completed'
- Après validation : invalidation des queries `appointments`, `agendaAppointments`, `adminAppointments`
- Vue MonthView disponible en plus de DayView et WeekView

### Dashboard
- Les encaissements CB/Espèces sont **séparés des pourboires**
- Les pourboires ont leur propre section avec CB/Espèces (via tip_method)
- Le CA utilise `grand_total || total_price` pour le total
- Compteur d'utilisateurs connectés en direct via WebSocket

### Profil barber
- La vidéo de présentation est stockée **dans `employees.bio`** après le marqueur `\n%%VIDEO%%url` (pas dans working_hours). Ne pas écraser la bio sans préserver ce suffixe.
- Comparer les ids employé en string (`String(a) === String(b)`) : mélange UUID / number selon la source
- **Photos des barbers : format portrait 1748 × 2480** (ratio A4, buste centré, fond sombre, référence « KVB APP »). Les constantes sont dans `src/lib/barberPhoto.js` (`BARBER_PHOTO_ASPECT` pour le CSS, `BARBER_PHOTO_RATIO` pour le recadrage, `BARBER_PHOTO_BG`). Le recadrage à l'upload (Équipe admin, Mes paramètres) force ce ratio (`ImageCropDialog` prop `aspect`, forme `rect`, côté max 2480 px) et tous les affichages (carrousel accueil, cartes de réservation, profil public sans vidéo, admin) utilisent le même cadre. Ne pas réintroduire de vignette carrée / ronde pour un barber ; les avatars clients restent ronds.

### Animations « signature » (ajoutées le 3 sept. 2026)
Règle commune : n'animer que `transform` et `opacity`, respecter `useReducedMotion` / `prefers-reduced-motion`, retour haptique via `hapticFeedback` sur les actions clés.
- **Transition partagée carrousel → profil** : la photo du barber « vole » de la vignette de l'accueil vers la photo de la carte FUT. Mécanisme (`BarberMarquee` dans `Home.jsx`) : à la pression d'une vignette (`onPointerDown`), on monte un **fantôme invisible** en `position: fixed` sur le rectangle de la vignette, porteur du `layoutId` `barberPhotoLayoutId(id)` (exporté par `BarberCard.jsx`) ; la photo de la carte porte le même `layoutId` et démarre depuis ce rectangle. Ne pas mettre le `layoutId` sur les vignettes elles-mêmes : framer-motion n'enregistre un `layoutId` qu'au montage, et les clones du carrousel partageraient l'id (masqués). Ne pas remonter la vignette pressée (le clic serait perdu)
- **Carte FUT** (`BarberCard.jsx`) : chiffres qui montent de 0 à leur valeur (`CountUp`, écrit dans le DOM via `animate`, en cascade), reflet holographique qui balaie la carte à l'arrivée, inclinaison 3D et reflet qui suivent le pointeur (`useMotionValue` + `useSpring`, remis à zéro au relâchement). **Double tap = retournement** (rotation 3D à ressort, deux faces avec `backface-visibility: hidden`) : le dos (`CardBack`) affiche la description du barber (prop `bio`, passée par `BarberProfile` = bio sans le marqueur vidéo). Détection maison sur `pointerup` (deux taps < 320 ms, déplacement < 12 px) + `touch-action: manipulation` contre le zoom iOS. La bio n'est donc plus dans le bloc « À propos » du profil (expérience et compétences seulement)
- **Barre du bas** (`BottomNav.jsx`) : indicateur actif partagé (`layoutId="nav-active"`) qui glisse d'un onglet à l'autre, icône qui rebondit, anneau lumineux qui orbite autour du bouton Réserver (`.nav-orbit`, dégradé conique en rotation)
- **Réservation** (`Booking.jsx`) : étapes qui glissent dans le sens de la navigation (`AnimatePresence mode="popLayout"`, variants avec `direction`), halo d'étape qui glisse (`layoutId="step-halo"`), coches à ressort et lignes qui se remplissent, prestations / dates / créneaux en cascade, **récapitulatif** sous les étapes (chips + prix qui compte, `AnimatedNumber`) avant la confirmation, **créneau choisi qui se loge dans le résumé** (`layoutId` `slot-HH:MM` partagé entre le bouton et le résumé), pendant l'envoi le bouton affiche « Confirmation... » (pas d'écran de chargement, retiré à la demande), puis écran de succès (`SuccessOverlay`, exporté) : flash et deux ondes de choc, coche dont le trait se dessine (`pathLength`) dans un disque entouré d'un anneau gradué qui tourne, **pluie de 30 lames de rasoir acier** (`BladeBurst`, éclatement radial en trois vagues, culbute 3D `rotateX` + rotation, retombée, fondu), titre, barber, chip date · heure (prop `detail`), barre de progression ; `SUCCESS_DURATION` = 4,2 s avant la redirection vers Mes rendez-vous. Choix validé par le client : lames de rasoir en guise de confettis, version soignée (la scène de coupe a été retirée)
- **Feed** (`Feed.jsx`) : explosion d'emojis à la réaction (`EmojiBurst`), emoji choisi qui pop, double tap sur la photo = ❤️ avec gros cœur

### Accueil : mise en page du haut de page, identique sur toutes les tailles d'écran (règles, 3 sept. 2026)
- Hero : **deux lignes fixes** sous « Premium BarberShop » (note + Douvaine, puis pastille Ouvert / Fermé), jamais de `flex-wrap` qui replierait différemment selon la largeur
- Le bouton musique est **dans la rangée des réseaux sociaux** du hero ; le `MusicToggle` flottant global (App.jsx, désormais dans le `Router`) rend `null` sur `/`
- Les contrôles admin « Organiser l'accueil » / « Sauvegarder » / « Annuler » sont **dans le flux**, au-dessus des sections (collés en haut en mode édition). **Plus jamais de bouton flottant sur l'accueil** : il chevauchait les cartes d'information sur les grands iPhone
- Bloc « Comme la dernière fois » : prestations sur deux lignes max (`line-clamp-2`), date courte (`EEE d MMM`), aucun `truncate`
- Vérification attendue avant tout changement du hero : captures à 320, 375 et 430 px

### Fonctions client ajoutées le 3 sept. 2026 (lot multi-agents)
- **Accueil, « Comme la dernière fois »** (`components/home/RebookCard.jsx`) : dernier RDV du client non annulé (`Appointment.filter({ client_email })`, tri date + heure), photo du barber, prestations, date de la dernière visite, prix / durée **actuels** des prestations encore actives, bouton vers `/booking?barber=<id>&services=<ids>` (Booking pré-sélectionne les deux). Bloc fixe sous le hero, hors `homepage_order`, rien sans RDV
- **Accueil, pastille Ouvert / Fermé** (`components/home/OpenStatusBadge.jsx`) : `computeOpenStatus(opening_hours)` à l'heure de Paris (`Intl`), états open / soon / closed avec prochain jour ouvert, recalcul chaque minute et au retour au premier plan
- **Carte de fidélité** : livrée puis **retirée le 3 sept. 2026 à la demande du client** (commit 815d581 contient la version si besoin : `components/shared/LoyaltyCard.jsx`, 10 tampons calculés depuis les RDV `completed`). Ne pas la réintroduire sans demande
- **Ajouter au calendrier** (`lib/calendarLinks.js`) : `buildAppointmentEvent`, `buildGoogleCalendarUrl` (`ctz=Europe/Paris`), `buildIcs` (VTIMEZONE, CRLF, pliage 75 octets, UID `appointment-<id>@dhomebarber.fr` stable), `openCalendar('google' | 'ics')` (natif : `openExternalUrl` ; le `.ics` en natif passe par une URL `data:`, meilleur effort, la voie robuste serait `@capacitor/filesystem` + `@capacitor/share`). Boutons sur l'écran de succès de la réservation (prop `calendarEvent` de `SuccessOverlay`) et dans Mes rendez-vous (RDV à venir)
- **Réservation, « Peu importe »** (`Booking.jsx`) : carte `AnyBarberCard` en tête de l'étape 2, état `anyBarber` ; à l'étape 3 les RDV du jour sont chargés pour tous les barbers (`filter({ date, status })` sans `employee_id`, autorisé par la politique de lecture) et `computeSlots` (fonction pure) donne l'union des créneaux, nom du premier barber dispo (ordre `sort_order`) sous chaque heure ; le tap fixe `selectedEmployee`. Le paramètre d'URL `barber` saute toujours l'étape 2
- **Boutique** (`Shop.jsx`) : à l'ajout, un clone de l'image vole en arc vers le bouton panier (`position: fixed`, 0,7 s), rebond du bouton et pop du compteur via une motion value, haptique ; plusieurs ajouts = plusieurs clones
- **Carte FUT, gyroscope** (`BarberCard.jsx` + `lib/motion.js`) : `deviceorientation` → mêmes motion values que le pointeur (gamma → rotateY ± 18°, beta − 40 → rotateX ± 14°), pointeur prioritaire 300 ms. **Autorisation gérée au niveau de l'app** : `armMotionPermissionOnFirstGesture()` dans `main.jsx` demande `DeviceOrientationEvent.requestPermission()` au premier geste valide n'importe où dans l'app (touchend / pointerup / click / keydown, Safari ne compte pas `pointerdown`), résultat mémorisé en `localStorage` (`dhb-motion-permission`) et diffusé aux cartes via `onMotionPermission`. Sans `requestPermission` (Android, web), actif d'emblée. Impossible d'activer sans aucun geste sur iOS : c'est une règle de Safari / WKWebView
- **Tailwind** : `theme.extend.opacity` ajoute 2, 3, 4, 6, 8, 12 car le code utilise `bg-white/4`, `border-white/8`… que Tailwind 3.4 ignorait silencieusement (fonds et bordures très légers absents du CSS compilé jusqu'ici)

### Essayage couleur « Nouvelle tête » (`src/pages/TryOn.jsx`, `src/lib/hairColor.js`, `src/lib/hairGl.js`, `src/lib/hairUltra.js`)
Deux modes. **FAST** = aperçu temps réel sur l'appareil ; **AI ULTRA** = traitement final haute qualité côté serveur (`dhomebarber-api/lib/hairUltra.js`), visible seulement si `features.hairUltra` des paramètres publics est vrai (clé `FAL_KEY` sur Heroku).
- **Détection (FAST), tout sur l'appareil** : deux modèles MediaPipe (`@mediapipe/tasks-vision`, épinglé ; WASM chargé depuis jsDelivr **à la même version** que le paquet, constante `TASKS_VISION_VERSION` ; modèles depuis `storage.googleapis.com`) : `hair_segmenter` (masque cheveux) et `face_landmarker` (478 points). **Barbe** : zone tracée par les points du visage (`JAW`, `BEARD_TOP`, lèvres `LIPS` exclues, bords floutés) puis pixels plus sombres que la peau (`SKIN_POINTS`) et peu saturés ; retirée du masque cheveux (`subtractZone`). **Racines** : `computeRootsAlpha` = bande des cheveux le long de l'ovale du visage dilaté. Analyse en 360 px (`PROC_WIDTH`), masques → alpha avec rampe douce et lissage temporel
- **Rendu FAST, shader WebGL en Oklab** (`createHairRenderer`) : clarté d'origine conservée, sa moyenne (`meanLuminance`, clarté Oklab) déplacée vers celle de la cible selon le ton (`TONES` : light 0,9 / dark 0,8 / natural 0,65 / vivid 0,5 ; barbe × 0,8, × 0,55 pour les tons clairs), écarts conservés (`contrast`), chroma de la cible modulé par la clarté et la mèche, reflets gardés. Réglages : intensité, saturation (× 0,4 à 1,6), luminosité (± 0,25), racines (assombrit et désature la bande racine), cheveux gris (pixels peu saturés plus clairs que la masse ramenés vers elle). Couleur personnalisée : `makeColor({ hex })` (ton déduit de la clarté / du chroma Oklab). Avant / après : maintien sur l'image (original) ou curseur (`uSplit`, côté écran même en miroir). **Pas de `UNPACK_FLIP_Y_WEBGL`** (ignoré pour les ImageBitmap) : orientation gérée dans le vertex shader. Repli canvas 2D (`renderHairColor2D`) sans WebGL
- **Modes d'entrée** : caméra frontale (flux en miroir, capture remise à l'endroit + image brute conservée pour ULTRA) et photo (EXIF via `createImageBitmap`, une analyse puis rendu à chaque réglage). Repli photo si caméra refusée / absente. Partage `navigator.share` sinon téléchargement (web) ou consigne « maintenez l'image » (natif). « Réserver une coloration » → `/booking?services=<colo / mèche / décolo / blond>`
- **AI ULTRA** (`lib/hairUltra.js` côté client → `POST /api/apps/:appId/ai/hair-ultra`, auth, 12 appels / heure / compte, image JPEG ≤ 6 Mo en data URL, côté max 1536 px) : pipeline serveur sur fal.ai = SAM 3 (`fal-ai/sam-3/image`, prompts « hair », « beard », « mustache », 0,005 $ chacun) → union des masques, bords adoucis → FLUX.1 Kontext [pro] (`fal-ai/flux-pro/kontext`, 0,04 $, modèle modifiable via `HAIR_ULTRA_EDIT_MODEL`) avec consigne « ne changer que la couleur » → **fusion gardée par le masque** : hors masque, pixel d'origine au bit près ; dans le masque, basses fréquences du rendu (la couleur) + hautes fréquences de l'original (chaque poil, `sigma = w / 500`). Rien n'est stocké. Coût ≈ 0,06 $ / photo, ~20 s. Sans `FAL_KEY` : 503 `not_configured`, bouton masqué côté client. Le client affiche le résultat avec le curseur avant / après (deux images superposées, `clip-path`)
- **Natif** : `NSCameraUsageDescription` (iOS) et `android.permission.CAMERA` déclarés localement (dossiers hors git). `getUserMedia` exige un contexte sécurisé
- Entrée : depuis le 4 sept. 2026 la section « Nouvelle tête » de l'accueil (`try-on` dans `DEFAULT_SECTION_ORDER`, libellé « Filtres Snap ») ouvre `/snap` ; l'essayage couleur IA reste accessible par le lien en bas de la page Filtres Snap
- Tests : harnais Chrome headless avec `--use-angle=swiftshader --enable-unsafe-swiftshader` (WebGL logiciel ; avec `--disable-gpu` l'analyse échoue), mode photo avec les portraits des barbers (Romain / Kevin : cheveux + barbe ; Dom : casquette, barbe seulement) ; backend : `runHairUltra` testé avec un faux fal.ai (masque ellipse, édition teintée) pour vérifier la fusion

### Filtres Snap, Camera Kit (`src/pages/SnapLenses.jsx`, `src/lib/snapLenses.js`, ajouté le 4 sept. 2026)
- **Technologie** : Camera Kit, le SDK officiel de Snap pour intégrer de vraies lentilles Snapchat dans une app tierce (`@snap/camera-kit`, chargé à la demande sur `/snap`, route lazy). Les lentilles se créent dans **Lens Studio** (modèles « Hair Color », « Hair Simulation » avec coupes et barbes 3D, « Segmentation ») et se publient dans le **groupe de lentilles** de l'app Camera Kit du salon : l'app les liste (`lensRepository.loadLensGroups([groupId])`, icône `iconUrl`, `name`) et les applique sur la caméra frontale (`createMediaStreamSource` avec `Transform2D.MirrorX`, `session.applyLens`). Ajouter un filtre = publier une lentille, aucun code
- **Interrupteur (ajouté le 5 sept. 2026, backend v82, frontend 4ccbcf0)** : les filtres n'apparaissent que si Camera Kit est configuré côté serveur **et** si l'admin les a allumés dans Paramètres du salon → section « Fonctionnalités » (`salon_settings.snap_lenses_enabled`, **éteint par défaut**). Tant que c'est éteint, `features.snapLenses` est faux, le jeton Camera Kit n'est pas exposé, la carte « Nouvelle tête » disparaît de l'accueil (`Home.jsx`, cas `try-on` — elle reste visible en mode édition pour que l'admin la positionne) et la caméra n'est jamais demandée. Allumer les filtres le jour où les lentilles produisent enfin un effet ne demande donc **ni build ni revue Apple**. Les paramètres publics sont mis en cache 30 s côté serveur, vidé dès qu'un admin enregistre les paramètres
- **Configuration** : variables Heroku `SNAP_CAMERA_KIT_API_TOKEN` (jeton d'API client Camera Kit, public par nature) et `SNAP_LENS_GROUP_ID`, exposées par `routes/public.js` (`snap: { apiToken, lensGroupId }`, `features.snapLenses`). Sans elles : page « Filtres Snap bientôt disponibles », bouton masqué dans « Nouvelle tête ». Le jeton de **staging** sert au développement, celui de **production** exige la validation de l'app par Snap dans le portail Camera Kit
- **Lentille du salon « DHB Couleur »** (publiée le 4 sept. 2026) : projet Lens Studio dans `~/Documents/DHB Lenses/HairColor/` (hors git). Contenu : composant officiel « Hair Color » de la bibliothèque d'assets (segmentation cheveux + recoloration, `Packages/Hair Color.lsc`) et `Assets/Scripts/DhbHairColorLauncher.js`, qui lit les paramètres de lancement Camera Kit (`global.launchParams` : `color` hex, `color2` hex optionnel, `mode` full/ends/roots, `gradient` ombre/split) et pilote le composant. Une seule lentille sert donc les 16 couleurs de la palette. Identifiants : lentille `d7dd254c-7188-4dde-87fb-572a85a3c501`, dossier de lentilles « Hair Color » `137a6b8e-f41f-4dde-873d-149ca0fa8dc3`, groupe Camera Kit « D'Home Barber » `7c603de2-5d64-4d22-84e7-6dcfe63f2621` (Heroku v72). Visibilité « Do not publish to Snapchat » : utilisable dans l'app, absente de Snapchat
- **Barbe fusionnée dans « DHB Couleur »** (4 sept. 2026, après-midi) : les quatre styles de barbe ont été ajoutés au projet `~/Documents/DHB Lenses/HairColor/` pour tenir dans une seule lentille (le compte n'en accepte plus d'autre, voir blocage ci-dessous). `Assets/Scripts/DhbHairColorLauncher.js` est maintenant sur son propre objet « DHB Couleur » avec l'objet Hair Color en entrée : **sans paramètre `color`, il désactive la recoloration**, ce qui permet de choisir une barbe sans teindre les cheveux. `DhbBeardLauncher.js` fait de même avec le style `none`. Testé dans l'aperçu : sans paramètre, aucun effet ; couleur seule, barbe seule et les deux ensemble fonctionnent. **Publication en attente** (voir blocage). Version autonome conservée dans `~/Documents/DHB Lenses/beard-build/HairColor/` (le dossier porte ce nom exprès : Snap semble dériver le nom du dossier de lentilles de celui du projet, et le compte de staging refuse d'en créer un second). Quatre styles dans une seule lentille, choisis par `launchParams.style` : `full` (composant « Beard Additions », barbe densifiée par SnapML), `light` (paquet 3D « Light Mustache and Beard », couleur du matériau assombrie à 0.13/0.10/0.08 sinon la barbe sort blanche), `mustache` (paquet « Mustache »), `shaved` (« Beard Removal », efface la barbe par SnapML). `Assets/Scripts/DhbBeardLauncher.js` active un seul objet à la fois. **Les deux paquets SnapML rendent dans leur propre cible** : après installation, remettre `renderTarget` de leur `Orthographic Camera` sur `Render Target.renderTarget` de la scène, sinon l'effet est invisible. Côté app, `SNAP_BEARD_STYLES` affiche déjà les quatre pastilles dès que la lentille est dans le groupe
- **Blocage connu de la publication** (depuis le 4 sept. 2026, 03h12) : plus aucune soumission n'est enregistrée par Snap. Lens Studio remonte `success`, mais rien n'apparaît dans My Lenses et le quota reste figé à 18. Vérifié : ce n'est ni la taille, ni SnapML (une version allégée échoue pareil), ni le nom du dossier de projet (test avec un dossier renommé `HairColor`), ni le fait que la lentille soit nouvelle (une mise à jour du document déjà publié `f3d524c5` échoue aussi). La création d'un second dossier de lentilles échoue également dans le portail. Reste : limite côté compte Camera Kit en staging, à lever avec le passage en production. Dès que Snap réaccepte, un seul clic sur `Publish` depuis `~/Documents/DHB Lenses/HairColor/` livre couleur et barbe
- **Publier une nouvelle version** : ouvrir le projet dans Lens Studio, bouton `Publish`. Trois obligations sinon le statut passe à `Invalid` dans My Lenses : nom de lentille ≤ 18 caractères, **icône exactement 320 × 320 px** (`lens-icon-320.png`, redimensionné depuis `public/logo.png`) et vidéo d'aperçu (`preview.mp4`). La validation par Snap prend une dizaine de minutes (`Processing` → `Available`). Lens Studio expose un serveur MCP local (`http://localhost:50040/mcp`, jeton dans `<projet>/.mcp.json`) avec `ExecuteEditorCode`, `VirtualScene`, `PreviewPanelTool`, `RunAndCollectLogsTool` : c'est la voie fiable pour scripter l'éditeur, l'interface Qt étant mal exposée à l'accessibilité macOS
- **Comptes Snap créés le 4 sept. 2026** (compte Snapchat `devnova33`, Anthony Saldi) : organisation Business Manager « D'Home Barber » `e4862ccf-d44b-4b39-a9e8-cdba88fafe34`, app Snap Kit « D'Home Barber » (Web) `d1e96176-c662-4cb8-8b06-eb91e6e54873` (portail : kit.snapchat.com/manage), Camera Kit activé en **staging** sur « Initial Version » (portail : my-lenses.snapchat.com → Camera Kit → Apps). **État vérifié le 4 sept. 2026** (SDK Camera Kit exécuté dans Chrome headless contre l'API) : jeton de staging (claims `sub` = app `d1e96176-…~STAGING~…`) et `SNAP_LENS_GROUP_ID` = `7c603de2-5d64-4d22-84e7-6dcfe63f2621`, qui contient **une seule lentille** : « DHB Couleur » (`d7dd254c-7188-4dde-87fb-572a85a3c501`), icône et aperçu présents, **`vendorData` vide**, et la lentille **ignore les paramètres de lancement** (vérifié par le client : les 16 pastilles donnaient toutes la même teinte). D'où le contrat retenu le 4 sept. 2026 : la palette n'est déployée que si la lentille **déclare** `dhb` = `hair-color` / `beard` / `hair-color+beard` (Project Info → Vendor Data dans Lens Studio) — plus aucune reconnaissance par le nom, qui promettait des réglages que la lentille n'honorait pas. Sans vendor data : une seule vignette, la lentille avec sa couleur d'origine. Il reste à ajouter le script de lecture des launch params dans la lentille (étape 3 de `docs/lens-studio-couleur-cheveux.md`) **puis** à poser la vendor data. **La lentille « DHB Couleur » est un projet vide** : l'aperçu généré par Snap lui-même montre le mannequin de test avec
  ses cheveux d'origine, et le client confirme qu'aucun effet n'apparaît. Elle est à refaire dans Lens Studio.
  Le groupe de démonstration de Snap `39ed26d4-1931-4d21-98c2-eb2e29b76f6f` **ne renvoie plus aucune lentille** (0 sur 23) :
  il n'est plus rattaché à l'app dans le portail Camera Kit → Apps → Lens Groups. `/snap` n'a donc, au 4 sept. 2026,
  aucun filtre qui fonctionne. Deux issues, toutes deux dans les outils de Snap : republier une vraie lentille dans le
  groupe du salon, ou rattacher à nouveau le groupe de démonstration.
  Depuis Heroku v73, `SNAP_LENS_GROUP_ID` accepte **plusieurs groupes séparés par des virgules** (`loadLensGroups` en prend
  une liste, et chaque lentille porte son `groupId`, donc le filtrage des démos reste juste) : les deux groupes y sont déjà,
  ce qui rendra les filtres visibles dès que l'un des deux redeviendra disponible, sans redéploiement. Pour les lentilles du salon : créer un groupe dans Lens Scheduler, y publier depuis Lens Studio, puis `heroku config:set SNAP_LENS_GROUP_ID=<id>` — pas à pas complet dans `docs/lens-studio-couleur-cheveux.md` (modèle « Hair Color », script de lecture des launch params, vendor data `dhb=hair-color`, publication). **Impossible d'importer une lentille publique de Snapchat** : Camera Kit ne sert que les lentilles publiées par l'organisation. Pour la production : soumettre l'app à Snap, puis remplacer le jeton par celui de production
- **Passage en production Snap (revue)** : **soumis le 4 sept. 2026 à 18h55**, statut de « Initial Version » passé de
  `In Development` à **`In Review`** (mutation `submitAppVersionForReview` acceptée). Contenu envoyé : icône 1024 × 1024
  (163 Ko — la limite du portail est **400 Ko**, le `public/logo.png` d'origine de 1,4 Mo était refusé), nom, catégorie
  *Lifestyle*, description, `https://dhomebarber.fr/privacy.html`, la vidéo de démonstration courte, et un texte
  *How does your integration work?* de 1 744 caractères qui décrit le SDK, l'écran de CGU Camera Kit avec son timecode et
  les cinq étapes de test avec le compte client dédié `snap.review@dhomebarber.fr` (créé le 4 sept. 2026 ; **indispensable**,
  `/snap` est derrière `RequireAuth`, sans compte le reviewer n'atteint jamais les filtres — ne pas le supprimer avant la
  fin de la revue ; mot de passe dans `~/Downloads/snap-review-dossier.md`, hors git). Deux pièges rencontrés : la
  soumission est refusée tant qu'aucune **origine de confiance** n'est déclarée (Setup → *Platform Identifiers*), et le
  champ n'accepte **pas** une URL — il faut le domaine nu `dhomebarber.fr` (`https://dhomebarber.fr` renvoie
  `BAD_USER_INPUT`) ; l'origine est déclarée pour `STAGING` et `PROD`. Le **jeton d'API de production existe déjà** dans le
  portail (créé le 3 sept. 2026, tableau *API Tokens*) mais *Production Version* affiche « No Approved Versions » : il ne
  servira probablement les lentilles qu'après approbation, à tester puis
  `heroku config:set SNAP_CAMERA_KIT_API_TOKEN=<jeton prod>`. Deux pièces décisives : une **politique de confidentialité
  publique** (`public/privacy.html`, section 6 « Caméra, filtres et essayage virtuel » ajoutée le 4 sept. 2026) et une ou
  plusieurs **vidéos de démonstration** montrant le parcours jusqu'aux filtres, la caméra en action, l'après-capture et
  **l'affichage et l'acceptation des CGU Camera Kit**. Délai annoncé : 1 à 2 jours ouvrés.
  Le SDK embarque bien un dialogue de CGU (`legal/legalPrompt.js`) mais la configuration distante de Snap le **désactive** :
  vérifié le 4 sept. 2026, une lentille s'applique sans que rien ne s'affiche. D'où l'écran d'acceptation maison de
  `SnapLenses.jsx` (statut `consent`, mémorisé sous `dhb-snap-tos-v1`, liens `snap.com/terms`,
  `values.snap.com/privacy/privacy-policy`, `support.snapchat.com/article/camera-information-use` — ceux du SDK) :
  **aucune caméra ni SDK ne démarre avant l'acceptation**. Ne pas le retirer, c'est une exigence de la revue.
  **Vidéo de démonstration prête** (enregistrée sur iPhone le 4 sept. 2026, 16h04) : `~/Downloads/dhb-snap-camerakit-demo.mp4`
  (44 s, parcours complet depuis l'écran d'accueil iOS) et `~/Downloads/dhb-snap-camerakit-demo-court.mp4` (33 s, sans la
  partie connexion / tableau de bord admin) — H.264 884 × 1920, 30 fps, ~6 Mo, transcodées depuis le HEVC 60 fps que les
  portails refusent. Elles montrent dans l'ordre : accueil client → bloc « Filtres Snap » → écran d'acceptation des CGU
  Camera Kit (3 s à l'écran, trois liens visibles) → permission caméra iOS → « Chargement de Camera Kit » → caméra en direct
  avec le filigrane « Camera Kit Staging » et la lentille « DHB Couleur » appliquée → capture → « Reprendre / Partager » →
  « Réserver ce look » → réservation confirmée. Réserve : la lentille n'a **aucun effet visible** (vendor data absente,
  launch params ignorés, publication bloquée) et le sujet porte une casquette — à refilmer si Snap demande à voir l'effet.
- **Prérequis navigateur** : Safari 16+ (iOS 15+), Chrome 95+, WebGL, caméra (`snapSupported`). CSP si un jour ajoutée au frontend : `connect-src https://*.snapar.com`, `script-src https://cf-st.sc-cdn.net blob: 'wasm-unsafe-eval'`. Dans la WebView Capacitor iOS, `getUserMedia` fonctionne (iOS 14.3+) ; en cas de problème de performance, la voie officielle est le SDK natif iOS / Android via un plugin Capacitor, non fait
- **Styles de barbe** (`SNAP_BEARD_STYLES`) : même mécanique que la palette, quatre pastilles à emoji (barbe fournie, barbe de 3 jours, moustache, rasé de près) qui relancent la lentille avec `launchParams: { style }`. La lentille du salon portant les deux effets, `expandLenses` émet les barbes puis les teintes ; à l'ouverture c'est une teinte qui est appliquée
- **Palette de couleurs** (`SNAP_HAIR_COLORS` dans `SnapLenses.jsx`) : la lentille couleur du salon est reconnue par sa donnée fournisseur `dhb = hair-color` ou par son nom (`/^dhb\s*couleur/i`), puis déployée en une pastille par teinte (16 : platine, doré, miel, châtain clair, châtain, brun, noir, cuivré, auburn, argent, blanc, bleu nuit, violet, rose, cerise, émeraude). Chaque pastille applique la **même** lentille avec `applyLens(lens, { launchParams: { color, mode } })` ; la pastille affiche la couleur au lieu de l'icône. Ajouter une teinte = une ligne dans ce tableau, aucune republication de lentille
- Page : caméra pleine hauteur (rendu 720 × 960), carrousel des lentilles du groupe (pastille « Sans filtre » en tête, lentilles cheveux / barbe / couleur `RELEVANT` d'abord et appliquées d'office, jamais une autre : les démos de Snap recouvrent la caméra de leur interface), capture (`canvas.toDataURL`), partage, « Réserver ce look », lien vers l'essayage couleur IA. Sur le groupe de démonstration de Snap (`SNAP_DEMO_GROUP`), seules « Hair Color », « Face Expressions » et « Distort » sont affichées (`DEMO_KEEP`) ; un groupe du salon est affiché en entier. Erreurs du SDK (`LensExecutionError`) affichées sans casser la session. Filigrane « Camera Kit Staging » normal avec le jeton de staging

### Profil barber : navigation entre barbers (`src/pages/BarberProfile.jsx`)
- La page charge la liste des barbers actifs avec la **même requête et la même clé de cache que l'accueil** (`['employees']`, filtre `is_active`, tri `sort_order`) et retrouve le barber courant par son id (comparaison en string)
- Le contenu du profil (`BarberProfileContent`) est rendu dans un `motion.div` glissable (`drag="x"`, contraintes 0 / 0, élasticité 0,3) sous `AnimatePresence mode="popLayout"`, clé = id du barber. Swipe gauche = suivant, droite = précédent, en boucle ; seuils `SWIPE_OFFSET` 60 px ou `SWIPE_VELOCITY` 450 px/s, sinon retour élastique. Flèches ← / → du clavier, boutons « ‹ précédent / suivant › » et points de pagination font la même chose
- Le changement passe par `navigate('/barber/:id', { replace: true })` : le bouton retour ramène toujours à l'accueil. `ScrollToTop` (App.jsx) remet la page en haut à chaque changement, et l'animation d'entrée / sortie suit le sens (`direction` 1 / -1). Retour haptique via `hapticFeedback`

### Carte barber style FUT (`src/components/shared/BarberCard.jsx`)
- Affichée en tête du profil public `/barber/:id` (référence : carte FIFA « Team of the Season », bleu / or, liseré néon). Carte fixe 300 × 470 px, forme découpée en `clip-path`, police `Barlow Condensed` (classe `.font-fut`, importée dans `index.css`)
- Contenu : note globale, `title` du barber (ex. KVB), logo du salon, photo (fondu radial : le fond sombre de la photo se fond dans la carte, d'où l'importance du format portrait fond sombre), bandeau nom, six stats
- Stats = compétences du barber (`employees.skills`, niveau 0-5 par `SkillCategory`) converties : 1→68, 2→76, 3→84, 4→92, 5→99 ; non évaluée → « – ». Abréviations 3 lettres (`skillAbbr` : CIS, BAR, AFR, DES, COL, TAP, sinon 3 premières lettres). Au-delà de 6 catégories, on garde les 6 mieux notées
- Note globale = moyenne arrondie des stats renseignées (`overallRating`), « – » si aucune. Ne dépend pas de `experience_level`

### Accueil : incitations au clic et parallaxe (`src/pages/Home.jsx`, `src/index.css`)
- **Boutons Réserver de l'accueil** (hero et section Réservation) : même **anneau lumineux orbital** que le bouton central de la barre du bas (classe `.orbit-wrap` sur le `<Link>`, pseudo-élément conique en rotation, bouton en `rounded-[14px]` à l'intérieur, ombre portée sur le conteneur). **Pulsations** : `.pulse-cta` (respiration + double anneau vert, utilisée sur le bouton « Confirmer le rendez-vous » de la réservation) et `.pulse-card` (bloc Carte Cadeau : halo vert) ; l'icône cadeau a `.gift-wiggle`. Ces classes sont posées sur le `<Link>` (`<a>`) qui enveloppe l'élément, **jamais sur l'élément `motion.*`** : une animation CSS sur `transform` écraserait le `whileTap` de framer-motion. **Fluidité** : n'animer que `transform` et `opacity` (ombres et halos statiques sur des pseudo-éléments, jamais de `box-shadow` animé), courbes sinusoïdales. Désactivées avec `prefers-reduced-motion`
- **Parallaxe sous le carrousel des barbers** (`BarberMarquee`) : nuances de vert et de bleu, **sans hachures** (demande explicite) : teinte fixe vert → bleu, halos verts flous à 20 % de la vitesse du carrousel, halos bleus à 40 %, plus un léger glissement vertical au défilement de la page (12 % / 22 %). Le déplacement horizontal est calculé modulo la période de chaque motif répété (`GREEN_PERIOD`, `BLUE_PERIOD`), donc sans couture. **Aucun bord net** (demande explicite) : le conteneur du décor est masqué en fondu sur les quatre côtés (`softMask`, deux dégradés combinés par `mask-composite: intersect`), donc ne jamais y remettre un rectangle ou une bande visible
- **Boucle du carrousel** : la liste des barbers est répétée `reps` fois (assez pour dépasser 600 px), et le rebouclage recule d'une **période mesurée sur le DOM** (`getPeriod` : largeur d'une série complète de cartes), pas de la moitié du `scrollWidth`. Avec 3 barbers actifs, l'ancienne logique ne bouclait jamais (fin de course < moitié). Le compteur de parallaxe neutralise ce saut (`syncParallax`)

### Infos du salon
- Adresse : Sur le côté gauche du bâtiment Odyssée, 3 Rue du Bois Arquet, 74140 Douvaine
- Téléphone : 06 66 08 36 05
- Barbers : Dom, Kevin, Denis, Romain, Sacha

## Commandes utiles

```bash
# Frontend - dev local
cd /Users/zoomproject/Downloads/puzzling-sharp-edge-book
npm run dev

# Frontend - push (auto-deploy Vercel)
git add -A && git commit -m "message" && git push

# Frontend - apps natives
npm run cap:sync        # build + sync iOS/Android
npm run cap:ios         # build + sync + ouvre Xcode
npm run cap:android     # build + sync + ouvre Android Studio

# Backend - deploy
cd /Users/zoomproject/Downloads/dhomebarber-api
git add -A && git commit -m "message" && git push heroku main

# Backend - logs
heroku logs --tail --app dhomebarber-api

# Backend - console DB
heroku pg:psql --app dhomebarber-api

# Backend - init DB (tables + indexes)
heroku run node init-db.js --app dhomebarber-api

# Vérifier que l'API répond
curl -s -o /dev/null -w "%{http_code}\n" https://dhomebarber-api-3aabb8313cb6.herokuapp.com/api/apps/public/prod/public-settings/by-id/prod
```
