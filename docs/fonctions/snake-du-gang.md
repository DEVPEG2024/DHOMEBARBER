# Snake du Gang

> Mini-jeu du salon, demandé le 2 nov. 2026 (« un nouveau jeu, le Snake en version 3310 », puis « les vraies règles », « juste pas de labyrinthe », « Tu peux coder ce jeux »). Planche validée : https://claude.ai/artifact/4Kf7Xxy7S45CFzckUmbT2B. Contrat de construction (schéma, API, formes des réponses, écrans) : `snake-du-gang-contrat.md`. Textes stores : `snake-du-gang-stores.md`.

## Décisions du propriétaire (2 nov. 2026)

- Les **vraies règles du Snake classique**, sans labyrinthe ni mur (on ressort de l'autre côté). Les variantes « salon » de la première planche (mèches, objets du salon, labyrinthes) ont été retirées à sa demande.
- Nom « Snake du Gang » (proposé, accepté avec la planche). **Ni « Nokia » ni « 3310 »** dans l'app (marques, règle Apple 5.2.1) : téléphone, bestioles et textes sont dessinés par nous.
- Classement du mois, volontaire, prénom + initiale, **aucun lot**. Les points du Snake ne comptent **nulle part ailleurs** (ni carte Gang, ni Points de Coupe). Sons : bips rétro seulement.
- **Commandes au glisser** (3 nov. 2026, « je vois plus un système de swipe à l'écran pour changer de direction qu'avoir des touches tactiles ») : on tourne en glissant n'importe où sur le téléphone de la partie ; zone « GLISSE » sous l'écran vert à la place des touches 2 4 6 8 ; restent Menu, 5 GO / PAUSE et Rejouer. Les touches 2 4 6 8 reviennent avec l'option « Touches 2 4 6 8 » de Vitesse et options (éteinte par défaut ; alternative au geste, WCAG 2.5.1). Un toucher lance ou reprend, **jamais de pause** (un glisser trop rapide pour être lu ne doit pas arrêter la partie) : la pause passe par la touche PAUSE.

## Règles du jeu

Grille 22 × 16 sans murs. Le serpent avance seul (300 − 25 × niveau ms par pas, niveau 1 à 9), on ne fait que tourner, jamais de demi-tour. Une bouchée : +1 case, le niveau en points. Toutes les 5 bouchées, une bestiole (souris, araignée, poisson, scarabée, 2 cases) reste 24 pas : l'attraper vaut niveau × (2 + ⌈pas restants / 6⌉), sans grandir. Perdu si la tête entre dans le corps (la case que quitte la queue au même pas est libre).

## Où est quoi

| Fichier | Rôle |
|---|---|
| `src/lib/snake/engine.js` = `dhomebarber-api/lib/snakeEngine.mjs` | moteur, **deux copies identiques octet pour octet** (`test/test-snake-engine.js` compare) : hasard à graine (mulberry32), `createGame`, `play`, `step`, `replay` |
| `src/lib/snake/snakeApi.js` | client REST, drapeau `features.snake` (rejette sur une panne), clés `['snake', …]` |
| `src/lib/snake/prefs.js` | réglages de l'appareil (niveau, bips, vibrations, touches 2 4 6 8), `localStorage` `dhb-snake-prefs` |
| `src/lib/snake/{loop,renderer,sound,haptics,share}.js` | boucle `requestAnimationFrame`, dessin canvas, bips, vibrations, partage |
| `src/components/snake/game/controller.js` | déroulé d'une partie sans React : ticket, file de virages, fin, envoi |
| `src/components/snake/game/*.jsx` | téléphone, pavé, zone « GLISSE » (`SwipePad.jsx`), écran vert, menu, partie, fin |
| `src/components/snake/game/swipe.js` | glisser sur tout le téléphone de la partie (`useSwipe` : virage dès 14 px, toucher sous 8 px = lancer ou reprendre) |
| `src/pages/Snake.jsx` | `/snake` : menu → partie → fin ; `?jouer=1` ouvre la partie |
| `src/pages/SnakeClassement.jsx`, `SnakeReglages.jsx`, `SnakeRegles.jsx` | classement du mois, vitesse et options, comment jouer |
| `src/components/snake/SnakeGameCard.jsx` | carte de la page Jeux (« Nouveau » jusqu'au 2 déc. 2026) |
| `src/components/snake/{palette.js,Lcd.jsx,SnakeShell.jsx,SnakeLoadError.jsx,snakeErrors.js}`, `pages/*` | couleurs, écran vert, cadre des pages, erreurs, interrupteur, lignes du classement, dessins à pixels |
| `dhomebarber-api/routes/snake.js`, `lib/snakeResults.js` | routes, ticket, rejeu, classement, purges |
| `e2e/snake-partie.spec.js`, `e2e/snake-pages.spec.js`, `FauxSnakeRest` (`e2e/support/mockApi.js`) | tests de bout en bout ; le faux serveur rejoue chaque partie avec le vrai moteur |

## Score vérifié par le serveur

Le téléphone demande un ticket (`POST /snake/games` : graine, niveau), joue, puis envoie ses virages (`[pas, direction, …]`), le nombre de pas, la fin et son score. Le serveur rejoue la partie avec le même moteur : score différent, virage impossible ou partie plus rapide que le temps réel depuis le ticket (marge 5 s) = refus (422), rien d'écrit. Un renvoi de la même fin rend la même réponse (`duplicate`). Hors connexion, la partie se joue avec une graine locale et n'est pas classée.

## Coupure d'urgence

Variable Heroku `SNAKE=off` (sans nouveau build) : routes en 404 `disabled`, `features.snake` faux, le jeu disparaît de l'app (page Jeux, accueil, fil) et `/snake…` renvoie à l'accueil.

## Données

`snake_games` (tickets et parties, purgés après 7 jours), `snake_scores` (meilleur du mois et de tous les temps par compte ; mois de plus de 13 mois purgés, `total` gardé), `users.snake_leaderboard_opt_in`. Tout est effacé avec le compte (client par lui-même ou par l'admin, compte barber). Purge quotidienne à 04:20 Paris.

## Historique

- 2 nov. 2026 : planche (Design), règles classiques, labyrinthes retirés, construction par le chef (moteur, contrat, client, routes, faux serveur) et trois constructeurs (serveur, jeu, pages), puis trois contre-expertises (code, navigateur, conformité serveur).
- 3 nov. 2026 : en ligne sur le site (Heroku v170, Vercel 878ec7e). Le même jour, commandes au glisser à la demande du propriétaire (zone « GLISSE », touches 2 4 6 8 en option).
