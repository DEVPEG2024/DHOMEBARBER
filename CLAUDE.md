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
- Variables d'environnement attendues : `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, `SMTP_HOST` (défaut smtp.hostinger.com), `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

### Apps natives (Capacitor)
- Scripts : `npm run cap:sync` (build + sync), `npm run cap:ios`, `npm run cap:android` (build + sync + ouverture Xcode / Android Studio)
- Le build web (`dist/`) est copié dans les projets natifs par `cap sync` ; les apps chargent le bundle local, pas dhomebarber.fr
- Android : `android/dhomebarber-release.keystore` + `android/keystore.properties` servent à signer les releases Play Store. **Ils ne sont dans aucun git : à sauvegarder ailleurs, sans eux aucune mise à jour Play Store n'est possible.**
- Dernier état connu (2 septembre 2026) : Android 1.0.1 (versionCode 2), iOS 1.0 (build 5, soumis à la review Apple le 2 sept. 2026 au soir, reviewSubmission 50bedf7e-ee85-4050-82cc-a5a7fbeb5566, mise en ligne manuelle après approbation). Incrémenter `versionCode` / `CURRENT_PROJECT_VERSION` avant chaque envoi aux stores. Les builds natifs embarquent le bundle web : après une modification frontend, refaire `npm run cap:sync` puis un nouveau build store pour que les apps l'aient (le web dhomebarber.fr, lui, est à jour dès le push).
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
│   ├── app-params.js          # Paramètres app (appId, token, etc.)
│   ├── pushNotifications.js   # Service Worker push notifications (web)
│   ├── query-client.js        # React Query config
│   ├── utils.js               # Utilitaires (cn, etc.)
│   └── PageNotFound.jsx       # Page 404
├── components/
│   ├── agenda/                # DayView, WeekView, MonthView, AgendaToolbar, AppointmentDetailModal, BreakModal
│   ├── layout/                # ClientLayout, AdminLayout, BottomNav
│   ├── shared/                # ServiceCard, EmployeeCard, BarberCard (carte style FUT), StarRating, SectionHeader, ImageCropDialog, MusicToggle
│   ├── BackgroundMusic.jsx
│   ├── ErrorBoundary.jsx
│   ├── UserNotRegisteredError.jsx
│   └── ui/                    # Composants shadcn/ui (dialog, button, etc.)
├── pages/
│   ├── Home.jsx               # Page d'accueil (hero centré, logo, "Premium Barber Shop", bouton Réserver pulsant, carrousel barbers avec parallaxe, bloc Carte Cadeau pulsant). Ordre des sections lu depuis salon_settings.homepage_order (pas d'éditeur UI, modifier en DB)
│   ├── Booking.jsx            # Réservation en 4 étapes (étapes glissantes, récap animé, créneau qui se loge dans le résumé, écran de succès confettis)
│   ├── Services.jsx           # Liste des prestations
│   ├── Shop.jsx               # Boutique produits
│   ├── Orders.jsx             # Commandes client
│   ├── Appointments.jsx       # Mes rendez-vous (client)
│   ├── MyReviews.jsx          # Mes avis (client)
│   ├── BarberProfile.jsx      # Profil public d'un barber (/barber/:id) : carte style FUT (BarberCard, holographique, stats qui montent, transition partagée depuis l'accueil) + vidéo de présentation ; swipe gauche/droite (ou flèches, boutons, points) pour passer aux autres barbers sans quitter la page
│   ├── Feed.jsx               # Fil social "Ca dit quoi le Gang ?" (posts, réactions emoji, commentaires, menu Signaler / Bloquer, panneau admin des signalements) — aussi /admin/feed
│   ├── Events.jsx             # Privatisation du salon : demande d'événement, acceptation/refus du devis
│   ├── GiftCards.jsx          # Cartes cadeau : achat (code DHB + QR), affichage
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

Routes client : `/`, `/services`, `/booking`, `/shop`, `/appointments`, `/orders`, `/reviews`, `/settings`, `/notifications`, `/profile`, `/barber/:id`, `/feed`, `/events`, `/gift-cards`, `/login`.
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
├── lib/
│   ├── accessControl.js # Politique de lecture par rôle (applyReadPolicy), validation, identité du compte, code carte cadeau
│   ├── emailHelper.js # Nodemailer SMTP : bienvenue, confirmation/rappel/annulation RDV, commande, événements, avis, anniversaire
│   └── pushHelper.js  # sendPushToRole, sendPushToEmail, sendPushToEmployee, sendToSubscriptions (Web Push, lots de 50)
├── jobs/
│   ├── appointmentReminder.js  # Toutes les 30 min : rappel RDV (push + email)
│   ├── reviewReminder.js       # Toutes les 30 min : demande d'avis après prestation (review_reminder_sent)
│   └── birthdayReminder.js     # Tous les jours 8h : notif + email anniversaire (users.birth_date)
└── routes/
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
| Appointment | appointments | client_name, client_email, client_phone, employee_id, employee_name, date, start_time, end_time, services (JSONB), status, payment_method, tip, tip_method, product_sold, product_price, grand_total, deposit_amount, reminder_sent, review_reminder_sent, internal_notes, cancellation_reason |
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
| SalonSettings | salon_settings | salon_name, tagline, description, phone, email, address, city, opening_hours (JSONB), social_*, cancellation_hours, require_deposit, deposit_percentage, homepage_order (JSONB) |
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
- **UploadFile** → `POST /api/apps/:appId/integration-endpoints/Core/UploadFile`. Les images sont **compressées côté client avant l'envoi** (`src/lib/imageCompress.js` : côté ≤ 1280 px, JPEG, cible 400 Ko) car le serveur les stocke en base64 dans PostgreSQL et les renvoie inline dans chaque liste. Ne jamais appeler l'endpoint sans passer par `UploadFile`
- `appId` est fixé à `prod`
- **Cache React Query** (`src/lib/query-client.js`) : `staleTime` 60 s par défaut, 5 min sur les catalogues (Employee, Service, ServiceCategory, Product, SalonSettings, SkillCategory). Les listes admin complètes utilisent des clés préfixées (`['employees','all']`, `['products','all']`, `['services','all']`…) distinctes des listes client filtrées `is_active`, mais invalidées par le même préfixe. Le cache est vidé au login / à l'inscription (réponses différentes selon le rôle)

### Endpoints spécifiques (hors CRUD)
- `POST /auth/forgot-password` → envoie un code à 6 chiffres par email ; `POST /auth/reset-password` le vérifie
- `DELETE /auth/delete-account` → transaction : supprime l'utilisateur, ses abonnements push, ses avis, ses posts / commentaires / réactions et blocages ; anonymise ses RDV, commandes, événements, cartes cadeau envoyées et signalements ("Compte supprimé") (exigence App Store / Play Store)
- `POST /last-minute` (auth requise, barbers autorisés) → push "Créneau Last Minute" à tous les clients (rôle `user`)
- `POST /push/subscribe-native` → enregistre un token FCM/APNs (iOS/Android)
- `PATCH /leave/:id/status` → admin approuve/refuse un congé, push au barber
- `GET /apps/public/prod/public-settings/by-id/:appId` → paramètres publics du salon (utile pour vérifier que l'API répond)
- WebSocket `/ws/live` → diffuse le nombre d'utilisateurs connectés (hook `useLiveCount`)

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
- **Push natif** : token enregistré via `subscribe-native` (endpoint `native://<platform>/<token>`), déclenché par `src/lib/capacitor.js` sur iOS/Android. **Aucun envoi APNs / FCM n'est implémenté** : ces tokens sont ignorés (`skippedNative`) par `sendToSubscriptions`. Pour activer le push natif il faut Firebase Admin (clé de service) et un envoi dédié
- **Email** : Nodemailer SMTP (`lib/emailHelper.js`), silencieux si `SMTP_*` absents (`isConfigured`). Envoyé à l'inscription, création/rappel/annulation de RDV, commande, demande/devis/acceptation/refus d'événement, demande d'avis, anniversaire

### Jobs automatiques (node-cron)
- **appointmentReminder** : toutes les 30 min, rappel des RDV à venir (push + email), flag `reminder_sent`
- **reviewReminder** : toutes les 30 min, demande d'avis après prestation terminée, flag `review_reminder_sent`
- **birthdayReminder** : tous les jours à 8h, push + email aux clients dont c'est l'anniversaire

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
- **Carte FUT** (`BarberCard.jsx`) : chiffres qui montent de 0 à leur valeur (`CountUp`, écrit dans le DOM via `animate`, en cascade), reflet holographique qui balaie la carte à l'arrivée, inclinaison 3D et reflet qui suivent le pointeur (`useMotionValue` + `useSpring`, remis à zéro au relâchement)
- **Barre du bas** (`BottomNav.jsx`) : indicateur actif partagé (`layoutId="nav-active"`) qui glisse d'un onglet à l'autre, icône qui rebondit, anneau lumineux qui orbite autour du bouton Réserver (`.nav-orbit`, dégradé conique en rotation)
- **Réservation** (`Booking.jsx`) : étapes qui glissent dans le sens de la navigation (`AnimatePresence mode="popLayout"`, variants avec `direction`), halo d'étape qui glisse (`layoutId="step-halo"`), coches à ressort et lignes qui se remplissent, prestations / dates / créneaux en cascade, **récapitulatif** sous les étapes (chips + prix qui compte, `AnimatedNumber`) avant la confirmation, **créneau choisi qui se loge dans le résumé** (`layoutId` `slot-HH:MM` partagé entre le bouton et le résumé), écran de succès (`SuccessOverlay` : coche à ressort, anneau, confettis) avant la redirection vers Mes rendez-vous
- **Feed** (`Feed.jsx`) : explosion d'emojis à la réaction (`EmojiBurst`), emoji choisi qui pop, double tap sur la photo = ❤️ avec gros cœur

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
