# Documentation du projet D'Home Barber

> Index créé le 20 oct. 2026, quand `CLAUDE.md` (336 Ko, chargé à chaque session) a été réduit à l'essentiel. Le point d'entrée reste `CLAUDE.md` à la racine : architecture, déploiement, état des stores, règles à ne pas casser. Ce dossier garde le détail.

## Organisation

- `fonctions/` : comment marche chaque fonction (un fichier par domaine). À lire avant de modifier la fonction, à mettre à jour quand on la modifie.
- `historique/` : récits datés (envois aux stores, vérifications, audits, incidents) et `restes-a-faire.md`. On n'y réécrit pas l'histoire : un nouveau tour = un nouveau fichier daté.
- `backend-*.md` : notices écrites avant le code serveur (`dhomebarber-api`), toutes appliquées, gardées comme référence de contrat.
- `app-review-notes.md`, `store-listing.md` : textes à coller dans App Store Connect et Google Play.
- `lens-studio-couleur-cheveux.md` : pas à pas Lens Studio.

Les fichiers de `fonctions/` et `historique/` (sauf `restes-a-faire.md`) reprennent mot pour mot l'ancien `CLAUDE.md` (commit 7738a11), découpé par sujet, avec un en-tête. Leurs renvois « voir « Titre » » désignent une section de l'ancien fichier : `grep -rn "### Titre" docs/` la retrouve.

## `fonctions/`

| Fichier | Sujet |
|---|---|
| `architecture-deploiement.md` | architecture, Vercel, Heroku, sauvegardes, variables d'environnement, commandes, infos du salon |
| `structure-code.md` | rôle de chaque fichier du frontend et du backend |
| `entites-api-auth.md` | tableau des entités, client API, endpoints hors CRUD, types, auth, auto-migrations |
| `securite-moderation-nettoyage.md` | politique d'accès par rôle, nettoyage après les tests et les revues, modération du fil |
| `notifications-jobs.md` | push web et natif, emails, fenêtre d'activation, jobs automatiques |
| `reservation-rendez-vous.md` | réservation et prestations, délai d'annulation, déplacer, Last Minute, produits liés, favoris |
| `agenda-menage.md` | agenda de l'équipe, planning, entretien du salon |
| `barbers.md` | créer un barber, fiche de test, profil public, carte FUT, galerie, « Mon espace » |
| `admin-pilotage.md` | tableau de bord, bugs et suggestions, trafic, activité clients |
| `boutique-commandes-bons-plans.md` | boutique, commandes et annulations, fiche produit, bons plans |
| `cartes-cadeau-wallet.md` | cartes cadeau, débit, historique, suppression, Apple / Google Wallet |
| `carte-gang.md` | carte Gang des clients |
| `textile.md` | textile et drops |
| `evenements-privatisation.md` | privatiser le salon, événements du salon |
| `snap-essayage.md` | filtres Snap, essayage couleur |
| `interface-accueil-animations.md` | accueil, animations, fenêtres, défilement, gyroscope |
| `natif-ios-android.md` | Capacitor, publication Android, archive iOS, clavier, langue |

## `historique/`

| Fichier | Sujet |
|---|---|
| `restes-a-faire.md` | restes à faire, limites connues, points non corrigés (rédigé, dédoublonné) |
| `stores.md` | envois aux stores du 5 sept. au 20 oct. 2026 |
| `2026-09-05-revue-securite-et-bugs.md` | revue de sécurité et de charge, bugs du 5 sept. 2026 |
| `2026-10-07-verification-complete.md` | vérification du 7 oct. 2026 |
| `2026-10-14-revue-et-2026-10-16-audit.md` | revue du 14 oct., audit du 16 oct. 2026 |
| `2026-10-17-verification-complete.md` | vérification du 17 oct. 2026 |
| `2026-10-18-verification-tours-2-a-4.md` | 18 oct. 2026, tours 2 à 4 |
| `2026-10-18-verification-tours-5-a-7.md` | 18 oct. 2026, tours 5 à 7 |
| `2026-10-18-verification-tours-8-et-9.md` | 18 oct. 2026, tours 8 et 9 |
