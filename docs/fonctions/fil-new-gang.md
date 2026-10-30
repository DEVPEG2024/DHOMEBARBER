# Fil « New Gang » v2 : interaction et rétention

> Demande du propriétaire du 29 oct. 2026 : « revoit l'architecture et améliore l'espace new gang pour plus d'interaction et de rétention ». Planche (diagnostic, architecture, écrans, plan) : https://claude.ai/artifact/R8re91ruSRri2pJ7YFxV9b. Chantier lancé le 30 oct. 2026 (« Lance le chantier sans que j'interviens »), avec les recommandations de la planche pour les six choix. **Contrat détaillé** (schéma, API, formes des réponses, tâches, partage des fichiers) : `fil-new-gang-contrat.md`.
>
> Site : en ligne avec le déploiement du 30 oct. 2026 (Heroku puis Vercel). **Apps natives** : avec les prochains builds (iOS build 19, Android code 20) ; Android 1.0.18 et iOS 1.0.10 (build 18, La Coupe du Gang) n'ont que l'ancien fil, qui continue de marcher grâce au CRUD inchangé.

## Ce qui a changé pour le client

- **Fil en une requête** (`GET /feed`, curseur) : réactions par emoji, ma réaction, nombre et 2 derniers commentaires, sondage, vues ; plus de cascade publications → réactions → commentaires ni de doublons à la pagination.
- **Réactions en pastilles** (emoji + nombre, la mienne en vert), choix des 6, appui long, double tap ❤️ sur une photo ; affichées tout de suite, retour en arrière si le serveur refuse.
- **Commentaires dans une fenêtre** : réponses (un niveau), ❤️ sur un commentaire, 2 commentaires en aperçu sous la carte, plus de champ sous chaque carte.
- **Formats** : publication avec 1 à 4 photos ; **« Mon look »** (client, rattaché à une de ses visites, bouton **« Réserver ce look avec <barber> »** qui ouvre la réservation remplie) ; **avant / après** (client, curseur de comparaison) ; **sondage** (salon seul) ; **Moments du Gang** (publication du salon quand un membre du classement Team of the Season monte de niveau, « 👏 Féliciter »).
- **Boucle d'activité** : écran Activité (`/feed/activite`, cloche du fil), pastille sur l'onglet « New's Gang ! », « N nouvelles publications », pushs groupés quand on réagit, commente ou répond chez toi, invitation « Ta coupe est toute fraîche » 2 h après la visite ; réglages « Me prévenir pour » (réactions, commentaires, nouveautés du salon, après ma visite).
- Filtres Tout / Le salon / Les looks / Sondages ; partage d'une publication (`https://dhomebarber.fr/feed?post=<id>`) ; l'auteur voit le nombre de membres qui ont vu sa publication ; halo vert animé retiré.

## Où est quoi

**Serveur** (`dhomebarber-api`)
- `lib/feedRules.js` : règles pures (curseur, formats, sondage, look, textes de repli, regroupement de l'activité, textes des pushs). Test `test/test-feed-rules.js`.
- `routes/feed.js` + `lib/feedQueries.js` : lecture (`GET /feed`, `/feed/:id`, `/feed/:id/comments`, `/feed/visits`) et gestes (`POST /feed/posts`, `/react`, `/comments`, `/comments/:id/like`, `/vote`). Test `test/test-feed-routes.js`.
- `lib/feedActivity.js` : activité écrite après chaque geste (v2 et CRUD des apps publiées, branché dans `routes/entities.js`, `recordFeedActivity`). `routes/feedActivity.js` : `GET /feed/activity`, `POST /feed/activity/read`, `GET /feed/unread`, `POST /feed/seen`, `GET|PUT /feed/prefs`. Test `test/test-feed-activity.js`.
- `jobs/feedDigest.js` : toutes les 5 min pushs groupés, sondages, invitation après la visite ; Moments à 11:00 et 18:00 ; purge 04:30 (activité > 90 j). Lancement à la main : `heroku run "node jobs/feedDigest.js digest|broadcasts|visits|moments|purge" --app dhomebarber-api`. Test `test/test-feed-digest.js`.
- `test/test-feed-chef.js` : colonne interne jamais renvoyée par le CRUD, coupure d'urgence, Moments oubliés au retrait du classement.
- Migration « fil v2 » de `server.js` : `posts.subject_user_id`, `post_comments.parent_id`, `comment_likes`, `post_poll_votes`, `feed_activity`, `feed_broadcasts`, `feed_push_counts`, `users.feed_seen_at / feed_prefs / gang_moment_tier`, `appointments.feed_invite_sent`.
- **Coupure d'urgence** : `heroku config:set FEED_V2=off --app dhomebarber-api` → `features.feedV2` faux, l'app relit l'ancien fil par les entités (les tâches continuent) ; `heroku config:unset FEED_V2` pour rouvrir.

**App** (`puzzling-sharp-edge-book`)
- `src/lib/feed/` : `rules.js` (règles pures), `feedApi.js` (drapeau `useFeedV2Query`, qui rejette sur une panne ; `FEED_KEYS` ; un appel par route), `feedCache.js` (mise à jour du cache partout où la publication est affichée), `useFeed.js` (pages, gestes optimistes, ancien fil par `legacyItem`), `useUnread.js` (pastille, 60 s), `share.js`, `escapeStack.js` (Échap ne ferme que la fenêtre du dessus).
- `src/pages/Feed.jsx` (fin : assemble), `src/pages/FeedActivity.jsx` (`/feed/activite`, `/admin/feed/activite`).
- `src/components/feed/` : `PostCard`, `ReactionBar`, `CommentPreview`, `FeedHeader` (en-tête, « Quoi de neuf », filtres), `NewPostsButton`, `ModerationPanel`, `PostMenu` (Signaler / Bloquer, `BlockConfirm`), `ReportSheet`, `CommentsSheet`, `Composer` (brouillon gardé par compte et par onglet le temps de la page), `LookCard`, `PollCard`, `BeforeAfter`, `MomentCard`, `VisitPicker`, et les briques `FeedSheet`, `AuthorLine`, `MediaGrid`.
- `src/components/layout/BottomNav.jsx` : pastille de l'onglet.
- Tests e2e : `e2e/fil-v2*.spec.js` ; faux serveur du fil `FauxFil` (`e2e/support/mockApi.js`, état `api.fil`, fabriques `publicationFil`, `sondageFil`, `activiteFil` de `donnees.js`).

## Règles retenues (et pourquoi)

- **Apps publiées** : le CRUD `Post` / `PostLike` / `PostComment` ne change pas ; chaque format v2 écrit un texte de repli (`content`) et sa première photo (`image_url`, avant / après : « après ») ; le mot de l'auteur est gardé dans `meta.caption`. Une réponse apparaît comme un commentaire ordinaire dans une ancienne app.
- **`post_likes`** garde l'email tel que le CRUD l'écrit (unicité `(post_id, user_email)` partagée avec les apps publiées) ; les nouvelles tables sont en minuscules.
- **Blocages** : exclus avant le `LIMIT` ; une réponse sous la racine d'un auteur bloqué est retirée aussi ; un Moment d'un membre bloqué aussi ; pas d'activité vers quelqu'un qui a bloqué l'auteur du geste.
- **Tous les comptes admin = le salon** : pas d'activité d'un admin vers un autre, pas de sondage du salon « à voter » pour un admin, pas de « nouvelles publications » du salon pour un admin.
- **Pushs du fil** : jamais 21:00–08:00 (ils partent à 8 h, regroupés), un par compte et par passage, 30 min au moins entre deux, 2 h entre deux pushs d'une même publication, 8 par jour ; réglage éteint = lignes marquées sans envoi (`pushed_at = created_at`) ; nouveautés du salon (sondages) seulement si `feed_prefs.salon = true` (Apple 4.5.3), jamais à qui a bloqué le salon ; invitation après la visite valable 6 h.
- **« N nouvelles publications »** : `since` = date de la publication du haut, renvoyée à la milliseconde par l'app alors que la colonne garde la microseconde : la requête ajoute 1 ms (sinon la publication du haut se comptait elle-même, vu par la contre-expertise).
- **Pastille** = groupes non lus (comme l'écran Activité), 99 au plus.
- **Moments du Gang** : seulement pour les membres du classement Team of the Season (volontaires, non exclus) ; premier passage = niveaux notés sans publication ; un membre qui rejoint (ou revient au) classement est noté sans publication ; quitter le classement efface ses Moments (`forgetMoments`, `routes/gangCard.js`).
- **Look** : visite relue en base (au client, sans proche, commencée, 60 jours) ; jamais de prix ; « Réserver ce look » relu à la lecture (barber inactif, caché ou supprimé → pas de bouton).
- **Suppression de compte** : votes, ❤️ de commentaires, activité reçue et faite, Moments, compteurs de pushs ; médias de `meta` relevés. Signalements des réponses clos quand l'admin supprime un commentaire racine.
- `public/privacy.html` mise à jour le 30 oct. 2026 (formats, activité, Moments, vues).

## Vérifications du 30 oct. 2026

- Équipe : fondations du chef, 5 constructeurs (S1 lecture et gestes, S2 activité et tâches, F1 page et cartes, F2 formats, commentaires, composeur, F3 Activité, pastille, faux serveur, tests), 3 contre-expertises (code de l'app : 1 bloquant + 14 mineurs ; serveur : 0 bloquant, 10 points ; navigateur), correcteurs, vérification finale.
- Toutes les requêtes nouvelles exécutées sur une base PostgreSQL 17 locale montée avec `init-db.js` et les migrations de `server.js` (routes réelles et tâches appelées pour de vrai, heure de jour simulée) ; aucune erreur de type.
