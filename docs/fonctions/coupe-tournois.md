# La Coupe du Gang : tournois (décisions)

Demande du propriétaire du 3 nov. 2026 au soir : « je veux aussi pouvoir faire des tournois pour le jeu de foot, fais une rubrique d'abord en artefact (propose-moi un truc bien) ». Planche validée par « go » le même soir : https://claude.ai/artifact/S7Kk4Bv1c35Yz3acHuZk9r (15 écrans). Construction : `coupe-tournois-contrat.md`.

## Décisions du propriétaire (3 nov. 2026)

- **Tournoi en direct**, à l'heure que l'admin choisit à chaque fois (pas de rendez-vous fixe : « quand je veux »), 20:00 au plus tard à cause de la règle « jamais de notification entre 21:00 et 08:00 ».
- **8 ou 16 joueurs, au choix** à chaque tournoi.
- **Ouvert à tout le monde** : clients avec ou sans carte Gang, barbers, salon. Sans carte Gang, un match ne rapporte pas de Points de Coupe (règle d'aujourd'hui), mais on joue le tournoi et on peut le gagner.
- Élimination directe ; « Je suis là » 15 min avant (liste d'attente) ; tirage au sort en direct avec têtes de série (meilleurs Points de Coupe) ; matchs lancés tout seuls ; règlement v2 ; **tirs au but** si égalité après le but en or ; 2 min pour rejoindre son match, sinon forfait.
- **Aucun lot** (décision du 28 oct. 2026 gardée) : trophée, palmarès (fiche du joueur, classement ; jamais sur la carte Gang), annonce du salon dans le fil. Un lot demanderait un règlement écrit et la mention « Apple n'est pas sponsor » (règle Apple 5.3).
- **Spectateurs** (étape 2) : on peut regarder un match sans jouer (« possible d'être seulement spectateur des matchs ? ») ; matchs de tournoi ouverts à tous, matchs ordinaires seulement si les deux joueurs l'acceptent ; réactions toutes faites, aucun message écrit ; initiales des clients, jamais leur photo.
- **Écran du salon « tout le temps »** (étape 2) : une adresse du site sur la télé ou une tablette du salon ; pendant un tournoi, le match en cours et le tableau ; le reste du temps, classement, prochain tournoi, barbers dispo, derniers matchs, record du Snake.
- **Matchs des barbers à l'écran (réponse B du 4 nov. 2026)** : « Rien ne passe à l'écran tant que le barber ne l'a pas allumé lui-même. » Un match ordinaire n'est regardable (téléphones et écran du salon) que si les deux joueurs ont allumé « Laisser regarder mes matchs » (éteint par défaut) ; un match de tournoi l'est toujours. Contrat : `coupe-spectateurs-contrat.md`.
- Formats écartés pour plus tard : tournoi de la semaine (un tour par jour), soirée au salon à deux sur un téléphone.

## Étapes

1. Les tournois (inscription, présence, tirage, tableau en direct, matchs, tirs au but, champion, palmarès, admin) : construits la nuit du 3 au 4 nov. 2026 (chef, 5 constructeurs, 3 contre-experts, 3 correcteurs), serveur en ligne le 4 nov. 2026 (Heroku v172), site ensuite.
2. Spectateurs et écran du salon : lancée le 4 nov. 2026 après la réponse B (contrat `coupe-spectateurs-contrat.md`).

Arrivée dans les apps : un build store (examen Apple et Google, notes de revue 2.5.19), sur feu vert.

## Où est quoi (étape 1)

- Serveur (`dhomebarber-api`) : `lib/coupeTournaments.js` (tirage, tableau, horloge `startTournamentTicker`, `checkJoin`, `recordTournamentMatch`, admin, purge, requêtes dans `SQL`), `routes/coupeTournaments.js` (routes), `lib/coupeRooms.js` (`tjoin`, salles de tournoi, tirs au but, `tournamentLive`, `closeTournamentMatch`), `lib/coupeResults.js` (palmarès `titles`, purge), `lib/coupeNotify.js` (pushs), tables créées dans `server.js`. Harnais : `test/test-coupe-tournois.js`, `test-coupe-tournois-api.js`, `test-coupe-rooms-tournoi.js`.
- App : `src/lib/coupe/coupeApi.js` (drapeau, lectures, envois), `src/pages/CoupeTournoi.jsx` et `src/components/coupe/tournoi/*` (page du tournoi), carte de l'accueil dans `src/pages/Coupe.jsx` (et ouverture du match `?tmatch=&tournoi=`), jeu : `src/lib/coupe/onlineMatch.js`, `src/components/coupe/CoupeGame.jsx`, `game/TournamentWaiting.jsx`, `game/tournament.js`, `EndScreen.jsx` ; admin : `src/components/admin/coupe/*` dans `src/pages/admin/AdminCoupe.jsx`. Tests : `e2e/coupe-tournois.spec.js`, `coupe-tournoi-match.spec.js`, `coupe-tournois-admin.spec.js` ; faux serveurs `e2e/support/fauxTournois.js` (aides `api.tournois`) et `fauxCoupe.js` (`faux.tournoi`, `tirsAuBut`, `redemarrer`).
- Relectures du 4 nov. 2026 (corrigé) : désinscription trop près de « Je suis là », retour du jeu sur un tableau périmé, présent sans place sans explication, match fini qui répondait « pas encore prêt », redémarrage en plein match, forfait pendant les tirs au but présenté comme des tirs au but, pushs vers une page absente des apps publiées, retrait par l'admin sans effet, rappel perdu entre 08:00 et 08:29, création rejouée en double.

## Au prochain build (sur feu vert)

- Notes de revue (règle 2.5.19) : tournois en direct de la Coupe, ouverts à tous, aucun lot, mêmes Signaler / Bloquer que le jeu.
- Après la mise en ligne des deux apps : `TOURNAMENT_NATIVE = true` dans `lib/coupeTournaments.js` (pushs des tournois vers les apps).
