# La Coupe du Gang : mini-jeu de foot façon air hockey

> Cahier des charges validé par le propriétaire le 28 oct. 2026 ; jeu complet construit le 29 oct. 2026 (serveur Heroku v158 et suivants, app sur dhomebarber.fr). **Pas encore dans les apps natives** : il arrive avec le build 18, que le propriétaire enverra lui-même. Le fonctionnement actuel est résumé dans « Jeu complet » plus bas ; le **contrat détaillé** (schéma, API, protocole v2, décisions du chef) est `coupe-du-gang-contrat.md` (sections 7 et 8 = dernières décisions) ; textes stores et confidentialité : `coupe-du-gang-stores.md`.
>
> - Planche des écrans (validée le 29 oct. 2026) : https://claude.ai/artifact/6sEgcJPvzCvPtBQsGPP3vU
> - Prototype jouable du 28 oct. (contre le salon, à deux sur un téléphone) : https://claude.ai/artifact/TDdZxv5v9xYGQwW28zSrxf ; source dans `docs/prototypes/coupe-du-gang.html`.
> - **Thème stade (29 oct. 2026)** : stade rouge et noir vu du ciel (image du propriétaire sans les marques du club), rouge, noir et blanc avec une touche d'or, avant-match (stade entier puis zoom sur le terrain), terrain seul pendant le match, stade au débrief. L'image **est** le terrain : le jeu n'y pose que joueurs, ballon, score et effets. Contrat et décisions : `coupe-du-gang-stade.md` ; fabrication de l'image : `docs/prototypes/stade-coupe/`.

## Jeu complet (29 oct. 2026) : où est quoi

**Serveur** (`dhomebarber-api`)
- `lib/coupeEngine.mjs` : moteur physique, **copie octet pour octet** de `src/lib/coupe/engine.js` (`test/test-coupe-engine.js` compare) ; chargé par `import()`.
- `lib/coupeRooms.js` : salles et matchs (`/ws/coupe`, protocole v2) ; le serveur **recalcule chaque choc** (`collidePaddle`) à partir de la position et de la vitesse envoyées par le téléphone, jamais d'un ballon envoyé par lui ; reprise après coupure, pauses, forfaits, limite de 5 min de jeu, durées minimales (abandon < 20 s = annulé, match < 10 s = amical), garde-fous (quotas, seau de messages, places). Dépendances injectées par `server.js` (contrat 4.5).
- `lib/wsRouter.js` : **un seul** écouteur `upgrade` pour `/ws/live` et `/ws/coupe` (deux `WebSocketServer` sur le même serveur HTTP se rejettent en 400) ; quota par IP sur `/ws/coupe` seulement, **jamais sur `/ws/live`**.
- `lib/coupeResults.js` : `recordMatch` (transaction, verrous, droits relus en base, `+3 / −1` jamais sous 0, saison du mois de Paris + total, ligne `salon` pour tous les admins), clés publiques HMAC, barbers occupés (RDV, congé approuvé) et joignables (push web ou socket ouverte), purge du compte (`purgeAccount`), purge quotidienne 04:15 (amicaux > 30 j, tout > 13 mois). `lib/coupePoints.js` : règles pures. `lib/coupeNotify.js` : push de défi **web seulement** (apps publiées sans le jeu), jamais 21:00–08:00.
- `routes/coupe.js` : `/coupe/me`, classement (volontaires + salon, ni testeur, ni fiche cachée, ni compte exclu), barbers, blocages, signalements, vue admin, exclusion et remise à zéro.
- Coupure d'urgence : `heroku config:set COUPE_WS=off --app dhomebarber-api` → `features.coupe` faux, `/ws/coupe` 503, routes 404 `disabled` ; `heroku config:unset COUPE_WS` pour rouvrir.

**App** (`puzzling-sharp-edge-book`)
- `src/lib/coupe/` : `engine.js` (copie du serveur), `onlineMatch.js` (connexion et code réseau : ballon prédit au présent dans sa moitié, au même instant que l'adversaire dans la sienne, fondu à la ligne médiane, frappes au moment du choc en pleine précision, reprise automatique), `localMatch.js` (contre le salon, à deux), `renderer.js`, `sound.js`, `coupeApi.js` (REST, drapeau qui **rejette** sur une panne).
- `src/components/coupe/CoupeGame.jsx` (+ `game/`) : écran de jeu des trois modes ; `src/pages/Coupe.jsx` (+ `components/coupe/hub/`) : accueil `/coupe` ; `CoupeClassement.jsx` ; `CoupeTest.jsx` : écran d'essai réseau (équipe et testeurs).
- Page « Jeux » (`/jeux`, `src/pages/Jeux.jsx`, demande du propriétaire du 29 oct. 2026 : « une section jeux, quand on clique dessus, on voit la Coupe du Gang et les autres jeux que j'ajouterai ») : une carte par jeu ouvert ; celle de la Coupe (`CoupeGameCard`) porte tes Points de Coupe, ta place, « Jouer », contre le salon et à deux. Liste des jeux : `src/lib/games.js` (`GAMES` + `useGames`) ; **ajouter un jeu = une entrée dans `GAMES` et la lecture de son drapeau dans `useGames`** (carte simple par défaut, ou la sienne dans `GAME_CARDS` de `Jeux.jsx`).
- Intégrations : section « Jeux » de l'accueil (clé `games`) : une carte « Jeux » (nom de chaque jeu) vers `/jeux`, sans lecture des points ; entrée « Jeux » en tête du fil vers `/jeux`, absente quand l'admin a masqué la catégorie « Jeux » de l'accueil (« Organiser l'accueil », `homepage_hidden`) ; bloc sous la carte Gang, « Dispo pour un match » et ligne Coupe de la carte FUT dans Mon espace, « Défier » sur le profil d'un barber, Admin → « La Coupe du Gang » (`/admin/coupe`), `public/privacy.html` section 7 bis.
- Tests e2e : `e2e/coupe.spec.js` (jeu, faux serveur `e2e/support/fauxCoupe.js`), `coupe-accueil.spec.js`, `coupe-integrations.spec.js` (réponses REST simulées dans `mockApi.js`).

## Décisions du propriétaire (28 oct. 2026)

- Nom : **La Coupe du Gang** (coupe de cheveux / coupe du vainqueur).
- Jeu **en temps réel, façon air hockey, sur un terrain de foot vu du dessus** (le tour par tour à la pichenette, proposé d'abord, est écarté).
- **Points de Coupe séparés du niveau Gang** : ils ne changent ni le niveau, ni les stats 0–99, ni les écussons (le niveau reste calculé sur les visites).
- **L'admin joue sous le nom « D'Home Barber »** (logo, petite étoile bleue), comme dans le fil.
- **Interrupteur « Dispo pour un match »** pour chaque barber.
- **Aucun lot** : seulement un classement (donc pas de concours au sens de la règle Apple 5.3).
- Match à deux sur un seul téléphone : amical, sans points (recommandation non contestée).

## Décisions du propriétaire (29 oct. 2026)

- Saison = un mois civil de Paris ; pion d'un barber = son initiale + des ciseaux (jamais sa photo en rond) ; « Dispo » coupé tout seul pendant les rendez-vous du barber (propositions validées par le « go »).
- **Tous les matchs comptent** : ni limite par adversaire ni plafond par jour (remplace les garde-fous proposés le 28 oct.). Reste la condition d'avoir une carte Gang pour un client. Risque assumé : deux complices peuvent se faire gagner des points ; prévoir une vue admin des paires qui jouent le plus ensemble.
- **Une seule ligne « D'Home Barber »** au classement pour tous les comptes admin (points additionnés).
- **Interrupteur à part** pour figurer au classement de la Coupe (indépendant de celui du classement Gang).

## Règles du match

- Terrain vertical (téléphone tenu droit), vu du dessus ; ta cage toujours en bas. Bords = panneaux lumineux « D'Home Barber » où le ballon rebondit.
- Chaque joueur = un rond avec sa photo, qui suit le doigt **dans sa moitié** (jamais au-delà de la ligne médiane). **Doigt posé sur son joueur (ou à 20 unités de son rond) : le joueur ne bouge pas**, il garde ensuite le même écart avec le doigt (demande du propriétaire du 29 oct. 2026 : avant, il sautait 34 unités devant le doigt). Doigt posé ailleurs : le joueur y va, un peu au-dessus du doigt pour que le pouce ne le cache pas. Souris : le pointeur lui-même. Code : `src/lib/coupe/finger.js` (`fingerOffset`), appelé par `CoupeGame.jsx` quand le doigt se pose ; astuce du premier match « Pose ton doigt sur ton joueur » (35 caractères au plus : à 320 px, deux lignes cachaient le pion adverse).
- **Interdit d'entrer dans sa petite surface** : on ne gare pas son joueur devant sa cage.
- Ballon gardé plus de 5 s dans une moitié : rendu à l'adversaire (anti-jeu).
- Après un but, le ballon est posé devant celui qui l'a encaissé.
- **Premier à 3 buts.** Ballon qui ralentit doucement (plus qu'un palet), vitesse plafonnée. Match de 1 à 2 minutes.
- Ressenti : traînée et étincelles, vibration selon la force, ralenti + « BUT ! » + léger tremblement + foule sur un but, pluie de lames de rasoir à la victoire, score partageable en story. Animations réduites si le téléphone le demande.

## Trois façons de jouer

1. **Contre le salon** (ordinateur), niveaux Apprenti, Barber, Boss : sans points, sans réseau.
2. **À deux sur un téléphone** (posé à plat, chacun son bout) : amical, sans points.
3. **En ligne, chacun son téléphone** : seul mode qui compte. Défier un barber (bouton sur sa page, seulement s'il est « Dispo », invitation de 2 minutes), défier un ami (lien `https://dhomebarber.fr/defi/<code>` ou QR code), revanche. Déconnexion : 10 s pour revenir, sinon forfait (= défaite). Match coupé par le serveur (redémarrage quotidien d'Heroku) : annulé, sans points.

On ne cherche jamais un client par son nom (pas d'oracle sur l'identité).

## Points de Coupe et classement

- Victoire **+3**, défaite **−1**, **jamais sous 0**. Forfait = défaite.
- Affichés dans un bloc de la page de la carte Gang (jamais en bandeau sur la carte) et sur la carte FUT d'un barber.
- Classement de la saison et classement général ; clients et barbers ensemble (barbers marqués d'une icône ciseaux, admin = « D'Home Barber » + étoile bleue) ; prénom + initiale + avatar ; on n'y figure que si on l'accepte (même logique que le classement Gang existant). Durée d'une saison : **à fixer** (proposition : un mois).

## Garde-fous

- Points seulement avec une **carte Gang** (au moins une visite réelle au salon) : un faux compte ne peut pas gonfler un ami. Sans carte : matchs amicaux.
- ~~Contre un même adversaire, points au premier match du jour seulement ; au plus 5 matchs à points par jour~~ : retiré le 29 oct. 2026, **tous les matchs comptent** (décision du propriétaire). `lib/coupePoints.js` (`matchCounts`, `DAILY_RANKED_MAX`) est à aligner avant de brancher les points.
- Le serveur arbitre : il calcule le ballon, compte les buts, plafonne la vitesse des joueurs. Le téléphone n'envoie que la position du doigt.
- Pas de discussion, seulement des réactions toutes faites. Invitations par notification jamais entre 21:00 et 08:00, avec quota par compte.
- Suppression de compte : matchs et points effacés (check-list des entités, point 4).

## Réseau (risque principal)

- Le serveur est en région **us** (Heroku, constaté le 28 oct. 2026) : ~100 ms d'aller-retour depuis la France.
- Principe retenu : le joueur bouge sur le téléphone sans attendre, le téléphone anticipe le ballon dans sa moitié, le serveur garde le dernier mot. Le WebSocket `/ws/live` actuel est anonyme (compteur de visiteurs) : il faudra un canal authentifié pour les matchs.
- **Prototype réseau à deux téléphones avant de construire le reste.** Si le ressenti n'est pas bon : garder les modes 1 et 2, revoir le mode en ligne.

## Prototype réseau (lancé le 29 oct. 2026)

But : juger sur deux téléphones la sensation d'un match en ligne avec le serveur en région us. **Sans points ni écriture en base.** Écran caché `/coupe-test`, réservé à l'admin, aux barbers et aux comptes testeurs (`users.is_tester`, lu en base).

### Moteur partagé

`src/lib/coupe/engine.js` (app) et `lib/coupeEngine.mjs` (serveur, chargé par `import()`) : **deux copies identiques octet pour octet**, comparées par `test/test-coupe-engine.js`. Fonctions pures : `movePaddle`, `constrainPaddle`, `stepBall`, `collidePaddle`, `unpin`, `advanceBall`, `goalScorer`, `placeKickoff`, `botTarget`… Repère du serveur : joueur 0 en bas, joueur 1 en haut ; le téléphone du joueur 1 tourne tout de 180° (`flipPoint`, `flipVel`) à l'entrée et à la sortie du réseau, et joue toujours « en bas ».

### Principe : « la frappe appartient à celui qui frappe »

- Le serveur calcule le ballon (bords, poteaux, filets, buts) mais **ne fait pas les chocs avec les joueurs**. Chaque téléphone simule le ballon et **son propre joueur** sans attendre : sa frappe est immédiate. Il envoie la frappe (état du ballon juste après, position de son joueur, heure du serveur estimée).
- Le serveur **vérifie** la frappe (match en cours, heure dans les 400 dernières ms, joueur dans sa moitié et près du ballon, ballon proche de celui du serveur à cet instant, vitesse plafonnée, numéro croissant, 40 ms au moins entre deux frappes), remet le ballon à cet état à cet instant puis **rejoue** jusqu'à maintenant (`advanceBall`). Frappe refusée : simplement ignorée, le téléphone se recale.
- **But confirmé 150 ms après** que le ballon a franchi la ligne : une parade valable arrivée en retard, datée d'avant le but, l'annule.
- Le serveur garde l'historique du ballon (600 ms) pour ces vérifications et ce rejeu.
- Le téléphone recale son ballon sur l'état du serveur amené à maintenant, en lissant l'écart sur ~80 ms ; il ignore le ballon du serveur tant que sa dernière frappe n'est pas acquittée (`ack`).
- Joueur adverse : affiché avec 100 ms de retard, interpolé entre deux états. Horloge : écart avec le serveur estimé par `ping` / `pong` (échantillon au plus court aller-retour).

### Protocole `wss://<API>/ws/coupe` (JSON, coordonnées dans le repère du serveur)

> Protocole du prototype (v1), gardé pour l'histoire. En vigueur : protocole v2 de `coupe-du-gang-contrat.md`, avec la durée du compte à rebours dans `start.cd` et `state.cd` (4,5 s au premier coup d'envoi depuis le thème stade, 3 s après un but ou un retour).

- Origine vérifiée comme `/ws/live` ; **un seul aiguillage `upgrade`** pour les deux chemins (deux `WebSocketServer` branchés sur le même serveur HTTP se rejettent mutuellement en 400 : `ws` 8, `shouldHandle`).
- Jeton jamais dans l'adresse (journaux du routeur Heroku) : premier message `{t:'auth', v:1, token}` sous 3 s, sinon fermeture 4401. Accès refusé : `{t:'error', code:'not_allowed'}`, fermeture 4403.
- Téléphone → serveur : `create` → `{t:'room', code, side:0}` (code à 4 chiffres, 10 min) ; `join {code}` → `{t:'room', code, side:1}` puis `{t:'start', you, names:[…], roles:[…]}` aux deux ; `in {x, y}` (son joueur, ~30 / s) ; `hit {n, at, b:[x,y,vx,vy], p:[x,y]}` ; `ping {c}` → `pong {c, s}` ; `react {r: 0|1|2}` (1 / s) ; `rematch` ; `leave`.
- Serveur → téléphone : `state {s, ph, pt, b, p:[[x,y],[x,y]], sc, ack:[n0,n1], k, kt}` 30 fois par seconde (`ph` : `count` 3 s au coup d'envoi du match, `ready` 0,8 s à chaque engagement, `live`, `goal` 1,9 s, `over`) ; `goal {by, sc}` ; `end {winner, sc}` ; `opp_left` ; `react {r}` ; `error {code}`.
- Noms : l'admin = « D'Home Barber » ; un barber = le prénom de sa fiche ; un client = prénom + initiale ; jamais d'email.
- Prototype : un joueur qui se déconnecte termine le match (pas de reprise).

### Après les relectures du 29 oct. 2026 (contrat en vigueur)

- `auth` porte la version du protocole `v: 1` ; autre valeur → `update_required` et fermeture 4426 (les téléphones gardent un build des mois : toute évolution incompatible passe par `v`).
- L'app attend `hello` avant `create` / `join` ; le serveur garde tout de même le dernier `create` / `join` reçu pendant l'authentification.
- `pt` et `kt` sont **en secondes**. `count` enchaîne directement sur `live` ; `ready` ne suit qu'un but ou un changement de camp.
- Une frappe porte l'instantané **du moment du choc** (`at`, `b`, `p`) ; 10 ms au moins entre deux frappes acceptées, 250 ms d'âge au plus ; le délai de 150 ms du but court depuis `max(franchissement, réception de la frappe qui l'a produit)`.
- Erreurs : `no_room` (code inconnu ou salle pleine, même réponse), `own_room` (deux téléphones sur le même compte : il faut deux comptes), `room_expired`, `rate_limited`, `server_full`, `update_required`, `not_allowed` (aussi en cours de partie si l'accès est retiré, revérifié toutes les 60 s), `server_error` suivi d'une fermeture 1011.
- Garde-fous : avant `auth`, seuls `auth` et 2 `ping` (3 s pour s'authentifier, 20 sockets non authentifiées au plus) ; lecture du compte en cache 60 s, 10 authentifications par minute par compte et par IP ; 2 sockets par compte (la plus récente remplace l'autre), une salle d'attente de 2 min, 5 `join` ratés par minute puis 10 min de blocage ; 10 ouvertures par minute et par IP sur `/ws/coupe` seulement (jamais sur `/ws/live`) ; seau de 60 messages/s (réserve 120), excédent ignoré ; socket terminée au-delà de 256 Ko en attente ; 60 sockets et 20 matchs au plus ; `maxPayload` 1024.
- Coupure d'urgence : variable Heroku `COUPE_WS=off` (`/ws/coupe` refusé, `/ws/live` intact).
- Chaque fin de match écrit une ligne `[Coupe] fin de match …` (frappes acceptées / refusées par raison, écarts p50 / p95), sans nom ni identifiant : elle sert à régler les tolérances.

### Essai sur deux téléphones (29 oct. 2026, vers 02:50 Paris) : validé

Serveur Heroku v157, app commit 8d6494f. Verdict du propriétaire : « c'est bien sur mobile ». Trois matchs (3-1, 3-0, 3-2) d'après les lignes `[Coupe] fin de match` :

| | match 1 | match 2 | match 3 |
|---|---|---|---|
| frappes acceptées / refusées | 40 / 0 | 27 / 0 | 38 / 0 |
| écart ballon p50 / p95 (unités) | 2,8 / 19,5 | 3,3 / 23,5 | 4,9 / 27 |
| âge d'une frappe p50 / p95 | 67 / 96 ms | 66 / 85 ms | 65 / 90 ms |
| recalage joueur p50 / p95 | 12,5 / 42,1 | 12,5 / 54 | 25 / 82,8 |

Aller-retour mesuré depuis le Mac (fixe) vers la région us : médiane 106 ms, p95 178 ms (`scripts/coupe-latency.js measure`). Le principe réseau est retenu ; pas de déménagement du serveur. Ces mesures servent à resserrer les tolérances avant les points (écart ballon p95 ≈ 27 contre 30 + 0,06 × vitesse toléré aujourd'hui ; âge p95 < 100 ms contre 250 ms permis).

### Latence et notifications de défi : audit du 29 oct. 2026 au soir (lecture seule)

- **Latence** : serveur Heroku en région **us**, une seule machine. Aller-retour depuis le Mac (fixe) : médiane 110 à 118 ms, p95 190 à 300 ms ; les pics se voient aussi sur les ouvertures TCP (ligne, pas le serveur). Même base que l'essai à deux téléphones ; le serveur accepte une frappe jusqu'à 400 ms d'âge. Rien n'indique un problème côté serveur. Déménager en Europe diviserait le plancher par trois, mais l'adresse de l'API est écrite dans les apps publiées : il faudrait d'abord un domaine à nous (`api.dhomebarber.fr`) dans un build (reste à faire).
- **Mesures des vrais matchs gardées** (avant : seulement dans les journaux Heroku, effacés en moins d'une heure) : `coupe_matches.metrics` (JSONB : frappes acceptées / refusées et raisons, âge p50/p95, écart ballon, recalage joueur, parades tardives, secondes de jeu ; des nombres seulement, `metricsJson`), écrit avec le match ; un match annulé n'est jamais enregistré. Lecture : `heroku run "node scripts/coupe-mesures.js --days=7" --app dhomebarber-api`.
- **Défis à un barber, corrigés** (`lib/coupeResults.js` `reachableUsers` / `canChallenge`, `lib/coupeNotify.js`, `lib/coupeHours.js`) :
  - la nuit (21:00–08:00), aucun push de défi ne part : un barber n'est joignable que s'il a le jeu ouvert (avant : « Dispo » et défiable, le client attendait 2 min pour rien) ;
  - au plafond de 20 pushs de l'heure (`barberCapped`, lecture seule), plus proposé sans jeu ouvert ;
  - push web en urgence haute (`urgency: 'high'`, `pushHelper.sendToSubscriptions`) : un Android en veille le reçoit dans les 2 minutes ;
  - « jeu ouvert » (`isOnline` des salles) compté seulement en salle d'attente ou sur l'écran de fin, les seuls écrans où l'app affiche « Défi reçu ».
- **Qui reçoit un défi aujourd'hui** : push web seulement (les apps 1.0.9 / 1.0.17 n'ont pas le jeu) ; seul Kevin a un abonnement web (Dom et Romain : iOS seulement) : leur faire activer les notifications web, ou attendre les pushs natifs du build 18. Défi entre amis : lien partagé, aucune notification, valable 2 minutes.

### Avant d'ouvrir les points (revue de sécurité du 29 oct. 2026)

- Le serveur doit **recalculer lui-même chaque choc** (`collidePaddle` du moteur partagé) à partir de la position et de la vitesse du joueur, et ne plus croire le ballon envoyé : aujourd'hui un téléphone modifié peut annuler un but adverse ou tirer en téléguidé (démontré).
- Continuité du joueur vérifiée sur un historique des `in` horodatés ; tolérances resserrées d'après les mesures `[Coupe] fin de match` du prototype.
- Droit aux points seulement avec une visite constatée (encaissée, `attended_at` ou `completed`), plafonds par paire et par semaine, compteurs sous verrou, écriture idempotente par match.
- Reprise après déconnexion (10 s, 20 s de pause cumulée, 2 retours par match), `leave` en plein match = forfait.
- `Signaler` et `Bloquer` sur la fin de match et le classement (App Store 1.2, Play) ; brouillons stores et confidentialité : `docs/fonctions/coupe-du-gang-stores.md`.
- `/coupe-test` ne part jamais dans un build envoyé aux stores sans être décrit (règle 2.5.19).

## Stores

- Nouveau build (iOS build 18, Android versionCode 19) ; drapeau `features.*` ; jeu décrit dans les notes de revue (règle 2.5.19), le compte de démonstration peut jouer contre le salon.
- Nouvelle donnée : « Contenu de jeu » à déclarer (App Store, Play « Sécurité des données ») et `public/privacy.html`.
