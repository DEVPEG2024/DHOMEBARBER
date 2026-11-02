# Snake du Gang : contrat de construction (2 nov. 2026)

> Écrit par le chef de chantier avant la construction en parallèle. Chaque constructeur suit ce contrat à la lettre et signale tout écart dans son rapport. Planche validée par le propriétaire (« Tu peux coder ce jeux », 2 nov. 2026) : https://claude.ai/artifact/4Kf7Xxy7S45CFzckUmbT2B ; fichiers de la planche (à lire pour le dessin exact) : `/private/tmp/claude-501/-Users-zoomproject-Downloads-puzzling-sharp-edge-book/bd7d6845-eee0-43fb-97b2-777cfe25a15b/scratchpad/snake-planche/project/*.dc.html`. Mise en ligne sur le site autorisée ; **jamais d'envoi aux stores**.

## 0. Principes

- **Les vraies règles du Snake classique**, sans labyrinthe ni mur (« juste pas de labyrinthe », 2 nov. 2026). Moteur : `src/lib/snake/engine.js`, **copie identique octet pour octet** dans `dhomebarber-api/lib/snakeEngine.mjs` (le serveur le charge par `import()`). Ne jamais le modifier sans le chef.
- **Ni « Nokia » ni « 3310 »** nulle part (marques, règle Apple 5.2.1). Téléphone, bestioles et textes dessinés par nous.
- Nom : **« Snake du Gang »**. Ouvert à **tout compte connecté** (clients, barbers, admin). Plein écran, hors des mises en page client et admin, comme La Coupe du Gang.
- **Un seul interrupteur** : variable Heroku `SNAKE` ; `off` (casse indifférente) → routes `/snake` 404 `{ code: 'disabled' }` et `features.snake = false`. Absent ou faux dans l'app = jeu caché partout (page Jeux, accueil, fil, routes `/snake…` renvoyées à l'accueil).
- **Le score est recalculé par le serveur** : il donne la graine, le téléphone renvoie ses virages, le serveur rejoue la partie avec le moteur. Jamais un score envoyé par le téléphone pris tel quel.
- Classement **du mois** (heure de Paris), meilleur score de chaque joueur, **volontaires seulement** (`users.snake_leaderboard_opt_in`, défaut faux, à part de la Coupe et de la carte Gang). Aucun lot. Points du Snake comptés **nulle part ailleurs** (ni carte Gang, ni Points de Coupe).
- Figurent au classement : clients (testeurs compris) et barbers à fiche active et visible, volontaires, non exclus (`users.gang_leaderboard_banned_at`, même retrait que la carte Gang et la Coupe). **L'admin joue mais ne figure jamais au classement** (son record personnel reste). Noms : client « Lucas M. », barber prénom de sa fiche ; jamais d'email, jamais d'id de compte.
- Sons : **bips rétro seulement** (pas de musique) ; vibrations ; deux réglages sur l'appareil.
- Hors connexion : on joue quand même (graine locale), partie **non classée**, dit à l'écran. Jamais un bouton qui tourne sans fin.
- Textes au **tutoiement** (écrans de jeu, comme la Coupe). Jamais « Load failed » ; `queryFailed` avant tout état vide ; fenêtres fermées par la croix ; heure de Paris ; `overflow-x-clip` ; 320 / 390 / 430 px sans défilement horizontal ; animations `transform` / `opacity`, « réduire les animations » respecté.

## 1. Règles (moteur, `engine.js`)

| Règle | Valeur |
|---|---|
| Grille | 22 × 16 cases, les bords se rejoignent (on ressort de l'autre côté) |
| Départ | 5 cases, ligne 14, tête en (7, 14), vers la droite |
| Pas | `tickMs(niveau)` = 300 − 25 × niveau ms (275 au niveau 1, 75 au niveau 9) |
| Bouchée | +1 case, `niveau` points |
| Bestiole | toutes les 5 bouchées (si aucune en vue), 2 cases de large, 24 pas, vaut `niveau × (2 + ⌈restants / 6⌉)`, ne fait pas grandir ; souris, araignée, poisson, scarabée tour à tour |
| Perdu | tête dans le corps (`end: 'bite'`) ; la case que la queue quitte au même pas est libre |
| Demi-tour | impossible (ignoré) |

API du moteur : `createGame({ seed, level })`, `play(state, dir, moves)` (virage si permis + note dans `moves` + un pas ; rend `{ ate, caught, spawned, vanished, died }`), `step(state)`, `replay({ seed, level, moves, ticks, end })`, `canTurn`, `tickMs`, `bonusPoints`, `bonusCells`, `xOf`, `yOf`, `cellOf`, constantes `COLS`, `ROWS`, `DIRS`, `UP/RIGHT/DOWN/LEFT`, `KINDS`, `BONUS_STEPS`, `LEVEL_MIN/MAX/DEFAULT`, `MAX_TICKS`, `MAX_MOVES`. État : `snake` (cases, tête d'abord), `food` (case ou null), `bonus` (`{ cell, left, kind }` ou null), `dir`, `tick`, `score`, `eaten`, `bonuses`, `over`, `end` ('bite' | 'full' | null).

**Gestes** : tableau plat `[pas, direction, …]` rempli par `play` (direction 0 haut, 1 droite, 2 bas, 3 gauche). `ticks` = nombre de pas joués (le pas fatal compris). Fin : `end` de l'état si la partie est finie, sinon `'quit'` (partie quittée : le score à ce moment compte).

## 2. API REST (`dhomebarber-api/routes/snake.js`, montée sous `/api`, préfixe `/apps/:appId/snake`)

Toutes : `requireAuth` ; 404 `{ error, code: 'disabled' }` quand `SNAKE=off` ; erreurs `{ error, code }` en français au tutoiement ; jamais d'email ni d'id de compte dans une réponse.

### `GET /snake/me`
```json
{ "season": "2026-11", "season_ends_at": "2026-11-30T23:00:00.000Z",
  "opt_in": false, "rankable": true, "banned": false,
  "record": { "score": 312, "level": 5, "eaten": 38, "at": "…" },
  "season_best": { "score": 248, "level": 5, "eaten": 30, "at": "…" },
  "rank": 6, "players": 23, "games": 14 }
```
`record` : meilleur de tous les temps (null sans partie) ; `season_best` : du mois (null) ; `rank` : place au classement du mois (null si pas volontaire, pas classable ou sans score) ; `players` : nombre de joueurs classés ce mois ; `games` : parties terminées ce mois ; `rankable` : ce compte peut figurer au classement (client, barber à fiche active et visible ; faux pour l'admin et un compte exclu) ; `banned` : retiré par le salon.

### `GET /snake/leaderboard?season=YYYY-MM` (mois en cours par défaut ; 400 `bad_season`)
```json
{ "season": "2026-11", "season_ends_at": "…", "players": 23,
  "rows": [{ "rank": 1, "name": "Yanis B.", "role": "user", "score": 486, "level": 7, "me": false }],
  "me": { "rank": 6, "score": 312, "level": 5 }, "opt_in": true }
```
Lignes à 0 point exclues (partie quittée au premier pas). 50 lignes au plus ; ordre : score décroissant, puis le premier à l'avoir atteint (`reached_at`), puis l'id. `me` : null si le lecteur n'y figure pas.

### `PATCH /snake/settings` `{ "opt_in": true }` → `{ "opt_in": true }`
400 `bad_request` (pas un booléen) ; 403 `not_rankable` (admin, fiche barber inactive ou cachée) ; 403 `banned` (se remettre au classement ; en sortir reste permis).

### `POST /snake/games` `{ "level": 5, "rules": 1 }` → 201 `{ "id": "<uuid>", "seed": 123456789, "level": 5, "rules": 1, "expires_at": "…" }`
Ticket de partie : graine `crypto.randomInt(0, 2**32)`, valable 6 h. 400 `bad_level` (entier 1 à 9). `rules` = `SNAKE_RULES` du moteur du téléphone (absente = 1) : une autre version que celle du serveur → 409 `update_required` (le téléphone joue sans classement ; jamais un rejeu avec le mauvais moteur). Quota 600 / h par compte (429 `rate_limited` ; relevé de 120 après la contre-expertise : un ticket par partie plus un par ouverture de l'écran de jeu).

### `POST /snake/games/:id/finish` `{ "moves": [12, 2, 30, 1], "ticks": 418, "end": "bite", "score": 248 }`
→ 200 `{ "score": 248, "eaten": 30, "bonuses": 4, "level": 5, "ranked": true, "record": true, "previous_record": 230, "season_best": 248, "rank": 6, "players": 23 }`
- Partie de ce compte seulement, sinon 404 `not_found` (id mal formé aussi).
- Déjà terminée : **la même réponse**, plus `"duplicate": true` (réponse perdue puis renvoyée) ; déjà refusée : 422 avec le même `code`.
- Ticket de plus de 6 h : 410 `expired`. Ticket donné sous d'autres règles (`snake_games.rules`) : 409 `update_required`. Quota 240 / h par compte.
- Forme : `moves` tableau d'entiers de longueur paire ≤ 2 × `MAX_MOVES`, `ticks` entier ≤ `MAX_TICKS`, `end` ∈ `bite`, `full`, `quit`, `score` entier ; sinon 400 `bad_request`.
- Rejoue avec `replay` du moteur : erreur → 422 `replay_mismatch` ; score rejoué ≠ `score` annoncé → 422 `replay_mismatch` (bug ou triche, journalisé sans identité : `[Snake] partie refusée : <raison>`).
- **Trop rapide** : `ticks × tickMs(level)` > temps écoulé depuis le ticket + 5 s → 422 `too_fast`.
- Refus : la partie passe `rejected` (raison gardée), aucun score écrit.
- Accepté : transaction ; partie `done` ; `snake_scores` du mois (de Paris, à l'heure de la fin) et `total` : `best` relevé seulement si battu (`reached_at` alors), `games + 1`. `ranked` : compte classable et volontaire ; `record` : nouveau record de tous les temps (strictement meilleur, et > 0) ; `previous_record` : l'ancien (null) ; `rank`/`players` : comme `/me`.

## 3. Base (auto-migrations de `server.js`)

```sql
CREATE TABLE IF NOT EXISTS snake_games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  seed BIGINT NOT NULL,
  level SMALLINT NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'open',   -- open | done | rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  ticks INT, score INT, eaten INT, bonuses INT,
  end_reason VARCHAR(10), reject_reason VARCHAR(20),
  result JSONB,                                  -- réponse rendue (renvoi à l'identique)
  rules SMALLINT NOT NULL DEFAULT 1              -- version des règles du moteur au moment du ticket
);
CREATE INDEX IF NOT EXISTS idx_snake_games_user ON snake_games (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snake_games_created ON snake_games (created_at);
CREATE TABLE IF NOT EXISTS snake_scores (
  season VARCHAR(7) NOT NULL,                    -- 'YYYY-MM' ou 'total'
  user_id UUID NOT NULL,
  best INT NOT NULL DEFAULT 0 CHECK (best >= 0),
  level SMALLINT, eaten INT,
  games INT NOT NULL DEFAULT 0,
  reached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (season, user_id)
);
CREATE INDEX IF NOT EXISTS idx_snake_scores_rank ON snake_scores (season, best DESC, reached_at ASC);
ALTER TABLE users ADD COLUMN IF NOT EXISTS snake_leaderboard_opt_in BOOLEAN NOT NULL DEFAULT false;
```
- Suppression d'un compte (client par lui-même ou par l'admin : `purgeClientContent` de `routes/auth.js` ; compte barber : `routes/barberAccounts.js`) : `DELETE` de ses lignes des deux tables (point de sauvegarde, table absente = rien à effacer, comme `purgeCoupe`).
- Purge quotidienne 04:20 Paris : parties de plus de 7 jours ; lignes `snake_scores` des mois de plus de 13 mois (jamais `total`).
- `EXPLAIN` de chaque requête : base locale PGlite (`@electric-sql/pglite`) ou équivalent, jamais d'écriture en production.

## 4. Drapeau

`routes/public.js` : `snake: snakeEnabled()` (`String(process.env.SNAKE || '').trim().toLowerCase() !== 'off'`). App : `useSnakeFlagQuery()` (`src/lib/snake/snakeApi.js`) **rejette** sur une panne (jamais « jeu fermé » sur un 503).

## 5. Frontend : où est quoi

| Fichier | Rôle | Qui |
|---|---|---|
| `src/lib/snake/engine.js` | moteur (section 1) | chef |
| `src/lib/snake/snakeApi.js` | client REST + drapeau + clés React Query `['snake', …]` | chef |
| `src/lib/snake/prefs.js` | réglages de l'appareil : niveau, bips, vibrations (`useSnakePrefs`) | chef |
| `src/lib/snake/format.js` | mois en toutes lettres, jours restants, score sur 4 chiffres, « 1er / 6e » | chef |
| `src/components/snake/palette.js`, `SnakeShell.jsx`, `Lcd.jsx` | couleurs, cadre des pages (en-tête + retour), écran vert | chef |
| `src/lib/games.js`, `src/App.jsx` (routes, garde `RequireSnake`), `src/index.css` (police Silkscreen), `tailwind.config.js` (`font-pixel`), `e2e/support/mockApi.js` (`FauxSnakeRest`) | branchements | chef |
| `src/pages/Snake.jsx` + `src/components/snake/game/*` + `src/lib/snake/{loop,renderer,sound,haptics,share}.js` | `/snake` : menu du téléphone, partie, fin de partie | constructeur « jeu » |
| `src/pages/SnakeClassement.jsx`, `SnakeReglages.jsx`, `SnakeRegles.jsx`, `src/components/snake/SnakeGameCard.jsx`, `src/pages/Jeux.jsx`, `src/components/home/GamesSection.jsx` | classement, vitesse et options, comment jouer, carte de la page Jeux, pictogramme | constructeur « pages » |
| `dhomebarber-api` : `routes/snake.js`, `lib/snakeResults.js`, `server.js`, `routes/public.js`, `routes/auth.js`, `routes/barberAccounts.js`, `test/test-snake-*.js` | serveur | constructeur « serveur » |

Routes de l'app (plein écran, garde `RequireSnake` : compte connecté + drapeau) : `/snake` (menu, partie, fin), `/snake/classement`, `/snake/reglages`, `/snake/regles`. Liens entre écrans : comme la planche (menu → partie, vitesse, classement, comment jouer ; retour en haut à gauche vers `/snake` ; `/snake` revient à `/jeux`). **`/snake?jouer=1`** ouvre directement l'écran de partie (PRÊT ?) : boutons « Jouer » de Vitesse et options et « Battre mon record » du classement (lien avec `replace`, le paramètre est retiré à l'arrivée).

## 6. Écran de jeu (`/snake`)

- Téléphone rétro dessiné en CSS (corps `#1B1F25`, logo du salon `public/logo.png` en haut, écran vert `Lcd`, pavé de touches 2 / 4 / 5 / 6 / 8 de 72 × 52 px au moins) : planche `Main.dc.html` et `Partie.dc.html`.
- Menu dans l'écran vert (Nouvelle partie, Vitesse : niveau N, Classement, Comment jouer), sélection par 2 / 8 ou le doigt, 5 = OK. Sous le téléphone : « Ton record 312 · 6e de novembre » (`/snake/me`).
- Partie : canvas net (rapport de pixels de l'écran), cases entières (14 px à 390 px, moins sur 320 px), barre d'état (score sur 4 chiffres, « BONUS n » pendant une bestiole, « NIV n »). Écrans PRÊT ? / PAUSE / PERDU dans l'écran vert. Glisser sur l'écran vert, touches 2 / 4 / 6 / 8, flèches et ZQSD/WASD du clavier ; 5, Espace ou Entrée = lancer / pause. File de 2 virages au plus. Pause automatique quand l'app passe en arrière-plan ou l'onglet est caché.
- Boucle : `requestAnimationFrame`, un pas chaque fois que `tickMs(niveau)` est écoulé, 3 pas au plus par image (jamais plus rapide que le temps réel : le serveur refuse `too_fast`).
- Ticket demandé à l'arrivée sur l'écran de partie (`POST /snake/games` au niveau choisi), avant le premier pas ; pas de ticket au lancement (panne, hors connexion) : partie locale, bandeau « Hors connexion : partie non classée ». Ticket suivant demandé dès la fin d'une partie (Rejouer sans attente).
- Fin : le serpent clignote ~1 s, puis l'écran de fin (planche `Perdu.dc.html`) : PERDU, score, record, bouchées, niveau ; carte de place ou d'invitation au classement (« Apparaître au classement » si pas volontaire et `rankable`) ; Rejouer, Partager, Classement. Envoi `finish` en arrière-plan ; erreur réseau → « Score pas encore envoyé » + Réessayer (mêmes données, même id : la réponse en double est sans risque) ; 422 → « Score non enregistré ». Quitter une partie en cours (retour) : `finish` avec `end: 'quit'`, sans attendre.
- Sons (réglage « Bips du jeu ») : bips carrés courts par le contexte audio partagé de `src/lib/coupe/audioUnlock.js` (débloqué au geste qui lance la partie) ; vibrations (réglage « Vibrations ») par `@capacitor/haptics` dans les apps, `navigator.vibrate` sinon, jamais d'erreur.
- Partager : texte « J'ai fait 248 points au Snake du Gang. Viens me battre : https://dhomebarber.fr/snake » (jamais `window.location.origin`) : `@capacitor/share` dans les apps, `navigator.share` sur le web, sinon copie du lien (toast `sonner`).
- Musique de l'app (bouton en haut à droite, 32 px) : laissée telle quelle ; en-têtes en `pr-12`.

## 7. Tests

- Serveur : `test/test-snake-engine.js` (copies identiques, déterminisme, règles, rejeu, refus) et `test/test-snake-api.js` (routes, drapeau, quotas, trop rapide, renvoi en double, classement filtré, purge du compte) ; une mutation ciblée qui fait échouer chacun.
- App : `e2e/snake-partie.spec.js` (constructeur « jeu ») et `e2e/snake-pages.spec.js` (constructeur « pages ») ; faux serveur `FauxSnakeRest` (`api.snakeRest`), qui **rejoue chaque partie avec le vrai moteur** : un virage mal noté par l'app fait échouer le test.

## 8. Décisions du chef après les contre-expertises (2 nov. 2026)

- Version des règles (`rules`) envoyée par le téléphone et rangée avec le ticket : le jour où le moteur change, les parties des apps anciennes ne sont pas refusées au rejeu, elles sont jouées sans classement (409 `update_required`) ou le serveur garde l'ancien moteur.
- Fins non envoyées gardées sur l'appareil (`src/lib/snake/pending.js`, `localStorage` `dhb-snake-pending`) et renvoyées à la prochaine occasion ; partie fermée en cours (`pagehide`) : sa fin `quit` y entre aussi.
- Quota des tickets relevé à 600 / h ; aucune ligne à 0 point au classement ; données du Snake effacées aussi quand l'admin supprime un compte de l'équipe (`routes/entities.js`).
- Police Silkscreen embarquée (`@fontsource/silkscreen`) : l'écran vert reste rétro hors connexion dans les apps.
- Gardés tels quels : 9 boutons de niveau sur une ligne (28 px de large à 320 px, au-dessus des 24 px du minimum WCAG 2.2 AA ; dessin de la planche) ; un robot qui connaît la graine peut jouer parfaitement en temps réel (limite connue, aucun lot ; recours : l'exclusion du classement par le salon).
