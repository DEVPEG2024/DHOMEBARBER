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
- Dernier état connu (2 septembre 2026) : Android 1.0.1 (versionCode 2), iOS 1.0 (build 1). Incrémenter `versionCode` / `CURRENT_PROJECT_VERSION` avant chaque envoi aux stores.
- Plugins utilisés : push-notifications, haptics, browser, status-bar, splash-screen, keyboard, app (wrapper dans `src/lib/capacitor.js` : `isNative`, `platform`, `initCapacitor`, `hapticFeedback`, `openExternalUrl`)

## Structure Frontend

```
src/
├── api/apiClient.js          # Client HTTP maison (entities, auth, upload) → Heroku
├── App.jsx                   # Routing (react-router), layouts client/admin, lazy loading admin
├── lib/
│   ├── AuthContext.jsx        # Auth réelle (token localStorage, /me endpoint)
│   ├── ThemeContext.jsx       # Gestion du thème clair/sombre
│   ├── MusicContext.jsx       # Musique d'ambiance (/ambiance.mp3, volume 1 %)
│   ├── capacitor.js           # Wrapper Capacitor (natif vs web)
│   ├── useLiveCount.js        # Hook WebSocket → compteur d'utilisateurs connectés (/ws/live)
│   ├── app-params.js          # Paramètres app (appId, token, etc.)
│   ├── pushNotifications.js   # Service Worker push notifications (web)
│   ├── query-client.js        # React Query config
│   ├── utils.js               # Utilitaires (cn, etc.)
│   └── PageNotFound.jsx       # Page 404
├── components/
│   ├── agenda/                # DayView, WeekView, MonthView, AgendaToolbar, AppointmentDetailModal, BreakModal
│   ├── layout/                # ClientLayout, AdminLayout, BottomNav
│   ├── shared/                # ServiceCard, EmployeeCard, StarRating, SectionHeader, ImageCropDialog, MusicToggle
│   ├── BackgroundMusic.jsx
│   ├── ErrorBoundary.jsx
│   ├── UserNotRegisteredError.jsx
│   └── ui/                    # Composants shadcn/ui (dialog, button, etc.)
├── pages/
│   ├── Home.jsx               # Page d'accueil (hero centré, logo, "Premium Barber Shop"). Ordre des sections lu depuis salon_settings.homepage_order (pas d'éditeur UI, modifier en DB)
│   ├── Booking.jsx            # Réservation en 4 étapes
│   ├── Services.jsx           # Liste des prestations
│   ├── Shop.jsx               # Boutique produits
│   ├── Orders.jsx             # Commandes client
│   ├── Appointments.jsx       # Mes rendez-vous (client)
│   ├── MyReviews.jsx          # Mes avis (client)
│   ├── BarberProfile.jsx      # Profil public d'un barber (/barber/:id), vidéo de présentation
│   ├── Feed.jsx               # Fil social "Ca dit quoi le Gang ?" (posts, réactions emoji, commentaires) — aussi /admin/feed
│   ├── Events.jsx             # Privatisation du salon : demande d'événement, acceptation/refus du devis
│   ├── GiftCards.jsx          # Cartes cadeau : achat (code DHB + QR), affichage
│   ├── Profile.jsx            # Profil utilisateur
│   ├── Settings.jsx           # Paramètres client (suppression de compte, liens CGU / confidentialité)
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
│   ├── emailHelper.js # Nodemailer SMTP : bienvenue, confirmation/rappel/annulation RDV, commande, événements, avis, anniversaire
│   └── pushHelper.js  # sendPushToRole, sendPushToEmail, sendPushToEmployee (Web Push)
├── jobs/
│   ├── appointmentReminder.js  # Toutes les 30 min : rappel RDV (push + email)
│   ├── reviewReminder.js       # Toutes les 30 min : demande d'avis après prestation (review_reminder_sent)
│   └── birthdayReminder.js     # Tous les jours 8h : notif + email anniversaire (users.birth_date)
└── routes/
    ├── entities.js    # CRUD générique pour toutes les entités (+ envoi d'emails sur création RDV / commande / événement)
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
| User | users | email, full_name, phone, password_hash, role, employee_id, photo_url, birth_date, reset_code, reset_code_expires |
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
| GiftCard | gift_cards | code (DHB…, généré côté serveur), amount, remaining_balance, sender_*, recipient_name, recipient_message, status (pending → validé par admin), valid_until, validated_at, validated_by, used_at |
| SalonSettings | salon_settings | salon_name, tagline, description, phone, email, address, city, opening_hours (JSONB), social_*, cancellation_hours, require_deposit, deposit_percentage, homepage_order (JSONB) |
| PushSubscription | push_subscriptions | user_id, user_email, endpoint, keys_p256dh, keys_auth (+ tokens natifs via subscribe-native) |
| TimeOff | time_offs | employee_id, employee_name, start_date, end_date, reason, type, status (pending/approved/declined), requested_at |
| CleaningTask | cleaning_tasks | name, description, frequency, is_active, sort_order |
| CleaningSchedule | cleaning_schedules | task_id, task_name, employee_id, employee_name, date, status, week_start, completed_at |

## Points importants

### Sécurité Backend
- **CORS** restreint aux origines autorisées (dhomebarber.fr, localhost en dev)
- **Helmet** pour les headers de sécurité
- **Rate limiting** : 200 req/min global, 30 req/15min pour auth (login, register, forgot/reset-password), 20 uploads/15min
- **Trust proxy** activé (Heroku reverse proxy)
- Body parser limité à 10mb
- Gift cards : code généré côté serveur, montant validé, statut forcé à `pending` à la création, suppression admin uniquement
- Events : le client ne peut qu'accepter/refuser un devis, suppression admin uniquement
- Congés : changement de statut réservé à l'admin (`routes/leave.js`)

### Client API (`src/api/apiClient.js`)
- **list** → `GET /api/apps/:appId/entities/:entityName?sort=X&limit=N`
- **filter** → `GET /api/apps/:appId/entities/:entityName?q=JSON&sort=X&limit=N`
- **create** → `POST /api/apps/:appId/entities/:entityName`
- **update** → `PUT /api/apps/:appId/entities/:entityName/:id`
- **delete** → `DELETE /api/apps/:appId/entities/:entityName/:id`
- **auth.me** → `GET /api/apps/:appId/entities/User/me`
- **auth.loginViaEmailPassword** → `POST /api/apps/:appId/auth/login`
- **auth.register** → `POST /api/apps/:appId/auth/register`
- **UploadFile** → `POST /api/apps/:appId/integration-endpoints/Core/UploadFile`
- `appId` est fixé à `prod`

### Endpoints spécifiques (hors CRUD)
- `POST /auth/forgot-password` → envoie un code à 6 chiffres par email ; `POST /auth/reset-password` le vérifie
- `DELETE /auth/delete-account` → supprime l'utilisateur et ses abonnements push, anonymise ses RDV et commandes ("Compte supprimé"), supprime ses avis (exigence App Store / Play Store)
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
Le `server.js` exécute des migrations automatiques au démarrage (`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`). Les tables `skill_categories`, `posts`, `post_likes`, `post_comments`, `events` et `gift_cards` sont créées ici, pas dans `init-db.js`. Pour ajouter une colonne ou une table : ajouter la requête dans ce bloc, puis déployer.

### Notifications
- **Push web** : Web Push (VAPID) via `lib/pushHelper.js`, service worker `public/sw.js`
- **Push natif** : token enregistré via `subscribe-native`, déclenché par `src/lib/capacitor.js` sur iOS/Android
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
