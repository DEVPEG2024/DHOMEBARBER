# La Coupe du Gang : spectateurs et écran du salon (étape 2 des tournois)

Demandes du propriétaire du 3 nov. 2026 : « possible d'être seulement spectateur des matchs ? », puis écran du salon « tout le temps ». Réponse B du 4 nov. 2026 sur les matchs des barbers : « Rien ne passe à l'écran tant que le barber ne l'a pas allumé lui-même. » Planche validée : https://claude.ai/artifact/S7Kk4Bv1c35Yz3acHuZk9r, écrans 13 à 15. Contrat (protocole, routes, base, décisions après contre-expertise) : `coupe-spectateurs-contrat.md`. Décisions des tournois : `coupe-tournois.md`.

Construit le 4 nov. 2026 : chef (contrat, fondations), 5 constructeurs (B1 serveur de jeu, B2 routes et base, F1 vue spectateur, F2 écran du salon et admin, F3 côté joueurs), 3 contre-experts (code du serveur, app dans le navigateur, accord app ↔ serveur sur un banc avec le vrai serveur), 4 correcteurs.

## Règles (à garder)

- **Un seul réglage, « Laisser regarder mes matchs »** (`users.coupe_watch_opt_in`, éteint par défaut pour tout compte, écrit seulement par `PATCH /coupe/settings`). Un match ordinaire est regardable (téléphones et écran du salon) seulement si les deux comptes l'ont allumé **et** que les deux sockets joueur ont annoncé `auth.sp: 1` (app qui affiche le compteur : un joueur sait toujours qu'il est regardé). Relu à chaque coup d'envoi ; éteint en plein match = spectateurs sortis tout de suite. Jamais pour un compte exclu des classements ni un barber à fiche cachée ou inactive.
- **Match de tournoi : toujours regardable** (l'inscription le dit).
- Le spectateur ne compte nulle part et n'est rangé nulle part ; réactions toutes faites (« Allez ! », « Quel but », « Bravo », « Oh non »), anonymes, aucun message écrit ; pions aux initiales, jamais une photo ; spectateur bloqué par un joueur (ou qui l'a bloqué) : `no_match`.
- **Les joueurs voient** le nombre de spectateurs, « Sur l'écran du salon », et les réactions (bulles, jamais sur le centre du terrain). Messages nouveaux seulement aux sockets en protocole 3 ; protocole 2 et salles sans spectateur octet pour octet comme avant.
- **Quotas des spectateurs à part de ceux des joueurs** (au salon tout le monde partage une IP : un joueur ne doit jamais perdre son match parce que d'autres regardent). Quota HTTP général compté par compte (jeton vérifié), par IP sinon.
- **Écran du salon** : `/ecran#cle=…`, site seulement (absent des apps, règle 2.5.19), sans compte, clé créée par l'admin (Admin → La Coupe du Gang → Écran du salon, montrée une seule fois, rangée en sha256, 5 écrans au plus, 2 sockets par écran). La clé n'est oubliée par l'écran que sur `error screen_revoked` ou un 403 de `GET /coupe/screen`, **jamais sur une simple fermeture 4401**. Muet, jamais suivi par la mesure d'audience, noms publics seulement.
- Coupure d'urgence `COUPE_SPECTATEURS=off` (`features.coupeSpectators` faux ; faux aussi avec `COUPE_WS=off`).

## Où est quoi

- Serveur (`dhomebarber-api`) : `lib/coupeRooms.js` (section « Spectateurs (4 nov. 2026) » de l'en-tête : sockets `watch` / `screen`, `watch`, `wstart`, relais, `wend`, `watchers`, `cheer`, plafonds, `watchableLive`, `unwatchUser`, `dropScreen`), `lib/coupeScreen.js` (drapeau, clés d'écran, `watchAllowed`, `authenticateScreen`, données de l'écran, `/coupe/live`), `routes/coupe.js` (`/coupe/live`, `/coupe/screen`, `/coupe/admin/screens`, `watch_opt_in`), `server.js` (migrations, options, CORS `X-Screen-Key`, quota général), `lib/wsRouter.js` (ouvertures de `/ws/coupe`). Harnais : `test/test-coupe-spectateurs.js`, `test-coupe-ecran.js`, `test-coupe-direct.js`.
- App : `src/lib/coupe/watch.js` (réactions, retard, liens), `src/lib/coupe/spectatorMatch.js` (client spectateur), `src/components/coupe/watch/*` (`WatchStage`, bandeaux, parties de la vue), `src/pages/CoupeRegarder.jsx` (`/coupe/regarder?m=…&tournoi=…` ou `?w=…`), `src/pages/EcranSalon.jsx` et `src/components/coupe/ecran/*`, `src/lib/coupe/screenApi.js`, `src/components/admin/coupe/ScreensSection.jsx` ; côté joueurs : `onlineMatch.js` (`watchers`, `cheer`, `auth.sp`), `CoupeGame.jsx` et `game/Hud.jsx` (pastille, bulles), `hub/LiveSection.jsx` (« En direct »), `hub/SettingsCard.jsx` (réglage), `tournoi/BoardView.jsx` (« Regarder »). Tests : `e2e/coupe-regarder.spec.js`, `ecran-salon.spec.js`, `coupe-ecrans-admin.spec.js`, `coupe-direct.spec.js` ; faux serveurs `e2e/support/fauxCoupe.js` (spectateurs), `fauxDirect.js`, `fauxEcran.js`.

## Build du 5 nov. 2026 (iOS 1.0.13, Android 1.0.21, soumis)

- Notes de revue (règle 2.5.19) : regarder un match (tournoi, ou deux joueurs d'accord), réactions toutes faites, réglage « Laisser regarder mes matchs », nombre de spectateurs ; aucun texte libre.
- Les apps d'avant (1.0.11, 1.0.12) n'envoient pas `auth.sp` : leurs matchs ordinaires ne sont jamais regardables, même réglage allumé sur le site.
