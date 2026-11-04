# La Coupe du Gang : tournois, contrat de construction (étape 1, 3 nov. 2026)

Planche validée par le propriétaire (« go », 3 nov. 2026) : https://claude.ai/artifact/S7Kk4Bv1c35Yz3acHuZk9r (écrans 1 à 12 ; 13 à 15 = étape 2, spectateurs et écran du salon, **hors de ce contrat**). Décisions : `coupe-tournois.md`.

Ce contrat est la seule référence partagée entre les constructeurs. Rien d'autre n'est promis : un besoin qui n'est pas ici se dit au chef, il ne s'invente pas dans le fichier d'un autre.

## 1. Règles du tournoi (toutes décidées)

- **Format** : élimination directe, **8 ou 16 places** (choix de l'admin à chaque tournoi), en direct à l'heure choisie par l'admin (début **entre 08:00 et 20:00** heure de Paris, au moins 30 min après la création).
- **Inscription** : tout compte connecté (client avec ou sans carte Gang, barber, salon). Une identité = une inscription (tous les comptes admin = la seule identité « D'Home Barber », clé `salon` de `coupeResults.playerKey`). Au-delà des places : **liste d'attente** (ordre d'inscription). Inscription possible jusqu'au début ; s'inscrire pendant la présence vaut présence. Désinscription possible jusqu'au début. Un compte exclu du classement Gang (`gang_leaderboard_banned_at`) ne peut pas s'inscrire.
- **Présence** : de `starts_at − 15 min` à `starts_at`, chaque inscrit (liste d'attente comprise) appuie sur « Je suis là ».
- **Tirage** (à `starts_at`, par le serveur) : présents inscrits d'abord, puis présents de la liste d'attente dans l'ordre, jusqu'au nombre de places. **Moins de 4 présents : tournoi annulé** (`reason: 'not_enough'`). Têtes de série : `size / 4` (2 à 8, 4 à 16) = meilleurs Points de Coupe de la saison en cours (`coupe_scores`), à égalité le plus ancien inscrit ; les autres dans un ordre tiré au hasard (`crypto.randomInt`). Placement standard (8 : `[1,8,4,5,2,7,3,6]`, 16 : `[1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11]`, numéros de tête de série) ; les numéros au-delà du nombre de présents sont des **exempts** : leur adversaire passe le tour d'office (`status: 'bye'`), donc d'abord les têtes de série.
- **Animation du tirage** : les matchs du 1er tour deviennent jouables à `drawn_at + 30 s` (`DRAW_SHOW_MS`), le temps que l'app révèle le tirage.
- **Match** : un match en ligne ordinaire (serveur arbitre, règlement v2 obligatoire, premier à 5, 5 min puis but en or). Égalité à la fin du but en or : **tirs au but** (section 4). Points de Coupe comptés comme tout match (+3 / −1 selon les droits d'aujourd'hui) ; « trop court » ou « annulé » ne changent rien au tournoi (il y a toujours un vainqueur).
- **Rejoindre son match** : `JOIN_MS = 2 min` après `ready_at`. Un seul présent à l'échéance : il gagne (`reason: 'forfeit'`). Aucun des deux : vainqueur tiré au sort (`reason: 'double_forfeit'`). Abandon ou coupure au-delà des 10 s de reprise : forfait (jamais « annulé » en tournoi).
- **Serveur redémarré en plein match** (salle perdue) : le match redevient jouable (`started_at` remis à NULL, `ready_at = now`), les deux joueurs ont de nouveau 2 min.
- **Pas de revanche** dans une salle de tournoi.
- **Fin** : la finale jouée, `status: 'finished'`, champion et finaliste notés ; les deux perdants des demies sont 3es ex æquo. Publication du salon dans le fil (section 3.5).
- **Notifications** (jamais entre 21:00 et 08:00, règle de l'app) : à la publication si l'admin coche « Prévenir » ; à `starts_at − 30 min` aux inscrits (« confirme ta présence ») ; « Ton match commence » quand un match devient jouable (urgent, `ttlSeconds` court) ; annulation aux inscrits.
- **Coupure d'urgence** : `COUPE_TOURNOIS=off` (Heroku) ; drapeau public `features.coupeTournaments = coupeEnabled() && coupeRulesV2Enabled() && COUPE_TOURNOIS !== 'off'`. Drapeau faux : routes 404 `{ code: 'disabled' }`, `tjoin` refusé, rien des tournois dans l'app.

## 2. Base (migrations écrites par le chef dans `server.js`)

```sql
CREATE TABLE IF NOT EXISTS coupe_tournaments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(60) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  size SMALLINT NOT NULL CHECK (size IN (8, 16)),
  status VARCHAR(12) NOT NULL DEFAULT 'open',      -- open | running | finished | cancelled
  cancel_reason VARCHAR(20),                        -- admin | not_enough
  drawn_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  champion_key VARCHAR(64),                         -- clé joueur (playerKey) du champion
  runner_up_key VARCHAR(64),
  notify_sent_at TIMESTAMPTZ,                       -- annonce faite (ou NULL)
  reminder_sent_at TIMESTAMPTZ,                     -- rappel des 30 min fait
  post_id UUID,                                     -- publication du fil
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coupe_tournaments_starts ON coupe_tournaments (starts_at DESC);

CREATE TABLE IF NOT EXISTS coupe_tournament_players (
  tournament_id UUID NOT NULL REFERENCES coupe_tournaments(id) ON DELETE CASCADE,
  player_key VARCHAR(64) NOT NULL,                  -- playerKey (user:<id> ou salon)
  user_id UUID,                                     -- compte qui s'est inscrit (NULL après purge)
  role VARCHAR(10) NOT NULL,                        -- user | barber | salon
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  waiting BOOLEAN NOT NULL DEFAULT FALSE,           -- liste d'attente
  checked_in_at TIMESTAMPTZ,
  seed SMALLINT,                                    -- numéro au tirage (1 = meilleur), NULL hors tableau
  status VARCHAR(10) NOT NULL DEFAULT 'in',         -- in | absent | out | removed
  PRIMARY KEY (tournament_id, player_key)
);
CREATE INDEX IF NOT EXISTS idx_coupe_tplayers_user ON coupe_tournament_players (user_id);

CREATE TABLE IF NOT EXISTS coupe_tournament_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES coupe_tournaments(id) ON DELETE CASCADE,
  round SMALLINT NOT NULL,                          -- 1 = premier tour
  slot SMALLINT NOT NULL,                           -- 0.. dans le tour ; vainqueur → (round+1, slot>>1), côté slot&1
  p0_key VARCHAR(64), p1_key VARCHAR(64),
  status VARCHAR(8) NOT NULL DEFAULT 'pending',     -- pending | ready | done | bye
  ready_at TIMESTAMPTZ, started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ,
  score0 SMALLINT, score1 SMALLINT, so0 SMALLINT, so1 SMALLINT,
  winner_side SMALLINT,
  reason VARCHAR(16),                               -- null | forfeit | double_forfeit | admin | shootout | golden_goal | time_limit
  UNIQUE (tournament_id, round, slot)
);
```

La clé joueur est celle de `coupeResults.playerKey({ userId, role })` (jamais renvoyée aux clients : seulement `keyHash`). Données effacées avec le compte : section 3.6.

## 3. Serveur : `lib/coupeTournaments.js` + `routes/coupeTournaments.js` (constructeur « serveur tournois »)

### 3.1 Fonctions pures (testées sans base)

`bracketOrder(size)`, `drawBracket({ size, players })` (joueurs triés : `{ key, points, registeredAt }` ; rend les matchs du 1er tour avec exempts), `roundLabels(size)` → pluriel et singulier (16 : « 8es de finale / 8e de finale », « Quarts de finale / Quart de finale », « Demi-finales / Demi-finale », « Finale / Finale » ; 8 : sans le premier), `nextSlot(round, slot)`, `parisWindowOk(startsAt)`.

### 3.2 Horloge (`startTournamentTicker({ db, rooms, notify })`, toutes les 5 s, dans le processus web, jamais en double : verrou `pg_try_advisory_lock`)

1. `starts_at − 30 min` : rappel aux inscrits (une fois, `reminder_sent_at` posé **avant** l'envoi).
2. `starts_at` atteint, `status = 'open'` : tirage (transaction, `FOR UPDATE` sur le tournoi) ou annulation.
3. Matchs `ready` : échéance `ready_at + JOIN_MS` sans `started_at` → forfait selon la présence dans la salle (`rooms.tournamentLive()`, section 5) ; `started_at` posé mais match absent de `tournamentLive()` depuis plus de 30 s → serveur redémarré : rejouable (section 1).
4. Avancement : un match fini pose son vainqueur dans le match suivant ; un match du tour suivant dont les deux joueurs sont connus devient `ready` (`ready_at = now`, push « Ton match commence ») ; un exempt avance tout de suite. Finale finie → `finished`.

### 3.3 Résultat d'un match (`recordTournamentMatch(db, match)`)

Appelé par le chef dans `onMatchEnd` (après `coupeResults.recordMatch`) quand `match.tournament` existe (`{ tid, mid }`, section 5) : vainqueur (`winner` 0 / 1, côté de la salle = côté du match), score, tirs au but `match.so` (`[a, b]` ou absent), `reason`. Idempotent (`UPDATE … WHERE status = 'ready' RETURNING`).

### 3.4 Routes (base `/api/apps/:appId/coupe`, `requireAuth` ; drapeau relu à chaque requête ; messages d'erreur en français, `code` toujours présent)

Objet joueur public : `{ key_hash, name, role: 'user' | 'barber' | 'salon', me: bool }` (nom de `coupeResults.displayName` : « Lucas M. », prénom de la fiche, « D'Home Barber » ; jamais d'email, d'id ni de photo).

- `GET /coupe/tournaments` → `{ items: [Résumé], server_now }` : à venir et en cours (tous), puis les 10 derniers finis ou annulés. `Résumé = { id, name, starts_at, size, status, registered, waiting, me: { registered, waiting, checked_in } }`.
- `GET /coupe/tournaments/:id` → `Tournoi` :
  ```
  { id, name, starts_at, size, status, cancel_reason, drawn_at, finished_at, server_now,
    checkin_from,                                   // starts_at − 15 min
    players: [ { ...Joueur, waiting, checked_in, seed } ],   // ordre d'inscription
    me: { registered, waiting, checked_in, status, match: MatchMoi | null } ,
    rounds: [ { round, label, matches: [ Match ] } ],        // vide avant le tirage
    champion: Joueur | null, runner_up: Joueur | null, thirds: [Joueur] }
  Match   = { id, round, slot, p: [Joueur | null, Joueur | null], status, ready_at, forfeit_at,
              sc: [a, b] | null, so: [a, b] | null, winner: 0 | 1 | null, reason,
              live: { sc: [a, b], so: [a, b] | null, present: [bool, bool], playing: bool } | null }
  MatchMoi = Match + { side: 0 | 1, label }        // mon match en cours ou à venir, sinon null
  ```
- `POST /coupe/tournaments/:id/register` → `{ ok: true, waiting }` ; erreurs 409 `closed` (plus `open` ou début passé), 403 `banned`, 409 `already`.
- `DELETE /coupe/tournaments/:id/register` → `{ ok: true }` (avant le début).
- `POST /coupe/tournaments/:id/checkin` → `{ ok: true }` ; 409 `not_yet` (avant la fenêtre), `closed`, 404 `not_registered`.
- Admin (`requireAdmin`) :
  - `GET /coupe/admin/tournaments` → `{ items: [Résumé + { players_count, present_count }] }` ;
  - `POST /coupe/admin/tournaments` `{ name, starts_at: 'YYYY-MM-DDTHH:mm' (heure de Paris), size, notify }` → `Tournoi` ; 400 `bad_name` (1 à 60 caractères), `bad_size`, `bad_time` (passé, moins de 30 min, hors 08:00–20:00) ;
  - `PATCH /coupe/admin/tournaments/:id` `{ name?, starts_at? }` (seulement `open`) ;
  - `POST /coupe/admin/tournaments/:id/cancel` ;
  - `POST /coupe/admin/tournaments/:id/matches/:mid/winner` `{ side }` (match `ready` : forfait déclaré, `reason: 'admin'` ; ferme la salle par `rooms.closeTournamentMatch`) ;
  - `POST /coupe/admin/tournaments/:id/matches/:mid/replay` (match `done` dont le match suivant n'a pas commencé : redevient `ready`, vainqueur retiré du tour suivant) ;
  - `POST /coupe/admin/tournaments/:id/players/:keyHash/remove` (avant le tirage : retiré ; après : forfait de son match en cours, `status: 'removed'`).
- Quotas : inscription, désinscription et présence 20 / min par compte ; admin 60 / min.

### 3.5 Fil, palmarès, notifications

- Fin d'un tournoi : publication **du salon** (sans email d'auteur, comme les Last Minute : `posts.kind` lu par les apps publiées ; si une sorte nouvelle n'y est pas lisible, publication texte ordinaire du salon) : « {Champion} remporte {nom} ! Finale {a} – {b} contre {finaliste}. » ; `post_id` gardé (jamais republiée).
- Palmarès : `GET /coupe/player/:keyHash` et `GET /coupe/me` gagnent `titles: [{ tournament_id, name, date, rank: 1 | 2 }]` ; chaque ligne du classement gagne `titles` (nombre de tournois gagnés). Jamais sur la carte Gang.
- Notifications par `lib/pushHelper.js`, textes au tutoiement, `data.url` vers `/coupe/tournoi/<id>`.

### 3.6 Suppression de compte

`coupeResults.purgeAccount` (client, admin, compte barber) efface ses lignes `coupe_tournament_players` d'un tournoi pas encore commencé ; pour les autres, `user_id = NULL` (son nom devient « Ancien joueur »). Les clés du tableau restent (le tableau garde sa forme).

## 4. Tirs au but (salles de tournoi seulement)

Égalité à la fin du but en or (là où une salle ordinaire finit en nul `time_limit_draw`) : séance de tirs au but avec le penalty du règlement v2 (`startPenalty`, 3 s pour tirer, gardien sur sa ligne, `resolvePenalty`). Premier tireur tiré au sort, puis chacun son tour ; 3 tirs chacun, arrêt dès qu'un joueur ne peut plus être rattrapé ; égalité après 3 : un tir chacun jusqu'à ce que l'un marque et l'autre non. Un but de tir au but **ne compte jamais dans le score du match** (`sc` reste celui de l'égalité). Fin : `finishMatch` avec le vainqueur, `reason: 'shootout'`, `result.so = [a, b]`. Une coupure pendant la séance = forfait comme en jeu.

## 5. Salles (`lib/coupeRooms.js`, constructeur « serveur salles »)

- Options nouvelles de `createCoupeServer` : `canJoinTournamentMatch(userId, role, matchId)` → `null` ou `{ tid, mid, side, name, label, forfeitAt (ms) }` (lecture en base, écrite par le constructeur « serveur tournois » : `coupeTournaments.canJoin(db, …)`), `onTournamentStart(mid)` (pose `started_at`).
- Message client `{ t: 'tjoin', m: '<uuid du match>' }` (socket authentifiée, `v ≥ 3` sinon `update_required`) : refus `{ t: 'error', code }` avec `t_not_found`, `t_not_player`, `t_not_ready`, `t_closed`. Une salle par match (`room.tour = { tid, mid, name, label, fa }`), côté imposé par le match ; le premier attend (message `room` avec `tour`), le second démarre le match. Revenir sur la salle d'un match en cours = la reprise d'aujourd'hui.
- `start` et `room` portent `tour: { name, label, fa }` (`fa` = échéance de forfait, horloge du serveur, ms). État `state` pendant la séance : `so: [[1, 0, 1], [1, 0]]` (1 but, 0 raté, dans l'ordre) ; message `{ t: 'shootout', first }` à son début ; chaque tir réutilise `penalty {s}` et `pen_end {r}`. `end` gagne `so: [a, b]` et `tour: true` ; jamais de revanche (`rematch` → `{ t: 'error', code: 'rematch_off' }`), salle fermée après l'écran de fin.
- `result` de `onMatchEnd` gagne `tournament: { tid, mid }` et `so`.
- Exports nouveaux de `createCoupeServer` : `tournamentLive()` → `Map<mid, { present: [bool, bool], playing: bool, sc, so, startedAt }>` ; `closeTournamentMatch(mid, code)` (envoie `{ t: 'error', code }` aux présents, ferme la salle sans résultat).
- Tout ajout reste derrière `room.tour` : une salle ordinaire se comporte octet pour octet comme avant (tests existants inchangés).

## 6. App (site et apps au prochain build)

- Drapeau `features.coupeTournaments` (lecture qui ne rejette jamais ; faux ou illisible : rien des tournois).
- `src/lib/coupe/coupeApi.js` : `useCoupeTournamentsFlag()`, `useTournaments()`, `useTournament(id)` (relu toutes les 3 s quand la présence est ouverte ou le tournoi en cours, 30 s sinon ; onglet caché : pas de relecture), `registerTournament`, `unregisterTournament`, `checkinTournament` ; clés sous `['coupe', 'tournaments', …]`.
- Accueil de la Coupe (`src/pages/Coupe.jsx`) : carte « Prochain tournoi » ou « Tournoi en cours » sous les Points (écran 1), vers `/coupe/tournoi/:id`.
- Page `/coupe/tournoi/:id` (`src/pages/CoupeTournoi.jsx`, route ajoutée par le chef dans `App.jsx` sous la garde de la Coupe) : selon l'état et l'heure du serveur (`server_now`) : inscription (écran 2), présence (3), tirage animé pendant `DRAW_SHOW_MS` après `drawn_at` (4), tableau en direct avec « Jouer mon match » (5), après mon match : qualifié (8) ou éliminé, fini : champion (9) ou podium, annulé.
- Ouvrir mon match : `/coupe?tmatch=<mid>&tournoi=<tid>` (lu par `gameFromLocation` de `Coupe.jsx`) → `<CoupeGame mode="online" action={{ t: 'tournament', matchId, tournamentId }} />` ; sortie (`onExit`) vers `/coupe/tournoi/<tid>`.
- Jeu (`onlineMatch.js`, `CoupeGame.jsx`, `game/*`) : action `tournament` → `tjoin` après `hello` ; salle d'attente « En attente de {adversaire} » avec le compte à rebours du forfait ; bandeau du tour (« Quart de finale ») sur l'affiche et en haut pendant le match ; séance de tirs au but (bandeau « Tirs au but », pastilles des tirs, écran 7) ; écran de fin sans revanche ni partage du défi, bouton « Retour au tableau ».
- Palmarès : `PlayerSheet.jsx` (titres), `LeaderboardRow.jsx` (petite coupe et nombre de titres).
- Admin (`/admin/coupe`, écrans 11 et 12) : section « Tournois » (liste, créer, suivre en direct, forfait, rejouer, retirer, annuler).

## 7. Partage des fichiers (strict : jamais deux constructeurs sur un fichier)

| Constructeur | Fichiers |
|---|---|
| Chef | ce contrat, `server.js` (migrations, branchements, montage des routes), `routes/public.js`, `src/App.jsx`, `e2e/support/mockApi.js` (crochet vers `fauxTournois.js`), docs, CLAUDE.md |
| Serveur tournois | `lib/coupeTournaments.js`, `routes/coupeTournaments.js`, `lib/coupeResults.js`, `routes/coupe.js`, `lib/coupeNotify.js`, `test/test-coupe-tournois*.js` |
| Serveur salles | `lib/coupeRooms.js`, `test/test-coupe-rooms-tournoi.js` |
| App pages | `src/lib/coupe/coupeApi.js`, `src/pages/Coupe.jsx`, `src/pages/CoupeTournoi.jsx`, `src/components/coupe/tournoi/*`, `src/components/coupe/hub/PlayerSheet.jsx`, `src/components/coupe/hub/LeaderboardRow.jsx`, `e2e/support/fauxTournois.js`, `e2e/coupe-tournois.spec.js` |
| App jeu | `src/lib/coupe/onlineMatch.js`, `src/components/coupe/CoupeGame.jsx`, `src/components/coupe/game/*`, `e2e/support/fauxCoupe.js`, `e2e/coupe-tournoi-match.spec.js` |
| Admin (après « App pages ») | `src/pages/admin/AdminCoupe.jsx`, `src/components/admin/coupe/*`, `e2e/coupe-tournois-admin.spec.js` |
