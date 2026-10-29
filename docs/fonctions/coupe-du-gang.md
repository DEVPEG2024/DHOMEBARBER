# La Coupe du Gang : mini-jeu de foot façon air hockey

> Cahier des charges validé par le propriétaire le 28 oct. 2026. **Rien n'est encore codé dans l'app** : maquettes et prototype jouable d'abord, code ensuite. Ce fichier sert de référence aux sessions qui coderont le jeu ; il sera complété par le détail des fichiers quand ils existeront.
>
> - Planche des écrans (28 oct. 2026, en attente de validation) : https://claude.ai/artifact/6sEgcJPvzCvPtBQsGPP3vU
> - Prototype jouable (contre le salon, à deux sur un téléphone) : https://claude.ai/artifact/TDdZxv5v9xYGQwW28zSrxf ; source dans `docs/prototypes/coupe-du-gang.html` (moteur physique, ordinateur à 3 niveaux, effets : à reprendre pour l'app).

## Décisions du propriétaire (28 oct. 2026)

- Nom : **La Coupe du Gang** (coupe de cheveux / coupe du vainqueur).
- Jeu **en temps réel, façon air hockey, sur un terrain de foot vu du dessus** (le tour par tour à la pichenette, proposé d'abord, est écarté).
- **Points de Coupe séparés du niveau Gang** : ils ne changent ni le niveau, ni les stats 0–99, ni les écussons (le niveau reste calculé sur les visites).
- **L'admin joue sous le nom « D'Home Barber »** (logo, petite étoile bleue), comme dans le fil.
- **Interrupteur « Dispo pour un match »** pour chaque barber.
- **Aucun lot** : seulement un classement (donc pas de concours au sens de la règle Apple 5.3).
- Match à deux sur un seul téléphone : amical, sans points (recommandation non contestée).

## Règles du match

- Terrain vertical (téléphone tenu droit), vu du dessus ; ta cage toujours en bas. Bords = panneaux lumineux « D'Home Barber » où le ballon rebondit.
- Chaque joueur = un rond avec sa photo, qui suit le doigt **dans sa moitié** (jamais au-delà de la ligne médiane), placé un peu au-dessus du doigt pour que le pouce ne le cache pas.
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
- Contre un même adversaire, points au **premier match du jour** seulement ; au plus **5 matchs à points par jour** par joueur.
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
