# La Coupe du Gang : contrat de construction du jeu complet (29 oct. 2026)

> Écrit par le chef de chantier avant la construction en parallèle. Chaque constructeur suit ce contrat à la lettre et signale tout écart dans son rapport. Décisions du propriétaire et règles du jeu : `coupe-du-gang.md` (même dossier). Le propriétaire a autorisé le 29 oct. 2026 la construction complète et la mise en ligne sur le site, **pas l'envoi d'un build aux stores**.

## 0. Principes

- **Un seul interrupteur** : variable Heroku `COUPE_WS`. Absente ou différente de `off` → jeu ouvert ; `off` → `/ws/coupe` refusé (503) **et** `features.coupe = false` dans les paramètres publics (l'app cache tout : accueil, fil, carte Gang, Mon espace, profil barber, `/coupe`).
- Le jeu n'arrive dans les apps natives qu'avec le build 18 (non envoyé). Les apps publiées ne connaissent ni `/coupe` ni `features.coupe` : rien ne doit casser chez elles (pas de push qui ouvre une page qu'elles n'ont pas, voir 4.4).
- Ouvert à **tout compte connecté**. Points seulement si les deux joueurs y ont droit (client : carte Gang ; barber actif ; admin = « D'Home Barber »). **Tous les matchs comptent** (décision du 29 oct.) : ni limite par adversaire ni plafond par jour.
- Exception anti-abus (pas une limite de matchs) : un match abandonné **avant le premier but et avant 20 s de jeu** est **annulé** (aucun point, aucune ligne de score).
- Noms affichés : client = prénom + initiale (`Lucas M.`), barber = prénom de sa fiche, admin = « D'Home Barber ». Jamais d'email. Rôle affiché : `user`, `barber`, `salon`.
- Textes de l'app au tutoiement (écrans du jeu) ; erreurs jamais « Load failed » ; fenêtres fermées par la croix ; `queryFailed` avant tout état vide ; heure de Paris.

## 1. Base de données (auto-migrations de `server.js`)

```sql
CREATE TABLE IF NOT EXISTS coupe_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_code VARCHAR(16),
  season VARCHAR(7) NOT NULL,              -- 'YYYY-MM', mois de Paris de la fin du match
  day DATE NOT NULL,                       -- jour de Paris de la fin du match
  p0_user_id UUID, p1_user_id UUID,        -- NULL quand le compte est supprimé
  p0_key VARCHAR(64), p1_key VARCHAR(64),  -- clé de classement (voir plus bas)
  p0_role VARCHAR(10), p1_role VARCHAR(10),-- 'user' | 'barber' | 'salon'
  score0 INT NOT NULL, score1 INT NOT NULL,
  winner_side SMALLINT,                    -- 0 | 1 | NULL (annulé)
  forfeit BOOLEAN NOT NULL DEFAULT false,
  ranked BOOLEAN NOT NULL,
  reason VARCHAR(40),                      -- pourquoi amical : no_card, not_eligible, cancelled, db_error…
  delta0 INT NOT NULL DEFAULT 0, delta1 INT NOT NULL DEFAULT 0,  -- points réellement gagnés / perdus
  ended_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coupe_matches_p0 ON coupe_matches (p0_user_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupe_matches_p1 ON coupe_matches (p1_user_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupe_matches_day ON coupe_matches (day);

CREATE TABLE IF NOT EXISTS coupe_scores (
  player_key VARCHAR(64) NOT NULL,
  season VARCHAR(7) NOT NULL,              -- 'YYYY-MM' ou 'total'
  points INT NOT NULL DEFAULT 0 CHECK (points >= 0),
  wins INT NOT NULL DEFAULT 0, losses INT NOT NULL DEFAULT 0, matches INT NOT NULL DEFAULT 0,
  reached_at TIMESTAMP NOT NULL DEFAULT NOW(),  -- dernière variation des points (départage)
  PRIMARY KEY (player_key, season)
);
CREATE INDEX IF NOT EXISTS idx_coupe_scores_rank ON coupe_scores (season, points DESC, wins DESC, matches ASC, reached_at ASC);

CREATE TABLE IF NOT EXISTS coupe_blocks (
  blocker_user_id UUID NOT NULL,
  blocked_key VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_user_id, blocked_key)
);
CREATE TABLE IF NOT EXISTS coupe_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_user_id UUID,
  reported_key VARCHAR(64) NOT NULL,
  reported_name VARCHAR(120),              -- nom affiché copié au moment du signalement
  room_code VARCHAR(16),
  reason VARCHAR(40) NOT NULL,             -- name | behavior | cheating | other
  details TEXT,                            -- 500 caractères au plus
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | handled | dismissed
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS coupe_leaderboard_opt_in BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS coupe_available BOOLEAN NOT NULL DEFAULT false;
```

- **Clé de classement** (`player_key`) : `'salon'` pour tout compte admin (une seule ligne « D'Home Barber », points additionnés) ; sinon l'id du compte (`users.id`). Un barber est rangé sous l'id de **son compte** ; sa fiche se retrouve par `users.employee_id`.
- **Suppression de compte** (client par lui-même ou par l'admin) : `coupe_scores` de sa clé, `coupe_blocks` (ses blocages et ceux qui le visent), `coupe_reports` qu'il a envoyés supprimés ; dans `coupe_matches`, `pX_user_id = NULL` et `pX_key = NULL` (l'historique de l'adversaire garde « un ancien joueur »).
- Classement public : seulement les comptes avec `coupe_leaderboard_opt_in = true`, **plus la ligne `salon`** (toujours) ; jamais une fiche barber cachée (`employees.is_hidden`), jamais un compte testeur (`users.is_tester`) ni un barber inactif.

## 2. API REST (`routes/coupe.js`, monté sous `/api`, préfixe `/apps/:appId/coupe`)

Toutes les routes : `requireAuth` sauf mention ; 404 `{ code: 'disabled' }` si `COUPE_WS=off` ; erreurs `{ error, code }` en français.

| Méthode et chemin | Accès | Réponse |
|---|---|---|
| `GET /coupe/me` | connecté | `{ season, season_ends_at, eligible, eligible_reason, opt_in, season_stats: {points, rank, wins, losses, matches}, total_stats: {points, rank, wins, losses, matches}, recent: [{ ended_at, won, cancelled, score: [moi, adversaire], opponent: {name, role}, delta, ranked }] }` (10 derniers ; `rank` null si absent du classement) |
| `GET /coupe/leaderboard?scope=season\|total&season=YYYY-MM` | connecté | `{ scope, season, season_ends_at, rows: [{ rank, key_hash, name, role, avatar_url, employee_id, points, wins, losses, matches, me }], me: { rank, points, wins, losses, matches, opt_in } }` — 50 lignes au plus ; `key_hash` = clé publique HMAC (comme `author_key` du fil), jamais l'id |
| `PATCH /coupe/settings` `{ opt_in }` | connecté | `{ opt_in }` |
| `GET /coupe/barbers` | connecté | `[{ employee_id, name, photo_url, available, busy }]` — barbers actifs, visibles (`is_hidden = false`, sauf pour un testeur), qui ont un compte ; `busy` = un RDV client (`confirmed`, `pending`, `last_minute` repris) en cours ou qui commence dans les 10 min (heure de Paris) ; `available = coupe_available && !busy` |
| `PATCH /coupe/availability` `{ available }` | barber avec fiche | `{ available }` |
| `GET /coupe/player/:keyHash` | connecté | `{ name, role, season_stats, total_stats }` (fiche publique d'un joueur du classement) |
| `POST /coupe/block` `{ key_hash }` / `DELETE /coupe/block/:keyHash` | connecté | `{ blocked: true \| false }` — un joueur bloqué ne peut plus te défier ni rejoindre ta salle, et toi non plus ; 50 blocages au plus |
| `GET /coupe/blocks` | connecté | `[{ key_hash, name }]` |
| `POST /coupe/report` `{ key_hash, room_code?, reason, details? }` | connecté, 5 / h par compte | `{ ok: true }` — enregistre + `notifyAdminsOfClientAction` (alerte admin) |
| `GET /coupe/admin/overview` | admin | `{ today: {matches, players}, season: {matches, players, ranked}, top_pairs: [{ a, b, matches, ranked }] (30 jours, 20 paires), reports: [{ id, reported_name, reason, details, created_at, status }] (pending d'abord, 50) }` |
| `PATCH /coupe/admin/reports/:id` `{ status }` | admin | `{ status }` |

- La clé publique d'un joueur : `key_hash = HMAC(JWT_SECRET, 'coupe:' + player_key)` tronqué (voir `lib/publicKey.js`) ; la ligne `salon` a la clé `salon`.
- `features.coupe` dans `routes/public.js` = `process.env.COUPE_WS !== 'off'` (insensible à la casse).

## 3. Résultat d'un match (`lib/coupeResults.js`)

`recordMatch(db, { code, players: [{ userId, role, employeeId }, …], score: [s0, s1], winner, forfeit, cancelled, startedAt, endedAt })` → `{ ranked, reason, delta: [d0, d1], points: [p0, p1], rank: [r0, r1] }`.

- Une transaction ; `pg_advisory_xact_lock` sur les clés des deux joueurs (ordre trié) ; droits relus en base au moment de l'écriture (carte Gang par la règle de `lib/gangCard.js` : visite constatée ; barber actif ; admin) ; compte disparu → amical.
- `cancelled` → une ligne `coupe_matches` (`ranked = false`, `reason = 'cancelled'`, `winner_side NULL`), aucun score.
- Classé : `lib/coupePoints.js` (`applyResult`, jamais sous 0) sur la saison **et** sur `total`, `wins` / `losses` / `matches`, `reached_at` seulement si les points changent.
- Panne de base : le match n'est pas compté, `{ ranked: false, reason: 'db_error' }`, jamais d'exception vers les salles.
- `lib/coupePoints.js` est **aligné** : plus de règle de paire ni de plafond de 5 (`matchCounts` ne regarde que les droits), tests mis à jour.

## 4. Protocole WebSocket v2 (`/ws/coupe`)

Changements par rapport à v1 (section « Prototype réseau » de `coupe-du-gang.md`) ; tout le reste (garde-fous, plafonds, `state`, `pt` / `kt` en secondes, `ack`, heure `s`, fermetures) reste.

### 4.1 Connexion
- `auth {v: 2, token}` ; `v` ≠ 2 → `update_required` (4426). Accès : **tout compte connecté** (plus de restriction testeur).
- `hello {name, role}`.

### 4.2 Salles, défis, liens
- `create` → `room {code, link, side: 0}` : `code` = 4 chiffres (à montrer en personne), `link` = 12 caractères `[a-z0-9]` aléatoires (lien `https://dhomebarber.fr/coupe?defi=<link>`, jamais `window.location.origin`). Une salle d'attente par compte, 2 min.
- `join {code}` ou `join {link}` → `room {code, link, side: 1}` puis `start` ; erreurs `no_room`, `own_room`, `blocked` (l'un a bloqué l'autre), `rate_limited`.
- `challenge {employee_id}` (défier un barber) : barber actif, visible, `coupe_available`, pas `busy`, pas bloqué, n'est pas soi-même → salle créée et réservée à son compte, `room {code, link, side: 0, invited: {name, role: 'barber'}}`, push au barber (4.4) ; sinon `error {code: 'barber_unavailable'}`. Le barber accepte en ouvrant `/coupe?defi=<link>` (`join {link}`), refuse par `decline {link}` → le défiant reçoit `declined`.
- `peek {link}` (avant de rejoindre un défi) → `invite {link, from: {name, role}, expires_in}` (secondes) ou `error {code: 'no_room'}` : l'écran « Défi reçu » s'affiche avant `join`.
- `start {you, names, roles, keys, kick, ranked_hint}` : `keys` = clés publiques (`key_hash`, section 2) des deux joueurs, pour Signaler / Bloquer ; `ranked_hint` = les deux ont droit aux points (indicatif ; la fin du match fait foi).

### 4.3 Frappes vérifiées par le serveur (anti-triche)
- `in {x, y, t}` : position de son joueur et `t` = heure du serveur estimée (ms) ; le serveur garde 600 ms d'historique par joueur.
- `hit {n, at, p: [x, y], pv: [vx, vy]}` : **plus de ballon dans la frappe**. Le serveur prend **son** ballon à l'instant `at` (historique), vérifie le joueur (moitié, petite surface, continuité avec l'historique des `in` : écart ≤ `HUMAN_SPEED` × |écart de temps| + 20), plafonne `pv` à `HUMAN_SPEED`, puis applique **`collidePaddle`** du moteur partagé. Contact toléré si la distance joueur–ballon ≤ `PR + BR + 20` : le ballon est d'abord ramené sur le cercle de contact le long de la droite joueur → ballon, puis le choc est calculé. Pas de contact → refus `no_contact`. Ensuite rejeu jusqu'à maintenant (comme v1). Âge maximal 250 ms, 10 ms entre deux frappes acceptées, but confirmé 150 ms après (inchangés).
- Côté téléphone : la prédiction locale reste la même (moteur partagé) ; le téléphone envoie la position et la vitesse de son joueur **au moment du choc** (premier choc d'une série tout de suite, puis toutes les 40 ms pendant une poussée).

### 4.4 Défis par notification
- Push au barber défié par `lib/coupeNotify.js` : « ⚽ <Nom> te défie à la Coupe du Gang », `url: '/coupe?defi=<link>'`, `ttlSeconds: 120`. **Abonnements web seulement** (pas `native://…`) tant que les apps n'ont pas le jeu ; jamais entre 21:00 et 08:00 (Paris) ; 10 défis par heure par compte défiant ; le barber reçoit aussi `invite {link, from: {name, role}}` s'il a une socket ouverte sur `/ws/coupe`.

### 4.5 Coupure, abandon, fin
- Socket fermée sans `leave` pendant un match → l'autre reçoit `pause {away: side, left: secondes}` et le ballon s'arrête (phase `pause`). Retour : nouvelle socket, `auth`, puis `resume {link}` → `start` (mêmes noms) puis `state` reprend. 10 s pour revenir, 20 s de pause cumulée et 2 retours par match au plus, sinon **forfait**.
- `leave` en plein match = forfait immédiat (l'autre gagne).
- Abandon (forfait) avant le premier but **et** avant 20 s de jeu → match **annulé**.
- `end {winner, sc, forfeit, cancelled, points: { ranked, reason, delta: [d0, d1], total: [p0, p1], rank: [r0, r1] } | null}` envoyé **après** l'écriture de `recordMatch` (au plus 3 s d'attente, sinon `points: null`) ; `total` = points de la saison après le match, `rank` = place dans le classement de la saison (null si absent).
- `createCoupeServer` reçoit ses dépendances par injection (branchées par S2 dans `server.js`, remplacées par des faux dans les tests ; valeurs par défaut inoffensives) :
  - `playerKey({ userId, role })` → `'salon'` si `role === 'admin'`, sinon `String(userId)` (défaut fourni par S1, identique à `lib/coupeResults.js`) ;
  - `keyHash(playerKey)` → clé publique (défaut : la clé elle-même ; S2 branche le HMAC) ;
  - `onMatchEnd({ code, players: [{ userId, role, employeeId }, …], score, winner, forfeit, cancelled, startedAt, endedAt })` → promesse de `{ ranked, reason, delta, points, rank }` (`recordMatch`) ;
  - `canChallenge({ employeeId, byUserId })` → promesse de `{ ok: true, userId, name } | { ok: false, code }` (barber dispo, pas occupé, a un compte) ;
  - `isBlocked({ userId, key }, { userId, key })` → promesse de booléen (l'un a bloqué l'autre) ;
  - `notifyChallenge({ toUserId, fromName, link })` → promesse (push web, 4.4).

## 5. App

### 5.1 Routes (`src/App.jsx`)
- `/coupe` (accueil de la Coupe) et `/coupe/classement` : plein écran, hors des mises en page client / admin, garde « connecté » (tout rôle), redirection vers `/` si `features.coupe` est faux. Paramètres de `/coupe` : `?defi=<link>` ouvre l'écran « Défi reçu » (accepter / refuser) ; `?challenge=<employee_id>` lance le défi de ce barber (bouton « Défier » du profil public) ; `?mode=bot&level=…` ou `?mode=local` ouvre directement ce mode (section « Jeux » de l'accueil).
- `/coupe-test` reste l'écran d'essai (diagnostic réseau : code de salle, ping, recalages), réservé à l'équipe et aux testeurs, reconstruit sur `CoupeGame`.
- **Composant de jeu** `src/components/coupe/CoupeGame.jsx` (F1 ; une version provisoire au bon format existe dès le départ pour que F2 l'importe) :
  `<CoupeGame mode="online|bot|local" level="apprenti|barber|boss" action={…} onExit={() => …} onFinished={(result) => …} />` ; `action` pour `online` : `{ t: 'create' } | { t: 'join', code } | { t: 'defi', link } | { t: 'challenge', employeeId }`. Plein écran (fixed, au-dessus de tout), il gère seul la connexion, la salle d'attente (code à 4 chiffres + lien à partager), l'écran « Défi reçu » (`defi`), le match, la fin (points, revanche), Signaler / Bloquer. `onFinished` sert à relire les points (`invalidateCoupe`).
- `/admin/coupe` : admin seul (catégorie Clients du menu admin), « La Coupe du Gang ».

### 5.2 Client REST : `src/lib/coupe/coupeApi.js` (écrit par le chef)
Fonctions et crochets React Query listés en tête du fichier ; clés sous le préfixe `['coupe', …]`.

### 5.3 Écrans (d'après les maquettes validées : https://claude.ai/artifact/6sEgcJPvzCvPtBQsGPP3vU)
- Accueil de la Coupe (artboard « Accueil de la Coupe ») : Points de Coupe, défier un barber (portraits **en portrait, jamais ronds**, « Dispo » / « Pas dispo »), défier un ami (lien + code à 4 chiffres), contre le salon (Apprenti, Barber, Boss), à deux sur ce téléphone, haut du classement + sa place, interrupteur « Apparaître dans le classement ».
- Écran de jeu : un seul composant pour les trois modes (en ligne, contre le salon, à deux), rendu du prototype validé ; fin de match d'après l'artboard « Fin du match » (+3 / −1, place avant → après, revanche, retour) ; **Signaler** et **Bloquer** l'adversaire en ligne.
- Défi reçu (artboard « Défi reçu ») : nom, carte Gang ou barber, compte à rebours de 2 min, Accepter / Pas maintenant.
- Classement (artboard « Classement ») : Saison / Général, podium, liste, sa ligne, étoile bleue pour « D'Home Barber », ciseaux pour un barber, interrupteur.
- Carte Gang (artboard) : bloc « La Coupe du Gang » sous la carte (jamais sur la carte).
- Mon espace (artboard) : interrupteur « Dispo pour un match » + ligne « COUPE · pts · rang » sur la carte FUT.
- Profil public d'un barber : bouton « Défier » quand il est dispo.
- **Section « Jeux » de l'accueil** (demande du propriétaire, 29 oct.) : clé `games`, libellé « Jeux », placée après `rebook` dans l'ordre par défaut, déplaçable dans Admin → Paramètres comme les autres ; une carte « La Coupe du Gang » (tes points, « Jouer »).
- **Fil** : une entrée compacte en tête du fil (« La Coupe du Gang · Joue contre les barbers »), cachée sans `features.coupe`.
- Admin → « La Coupe du Gang » : chiffres du jour et de la saison, paires qui jouent le plus ensemble, signalements (traité / ignoré), rappel de la coupure `COUPE_WS=off`.

## 6. Partage des fichiers (un fichier = un seul constructeur)

| Constructeur | Fichiers |
|---|---|
| **S1 serveur de jeu** | `dhomebarber-api/lib/coupeRooms.js`, `test/test-coupe-rooms.js` |
| **S2 données et API** | `dhomebarber-api/server.js` (migrations, montage, branchement des dépendances de `createCoupeServer`), `routes/public.js` (`features.coupe`), `routes/coupe.js`, `lib/coupeResults.js`, `lib/coupeNotify.js`, `lib/coupePoints.js`, `routes/auth.js` (suppression de compte), `routes/clients.js` ou le fichier de suppression par l'admin, tests `test/test-coupe-api.js`, `test/test-coupe-results.js`, `test/test-coupe-points.js` |
| **F1 jeu** | `src/lib/coupe/onlineMatch.js`, `src/lib/coupe/localMatch.js` (nouveau), `src/lib/coupe/renderer.js`, `src/lib/coupe/sound.js`, `src/components/coupe/CoupeGame.jsx` (remplace la version provisoire), `src/components/coupe/game/` (ses sous-composants), `src/pages/CoupeTest.jsx` (écran d'essai reconstruit sur `CoupeGame`, route gardée), `e2e/coupe.spec.js`, `e2e/support/fauxCoupe.js` |
| **F2 accueil et classement** | `src/pages/Coupe.jsx`, `src/pages/CoupeClassement.jsx`, `src/components/coupe/hub/` (ses sous-composants), `src/App.jsx`, `e2e/coupe-accueil.spec.js`, `e2e/support/mockApi.js` (routes REST de la Coupe) |
| **F3 intégrations** | `src/pages/Home.jsx` + `src/components/home/GamesSection.jsx`, éditeur d'ordre de l'accueil (Admin → Paramètres), `src/pages/Feed.jsx`, `src/pages/GangCardPage.jsx`, `src/components/shared/BarberCard.jsx`, `src/pages/admin/BarberHome.jsx`, `src/pages/BarberProfile.jsx`, `src/pages/admin/AdminCoupe.jsx` + son entrée du menu admin, `public/privacy.html`, `e2e/coupe-integrations.spec.js` |
| **Chef** | ce contrat, `src/lib/coupe/coupeApi.js`, `src/lib/coupe/engine.js` + `lib/coupeEngine.mjs` (copies identiques), `CLAUDE.md`, docs |

Besoin d'un fichier d'un autre : le dire dans le rapport, ne pas le modifier. La route `/admin/coupe` (→ `pages/admin/AdminCoupe.jsx`, admin seul, dans les routes admin de `App.jsx`) est ajoutée par le chef à l'intégration, quand F3 a livré la page : F2 ne l'ajoute pas.
