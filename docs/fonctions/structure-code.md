# Structure du code (frontend et backend), fichier par fichier

> Période : état au 20 oct. 2026. Déplacé tel quel depuis `CLAUDE.md` le 20 oct. 2026 (version du commit 7738a11). Les règles à retenir sont résumées dans `CLAUDE.md` ; ce fichier garde le détail. Quand une session modifie cette fonction, elle met ce document à jour.

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
│   ├── aiWriter.js            # Assistant IA des notifications : features.aiWriter, POST /ai/notification-draft, retouches proposées
│   ├── textileApi.js          # Textile & drops : client des routes /textile (overview, vote, alerte, réservation, notify), constantes et helpers partagés
│   ├── contentFilter.js       # Filtre des contenus choquants avant publication (App Store 1.2) : fil, commentaires, avis, nom affiché
│   ├── giftCardDebit.js       # Débit d'une carte cadeau (admin) : route POST /gift-cards/:id/debit avec repli GiftCard.update, annulation, historique, RDV du jour, clôture du RDV
│   ├── walletApi.js           # Carte cadeau dans Apple / Google Wallet : drapeaux features.appleWallet / googleWallet, POST /gift-cards/:id/wallet-links, choix selon l'appareil
│   ├── favorites.js           # Favoris du client (prestations, produits) : useFavorites, rangés sur l'appareil par compte
│   ├── slots.js               # Créneaux libres d'un barber (analyzeDay, parisDay…), partagés par la réservation et le déplacement
│   ├── availability.js        # Écran Créneau : créneaux d'un jour (barber ou « peu importe », dayOptions), semaines (weekDays, weekKeyOf), prochaines disponibilités (pickNextOptions), libellés des jours sans place
│   ├── popularServices.js     # « Les plus demandées » : usePopularServiceIds() lit `popular_services` des paramètres publics (classement calculé par le serveur), [] en cas d'échec
│   ├── reschedule.js          # Déplacer un RDV : prochains créneaux libres (même barber, mêmes prestations), création puis annulation de l'ancien
│   ├── lastMinute.js          # Last Minute de l'accueil (20 oct. 2026) : useOpenLastMinutes (créneaux libres d'aujourd'hui et de demain, clé ['appointments','last-minute', jour]), libellés, lien /booking, forgetBookedLastMinute (retrait du cache après une réservation)
│   ├── feedbackApi.js         # Bugs et suggestions : types, statuts, endroits de l'app, contexte technique joint à l'envoi
│   ├── adminAlerts.js         # Réglages des alertes admin (salon_settings.admin_alerts) : useAdminAlertPrefs, groupes de types
│   ├── adminActivity.js       # Activité clients (admin) : agrégation des entités en chronologie, lu / non lu, toasts, formatActivityTime
│   ├── analytics.js           # Mesure d'audience interne (Admin → Trafic) : appareil aléatoire (dhb-vid), session, temps au premier plan, pages / temps par tranches, actions (track), publications du fil vues (trackPostView), provenance (noteSource), refus dans Paramètres (dhb-analytics-optout)
│   ├── cancellation.js        # Annulations : drapeaux serveur orderCancel / appointmentCancelReason, POST /orders/:id/cancel, messages d'erreur, qui a annulé
│   ├── partnersApi.js         # Bons plans du Gang : clé React Query, catégories, helpers (meilleure remise, expiration, liens sûrs)
│   ├── salonEventsApi.js      # Événements du salon : client des routes /salon-events (mine, rsvp, invite, guests, remind), constantes et helpers
│   ├── app-params.js          # Paramètres app (appId, token, etc.)
│   ├── pushNotifications.js   # Service Worker push notifications (web)
│   ├── query-client.js        # React Query config
│   ├── utils.js               # Utilitaires (cn, etc.)
│   └── PageNotFound.jsx       # Page 404
├── components/
│   ├── admin-activity/        # Activité clients : ActivityBell (cloche de l'en-tête admin), lignes, filtres, statistiques du panneau
│   ├── agenda/                # DayView, WeekView, MonthView, AgendaToolbar, AppointmentCard (+ DragGhost), AppointmentDetailModal + AppointmentEditForm, MoveDialog, BreakModal, useBreakDrag, useCardDrag, agendaUtils (période, chevauchements, horaires, slotIssues)
│   ├── layout/                # ClientLayout, AdminLayout, BottomNav
│   ├── shared/                # ServiceCard, EmployeeCard, BarberCard (carte style FUT), StarRating, SectionHeader, ImageCropDialog, MusicToggle
│   ├── home/                  # RebookCard (« Comme la dernière fois »), OpenStatusBadge (Ouvert / Fermé heure de Paris), LastMinuteSection (créneaux Last Minute en cartes orange : une grande carte ou un carrousel)
│   ├── BackgroundMusic.jsx
│   ├── ErrorBoundary.jsx
│   ├── UserNotRegisteredError.jsx
│   └── ui/                    # Composants shadcn/ui (dialog, button, etc.)
├── pages/
│   ├── Home.jsx               # Page d'accueil (hero centré, logo, "Premium Barber Shop", pastille Ouvert / Fermé en direct, bouton Réserver à anneau orbital, section Last Minute en tête par défaut, bloc « Comme la dernière fois », carrousel barbers avec parallaxe, bloc Carte Cadeau pulsant). Ordre des sections lu depuis salon_settings.homepage_order, modifiable par l'admin (« Organiser l'accueil ») ; sections dans un conteneur `flex flex-col gap-8`
│   ├── Booking.jsx            # Réservation en 3 étapes (refonte du 19 oct. 2026, voir « Prestations et réservation ») : Prestation → Créneau (barber, semaine avec places, heures Matin / Après-midi / Soir) → Confirmation, barre fixée en bas, écran de succès pluie de lames + boutons calendrier — composants dans components/booking/
│   ├── Services.jsx           # Prestations (refonte du 19 oct. 2026) : « Les plus demandées » (classement serveur), rubriques automatiques, lignes compactes avec « Réserver » direct → /booking?services=<id> (ouvre l'écran Créneau), fiche d'une prestation, sélection multiple + barre de résumé — même catalogue que la réservation (`ServicePicker`), composants dans components/services/
│   ├── Shop.jsx               # Boutique produits : tap sur une carte → fiche produit complète (components/shop/ProductSheet.jsx : galerie image_url + images, description entière, stock, quantité, ajout au panier)
│   ├── Orders.jsx             # Commandes client
│   ├── Appointments.jsx       # Mes rendez-vous (client) : lien « Ajouter au calendrier » (Google / .ics, lien signé `calendar_url` dans les apps) sur les RDV à venir
│   ├── MyReviews.jsx          # Avis : « Tous les avis » / « Mes avis » ; après un avis (toute note : Google interdit de ne solliciter que les avis positifs, tour 6 du 18 oct. 2026), fenêtre « Publier aussi sur Google » (commentaire copié, page d'avis Google du salon, plus montrée une fois le lien utilisé : `dhb-google-review-done:<user.id>`)
│   ├── BarberProfile.jsx      # Profil public d'un barber (/barber/:id) : carte style FUT (BarberCard, holographique, stats qui montent, transition partagée depuis l'accueil) + vidéo de présentation + « Réalisations » (galerie, `components/barber-gallery/`) ; swipe gauche/droite (ou flèches, boutons, points) pour passer aux autres barbers sans quitter la page
│   ├── Feed.jsx               # Fil social "Ca dit quoi le Gang ?" (posts, réactions emoji, commentaires, menu Signaler / Bloquer, panneau admin des signalements) — aussi /admin/feed
│   ├── Events.jsx             # Onglet Événements : « Privatiser le salon » (refonte du 19 oct. 2026, components/privatisation/ : devis à accepter et billet confirmé en tête, accroche, occasions, demande de devis plein écran, suivi, FAQ — voir « Privatiser le salon : refonte ») et « Vos invitations » aux événements organisés par le salon (components/salon-events/ : cartes, fiche avec RSVP et places, confirmation animée, calendrier, SalonEventHomeCard pour l'accueil)
│   ├── GiftCards.jsx          # Cartes cadeau : achat (code DHB + QR), affichage
│   ├── Textile.jsx            # « DHB Textile » (/textile, lazy) : drop en vedette (compte à rebours, alerte), pièces (vote 🔥 + taille, réservation), Labo, mes réservations — composants dans components/textile/
│   ├── TryOn.jsx              # « Nouvelle tête » (/try-on, lazy) : essayage couleur cheveux / barbe, FAST sur l'appareil + AI ULTRA serveur
│   ├── Favorites.jsx          # « Mes favoris » (/favorites, lazy) : prestations (Réserver) et produits (boutique filtrée)
│   ├── Partners.jsx           # « Les bons plans du Gang » (/partners, lazy) : partenaires, remises, Carte Gang à présenter — composants dans components/partners/
│   ├── SnapLenses.jsx         # « Filtres Snap » (/snap, lazy) : lentilles Snapchat du salon via Camera Kit
│   ├── Profile.jsx            # Profil client en tableau de bord (18 oct. 2026) : salut + réglages, carte Gang, prochaine visite ou jauge de fraîcheur, chiffres, 9 raccourcis à pastilles, carrousel des favoris — composants dans components/profile/
│   ├── Settings.jsx           # Paramètres client (bugs et suggestions — components/feedback/ —, date de naissance, utilisateurs bloqués, suppression de compte, liens CGU / confidentialité)
│   ├── Login.jsx              # Connexion, inscription, mot de passe oublié (code à 6 chiffres par email)
│   ├── ClientNotifications.jsx # Notifications client
│   └── admin/
│       ├── Dashboard.jsx      # Tableau de bord (CA, CB/Espèces, pourboires séparés, compteur live)
│       ├── AdminActivity.jsx  # Activité clients (/admin/activity, admin) : chronologie des actions des clients (RDV, commandes, avis…)
│       ├── AdminTraffic.jsx   # Trafic (/admin/traffic, admin) : visiteurs, sessions, temps de présence, pages, parcours de réservation, heures de pointe, plateformes, provenances, actions, New Gang — composants dans components/analytics/
│       ├── Agenda.jsx         # Agenda admin avec DayView/WeekView/MonthView + envoi push "Last Minute" sur un créneau libre
│       ├── SmartAgenda.jsx    # Agenda intelligent
│       ├── Clients.jsx        # Gestion clients
│       ├── AdminServices.jsx  # Gestion des prestations
│       ├── AdminProducts.jsx  # Gestion des produits
│       ├── AdminStock.jsx     # Stock produits (ref, seuil critique, type boutique/salon)
│       ├── AdminOrders.jsx    # Gestion des commandes
│       ├── AdminReviews.jsx   # Gestion des avis
│       ├── AdminEvents.jsx    # Privatisations (demandes des clients) : devis, statut, notes admin
│       ├── AdminSnap.jsx      # Filtres Snap (/admin/snap, admin) : interrupteur, état des lieux, statistiques d'usage, lentilles (visibilité, nom, ordre, filtre à l'ouverture), palette, styles de barbe, jeton / groupes Camera Kit — composants dans components/snap-admin/
│       ├── AdminSalonEvents.jsx # Événements du salon (/admin/salon-events) : création (photos, date, lieu, prix, capacité, tenue, visibilité), publication, invitations ciblées ou à tous, liste des invités (RSVP, places, relances, export CSV) — composants dans components/salon-events-admin/
│       ├── AdminFeedback.jsx  # Bugs et suggestions (/admin/feedback, admin, catégorie Clients) : filtres type / statut, statut, réponse au client (push), capture, suppression
│       ├── AdminPartners.jsx  # Bons plans du Gang (/admin/partners, admin) : partenaires, offres (pourcentage facultatif), code promo, validité, coup de cœur, ordre
│       ├── AdminGiftCards.jsx # Cartes cadeau : validation (scan QR ou code), débit au comptoir (RDV du jour, prestations, montant libre), historique complet de la fiche, onglet « Historique » (?tab=history, journal de toutes les cartes), suppression définitive — components/giftcards-admin/, lib/giftCardDebit.js
│       ├── AdminTextile.jsx   # Textile & drops (/admin/textile) : drops, pièces (stock par taille, votes), réservations (payée / retirée), push aux abonnés — composants dans components/textile-admin/
│       ├── AdminSettings.jsx  # Paramètres du salon
│       ├── BarberHome.jsx     # « Mon espace » d'un barber (/admin/me, page d'arrivée des barbers, 18 oct. 2026) : carte FUT, ma journée, chiffres, raccourcis selon permissions, avis — composants dans components/barber-home/
│       ├── BarberSettings.jsx # Paramètres du barber connecté (/admin/my-settings) : photo, vidéo, réalisations (GalleryEditor), compétences
│       ├── AdminLeave.jsx     # Gestion congés (admin)
│       ├── BarberLeave.jsx    # Congés (vue barber)
│       ├── BarberAccounts.jsx # Comptes barbers
│       ├── BarberCleaning.jsx # Nettoyage (vue barber)
│       ├── Cleaning.jsx       # Gestion nettoyage (admin) : planning réparti selon la présence réelle (ligne « Au salon », tâches tombées sur un absent signalées)
│       ├── Notifications.jsx  # Notifications admin (push + email) avec l'Assistant IA de rédaction (components/notifications/AiWriterPanel.jsx)
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

Routes client : `/`, `/services`, `/booking`, `/shop`, `/appointments`, `/orders`, `/reviews`, `/settings`, `/notifications`, `/profile`, `/barber/:id`, `/feed`, `/events`, `/gift-cards`, `/textile`, `/partners`, `/favorites`, `/try-on`, `/snap`, `/login`.
Routes admin : `/admin`, `/admin/me`, `/admin/activity`, `/admin/traffic`, `/admin/agenda`, `/admin/smart-agenda`, `/admin/services`, `/admin/team`, `/admin/clients`, `/admin/products`, `/admin/stock`, `/admin/orders`, `/admin/reviews`, `/admin/stats`, `/admin/settings`, `/admin/my-settings`, `/admin/notifications`, `/admin/cleaning`, `/admin/my-cleaning`, `/admin/barber-accounts`, `/admin/leave`, `/admin/my-leave`, `/admin/feed`, `/admin/events`, `/admin/gift-cards`, `/admin/textile`, `/admin/salon-events`, `/admin/snap`, `/admin/partners`, `/admin/feedback`.

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
│   ├── hairUltra.js   # AI ULTRA : SAM 3 + FLUX Kontext (fal.ai) + fusion gardée par le masque (sharp)
│   ├── aiWriter.js    # Assistant de rédaction des notifications : Claude via @anthropic-ai/sdk, sortie JSON structurée
│   ├── cleaningPlan.js # Entretien : présence par jour (horaires − pauses de l'agenda, repos, congés, salon fermé), répartition au prorata de la présence
│   ├── orders.js      # Commandes : création en transaction (stock décompté, quotas, doublon), annulation (stock rendu), transitions du staff
│   ├── adminAlerts.js # Alertes push admin « Activité clients » (actions des clients seulement, préférences salon_settings.admin_alerts)
│   ├── contentFilter.js # Filtre des contenus choquants (App Store 1.2) : copie CommonJS de src/lib/contentFilter.js du frontend, MÊME liste (test-content-filter.js compare les deux)
│   ├── lastMinutePush.js # POST /last-minute : validation, barber relu, lien /booking, texte daté à Paris, réponse { sent, failed, total, skippedNative }, quota 6/h par compte
│   ├── giftCardDebit.js # Débit des cartes cadeau : débit / annulation en transaction (FOR UPDATE), historique, schéma gift_card_transactions
│   ├── wallet.js      # Carte cadeau dans le Wallet : configuration Apple / Google lue au démarrage, jeton court du .pkpass, pass.json, génération stricte (passkit-generator), vérification d'un .pkpass, objet giftCard et lien Google
│   ├── walletUpdates.js # Pass Apple tenu à jour : tables apple_passes / apple_pass_registrations, push vide APNs signé par le certificat du pass, refreshWallets (Google + Apple)
│   ├── popularServices.js # « Les plus demandées » : ids des prestations les plus réservées (RDV confirmés / terminés datés depuis J-90, à venir compris, comptes clients, hors fiches fantômes, prestations actives), 6 au plus, [] sous 10 visites, cache 1 h, attente bornée à 2 s, jamais d'erreur → `popular_services` des paramètres publics
│   └── snapConfig.js  # Filtres Snap : ligne snap_config (cache 30 s), jeton / groupes effectifs (admin > Heroku), bloc public, validation des modifications
├── jobs/
│   ├── appointmentReminder.js  # Toutes les 30 min : rappel RDV (push + email)
│   ├── reviewReminder.js       # Toutes les 30 min : demande d'avis après prestation (review_reminder_sent)
│   ├── birthdayReminder.js     # Tous les jours 8h : notif + email anniversaire (users.birth_date)
│   ├── comebackReminder.js     # Tous les jours 10h Paris : relance « il est temps de revenir » (comeback_reminder_sent), --dry-run
│   ├── textileDrop.js          # Chaque minute : ouvre les drops à l'heure (teasing → live + push aux abonnés), clôt (ends_at), rappelle / expire les réservations
│   └── salonEventReminder.js   # Toutes les 30 min : push « C'est demain » aux invités ayant accepté (fenêtre 23–25 h, reminder_sent_at)
└── routes/
    ├── media.js       # GET /api/media/:id : sert une image stockée en base (cache 1 an, ETag / 304)
    ├── hairUltra.js   # POST /ai/hair-ultra : recoloration HD (lib/hairUltra.js, fal.ai, FAL_KEY)
    ├── orders.js      # POST /orders/:id/cancel : annulation d'une commande par son client (lib/orders.js)
    ├── aiWriter.js    # POST /ai/notification-draft : rédaction / retouche d'une notification (lib/aiWriter.js, ANTHROPIC_API_KEY)
    ├── entities.js    # CRUD générique : politique d'accès par rôle (CREATE_RULES / UPDATE_RULES), emails sur création RDV / commande / événement
    ├── auth.js        # register, login, /me, forgot-password, reset-password, delete-account, logout
    ├── public.js      # Public settings endpoint
    ├── push.js        # Web Push (vapid-key, subscribe, unsubscribe, send, subscribers) + subscribe-native (token FCM/APNs)
    ├── upload.js      # Upload fichiers (images)
    ├── barberAccounts.js  # Gestion comptes barbers
    ├── cleaning.js    # generate-schedule (présence réelle, garde jours passés et tâches faites), availability, notify-today, toggle, history
    ├── leave.js       # PATCH /leave/:id/status : admin approuve/refuse un congé + push au barber
    ├── textile.js     # Textile & drops : GET /textile/overview, vote, alerte, réservation (transaction + stock), cancel, notify (staff) — lib/textileNotify.js pour le push d'ouverture
    ├── salonEvents.js # Événements du salon : GET /salon-events/mine, rsvp (transaction + capacité), invite (staff : push + email), guests, remind ; helpers de push exposés sur le routeur
    ├── giftCardDebit.js # POST /gift-cards/:id/debit, POST …/debit/:txId/undo (admin), GET /gift-cards/:id/transactions (admin ou acheteur) — erreurs toujours avec `code`
    ├── walletUpdates.js # Service web PassKit (appelé par Wallet) : /wallet/passkit/v1/devices/…/registrations/…, /passes/…, /log — lib/walletUpdates.js
    ├── wallet.js      # POST /apps/:appId/gift-cards/:id/wallet-links (expéditeur connecté, 20/h) et GET /wallet/apple/<jeton>.pkpass (public, jeton de 10 min, 30 / 15 min / IP) — lib/wallet.js, images dans wallet/apple/, scripts wallet-smoke.js / wallet-google-class.js / wallet-images.js
    └── snap.js        # Filtres Snap : GET/PUT /snap/admin et GET /snap/admin/stats (admin), POST /snap/events (usage de /snap, comptes clients seulement)
```
