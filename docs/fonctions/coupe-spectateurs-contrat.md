# La Coupe du Gang : spectateurs et écran du salon (contrat de l'étape 2 des tournois)

Écrit le 4 nov. 2026 par le chef, avant le code. Planche validée : https://claude.ai/artifact/S7Kk4Bv1c35Yz3acHuZk9r, écrans 13 (spectateur), 14 (écran du salon pendant un tournoi) et 15 (écran du salon le reste du temps). Décisions : `coupe-tournois.md`. Étape 1 (tournois) : `coupe-tournois-contrat.md`. Protocole du jeu : `coupe-du-gang-contrat.md` et `coupe-du-gang-regles-v2-contrat.md`.

## 0. Décisions (propriétaire et chef)

Propriétaire (3 et 4 nov. 2026) :
- On peut regarder un match sans jouer (« possible d'être seulement spectateur des matchs ? »).
- Écran du salon « tout le temps » : pendant un tournoi le match en cours et le tableau, le reste du temps classement, prochain tournoi, barbers dispo, derniers matchs, record du Snake.
- **Réponse B du 4 nov. 2026** : un match ordinaire d'un barber ne passe jamais à l'écran tant que le barber ne l'a pas allumé lui-même (« Rien ne passe à l'écran tant que le barber ne l'a pas allumé lui-même »).

Chef (4 nov. 2026, d'après la planche) :
1. **Un seul réglage, « Laisser regarder mes matchs »**, éteint par défaut pour tout compte (client, barber, admin) : `users.coupe_watch_opt_in`. Un match **ordinaire** est regardable (téléphones **et** écran du salon) seulement si **les deux** joueurs l'ont allumé, relu en base à chaque coup d'envoi (revanche comprise). L'éteindre en plein match fait sortir tout de suite les spectateurs de ses matchs ordinaires.
2. **Match de tournoi : toujours regardable** (s'inscrire, c'est accepter d'être regardé ; la page d'inscription le dit).
3. Qui regarde : tout compte connecté, sauf un compte assis dans ce match et sauf blocage dans un sens ou l'autre avec l'un des joueurs (`coupe_blocks`, même lecture que `isBlocked`) ; et l'écran du salon (clé d'écran, section 3).
4. Le spectateur ne joue rien, ne compte nulle part, n'est rangé nulle part (aucune table de spectateurs) : seul le nombre maximal de spectateurs d'un match entre dans ses mesures (`watch_max`, un nombre).
5. **Réactions toutes faites, aucun message écrit** : 0 « Allez ! », 1 « Quel but », 2 « Bravo », 3 « Oh non ». Anonymes (jamais le nom du spectateur). Une par spectateur toutes les 3 s ; le serveur en relaie une par seconde au plus et par match, l'excédent est jeté. L'écran du salon ne réagit pas.
6. Les joueurs voient le nombre de spectateurs et si l'écran du salon les montre ; ils voient passer les réactions (petites bulles, jamais sur le centre du terrain).
7. Noms affichés : ceux du jeu (`start.names` : « Lucas M. », prénom du barber, « D'Home Barber ») ; pions des spectateurs et de l'écran aux **initiales**, **jamais une photo** (le serveur n'envoie aucune photo aux spectateurs).
8. Plafonds : 50 spectateurs par match, 120 sockets de spectateurs en tout (écrans compris), 3 sockets d'écran. Le spectateur reçoit un état sur deux (15 par seconde) ; l'app dessine avec 200 ms de retard pour lisser.
9. Coupure d'urgence `COUPE_SPECTATEURS=off` (Heroku) : `features.coupeSpectators` faux, `watch` → `error {code: 'disabled'}`, `/coupe/live` et `/coupe/screen` → 404 `disabled`. Faux aussi avec `COUPE_WS=off`.
10. Écran du salon : **site seulement** (route `/ecran`, absente des apps : règle 2.5.19, comme `/coupe-test`), sans compte client, avec une clé d'écran créée par l'admin. Muet (aucun son). Seulement des noms déjà publics, jamais de photo.
11. Les apps : la vue spectateur, la liste « En direct », le réglage et le compteur arrivent avec le prochain build (notes de revue 2.5.19), derrière `features.coupeSpectators`. Les apps publiées ne changent pas : elles n'ont pas le réglage (donc jamais regardées hors tournoi) et ignorent les messages inconnus (`default: break` de `onlineMatch.js`) ; le serveur n'envoie de toute façon les messages nouveaux qu'aux sockets en protocole 3.
12. Aucune nouvelle donnée collectée (un réglage, rien sur les spectateurs) : ni étiquette de confidentialité ni `privacy.html` à changer.

## 1. Protocole des spectateurs (`/ws/coupe`, serveur `lib/coupeRooms.js`)

### 1.1 Connexion

- Spectateur connecté : `auth {token, v: 3, watch: true}` → `hello {name, role, watch: true}`.
- Écran du salon : `auth {screen: <clé>, v: 3}` → `hello {role: 'screen', watch: true}` (clé vérifiée par l'option `authenticateScreen`, section 1.6). Clé inconnue ou coupée : fermeture 4401, comme un jeton refusé.
- Une socket est **soit joueur, soit spectateur**, décidé à l'`auth`. Une socket spectateur ne peut ni créer, ni rejoindre, ni défier, ni jouer : `create`, `join`, `peek`, `challenge`, `decline`, `resume`, `tjoin`, `rematch`, `in`, `hit`, `react` → `error {code: 'watch_only'}` (aucune fermeture). Une socket joueur qui envoie `watch` → `error {code: 'watch_only'}`.
- Sockets spectateurs comptées à part : 1 par compte (la plus récente remplace l'ancienne : `replaced` puis 4409, comme aujourd'hui), jamais dans les 2 sockets joueur d'un compte, jamais dans le plafond de 60 sockets joueur. Plafond global à l'ouverture : 60 + 120. Après l'`auth` : 61e socket joueur → fermée 1013 sans message (comme aujourd'hui à l'ouverture) ; 121e spectateur ou 4e écran → `error {code: 'server_full'}` puis fermeture 1013.
- Une socket spectateur sans match regardé est fermée au bout de 5 min (`idle`, 4408), comme une socket joueur sans salle.
- `ping` / `pong` comme pour un joueur.

### 1.2 Regarder

- `watch {m: <uuid du match de tournoi>}` ou `watch {w: <identifiant de match ordinaire>}` (12 caractères `[a-z2-9]`). Au plus 10 `watch` par minute et par socket (au-delà : `error {code: 'rate_limited'}`). Un `watch` remplace le match regardé avant.
- Réponses :
  - `wstart {…}` (1.3), puis les messages du match ;
  - `error {code: 'not_live'}` : match de tournoi connu du serveur de jeu mais pas encore commencé (salle d'attente, ou pas encore de salle) : l'app réessaie toutes les 5 s ;
  - `error {code: 'no_match'}` : inconnu, fini, pas regardable (match ordinaire sans les deux accords), compte assis dans ce match, blocage : **une seule réponse**, on ne sonde pas ;
  - `error {code: 'watch_full'}` : 50 spectateurs ;
  - `error {code: 'disabled'}` : `COUPE_SPECTATEURS=off`.
- `unwatch {}` : quitte le match regardé (aucune réponse).
- `cheer {r}` (`r` entier 0 à 3) : réaction. Ignorée sans match regardé, pour un écran, ou à moins de 3 s de la précédente de cette socket.

### 1.3 `wstart`

```
wstart {
  kind: 'tour' | 'room', id: <m ou w>,
  names: [n0, n1], roles: [r0, r1],          // comme start (joueur 0 en bas, repère du serveur)
  rules: 1 | 2, gw: 3 | 5, sc: [a, b], kick,
  ph, cd?,                                   // phase en cours, compte à rebours comme state
  evs: [...],                                // règlement v2 : événements dont `until` n'est pas passé
  so: [[...], [...]] | null,                 // tirs au but en cours
  tour: { tid, name, label } | null,         // `label` : « Quart 1 », « Finale »…
  watchers: n, screen: bool                  // spectateurs (écrans compris), un écran regarde ?
}
```
Jamais `keys`, `photos`, ni rien d'autre sur les joueurs.

### 1.4 Messages relayés au spectateur

- `state` : **le même texte que celui des joueurs** (repère du serveur, joueur 0 en bas), **un sur deux** ; aucun état quand la socket a plus de `MAX_BUFFERED` en attente.
- Tels quels : `goal`, `ev`, `ev_end`, `foul`, `pen_end`, `gold`, `shootout`, `pause`, `time_left`.
- Jamais : `start`, `room`, `end`, `invite`, `react`, `error` d'un joueur, `waiting_opponent`, `opp_left`, `declined`.
- Fin : `wend {winner: 0 | 1 | null, sc, reason, forfeit, so?}` (mêmes valeurs que `end`, sans points ni classement), puis la socket ne regarde plus rien (elle reste ouverte). Salle fermée sans résultat (erreur du serveur, admin, match coupé par le serveur) : `wend {winner: null, sc, reason: 'closed', forfeit: false}`. Accord retiré (1.6, `unwatchUser`) : `wend {…, reason: 'private'}`. Revanche : jamais suivie (nouveau `w`).
- `watchers {n, screen}` (1.5) et `cheer {r}` des autres spectateurs.

### 1.5 Ce que voient les joueurs (sockets en protocole 3 seulement)

- `watchers {n, screen}` : à chaque changement, au plus un par seconde (le dernier état part à la fin de la seconde) ; `n` = spectateurs, écrans compris ; `screen` = un écran du salon regarde. Envoyé aussi juste après `start` si `n > 0`.
- `cheer {r}` : relayé aux deux joueurs et aux autres spectateurs, une par seconde au plus et par match.
- Une socket joueur en protocole 2 (apps publiées) ne reçoit **jamais** ces messages ; ses messages restent octet pour octet ceux d'aujourd'hui.

### 1.6 Ce qui est regardable, options et fonctions exportées

- Match de tournoi (`room.tour`) : regardable dès `start`, jusqu'à la fin.
- Match ordinaire : à chaque `startMatch`, `watchAllowed([userId0, userId1])` (option, 3 s au plus, erreur ou délai = non regardable) ; si les deux sont vrais, la salle reçoit un `w` neuf (`room.wid`), effacé à la fin du match. Le coup d'envoi n'attend jamais cette lecture.
- Options nouvelles de `createCoupeServer` :
  - `watchAllowed(userIds) → Promise<boolean[]>` (défaut : tout faux) ;
  - `authenticateScreen(key) → Promise<{ screenId } | null>` (défaut : null) ;
  - `spectators() → boolean`, relue à chaque `watch` (défaut : `COUPE_SPECTATEURS` différent de `off`, casse indifférente) ;
  - blocages : l'option `isBlocked` existante, `isBlocked({userId, role}, {userId, role})` pour le spectateur et chacun des joueurs (3 s au plus, erreur = pas bloqué, comme aujourd'hui).
- Exports nouveaux :
  - `watchableLive()` → `[{ kind, id, names, roles, sc, startedAt (ms, heure murale), watchers, screen, tour: { tid, name, label } | null, userIds: [u0, u1] }]` (matchs commencés regardables ; `userIds` interne : la route le retire) ;
  - `unwatchUser(userId)` : ses matchs ordinaires en cours perdent leur `w`, leurs spectateurs reçoivent `wend {reason: 'private'}` ;
  - `dropScreen(screenId)` : ferme les sockets de cet écran (4401).
- Mesures du match : `watch_max` (nombre maximal de spectateurs, écrans compris).
- Journaux : compteurs seulement, jamais de nom ni d'id.

## 2. Routes REST (serveur `routes/coupe.js`, `lib/coupeScreen.js`)

Toutes répondent 404 `{code: 'disabled'}` sans `features.coupeSpectators` (sauf les ajouts à `/coupe/me` et `/coupe/settings`, toujours là).

- `GET /coupe/me` : + `watch_opt_in` (booléen).
- `PATCH /coupe/settings` : + `watch_opt_in` (booléen, facultatif ; tout compte, admin et compte exclu des classements compris) ; au moins l'un des trois champs. Réponse + `watch_opt_in`. Passé à faux : `coupeServer.unwatchUser(userId)`. (Attention : l'admin a aujourd'hui une réponse anticipée ; `watch_opt_in` doit être enregistré avant.)
- `GET /coupe/live` (connecté) : `{ server_now, matches: [{ kind, id, names, roles, sc, started_at (ISO), watchers, screen, tour: { tid, name, label } | null }] }` : les matchs de `watchableLive()` moins ceux où le lecteur est assis et ceux avec un blocage dans un sens ou l'autre ; tournoi d'abord, puis du plus récent au plus ancien ; 20 au plus. 30 lectures par minute et par compte.
- `GET /coupe/screen` (en-tête `X-Screen-Key`, **sans compte**) : 403 `{code: 'screen_revoked'}` si la clé est inconnue ou coupée (jamais 401 : l'app ne doit pas croire à une session perdue). 60 lectures par minute et par IP (trois écrans relisent toutes les 5 s pendant un tournoi : 30 était trop serré, décision du chef du 4 nov. 2026). Pose `coupe_screens.last_seen_at` (au plus une fois par minute). Réponse :

```
{
  server_now,
  season, season_ends_at,
  tournament: null | {                         // tournoi en cours (status live, ou checkin / draw dans les 15 min)
    id, name, status, size, starts_at, round_label,
    rounds: [{ label, matches: [{ mid, label, p: [{ name, role } | null, …], sc, so, status, winner }] }]
  },
  next_tournament: null | { id, name, starts_at, size, registered, url },   // prochain à s'inscrire ; url https://dhomebarber.fr/coupe/tournoi/<id>
  leaderboard: [{ rank, name, role, points }],  // saison, 8 premières lignes, volontaires seulement (loadBoard), jamais de photo
  barbers: [{ name, available }],               // fiches actives visibles avec un compte ; available = « Dispo pour un match » et pas occupé
  recent: [{ p: [{ name, role }, …], sc, reason, ended_at }],  // 5 derniers matchs du jour (Paris) dont les deux joueurs sont publics
  played_today: n,                              // matchs finis aujourd'hui (Paris), tous
  snake: null | { name, score },                // meilleur du mois au classement volontaire du Snake (features.snake)
  live: [ …même forme que /coupe/live… ]        // tous les matchs regardables commencés
}
```
« Public » pour `recent` : barber, salon, client volontaire au classement de la Coupe non exclu, ou match de tournoi. Noms par `displayName`, jamais d'email, d'id de compte ni de photo.
- `GET /coupe/admin/screens` (admin) : `[{ id, label, created_at, last_seen_at }]` (écrans non coupés).
- `POST /coupe/admin/screens {label?}` (admin) : `{ id, label, key, url }`, `url` = `https://dhomebarber.fr/ecran#cle=<key>` ; la clé n'est rendue **qu'une fois**. 5 écrans actifs au plus → 409 `too_many_screens`. `label` 1 à 40 caractères, défaut « Écran du salon ». 10 par heure et par compte.
- `DELETE /coupe/admin/screens/:id` (admin) : coupe l'écran (`revoked_at`), `coupeServer.dropScreen(id)` ; `{ ok: true }` ; inconnu → 404.
- Paramètres publics : `features.coupeSpectators`.
- CORS : `X-Screen-Key` ajouté aux `allowedHeaders`.

## 3. Base (auto-migrations de `server.js`, dans un bloc à part : « Migration des spectateurs de la Coupe ignorée »)

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS coupe_watch_opt_in BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS coupe_screens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key_hash VARCHAR(64) NOT NULL UNIQUE,      -- sha256 hex de la clé (24 octets aléatoires, base64url)
  label VARCHAR(40) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL
);
```
Rien sur un client : la suppression de compte n'a rien de plus à effacer (la colonne part avec la ligne). La colonne suit la même règle de lecture que `coupe_challenge_opt_in` (jamais lisible par un autre compte).

## 4. App : où est quoi (partition stricte des fichiers)

Fondations du chef (déjà écrites) : `src/lib/coupe/watch.js` (réactions, retard, initiales, liens), routes de `src/App.jsx` (`/coupe/regarder` sous `RequireCoupe`, `/ecran` site seulement, hors mises en page, sans compte), `e2e/support/mockApi.js` (drapeau `features.coupeSpectators` vrai par défaut, `watch_opt_in` dans `/coupe/me` et `/coupe/settings`, aiguillage de `/coupe/live` vers `api.direct` et de `/coupe/screen`, `/coupe/admin/screens…` vers `api.ecran`), pages et faux serveurs de départ.

### 4.1 Regarder un match (constructeur F1)

- `src/lib/coupe/spectatorMatch.js` : client spectateur (connexion `auth watch`, ou `auth screen` avec une clé), `watch`, `unwatch`, `cheer`, reconnexion (3 essais, puis « Connexion perdue » et Réessayer), `not_live` réessayé toutes les 5 s (10 min au plus). Tampon des `state`, dessin à l'heure du serveur moins `WATCH_DELAY_MS` (200 ms), ballon et joueurs interpolés ; `getFrame()` rend **la même forme d'image que `OnlineMatch.getFrame()`** (repère du serveur : joueur 0 en bas), pour réutiliser `renderer.js`, le stade, les effets et `RulesHud`. Événements (`ev`), fautes, penalty, but en or, tirs au but appliqués à l'heure retardée.
- `src/components/coupe/watch/*` : `WatchStage` (stade + terrain dessiné + bandeaux du règlement v2 + score), réutilisable par l'écran du salon (`variant="screen"` : muet, sans boutons, grandes tailles), et le reste de la vue spectateur.
- Interface commune à F1 et F2 (l'écran du salon s'en sert sans rien d'autre) :

```js
import { SpectatorMatch } from '@/lib/coupe/spectatorMatch';
import WatchStage from '@/components/coupe/watch/WatchStage';

const sm = new SpectatorMatch({ screenKey = null, onChange: (ui) => …, onEvent: (type, data) => … });
// screenKey : écran du salon (auth screen) ; sinon le jeton du compte (comme OnlineMatch)
sm.watch({ m }) ou sm.watch({ w });  sm.unwatch();  sm.cheer(r);  sm.destroy();
// ui : { status: 'connecting' | 'waiting' (not_live) | 'live' | 'paused' | 'ended' | 'unavailable'
//        (no_match) | 'full' | 'disabled' | 'offline' | 'revoked' (écran coupé),
//        kind, id, names, roles, sc, so, tour, watchers, screen, ph, rules, gw,
//        result: { winner, sc, reason, forfeit, so } | null }
// onEvent : 'goal', 'cheer' ({ r }), 'foul', 'ev', 'end'…
<WatchStage match={sm} ui={ui} variant="phone" | "screen" className="…" />
// le parent donne la taille ; WatchStage remplit son cadre en gardant les proportions du terrain
```
- `src/pages/CoupeRegarder.jsx` : écran 13. `/coupe/regarder?m=<mid>[&tournoi=<tid>]` ou `?w=<id>`. En-tête (retour, « Tu regardes · Quart 1 », nom du tournoi, œil + nombre), bande des scores (pions aux initiales), terrain, 4 réactions (« Les joueurs voient tes réactions. Aucun message écrit. »), pour un tournoi « Ensuite : … » (prochain match du tableau, lu par `GET /coupe/tournaments/:id`). États : connexion, pas encore commencé, en direct, pause (« Un joueur s'est déconnecté »), fin (score, vainqueur, retour au tableau ou à la Coupe), `no_match` (« Ce match n'est plus en direct »), `watch_full`, `disabled`, hors connexion. Sans `features.coupeSpectators` : message « Regarder n'est pas encore ouvert » et retour (jamais une page blanche). Bruitages du but et du sifflet selon le réglage du son de la Coupe ; ni musique ni tribune.
- `e2e/support/fauxCoupe.js` : protocole des spectateurs (connexions `watch`, `wstart`, relais, `wend`, `cheer`) et aides pour les tests ; `e2e/coupe-regarder.spec.js`.

### 4.2 Écran du salon et admin (constructeur F2)

- `src/pages/EcranSalon.jsx`, `src/components/coupe/ecran/*`, `src/lib/coupe/screenApi.js` (lecture `GET /coupe/screen` par `fetch` direct avec `X-Screen-Key`, **jamais par `apiClient`**, toutes les 15 s, et toutes les 5 s pendant un tournoi en direct).
- `/ecran#cle=<clé>` : clé rangée sur l'appareil (`dhb-ecran-cle`, try/catch), retirée de l'adresse. Sans clé : « Ouvre le lien de l'écran donné dans Admin → La Coupe du Gang ». Clé coupée (403) : « Écran coupé par le salon », clé oubliée.
- Mise en page 16:9 de 1280 × 720 mise à l'échelle de l'écran (télé, tablette en paysage ; en portrait : empilé lisible), fond sombre de la Coupe, police de la Coupe, aucun défilement.
- Mode tournoi (écran 14) : tableau, match en cours en grand (`WatchStage variant="screen"` de F1), « Aussi en direct », « Prochain match », QR « Regarde sur ton téléphone » vers `https://dhomebarber.fr/coupe/regarder?m=<mid>&tournoi=<tid>`. Choix du match : le match de tournoi commencé le plus tôt encore en cours ; à sa fin, 8 s sur le score final puis le suivant, sinon le tableau.
- Mode libre (écran 15) : classement, prochain tournoi (logo, date, J − n, QR d'inscription, inscrits), « Dispo pour un match » (« Dispo » / « Pas dispo » seulement), derniers matchs et « n matchs joués aujourd'hui », record du Snake. Un match ordinaire regardable qui commence passe en grand (QR `?w=<id>`), retour au mode libre 8 s après sa fin.
- Écran allumé : `navigator.wakeLock` quand il existe (try/catch, repris au retour visible), rechargement de la page toutes les 6 h (nouveau déploiement). Panne réseau : dernières données gardées, petit bandeau « Connexion perdue ».
- QR : `qrcode.react` (déjà dans le projet).
- `public/sw.js` : jamais de cache pour une requête qui porte `X-Screen-Key`.
- Admin : `src/components/admin/coupe/ScreensSection.jsx` (+ montage dans `src/pages/admin/AdminCoupe.jsx`) : « Écran du salon » : créer un lien (nom), lien et QR montrés **une fois** avec « Copier » (`saveTextFile` inutile ; presse-papiers avec repli), liste des écrans (nom, vu pour la dernière fois), « Couper » confirmé. Mention : « Seuls les matchs de tournoi et les matchs dont les deux joueurs ont allumé « Laisser regarder mes matchs » passent à l'écran. »
- `e2e/support/fauxEcran.js`, `e2e/ecran-salon.spec.js`, `e2e/coupe-ecrans-admin.spec.js`.

### 4.3 Côté joueurs et pages existantes (constructeur F3)

- `src/lib/coupe/onlineMatch.js` : `watchers` et `cheer` → `ui.watchers {n, screen}` et un événement `cheer` ; remis à zéro à chaque match.
- `src/components/coupe/CoupeGame.jsx` et `game/*` : pastille œil + nombre (et « Sur l'écran du salon » quand `screen`) en haut, bulles des réactions qui montent et s'effacent (1,5 s, transform et opacité, rien quand « réduire les animations » : texte bref seulement), jamais sur le centre du terrain ni sous le doigt.
- `src/lib/coupe/coupeApi.js` : `fetchLive()`, `watch_opt_in` dans la lecture de `/coupe/me` et l'envoi des réglages, `useSpectatorsEnabled()` (drapeau, ne rejette jamais), liens par `watch.js`.
- `src/pages/Coupe.jsx` et `src/components/coupe/hub/*` : section « En direct » (seulement quand il y a des matchs : liste, « Regarder » ; relue toutes les 15 s page visible) ; réglage « Laisser regarder mes matchs » dans les réglages du bas (texte : « Sur les téléphones et l'écran du salon. Les matchs de tournoi sont toujours ouverts aux spectateurs. »).
- `src/components/coupe/tournoi/*` : « Regarder » sur chaque match en cours du tableau (sauf le sien) ; mention à l'inscription : « Les matchs du tournoi sont ouverts aux spectateurs et peuvent passer sur l'écran du salon. »
- `e2e/support/fauxDirect.js` (`GET /coupe/live`), `e2e/coupe-direct.spec.js`.

### 4.4 Serveur

- B1 : `lib/coupeRooms.js` + `test/test-coupe-spectateurs.js` (section 1).
- B2 : `routes/coupe.js`, `lib/coupeScreen.js` (nouveau), `server.js` (migrations, options du serveur de jeu, CORS), `routes/public.js` (drapeau), tests `test/test-coupe-ecran.js` et `test/test-coupe-direct.js` (section 2 et 3).

## 5. Vérifications avant le déploiement

- `npm test` (serveur), `npm run lint` et `npm run test:e2e` (app) ; un test par fonction importante, une mutation ciblée qui le fait échouer.
- Règle d'aujourd'hui octet pour octet pour une salle sans spectateur et pour toute socket en protocole 2 (comparé dans `test-coupe-spectateurs.js`).
- `EXPLAIN` de chaque nouvelle requête sur la base de production, en `READ ONLY`.
- Déploiement Heroku avant Vercel ; essai sans écrire en production.

## 6. Décisions du chef après la contre-expertise (4 nov. 2026)

Trois contre-experts (code du serveur, app dans le navigateur, accord app ↔ serveur prouvé sur un banc avec le vrai serveur et la vraie classe `SpectatorMatch`). Décisions, à appliquer par les correcteurs :

Serveur :
- **S1. Quotas à part pour les spectateurs** : authentifications `watch` et `screen` comptées dans leurs propres seaux (90 par minute et par IP, 20 par minute et par compte, écran compté par `screenId`), jamais dans ceux des joueurs (30 par IP, 10 par compte, inchangés). Ouvertures de `/ws/coupe` (`lib/wsRouter.js`) : 90 par minute et par IP (l'authentification reste limitée). Raison : au salon, tout le monde partage une IP ; un joueur ne doit jamais perdre son match parce que d'autres regardent.
- **S2. Clé d'écran refusée** (à la connexion, à la revérification, par `dropScreen`) : `error {code: 'screen_revoked'}` **avant** la fermeture 4401. Le code de fermeture du délai d'authentification ne change pas (apps publiées).
- **S3. Écrans** : 5 écrans distincts au plus (`screenId`, comme le plafond de l'admin), 2 sockets au plus par écran (la plus ancienne remplacée : `replaced` puis 4409).
- **S4. `watchAllowed` faux** pour un compte exclu des classements (`gang_leaderboard_banned_at`) et pour un barber à fiche cachée ou inactive.
- **S5. Écran coupé pendant sa connexion** : écrans coupés gardés 2 min en mémoire et contrôlés après la lecture de la clé.
- **S6. `coupe_watch_opt_in` jamais écrit par `User.update`** (admin compris) : seulement par `PATCH /coupe/settings`.
- **S7. `failRoom`** : `wend {reason: 'closed'}` aux spectateurs.
- **S8. Le joueur doit voir qu'il est regardé** : un match ordinaire n'est regardable que si **les deux** sockets joueur ont annoncé `auth.sp: 1` (apps qui affichent le compteur, à partir de ce build) **et** que les deux comptes ont allumé le réglage. Le point 0.11 était faux (réglage par compte, posé sur le site, joué depuis une app publiée). Tournois inchangés.
- **S9. `tour.title`** (« Quart 1 », « Demie 2 », « Finale ») ajouté au `tour` des spectateurs (`wstart`, `watchableLive`, donc `/coupe/live` et `/coupe/screen`) ; `start.tour` des joueurs inchangé.
- **S10. `wstart`** porte aussi `tl` (secondes restantes si l'alerte des 30 s est partie) et `away {side, left}` pendant une pause.
- **S11. Quota HTTP général** (400 par minute) compté par compte quand le jeton est valide (vérifié), par IP sinon : au salon, une vingtaine de téléphones sur la page d'un tournoi le dépassaient.

App :
- **A1. Un 4401 seul ne fait jamais oublier la clé de l'écran** : seuls `error screen_revoked` et le 403 de `GET /coupe/screen` le font.
- **A2. Une seule socket spectateur par écran du salon**, qui change de match par `watch` ; la page « Regarder » ferme sa socket après `wend` ou un refus définitif.
- **A3. 4429 avant `hello`** : 30 s d'attente sans entamer les essais rapides ; `replaced` (4409) pour un écran : nouvel essai 30 s plus tard.
- **A4. Bande du score de l'écran** à l'échelle de l'écran (`WatchStage` prop `scale`, variable CSS), tailles de la planche, noms sur deux lignes au plus ; textes d'information de l'écran à 16 px de scène au moins.
- **A5. Noms et score gardés** pendant une reconnexion du même match et avant `wstart` (ligne `live` de l'écran) ; « Connexion perdue, on réessaie… » sur le terrain hors ligne ; « Premier à … » caché avant `wstart`.
- **A6. Spectateur en attente** : tableau lu dès que `tournoi` est dans l'adresse (en-tête du tournoi, match fini ou exempt → « Ce match est fini ») ; `no_match` après une reprise du même match → fin « Le match s'est fini pendant ton absence » avec le dernier score.
- **A7. Ligne sous le score** : « Quart 1 · Premier à 5 » pour un tournoi (`tour.title`, repli sur `label`).
- **A8. Son** : bouton « Son » de la vue spectateur (réglage du son de la Coupe) ; bouton musique global caché sur `/coupe/regarder` et `/ecran`, aucune musique qui démarre au toucher sur `/ecran`.
- **A9. Mesure d'audience** : `/ecran` jamais suivi.
- **A10. « En direct » de l'accueil** : 2 cartes, puis « Voir les N matchs en direct ».
- **A11. Joueur** : `ui.watchers` remis à zéro à la reprise d'un match (le serveur renvoie le compte) ; une bulle sous le chrono des 30 s descend ou disparaît ; `auth.sp: 1` envoyé par `onlineMatch.js`.
- **A12. Petits points** : télé qui ne se compte pas dans « n spectateurs en ce moment » ; bulles de la vue spectateur espacées de 32 px au moins ; date de création des écrans dans l'admin ; phrase « Connecte-toi pour regarder le match » sur la connexion venue de `/coupe/regarder`.

Chiffres définitifs après correction (remplacent ceux des sections 1 et 2) : sockets d'écran = 5 écrans distincts, 2 sockets par écran ; authentifications des spectateurs 90 par minute et par IP, 20 par compte (écran : par `screenId`) ; ouvertures de `/ws/coupe` 90 par minute et par IP ; `GET /coupe/screen` 60 par minute et par IP ; `auth.sp`, `error screen_revoked`, `tour.title`, `wstart.tl` et `wstart.away` en plus. `coupe_watch_opt_in` jamais écrit par les entités (création et modification par l'admin comprises).
