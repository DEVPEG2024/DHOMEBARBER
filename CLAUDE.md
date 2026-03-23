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
│   ├── AuthContext.jsx        # Auth bypassed (DEV_BYPASS_AUTH = true), mock user admin
│   ├── app-params.js          # Paramètres app (appId, token, etc.)
│   └── query-client.js        # React Query config
├── components/
│   ├── agenda/                # DayView, WeekView, AppointmentDetailModal, etc.
│   ├── layout/                # ClientLayout, AdminLayout, BottomNav
│   ├── shared/                # ServiceCard, EmployeeCard, StarRating, SectionHeader
│   └── ui/                    # Composants shadcn/ui (dialog, button, etc.)
├── pages/
│   ├── Home.jsx               # Page d'accueil (hero centré, logo, "Premium Barber Shop")
│   ├── Booking.jsx            # Réservation en 4 étapes
│   ├── Services.jsx           # Liste des prestations
│   ├── Shop.jsx               # Boutique produits
│   ├── Appointments.jsx       # Mes rendez-vous (client)
│   └── admin/
│       ├── Dashboard.jsx      # Tableau de bord (CA, CB/Espèces, pourboires séparés)
│       ├── Agenda.jsx         # Agenda admin avec DayView/WeekView
│       ├── Clients.jsx        # Gestion clients
│       └── ...                # Services, Team, Products, Reviews, Stats, Settings
└── utils/
    └── serviceColors.js       # Couleurs par service pour l'agenda
```

## Structure Backend

```
dhomebarber-api/
├── server.js          # Express server, CORS ouvert, routes montées
├── db.js              # Pool PostgreSQL (DATABASE_URL)
├── init-db.js         # Création des tables
├── Procfile           # web: node server.js
└── routes/
    ├── entities.js    # CRUD générique pour toutes les entités
    ├── auth.js        # Mock auth (/entities/User/me retourne admin)
    └── public.js      # Public settings endpoint
```

## Entités (Tables PostgreSQL)

| Entité | Table | Champs clés |
|--------|-------|-------------|
| Service | services | name, price, duration, description, sort_order, is_active |
| Employee | employees | name, title, bio, color, working_hours (JSONB), sort_order |
| Appointment | appointments | client_name, client_email, employee_id, date, start_time, end_time, services (JSONB), status, payment_method, tip, tip_method, product_sold, product_price, grand_total |
| Product | products | name, price, brand, category, stock, is_active |
| Review | reviews | client_name, rating, comment, is_visible |
| SalonSettings | salon_settings | salon_name, phone, address, opening_hours (JSONB) |
| TimeOff | time_offs | employee_id, start_date, end_date, reason, type |

## Points importants

### API SDK
Le SDK Base44 fait :
- **list** → `GET /api/apps/:appId/entities/:entityName?sort=X&limit=N`
- **filter** → `GET /api/apps/:appId/entities/:entityName?q=JSON&sort=X&limit=N`
- **create** → `POST /api/apps/:appId/entities/:entityName`
- **update** → `PUT /api/apps/:appId/entities/:entityName/:id`
- **delete** → `DELETE /api/apps/:appId/entities/:entityName/:id`
- **auth.me** → `GET /api/apps/:appId/entities/User/me`

### Types de données
- Les colonnes `decimal` de PostgreSQL sont converties en nombres dans `normalizeRow()`
- Les colonnes `date` sont converties en format `YYYY-MM-DD` (pas ISO timestamp)
- Les colonnes JSONB (services, working_hours, opening_hours, items) sont auto-parsées

### Auth
- L'authentification Base44 est **complètement bypassed** (`DEV_BYPASS_AUTH = true`)
- Le mock user est admin avec email `admin@dhomebarber.com`
- Toutes les routes API sont publiques (pas de token requis)

### Agenda - Modal de détail RDV
- Le champ pourboire utilise un **input non contrôlé** (ref + defaultValue) pour éviter les problèmes de re-render
- Le bouton "Valider la prestation" sauvegarde : payment_method, tip, tip_method, product_sold, product_price, grand_total, status='completed'
- Après validation : invalidation des queries `appointments`, `agendaAppointments`, `adminAppointments`

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
```
