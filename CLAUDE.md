# D'Home Barber - Guide Projet

## Architecture

- **Frontend** : React + Vite + TailwindCSS, déployé sur **Vercel** (https://dhomebarber.fr)
- **Backend** : Express.js + PostgreSQL, déployé sur **Heroku** (https://dhomebarber-api-3aabb8313cb6.herokuapp.com)
- **SDK** : Le frontend utilise `@base44/sdk` pour communiquer avec le backend. Le SDK est un client HTTP générique qui fonctionne avec notre API Heroku.
- **Repo GitHub** : https://github.com/DEVPEG2024/DHOMEBARBER (frontend uniquement)
- **Backend repo** : /Users/zoomproject/Downloads/dhomebarber-api/ (push vers Heroku via `git push heroku main`)

## Déploiement

### Frontend (Vercel)
- Push sur `main` → déploiement automatique sur Vercel
- Domaine : dhomebarber.fr
- Hard refresh (Cmd+Shift+R) après chaque déploiement pour vider le cache

### Backend (Heroku)
- App : `dhomebarber-api`
- Déployer : `cd /Users/zoomproject/Downloads/dhomebarber-api && git push heroku main`
- Logs : `heroku logs --tail --app dhomebarber-api`
- Init DB : `heroku run node init-db.js --app dhomebarber-api`
- PostgreSQL addon : `postgresql-deep-70510` (plan essential-0)

## Structure Frontend

```
src/
├── api/base44Client.js       # Client SDK - serverUrl pointe vers Heroku en prod
├── lib/
│   ├── AuthContext.jsx        # Auth réelle (token localStorage, /me endpoint)
│   ├── ThemeContext.jsx       # Gestion du thème clair/sombre
│   ├── app-params.js          # Paramètres app (appId, token, etc.)
│   ├── pushNotifications.js   # Service Worker push notifications
│   ├── query-client.js        # React Query config
│   ├── utils.js               # Utilitaires (cn, etc.)
│   └── PageNotFound.jsx       # Page 404
├── components/
│   ├── agenda/                # DayView, WeekView, MonthView, AgendaToolbar, AppointmentDetailModal, BreakModal
│   ├── layout/                # ClientLayout, AdminLayout, BottomNav
│   ├── shared/                # ServiceCard, EmployeeCard, StarRating, SectionHeader
│   ├── UserNotRegisteredError.jsx
│   └── ui/                    # Composants shadcn/ui (dialog, button, etc.)
├── pages/
│   ├── Home.jsx               # Page d'accueil (hero centré, logo, "Premium Barber Shop")
│   ├── Booking.jsx            # Réservation en 4 étapes
│   ├── Services.jsx           # Liste des prestations
│   ├── Shop.jsx               # Boutique produits
│   ├── Orders.jsx             # Commandes client
│   ├── Appointments.jsx       # Mes rendez-vous (client)
│   ├── MyReviews.jsx          # Mes avis (client)
│   ├── Profile.jsx            # Profil utilisateur
│   ├── Settings.jsx           # Paramètres client
│   ├── Login.jsx              # Page de connexion
│   ├── ClientNotifications.jsx # Notifications client
│   └── admin/
│       ├── Dashboard.jsx      # Tableau de bord (CA, CB/Espèces, pourboires séparés)
│       ├── Agenda.jsx         # Agenda admin avec DayView/WeekView/MonthView
│       ├── SmartAgenda.jsx    # Agenda intelligent
│       ├── Clients.jsx        # Gestion clients
│       ├── AdminServices.jsx  # Gestion des prestations
│       ├── AdminProducts.jsx  # Gestion des produits
│       ├── AdminOrders.jsx    # Gestion des commandes
│       ├── AdminReviews.jsx   # Gestion des avis
│       ├── AdminSettings.jsx  # Paramètres du salon
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
```

## Structure Backend

```
dhomebarber-api/
├── server.js          # Express server, CORS restreint, helmet, rate limiting
├── db.js              # Pool PostgreSQL (DATABASE_URL)
├── init-db.js         # Création des tables + indexes
├── migrate.js         # Migrations DB
├── seed-admin.js      # Seed admin user
├── Procfile           # web: node server.js
├── jobs/
│   └── appointmentReminder.js  # Job de rappel RDV automatique
└── routes/
    ├── entities.js    # CRUD générique pour toutes les entités
    ├── auth.js        # Auth (/entities/User/me, login, register)
    ├── public.js      # Public settings endpoint
    ├── push.js        # Push notifications (Web Push)
    ├── upload.js      # Upload fichiers (images)
    ├── barberAccounts.js  # Gestion comptes barbers
    └── cleaning.js    # Gestion tâches de nettoyage
```

## Entités (Tables PostgreSQL)

| Entité | Table | Champs clés |
|--------|-------|-------------|
| User | users | email, full_name, phone, password_hash, role, employee_id |
| ServiceCategory | service_categories | name, sort_order, is_active |
| Service | services | name, price, duration, description, category_id, sort_order, is_active |
| Employee | employees | name, title, bio, email, phone, photo_url, color, working_hours (JSONB), permissions (JSONB), sort_order, is_active |
| Appointment | appointments | client_name, client_email, client_phone, employee_id, employee_name, date, start_time, end_time, services (JSONB), status, payment_method, tip, tip_method, product_sold, product_price, grand_total, deposit_amount, reminder_sent, internal_notes, cancellation_reason |
| Product | products | name, price, description, image_url, brand, category, stock, is_active |
| Order | orders | client_email, client_name, client_phone, items (JSONB), total_price, status, notes |
| Review | reviews | client_name, client_email, rating, comment, employee_name, is_visible |
| SalonSettings | salon_settings | salon_name, tagline, description, phone, email, address, city, opening_hours (JSONB), social_instagram, social_facebook, social_tiktok, cancellation_hours, require_deposit, deposit_percentage |
| PushSubscription | push_subscriptions | user_id, user_email, endpoint, keys_p256dh, keys_auth |
| TimeOff | time_offs | employee_id, employee_name, start_date, end_date, reason, type, status, requested_at |
| CleaningTask | cleaning_tasks | name, description, frequency, is_active, sort_order |
| CleaningSchedule | cleaning_schedules | task_id, task_name, employee_id, employee_name, date, status, week_start |

## Points importants

### Sécurité Backend
- **CORS** restreint aux origines autorisées (dhomebarber.fr, localhost en dev)
- **Helmet** pour les headers de sécurité
- **Rate limiting** : 200 req/min global, 15 req/15min pour auth, 20 uploads/15min
- **Trust proxy** activé (Heroku reverse proxy)
- Body parser limité à 10mb

### API SDK
Le SDK Base44 fait :
- **list** → `GET /api/apps/:appId/entities/:entityName?sort=X&limit=N`
- **filter** → `GET /api/apps/:appId/entities/:entityName?q=JSON&sort=X&limit=N`
- **create** → `POST /api/apps/:appId/entities/:entityName`
- **update** → `PUT /api/apps/:appId/entities/:entityName/:id`
- **delete** → `DELETE /api/apps/:appId/entities/:entityName/:id`
- **auth.me** → `GET /api/apps/:appId/entities/User/me`
- **auth.login** → `POST /api/apps/:appId/auth/login`
- **auth.register** → `POST /api/apps/:appId/auth/register`

### Types de données
- Les colonnes `decimal` de PostgreSQL sont converties en nombres dans `normalizeRow()`
- Les colonnes `date` sont converties en format `YYYY-MM-DD` (pas ISO timestamp)
- Les colonnes JSONB (services, working_hours, opening_hours, items, permissions) sont auto-parsées

### Auth
- L'authentification est **réelle** avec login/register et tokens JWT
- Token stocké dans `localStorage` (`base44_access_token`)
- L'endpoint `/me` retourne l'utilisateur connecté avec son rôle et permissions
- Rôles : `user`, `barber`, `admin`
- Les barbers ont un `employee_id` lié à leur profil employé
- Les permissions barber sont stockées dans `employees.permissions` (JSONB)

### Auto-migration au démarrage
Le `server.js` exécute des migrations automatiques au démarrage :
- `users.employee_id` (UUID)
- `employees.permissions` (JSONB)
- `time_offs.status` (VARCHAR, default 'pending')
- `time_offs.requested_at` (TIMESTAMP)

### Jobs automatiques
- **appointmentReminder** : job cron qui envoie des rappels de RDV via push notifications

### Agenda - Modal de détail RDV
- Le champ pourboire utilise un **input non contrôlé** (ref + defaultValue) pour éviter les problèmes de re-render
- Le bouton "Valider la prestation" sauvegarde : payment_method, tip, tip_method, product_sold, product_price, grand_total, status='completed'
- Après validation : invalidation des queries `appointments`, `agendaAppointments`, `adminAppointments`
- Vue MonthView disponible en plus de DayView et WeekView

### Dashboard
- Les encaissements CB/Espèces sont **séparés des pourboires**
- Les pourboires ont leur propre section avec CB/Espèces (via tip_method)
- Le CA utilise `grand_total || total_price` pour le total

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

# Backend - deploy
cd /Users/zoomproject/Downloads/dhomebarber-api
git add -A && git commit -m "message" && git push heroku main

# Backend - logs
heroku logs --tail --app dhomebarber-api

# Backend - console DB
heroku pg:psql --app dhomebarber-api

# Backend - init DB (tables + indexes)
heroku run node init-db.js --app dhomebarber-api
```
