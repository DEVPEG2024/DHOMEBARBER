# La Coupe du Gang : règlement v2, contrat de construction (31 oct. 2026)

Écrit par le chef avant le code, sur les décisions du propriétaire (`coupe-du-gang-regles-v2.md`, planche https://claude.ai/artifact/KDxZEPsPh97h8UJ9PLGASM, « GO » du 31 oct. 2026 qui accepte aussi les propositions de la planche). Chaque constructeur ne touche **que ses fichiers** (section 0) et suit ce contrat ; un écart nécessaire est signalé au chef, jamais réglé chez un autre.

## 0. Qui fait quoi

| Rôle | Fichiers (et seulement eux) |
|---|---|
| Chef (fait) | `src/lib/coupe/engine.js` = `lib/coupeEngine.mjs` (octet pour octet), `test/test-coupe-engine.js`, ce contrat |
| S1 serveur | `dhomebarber-api/lib/coupeRooms.js`, `lib/coupeResults.js`, `routes/public.js`, `test/test-coupe-regles-v2.js` (nouveau), retouches des tests `test/test-coupe-*.js` existants |
| F1 match en ligne | `src/lib/coupe/onlineMatch.js`, `e2e/support/fauxCoupe.js`, retouches de `e2e/coupe.spec.js` (version du protocole seulement) |
| F2 match hors ligne | `src/lib/coupe/localMatch.js` |
| F3 dessin et son | `src/lib/coupe/renderer.js`, `src/lib/coupe/effects.js` (nouveau), `src/lib/coupe/sound.js` |
| F4 interface | `src/components/coupe/**` (dont `CoupeGame.jsx`, `game/Hud.jsx`, `game/EndScreen.jsx`, `game/MatchIntro.jsx`, `game/GameStyles.jsx`, `game/challengeImage.js`, `hub/PlayModes.jsx`), `src/lib/coupe/coupeApi.js`, `src/components/home/GamesSection.jsx`, `src/lib/games.js`, `src/pages/CoupeTest.jsx`, `e2e/support/mockApi.js`, `e2e/coupe-regles-v2.spec.js` (nouveau), retouches de `e2e/coupe-accueil.spec.js`, `e2e/coupe-integrations.spec.js`, `e2e/coupe-animations.spec.js` |

Personne d'autre que le chef ne touche au moteur. Aucun constructeur ne fait de commit ni de déploiement.

## 1. Règles chiffrées (toutes dans le moteur)

- Premier à `GOALS_TO_WIN_V2` = **5** ; 5 min de jeu au plus (inchangé) ; égalité à 5 min → **but en or**.
- **Feu** (`FX_FIRE`) : frappe dont la vitesse d'impact (`collidePaddle`) ≥ `FIRE_HIT` (2200 : au-delà de `HIT_CAP`, il faut reprendre à pleine vitesse un ballon qui arrive ; à 1700, banc d'essai de F2 du 31 oct., une vingtaine de feux par match) vers le camp adverse, ou ballon qui dépasse `GEL_FIRE` sur le gel. Vaut 1. Traverse mousse et gel sans effet. S'éteint dans un jet d'arroseur, ou à la touche de l'adversaire (`touchBall`).
- **Électrique** (`FX_ELEC`) : ballon qui passe à moins de `CHARGE_R` d'un point frappé par la foudre, pendant `CHARGE_MS` (3 s) après l'éclair ; vitesse × 1,3, plafond `BALL_MAX_ELEC`. Vaut **2**. Le feu ne le remplace jamais. Perdu à la touche de l'adversaire. Dans un jet : **court-circuit**, il perd sa charge et **bondit** `HOP_S` (0,5 s) : ni choc, ni joueur repoussé, ni événement.
- `b.own` : camp qui a allumé ou chargé le ballon (direction d'attaque) ; `-1` sinon.
- **Fautes** (seulement en jeu normal : ni penalty, ni but en or, ni but en attente) :
  - camper : chrono `foulClock` (monte quand `inBigBox`, redescend deux fois plus vite dehors : un seul `in` hors de la surface toutes les 2,5 s l'effaçait, contre-expertise du 31 oct.) au-delà de `CAMP_S` (3 s) ; remis à zéro **quand le joueur touche le ballon** ;
  - bloquer : chrono `pinClock` (monte quand `pinnedBy` est vrai, redescend deux fois plus vite sinon) au-delà de `BLOCK_S` (1,5 s) ; `pinnedBy` sans condition de vitesse (un ballon écrasé contre le bord vibre à ~800 unités/s, et le serveur ne le voit qu'entre deux frappes : S1, 31 oct.) ;
  - garder : la règle des 5 s d'aujourd'hui (ballon qui change de camp) donne en plus un **avertissement** au camp qui gardait ; cumulés sur le match ; au `WARN_MAX`e (3e), **penalty** au lieu du changement de camp, et son compteur repart à 0.
  - Camper et bloquer donnent un penalty tout de suite.
- **Penalty** pour l'adversaire du fautif : tous les événements finissent ; phase `pen` de `PEN_SET_S` (1,8 s) : ballon sur `penaltySpot(tireur)` (`placePenalty`, à `PEN_D` = 160 de la ligne de but : 48 % de penaltys marqués par un bon tireur contre le salon Barber, 59 % entre deux humains, banc de F2 du 31 oct. ; 26 % à 190), chaque téléphone place son joueur (`penaltyPlace`), mode `{ k: 'pen', s: tireur }` (gardien sur `keeperLine` = sa ligne de but, centre entre les poteaux ; tireur derrière le point, ligne du milieu franchie. Gardien d'abord placé au bord de sa petite surface : il arrêtait 100 % des tirs directs sans bouger, banc d'essai du 31 oct.) ; puis `live` dans ce mode : `PEN_SHOT_S` (3 s) pour la première frappe du tireur ; après elle, `PEN_END_S` (1,5 s) pour marquer ; touche du gardien après le tir = arrêt, engagement `PEN_SAVE_S` (0,6 s) plus tard ; pas de tir à temps ou pas de but = raté. Arrêté ou raté : engagement du gardien (`ready`), mode effacé. But : comme tout but (célébration, engagement au gardien). Ni faute, ni règle des 5 s, ni événement, ni fin de temps pendant un penalty (le temps de jeu compte, la limite attend la fin du penalty).
- **But en or** : tous les événements finissent ; message `gold` ; engagement au hasard en `count` 3 s ; mode `{ k: 'gold' }` (tout le terrain sauf les deux petites surfaces) ; plus aucune règle (ni faute, ni règle des 5 s, ni événement) ; le premier but gagne, quelle que soit sa valeur (le score l'ajoute quand même) ; `GOLD_MAX_S` (2 min) de jeu sans but : match nul. Les deux joueurs peuvent se superposer (aucun choc entre joueurs : limite connue, chacun ne touche que le ballon).
- **Cages qui bougent** : mode `LINE_MODE` (`modeAt(mode, fld, t)`) : plus personne ne descend sur sa ligne de but (profondeur de la petite surface, toute la largeur), sinon un joueur collé à sa ligne bouchait la cage déplacée. Partout où un mode est passé (movePaddle, unpin, constrainPaddle des `in` et des `hit`), passer `modeAt(…)`.
- Ballon chargé à l'arrêt (foudre sur un engagement) : `own` -1, à celui qui le touche le premier.
- **Événements** (jeu normal seulement) : premier à `nextEventGap` (20 à 40 s) de **temps de jeu**, puis chaque fois 20 à 40 s après le précédent ; `pickEventKind` (jamais deux fois le même de suite) ; **`makeEvents(kind, id, t, rnd, pads)`** (rend 1 ou 2 événements : avec un orage ou un gel, l'arrosage s'ajoute une fois sur trois, `COMBO_P`, mêmes heures, identifiant suivant ; sans ce combo, deux événements ne se croisaient jamais et le court-circuit était impossible ; l'identifiant suivant à donner est `id + list.length`) ; annoncé à `an`, en jeu de `at` (= an + 1 s) à `until`. Après un penalty, pas d'événement avant 5 s de jeu.

## 2. Moteur (fait, à lire dans `engine.js`)

Sans les nouvelles options, chaque fonction calcule exactement comme avant (contrôlé sur 1,84 million de cas contre l'ancien fichier). Ajouts :

- options : `constrainPaddle(p, side, mode)`, `movePaddle(p, side, dt, maxSpeed, mode)`, `unpin(b, p, side, mode)`, `walls(b, onEvent, gx)`, `stepBall(b, dt, onEvent, fld, t)`, `advanceBall(b, seconds, onEvent, fld, t)` ; `fld` = liste des événements, `t` = heure en ms (horloge des événements) du début du pas ou de l'état ; `gx = goalOffsets(fld, t)` ;
- ballon : `fx`, `own`, `air` (absents = 0) ; `clearFx(b)` ; `placeKickoff` les efface ; `capBall` plafonne à `BALL_MAX_ELEC` un ballon électrique ; `collidePaddle` rend 0 et `unpin` ne fait rien sur un ballon en l'air ;
- `touchBall(b, side, hit)` après **chaque** frappe acceptée (`hit` > 0) en règlement v2 : rend `'fire'`, `'out'` ou null ;
- `onEvent` de `stepBall` reçoit en plus `'fire'`, `'charge'`, `'douse'`, `'short'` (le gestionnaire d'aujourd'hui du téléphone traite tout ce qui n'est pas `'post'` comme `'wall'` : à corriger) ;
- `goalValue(b)`, `inBigBox`, `pinnedBy`, `pinClock`, `penaltySpot`, `keeperLine`, `placePenalty`, `penaltyPlace`, `inLobes`, `jetAngle`, `goalOffsets`, `liveEvents`, `rng(seed)`, `nextEventGap`, `pickEventKind`, `makeEvent`, `makeEvents` (à utiliser pour créer), `flipEvent` ; constantes en tête du fichier.

Ordre d'un pas, partout (serveur, téléphone, hors ligne) : `movePaddle(…, mode)` ; ballon `stepBall(b, STEP, onEvent, fld, t)` ; `collidePaddle` ; si frappe et règlement v2 : `touchBall` ; `walls(b, null, goalOffsets(fld, t))` ; `unpin(b, p, side, mode)`.

## 3. Événements : descripteurs

Repère du serveur (joueur 0 en bas). Le téléphone du joueur 1 les tourne avec `flipEvent` à la réception. Communs : `k`, `id` (entier croissant dans le match), `an`, `at`, `until` (ms, horloge du serveur ; hors ligne, horloge du match), `sd` (graine du dessin, `rng(sd)`, sans effet sur le jeu).

| `k` | Champs | Effet (moteur) | Dessin (proposé par la planche) |
|---|---|---|---|
| `foam` | `l` : 2 ou 3 ellipses `[x, y, rx, ry, angle]` | freine (`FOAM_DRAG`), jamais sous `FOAM_MIN` | flaque de bulles qui épouse les ellipses, sillon du ballon, bulles qui éclatent, brûlées par le feu |
| `gel` | `l` : une ellipse | accélère (`GEL_GAIN`), enflamme au-delà de `GEL_FIRE` | flaque translucide (pelouse déformée), ondes, reflets |
| `storm` | `b` : 1 à 3 éclairs `[x, y, t]` | point chargé `CHARGE_R` (32) de t à t + 3 s | ciel assombri, pluie, éclair ramifié et flash à t, trace brûlée, braises, arcs bleus du point chargé |
| `goals` | `g` : `[clés de la cage du bas, clés de la cage du haut]`, clés `[[ms depuis at, dx], …]` de `[0, 0]` à `[8000, 0]` | cages décalées (`goalOffsets`, `walls`) ; les petites surfaces restent au milieu | **une seule cage visible à chaque bout** : la cage peinte dans l'image du stade est recouverte, la cage dessinée glisse (règle « jamais deux versions d'un même élément ») |
| `water` | `s` : 2 à 4 arroseurs `[x, y, base, range, len, ph]` | jet de `JET_MIN` à `len`, demi-largeur `JET_W`, angle `jetAngle(s, t − at)` : pousse (`JET_PUSH`), éteint, court-circuite | têtes qui sortent de la pelouse pendant l'annonce, gouttes qui suivent l'angle du jet, pelouse mouillée plus sombre |
| `smoke` | `x0, y0` (tribune, hors du terrain), `x, y` (arrêt), `w` (vent `[vx, vy]`) | aucun : il cache seulement | fumigène lancé de (x0, y0), qui rebondit et roule jusqu'à (x, y) pendant l'annonce, flamme rouge, fumée épaisse poussée par `w`, qui **cache le ballon** pour les deux joueurs |

Annonce (de `an` à `at`) : contour de la zone qui clignote, jamais d'effet sur le jeu. Fin : retrait en douceur (≈ 0,5 s) après `until`, sans effet.

## 4. Protocole v3 (`/ws/coupe`)

- `auth.v` : le téléphone envoie **3** ; le serveur accepte 2 et 3 (autre valeur : `update_required`, 4426, inchangé). La socket garde sa version.
- Règlement d'un match, décidé à chaque `startMatch` (revanche comprise) : **v2 si les deux sockets sont en v3 et `COUPE_RULES_V2` n'est pas `off`**, sinon la règle d'aujourd'hui, inchangée octet pour octet pour les apps publiées. Reprise (`resume`) par une socket v2 dans un match en règlement v2 : `error no_room`.
- Tout ce qui suit n'existe qu'en règlement v2 ; positions et camps dans le repère du serveur (le téléphone du joueur 1 tourne, comme pour `b` et `p`).
- `start` : `rules: 2`, `gw: 5` (absents = règle d'aujourd'hui, 3 buts) ; après une reprise, `evs` (événements dont `until` n'est pas passé).
- `state` en plus : `b` = `[x, y, vx, vy, fx, own, air]` (air en s, au millième) ; `md` absent (jeu normal), `['pen', s, left]` (tireur s ; `left` : secondes pour tirer, au dixième, `-1` après le tir) ou `['gold', left]` (secondes de but en or restantes) ; `w: [w0, w1]` avertissements ; `cp: [c0, c1]` secondes d'affilée en grande surface et `pk: [p0, p1]` secondes de ballon bloqué (au dixième, 0 hors faute possible) ; `ne: [left, total]` secondes de jeu avant l'annonce du prochain événement et écart total (absent sans événement prévu : penalty, but en or). Phase nouvelle `ph: 'pen'`.
- Messages nouveaux : `ev {e}` (création, au moment de l'annonce) ; `ev_end {id}` (fin avant `until` : penalty, but en or) ; `foul {side, k, w, pen}` (`side` : le fautif, `k` : `'camp'` | `'block'` | `'keep'`, `w` : avertissements après la faute, `pen` : penalty donné) ; `pen_end {r}` (`'goal'` | `'saved'` | `'missed'`) ; `gold {}`.
- `goal` en plus : `v` (valeur, 1 ou 2), `fx` (effet du ballon au franchissement).
- `end.reason` en plus : `'golden_goal'` (vainqueur du but en or, points normaux). But en or sans but : `'time_limit_draw'` (inchangé).
- `hit`, `in` : inchangés ; le serveur vérifie le joueur avec `constrainPaddle(q, side, mode)` du mode en cours.

## 5. Arbitre du serveur (S1)

- Physique : `stepOnce` passe `room.evs` et `room.simT` ; l'historique garde `fx`, `own`, `air` ; `ballAt` les rend et avance avec les événements ; `checkHit` applique `touchBall` et `walls(…, goalOffsets(evs, at))` sur son ballon ; une frappe acceptée remet à zéro le chrono de camping de son auteur.
- But : valeur lue au franchissement (`pending.v = goalValue(ball)`), ajoutée à la confirmation ; victoire à `gw` ou au premier but du but en or.
- Fautes, penalty, but en or, événements : section 1, chronos au pas de physique sur `room.pads` (positions des `in`) et le ballon du serveur.
- Métriques de fin de match (nombres seulement, dans `coupe_matches.metrics`) : `rules`, feux, charges, courts-circuits, fautes par sorte, penaltys par issue, événements, but en or (0 ou 1), buts à 2.
- Drapeau public `features.coupeRulesV2` = jeu ouvert et `COUPE_RULES_V2` différent de `off`.

## 6. Le match côté téléphone : image et événements (F1 et F2, mêmes formes)

`OnlineMatch` et `LocalMatch` rendent la **même** image (`getFrame()`) et les mêmes événements (`onEvent(type, data)`) ; repère local : le joueur du bas est l'index 0 (en ligne : soi ; hors ligne : le joueur du bas). Tout ce qui est ajouté est neutre en règle d'aujourd'hui.

Image, en plus de l'existant :

```js
{
  phase,            // + 'pen' (ballon posé sur le point, joueurs qui se placent)
  rules: 1 | 2,
  goalsToWin: 3 | 5,
  now,              // ms, horloge des événements (en ligne : heure du serveur estimée)
  events: [],       // descripteurs en repère local, annoncés ou en cours (now < until)
  goalOff: null,    // [dx cage du bas, dx cage du haut] = goalOffsets(events, now)
  ball: { x, y, vx, vy, roll, fx, own, air },  // own en repère local
  mode: null,       // { k: 'pen', s, left } (s local ; left : s pour tirer, -1 après le tir) | { k: 'gold', left }
  warn: [0, 0],     // avertissements
  camp: [0, 0],     // secondes d'affilée en grande surface
  pin: [0, 0],      // secondes de ballon bloqué
  nextEvent: null,  // { left, total } en secondes de jeu
}
```

Événements, en plus de l'existant (les champs sont en repère local) :

- `start`, `resumed` : + `rules`, `goalsToWin` ;
- `goal` : + `value` (1 ou 2), `fx` ;
- `event` `{ e }` à l'annonce ; `event_end` `{ id }` ;
- `bolt` `{ x, y }` quand l'horloge passe l'heure d'un éclair (une fois) ;
- `fire` `{ x, y }`, `charge` `{ x, y }`, `douse` `{ x, y, was }` (feu ou charge perdus sans bond), `short` `{ x, y }` (bond) : sur les changements du **ballon affiché** (`fx`, `air`), une fois chacun ;
- `foul` `{ side, k, warn, pen }` ; `penalty` `{ s }` au début de la phase `pen` ; `pen_end` `{ r }` ; `gold` `{}`.

En ligne (F1) : `auth.v` 3 ; `fld` local tenu par `ev` / `ev_end` / `start.evs` (tournés avec `flipEvent` pour le joueur 1), oublié avec `liveEvents` ; prédiction avec `fld` et l'heure du serveur estimée ; recalage sur `b` à 7 valeurs (`own` et `s` tournés pour le joueur 1 : `1 − v`, sauf `-1`) ; au début de `pen`, son joueur posé sur `penaltyPlace(0, s local)` ; tableaux `w`, `cp`, `pk` échangés pour le joueur 1. Faux serveur : `auth` accepte 2 et 3 ; `faux.regles = 2` avant le `start` y met `rules: 2, gw: 5` ; `etat(cnx, {…})` et `envoyer(cnx, {…})` passent les champs v2 tels quels ; `md`, `w`, `cp`, `pk`, `ne` et `b` à 7 valeurs envoyés si l'état les a.

Hors ligne (F2) : `new LocalMatch({ mode, level, onEvent, rules })` (`rules` 2 ou 1, défaut 1) ; mêmes règles que le serveur (section 1) avec son horloge et `Math.random` ; le robot apprend le penalty (gardien qui suit le ballon sur sa ligne ; tireur qui attend 0,4 à 1,4 s puis frappe fort vers un côté de la cage), le but en or (il peut monter) et ne campe jamais 3 s (il quitte sa grande surface avant 2 s) ; « À deux » : mêmes règles pour les deux joueurs.

## 7. Dessin et son (F3)

- Tout se lit dans l'image : `events`, `now`, `goalOff`, `ball.fx` / `air`, `mode`, `camp`, `pin`, `phase`. Les éclats ponctuels (allumage, charge, vapeur, court-circuit, éclair) naissent des changements d'une image à l'autre et de l'heure des éclairs, sans appel de l'interface. API existante gardée ; `renderer.goal(scorer, { value, fx })` (deuxième argument facultatif) pour un but électrique ou en feu.
- Base : les dessins de la planche (`docs/prototypes/coupe-regles-v2/coupe-sim.js`), portés dans `effects.js` (fonctions de dessin par événement, en coordonnées du terrain, sur le canvas du renderer).
- Thème stade : l'image est le terrain ; les effets se posent dessus. Cages qui bougent : recouvrir la cage peinte (raccord de pelouse) et dessiner la cage mobile, **jamais deux cages à un même bout**. Fumigène : par-dessus le ballon. Ballon en l'air : plus gros, ombre décalée.
- Penalty : point de penalty et ligne du gardien marqués pendant `mode.k === 'pen'` ; but en or : ligne du milieu qui s'efface (franchissable) ; anneau qui se remplit sous son joueur à partir de 1 s de camping (rouge à 3 s), et autour du ballon bloqué à partir de 0,5 s.
- Aucun texte dans le canvas (les bandeaux sont dans l'interface, F4). `reducedMotion` : pas de secousse ni de flash plein écran, effets fixes plutôt qu'animés.
- Mobile : particules plafonnées (≈ 300 en tout), sprites préparés une fois ; 60 images/s sur un iPhone moyen.
- Son : `sound.fx(nom)` (bruitage court, synthétisé comme les autres) pour `'fire'`, `'charge'`, `'douse'`, `'short'`, `'bolt'`, `'whistle'` (faute), `'warn'` (avertissement), `'penalty'`, `'save'`, `'gold'`, `'goal2'` (but à 2) ; `sound.event(kind)` à l'annonce d'un événement (un bruit par sorte). Coupés avec le son du jeu.

## 8. Interface (F4)

- Drapeau `useCoupeRulesV2()` dans `coupeApi.js` (`features.coupeRulesV2 === true`) ; hors ligne : `rules: drapeau ? 2 : 1` ; en ligne : le serveur décide (`start.rules`).
- Écran de match (planche « Écran de match ») : `goalsToWin` pastilles de buts par joueur, 3 pastilles d'avertissement en règlement v2, jauge « Prochain événement » (`nextEvent`), compte du penalty (3, 2, 1), « BUT EN OR ».
- Bandeaux (HTML, `aria-live="polite"`, jamais dans le canvas, un à la fois, ~1,4 s) : nom de l'événement à l'annonce (MOUSSE À RASER, GEL, ORAGE, BUTS QUI BOUGENT, ARROSAGE, FUMIGÈNE) ; FAUTE + raison (« Tu campais devant ton but », « Kevin bloquait le ballon »…) ; AVERTISSEMENT n/3 ; PENALTY ; ARRÊTÉ / RATÉ ; BUT EN FEU ; BUT ÉLECTRIQUE +2 ; BUT EN OR. Tutoiement (ton du jeu).
- Astuces une fois : camping (« Ne reste pas plus de 3 s devant ton but »), penalty (« Tire avant 3 s » / « Garde ta ligne »), but en or (« Tu peux monter chez l'adversaire »).
- Textes « premier à 3 buts » : 5 quand le drapeau est vrai (accueil, page Jeux, modes de jeu, avant-match, image de défi, `/coupe-test`) ; une page ou un volet « Règles » qui résume le règlement v2.
- Écran de fin : `reason: 'golden_goal'` (« Victoire au but en or »).
- Sons et vibrations des nouveaux événements (`sound.fx`, `sound.event`, `buzz`).
- Vérifications : `e2e/coupe-regles-v2.spec.js` avec le faux serveur (`faux.regles = 2`) et l'API simulée (`features.coupeRulesV2: true`) ; anciens tests de la Coupe verts, avec et sans le drapeau.

## 9. Compatibilité et coupure

- Apps publiées (build 18 et 19, protocole 2) : règle d'aujourd'hui, inchangée ; elles ne voient jamais `rules`, `pen`, `md`…
- Un téléphone v3 contre un téléphone v2 : règle d'aujourd'hui pour les deux ; l'app v3 doit jouer parfaitement sans `rules`.
- `COUPE_RULES_V2=off` (Heroku, sans déploiement) : plus de règlement v2 en ligne, `features.coupeRulesV2` faux, les matchs hors ligne reviennent aussi à la règle d'aujourd'hui.
- Déploiement : Heroku d'abord (accepte v2 et v3), Vercel ensuite.
