# Fil « New Gang » v2 : contrat (30 oct. 2026)

Contrat écrit avant le code, comme `coupe-du-gang-contrat.md`. Il fait foi pour le serveur (`dhomebarber-api`) et pour l'app. Planche validée : https://claude.ai/artifact/R8re91ruSRri2pJ7YFxV9b (« Lance le chantier », 30 oct. 2026).

## 0. Décisions (recommandations de la planche, prises le 30 oct. 2026)

1. Sondages réservés au salon (compte admin, publié au nom de « D'Home Barber »).
2. Moments du Gang seulement pour les membres qui figurent au classement Team of the Season (`users.gang_leaderboard_opt_in = true`, non exclus).
3. Push « Ta coupe est toute fraîche » 2 h après la fin de la visite, une seule fois par visite, jamais entre 21 h et 8 h.
4. L'auteur voit combien de membres ont vu sa publication : le nombre seulement (l'admin le voit sur toutes).
5. Halo vert animé sous les cartes : retiré.
6. Livraison : un seul envoi, serveur d'abord (Heroku), puis l'app (Vercel). Les apps l'auront avec le build 18.

Partage d'une publication : lien `https://dhomebarber.fr/feed?post=<id>` (pas de page d'aperçu `/p/<id>` dans ce lot : un aperçu ne doit rien montrer d'un client, à faire plus tard pour les publications du salon).

## 1. Règles qui ne bougent pas

- Apps publiées (build 17 et avant) : le CRUD `Post` / `PostLike` / `PostComment` / `PostReport` / `UserBlock` reste tel quel. Chaque format v2 écrit aussi `content` (texte de repli, `fallbackContent`) et `image_url` (première photo ; avant / après : la photo « après ») : une ancienne app montre une publication normale.
- Drapeau `features.feedV2` (routes/public.js). L'app sans drapeau lit l'ancien fil par les entités (`legacyItem`), sans formats, réponses, activité ni pastille. La lecture du drapeau rejette sur une panne (`fetchFeedV2`) : jamais l'ancien fil par erreur.
- Identité jamais lue dans le corps : auteur, votant, réacteur = jeton + `users` (`authorFields` de routes/entities.js, exporté). L'admin écrit au nom du salon (« D'Home Barber », logo, étoile bleue).
- Jamais d'email dans une réponse, sauf `author_email` pour le staff (modération) et sur ses propres lignes. Identifiants publics : `author_key` / `user_key` (lib/publicKey.js). `posts.subject_user_id` : interne, retiré de toute lecture (`ac.FEED_INTERNAL_COLUMNS`).
- Emails des nouvelles tables (`comment_likes`, `post_poll_votes`, `feed_activity`) **toujours en minuscules** à l'écriture (`String(email).trim().toLowerCase()`), comparés en `LOWER()`.
- Auteurs bloqués par le lecteur (`getBlockedKeys`, `getBlockedAuthorEmails`, exportés) exclus de tout : pages, publication seule, commentaires, activité (pas d'activité créée si le destinataire a bloqué l'auteur du geste), non-lus. Moment d'un membre bloqué : exclu aussi (clé de son email).
- Filtre des contenus (`assertPublishable`, exporté) sur tout texte écrit par un client : publication, commentaire, question et réponses d'un sondage (admin : jamais filtré).
- Quotas : publications et commentaires = `assertFeedRate` (3 / min, 20 / jour ; 10 / min, 100 / jour) ; doublons rendus tels quels (10 min ; 30 s pour un commentaire) ; réactions 120 / min par compte, ❤️ de commentaire 120 / min, votes 30 / min, `POST /feed/posts` passe par `assertFeedRate` comme le CRUD.
- Images : seulement des médias de l'app (`ac.profilePhotoOrNull`) ; `posts.meta` et `feed_activity.actor_photo_url` sont dans `jobs/mediaCleanup.js` (fait).
- Pushs : tutoiement, jamais entre 21:00 et 08:00 (`lib/coupeHours.js isNight`), flag posé avant l'envoi (`UPDATE … RETURNING`), tout passe par `lib/pushHelper.js`. Nouveautés du salon (sondages) seulement si `feed_prefs.salon = true` (Apple 4.5.3). Notifications jamais obligatoires.
- Suppression de compte (`purgeClientContent`, routes/auth.js) : `comment_likes`, `post_poll_votes`, `feed_activity` (destinataire ou auteur), Moments qui le concernent (`posts.subject_user_id`) effacés ; `collectClientMedia` relève aussi `meta->images` de ses publications.
- Erreurs `{ error, code? }` en français. Écrans du fil au tutoiement (fil, composeur, Activité, pushs) ; messages d'erreur génériques au vouvoiement comme le reste de l'app (« Pas de connexion internet. Réessayez dans un instant. »).
- Toute nouvelle requête : `EXPLAIN` en `READ ONLY` avant le déploiement (le chef s'en charge).

## 2. Base (server.js, bloc « Migration fil v2 », fait)

- `posts.kind` : `NULL` (publication, `post` dans l'API), `last_minute`, `look`, `poll`, `before_after`, `moment`.
- `posts.meta` (JSONB) selon le format :
  - post : `{ images: [url, …] }` seulement si plus d'une photo ;
  - look : `{ images, employee_id, employee_name, service_ids, service_names, bookable }` (`lookMeta`, jamais de prix) ;
  - poll : `{ question, options: [{ id: 'a', label }], ends_at }` (`pollMeta`) ;
  - before_after : `{ images: [avant, après], employee_id?, employee_name? }` ;
  - moment : `{ type: 'tier_up', tier, tier_label, member_name, member_photo_url }` + `posts.subject_user_id` ;
  - last_minute : inchangé (lib/lastMinuteAuto.js).
- `posts.subject_user_id UUID` (interne), index `(created_at DESC, id DESC)`.
- `post_comments.parent_id UUID REFERENCES post_comments(id) ON DELETE CASCADE` : réponse = un seul niveau, `parent_id` = commentaire racine.
- `comment_likes (comment_id, user_email, created_at)`, PK `(comment_id, user_email)`.
- `post_poll_votes (post_id, user_email, option_id, created_at, updated_at)`, PK `(post_id, user_email)`.
- `feed_activity (id, recipient_email, type, post_id, comment_id, appointment_id, actor_email, actor_name, actor_role, actor_photo_url, emoji, excerpt, created_at, read_at, pushed_at)` ; uniques : une `reaction` par (destinataire, publication, auteur), un `comment_like` par (destinataire, commentaire, auteur), un `visit_invite` par `appointment_id`.
- `feed_broadcasts (post_id PK, created_at, pushed_at)` : push d'un nouveau sondage, une fois.
- `users.feed_seen_at`, `users.feed_prefs` (JSONB, `normalizePrefs`), `users.gang_moment_tier` (dernier niveau annoncé) ; `appointments.feed_invite_sent`.

## 3. Règles pures (fait)

- Serveur : `lib/feedRules.js` (test : `test/test-feed-rules.js`) : curseur (`encodeCursor` / `decodeCursor`, `CURSOR_TS_SQL`), `pageSize`, `feedFilter`, préférences, `validateNewPost`, sondage (`pollMeta`, `isPollOpen`, `pollOptionOrThrow`, `pollView`), look (`lookMeta`, `lookBookingPath`), `fallbackContent`, `imagesOf`, `publicMeta`, activité (`actorLabel`, `groupActivity`, `pushTextFor`, `visitInviteText`, `pollPushText`, `momentContent`) et constantes (fenêtres, plafonds).
- App : `src/lib/feed/rules.js` (réactions, votes, fils de commentaires, phrases de l'écran Activité, pages du cache, `legacyItem`, `postShareUrl`), `src/lib/feed/feedApi.js` (drapeau, `FEED_KEYS`, un appel par route), `src/lib/feed/feedCache.js` (`updateFeedItem` avec retour en arrière, `removeFeedItem`, `prependFeedItem`, `invalidateFeed`).
- Briques d'écran : `src/components/feed/FeedSheet.jsx` (fenêtre du bas : portail, croix seule, Échap, retour Android, `layer="top"` = `z-[70]`), `AuthorLine.jsx` (`SalonStar`, `AuthorAvatar`, `AuthorName`), `MediaGrid.jsx` (1 à 4 photos 4:5).

## 4. API (préfixe `/api/apps/:appId`, toutes `requireAuth`)

### Formes communes

Publication (`item`) :

```js
{
  id, kind,                         // 'post' | 'look' | 'poll' | 'before_after' | 'moment' | 'last_minute'
  created_at,                       // ISO
  author_name, author_role, author_photo_url, author_key,
  author_email,                     // staff seulement, ou ses propres publications
  is_mine,                          // vrai : supprimer (l'admin : tout), pas de Signaler / Bloquer
  content,                          // texte (look / avant-après : le mot de l'auteur, sans la ligne de repli)
  images: [url],                    // 0 à 4 (avant / après : [avant, après])
  image_url,                        // première photo (apps publiées)
  meta,                             // publicMeta(kind) : look { employee_id, employee_name, service_ids, service_names, bookable, booking_path } ; moment { type, tier, tier_label, member_name, member_photo_url } ; last_minute : comme avant
  appointment_id,                   // last_minute seulement
  reactions: { '🔥': 12, '❤️': 5 },
  reactions_total, my_reaction,     // emoji ou null
  comments_count,
  comments_preview: [comment],      // 2 derniers commentaires (racines ou réponses), du plus ancien au plus récent
  poll,                             // pollView() ou null
  views,                            // nombre de membres qui l'ont vue : ses propres publications et l'admin ; sinon null
}
```

Le `content` d'un look ou d'un avant / après envoyé par `GET /feed` est le mot de l'auteur seul : le serveur garde le mot dans `meta.caption` à l'écriture (`content` en base = texte de repli) et renvoie `meta.caption` dans `content`. Sondage : `content` renvoyé = `poll.question`.

Commentaire :

```js
{ id, post_id, parent_id, author_name, author_role, author_photo_url, author_key, author_email /* staff ou à moi */, is_mine, content, created_at, likes, my_like }
```

### Lecture — routes/feed.js (constructeur S1)

- `GET /feed?before=<curseur>&filter=all|salon|looks|polls&limit=20` → `{ items, next_cursor }`. Tri `created_at DESC, id DESC`, curseur `(created_at, id) < ($ts::timestamp, $id::uuid)`, `limit + 1` lignes pour savoir s'il reste une page. `salon` = `author_role = 'admin'` (Last Minute et Moments compris) ; `looks` = `kind IN ('look', 'before_after')` ; `polls` = `kind = 'poll'`. Agrégats en une requête chacun, `post_id = ANY($1::uuid[])` : réactions par emoji, ma réaction, nombre de commentaires + 2 derniers (fenêtre `ROW_NUMBER()`), votes par réponse + mon vote, vues (`post_views`, rôles clients, comme `postViewCounts` de lib/analytics.js) pour mes publications (toutes pour l'admin). Auteurs bloqués exclus **avant** le `LIMIT`.
- `GET /feed/:id` → `{ item }` ; 404 `{ code: 'not_found' }` si absente ou auteur bloqué.
- `GET /feed/:id/comments` → `{ comments, total }` : ordre `created_at ASC`, 500 au plus, auteurs bloqués exclus, `likes` + `my_like`.
- `GET /feed/visits` (client) → `{ visits: [{ id, date, start_time, employee_id, employee_name, employee_photo_url, service_names }] }` : ses visites des 60 derniers jours (RDV `confirmed` ou `completed` déjà commencés, sans `guest_name`), la plus récente d'abord, 10 au plus.

### Écriture — routes/feed.js (S1)

- `POST /feed/posts` (corps : `validateNewPost`) → `{ item }`.
  - look : la visite est relue en base (à lui, sans proche, commencée, 60 jours au plus) ; barber = prénom de la fiche ; prestations = celles du RDV encore actives au catalogue (id + nom) ; `bookable` faux si le barber est inactif ou caché. 404 `{ code: 'visit_not_found' }` sinon.
  - poll : `pollMeta`, ligne `feed_broadcasts` créée dans la même transaction.
  - Toujours : `content` en base = `fallbackContent(kind, …)`, `image_url` = première photo (avant / après : « après »), `meta.images` si plus d'une photo, `meta.caption` = mot de l'auteur.
  - Doublon (même auteur, même `content` en base, même `image_url`, 10 min) : rendu tel quel.
- `POST /feed/:id/react { reaction }` (emoji de la liste, ou `null` pour retirer ; `reactionOrThrow`) → `{ reactions, reactions_total, my_reaction }`. Écrit `post_likes` (`INSERT … ON CONFLICT (post_id, user_email) DO UPDATE SET reaction`, ou `DELETE`), puis `feedActivity.recordReaction` / `removeReaction`. 404 si la publication n'existe plus.
- `POST /feed/:id/comments { content, reply_to? }` → `{ comment, comments_count }`. Mêmes règles que `CREATE_RULES.post_comments` (filtre, doublon 30 s, quota). `reply_to` : commentaire de la même publication (sinon 400) ; `parent_id` = `reply_to.parent_id || reply_to.id`. Puis `feedActivity.recordComment`.
- `POST /feed/comments/:id/like { liked }` → `{ likes, my_like }` ; puis `recordCommentLike` / `removeCommentLike`.
- `POST /feed/:id/vote { option_id }` → `{ poll }` ; 409 `{ code: 'poll_closed' }` après la fin ; 400 réponse inconnue ; vote changé tant que c'est ouvert.
- Suppression : CRUD existant (`Post.delete`, `PostComment.delete`), inchangé (réponses, ❤️, votes et activité suivent par `ON DELETE CASCADE`).

### Activité — routes/feedActivity.js (constructeur S2)

- `GET /feed/activity` → `{ items, unread_count, polls }` : 80 dernières lignes du compte (90 jours), auteurs bloqués exclus, `groupActivity()` ; chaque groupe : `{ id, ids, type, post_id, comment_id, appointment_id, actors: [{ name, photo_url, role }], actors_count, emoji, excerpt, created_at, unread, post_kind, post_image_url }`. `polls` : sondages ouverts du salon (14 derniers jours) où il n'a pas voté : `[{ post_id, question, ends_at }]`.
- `POST /feed/activity/read { ids? }` → `{ unread_count }` (sans `ids` : tout).
- `GET /feed/unread?since=<ISO>` → `{ activity, posts }` (99 au plus chacun) : `activity` = lignes non lues ; `posts` = publications d'autres auteurs (ni bloqués, ni Last Minute) plus récentes que `since`, sinon que `users.feed_seen_at` (0 si jamais vu).
- `POST /feed/seen` → `{ ok: true }` (`feed_seen_at = NOW()`).
- `GET /feed/prefs` → `normalizePrefs` ; `PUT /feed/prefs` (`prefsPatch`) → réglages complets.

### lib/feedActivity.js (S2) — appelée par routes/feed.js et par les entités du fil

Toutes `async`, **ne rejettent jamais** (erreur journalisée `[Fil] …`), premier argument `db` (pool ou client) :

- `recordReaction(db, { post, actor, emoji })` — `post` : ligne `posts` (`id`, `author_email`, `kind`, `subject_user_id`) ; `actor` : `{ email, name, role, photo_url }` (champs de `authorFields`, l'admin = le salon).
- `removeReaction(db, { postId, actorEmail })` — retire la ligne non lue de cet auteur.
- `recordComment(db, { post, comment, actor, replyTo })` — `replyTo` : commentaire répondu (`id`, `author_email`) ou null ; l'auteur de la publication reçoit `comment`, l'auteur répondu `reply` (une seule ligne s'il est les deux : `reply`).
- `recordCommentLike(db, { comment, actor })`, `removeCommentLike(db, { commentId, actorEmail })`.
- Destinataire d'une publication : `author_email`, ou pour un Moment l'email du compte `subject_user_id` ; jamais soi-même ; jamais une publication sans destinataire (Last Minute) ; jamais si le destinataire a bloqué l'auteur.

S2 branche aussi ces fonctions sur le CRUD des apps publiées (routes/entities.js : création de `post_likes` et de `post_comments`, modification de `post_likes.reaction`, suppression de `post_likes`), en tâche de fond après la réponse.

### Tâches — jobs/feedDigest.js (S2), `startFeedDigestJob()`

Toutes les 5 min (node-cron, heure de Paris), chaque étape dans son `try` :

1. **Pushs groupés** : lignes `pushed_at IS NULL`, de moins de 12 h, de type `reaction`, `comment`, `reply`, `comment_like`, `moment` ; jamais la nuit (elles attendent 8 h) ; par destinataire et publication (commentaire pour `comment_like`) : `groupActivity` puis `pushTextFor` ; un push au plus par (destinataire, publication) toutes les 2 h (`PER_POST_PUSH_GAP_MS`, lu sur les lignes déjà poussées), 8 par jour de Paris et par destinataire ; réglage éteint (`prefKeyForType`) → lignes marquées sans envoi ; `UPDATE … SET pushed_at = NOW() … RETURNING` avant `sendPushToEmail`.
2. **Sondages** : `feed_broadcasts` non poussés de moins de 24 h, en journée : `pushed_at` posé puis push (`pollPushText`) aux comptes `role = 'user'` dont `feed_prefs.salon = true` (`sendToSubscriptions` sur une requête jointe).
3. **Invitation après la visite** : RDV du jour (Paris) `confirmed` / `completed`, client avec compte `role = 'user'`, sans `guest_name`, `feed_invite_sent IS NOT TRUE`, fin passée depuis 2 h à 6 h ; réglage `visit` allumé ; pas d'invitation dans les 7 jours ; pas de look publié aujourd'hui ; en journée. `UPDATE appointments SET feed_invite_sent = true … RETURNING`, ligne `visit_invite` (`pushed_at` posé), push `visitInviteText`.
4. **Moments du Gang** (à 11:00 et 18:00 Paris, pas toutes les 5 min) : membres `gang_leaderboard_opt_in = true`, non exclus ; niveau (`gangCard.loadSummaries`) plus haut que `gang_moment_tier` → publication du salon `kind = 'moment'` (`author_email` NULL, `salonAuthorFields()`, `content = momentContent`, `subject_user_id`), `gang_moment_tier` mis à jour dans la même transaction, ligne `moment` pour le membre. **Premier passage** (marqueur `app_migrations` `feed_moments_init_2026_10_30`) : `gang_moment_tier` = niveau actuel de tous, aucune publication. Jamais plus de 5 Moments par passage.
5. **Purge** (04:30 Paris) : `feed_activity` de plus de 90 jours.

## 5. App (constructeurs F1, F2, F3)

### Écrans

- `/feed` (et `/admin/feed`) : en-tête « Communauté / Ca dit quoi le Gang ? » + cloche (pastille = activité non lue) vers `/feed/activite` (`/admin/feed/activite` dans l'admin) ; carte « Quoi de neuf, <prénom> ? » avec Photo, Mon look (client), Sondage (admin) ; puces de filtre (`FEED_FILTERS`) ; Team of the Season et « Jeux » comme avant ; bouton « N nouvelles publications » (`GET /feed/unread?since=`, toutes les 60 s) ; cartes ; défilement par curseur ; bouton flottant « Nouvelle publication » gardé.
- Carte (`PostCard`) : en-tête auteur (avatar, nom, étoile / Barber, temps, vues sur mes publications), corps selon le format, barre de réactions (pastilles emoji + nombre, la mienne en vert, bouton pour choisir), 2 commentaires en aperçu + « Voir les N commentaires », rangée Commenter / Partager. Plus de champ de commentaire sous chaque carte. Double tap sur la photo = ❤️. Halo vert retiré.
- Look : photo(s) avec le badge « Mon look » et le bandeau prestations + barber, bouton « Réserver ce look avec <barber> » (`meta.booking_path`) si `bookable`.
- Sondage : réponses en barres (pourcentage après mon vote ou à la fin, ou pour l'admin), ✓ sur mon vote, « 128 votes · encore 2 jours · tu peux changer ton vote ».
- Avant / Après : les deux photos comparées (curseur glissant au doigt et au clavier : `input type="range"`), libellés AVANT / APRÈS.
- Moment : carte dorée (niveau, prénom, « passe Or sur sa carte Gang »), bouton « 👏 Féliciter » = réaction 👏.
- Fenêtre des commentaires (`CommentsSheet`) : fils d'un niveau, Répondre (« Réponse à Kevin » + annuler), ❤️ par commentaire, Supprimer (deux taps) sur les miens (l'admin : tous), Signaler sur les autres, emojis rapides, champ en bas (`kb-sheet`).
- Composeur (`Composer`) : onglets Publication, Mon look (client), Sondage (admin), Avant/Après (client) ; photos jusqu'à 4 ; Mon look : « Ta dernière visite » + Changer (`GET /feed/visits`), interrupteur « Bouton Réserver ce look » ; Sondage : question, 2 à 4 réponses, durée ; règles de la communauté ; « Publier ». Ouvert par `?compose=look&visit=<id>` (push après la visite).
- Activité (`/feed/activite`) : « Nouveau » / « Plus tôt », éléments groupés (`activityLine`), tap = lu + ouvre la publication (`/feed?post=<id>`, `&comments=1` pour un commentaire), « Tout marquer lu », sondages à voter, réglages « Me prévenir pour » (4 interrupteurs).
- Onglet « New's Gang ! » : pastille rouge = activité non lue (nombre, « 9+ »), point vert = nouvelles publications seulement.
- `?post=<id>` : la publication est chargée seule (`GET /feed/:id`) et montrée en tête, entourée ; `&comments=1` ouvre ses commentaires.

### Fichiers (un propriétaire par fichier ; jamais deux agents sur le même)

| Constructeur | Fichiers |
|---|---|
| Chef | `src/lib/feed/rules.js`, `feedApi.js`, `feedCache.js`, `src/components/feed/FeedSheet.jsx`, `AuthorLine.jsx`, `MediaGrid.jsx`, `src/App.jsx`, `src/index.css`, ce contrat, CLAUDE.md |
| F1 (fil) | `src/pages/Feed.jsx`, `src/lib/feed/useFeed.js`, `src/lib/feed/share.js`, `src/components/feed/PostCard.jsx`, `ReactionBar.jsx`, `CommentPreview.jsx`, `FeedHeader.jsx`, `NewPostsButton.jsx`, `ModerationPanel.jsx`, `ReportSheet.jsx`, `PostMenu.jsx` |
| F2 (formats) | `src/components/feed/CommentsSheet.jsx`, `Composer.jsx`, `LookCard.jsx`, `PollCard.jsx`, `BeforeAfter.jsx`, `MomentCard.jsx`, `VisitPicker.jsx` |
| F3 (activité, tests) | `src/pages/FeedActivity.jsx`, `src/lib/feed/useUnread.js`, `src/components/layout/BottomNav.jsx`, `e2e/support/mockApi.js`, `e2e/support/donnees.js`, `e2e/fil-v2.spec.js`, les tests e2e existants du fil (`fil-salon`, `last-minute-fil`, `audit-entrees`, `coupe-integrations`) |
| S1 (serveur, lecture et écriture) | `routes/feed.js`, `lib/feedQueries.js`, `test/test-feed-routes.js` |
| S2 (serveur, activité et tâches) | `lib/feedActivity.js`, `routes/feedActivity.js`, `jobs/feedDigest.js`, `routes/entities.js` (branchements du CRUD seulement), `routes/auth.js` (purge), `test/test-feed-activity.js`, `test/test-feed-digest.js` |

### Interfaces entre constructeurs de l'app

- `PostCard` (F1) choisit le corps selon `item.kind` et importe de F2 :
  - `<LookCard item onDoubleTap />`,
  - `<PollCard item onVote={(optionId) => …} canSeeResults={bool} />`,
  - `<BeforeAfter item />`,
  - `<MomentCard item onCongratulate={() => …} />` (= réaction 👏 ; la carte entière remplace l'en-tête auteur).
- `CommentsSheet` (F2) : `<CommentsSheet item user onClose onOpenMenu={(target) => …} onCountChange={(n) => …} />` ; il charge `FEED_KEYS.comments(id)`, écrit par `postComment` / `likeComment` / `PostComment.delete`, et met à jour l'aperçu et le nombre de la carte par `updateFeedItem`. `target` du menu : `{ type: 'comment', id, authorKey, authorEmail, authorName, content }`. Le menu Signaler / Bloquer (F1, `PostMenu` + `ReportSheet`) s'ouvre en `layer="top"`.
- `Composer` (F2) : `<Composer user initialKind="post"|"look"|"poll"|"before_after" initialVisitId onClose onPublished={(item) => …} />` ; il envoie `createFeedPost`, puis `prependFeedItem` ; `onPublished` ferme et fait défiler en haut.
- `useFeed(filter)` (F1) rend `{ items, query, fetchNextPage, hasNextPage, isFetchingNextPage, react(item, emoji|null), vote(item, optionId), remove(item), legacy }` ; `react` et `vote` sont optimistes (`updateFeedItem` puis appel, retour en arrière et toast si refus).
- `useFeedUnread()` (F3) : `{ activity, posts }` (0 tant que rien n'est lu), relu toutes les 60 s et au retour au premier plan, seulement connecté et avec `features.feedV2`.

### Règles d'écran (rappel de CLAUDE.md)

Fenêtres fermées par la croix ; `useAndroidBack` (FeedSheet le fait) ; avant tout état vide `queryFailed(q)` → `LoadError` ; jamais « Load failed » à l'écran ; toasts `sonner` ; envois en `networkMode: 'always'` (défaut) ; `overflow-x-clip` jamais `overflow-x-hidden` ; aucun défilement horizontal à 320 / 390 / 430 px ; animations `transform` / `opacity`, `useReducedMotion` ; photos des barbers jamais rondes (avatars clients ronds) ; lien partagé = `https://dhomebarber.fr` ; partage : `@capacitor/share` dans les apps, `navigator.share` sur le web, puis copie du lien ; vouvoiement des messages d'erreur génériques, tutoiement des textes du fil.
