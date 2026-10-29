# La Coupe du Gang : thème stade (contrat de construction, 29 oct. 2026)

Planche validée par le propriétaire le 29 oct. 2026 (« Oui go ») : https://claude.ai/artifact/6sEgcJPvzCvPtBQsGPP3vU, rangées « Thème stade : rouge, noir, blanc et une touche d'or » et « Les autres écrans aux nouvelles couleurs ». Copies locales des maquettes (HTML lisible) : `StadeAnimation`, `StadeAvant`, `StadeMatch`, `StadeVictoire`, `StadeDefaite`, `CoupeAccueilRouge`, `JeuxRouge` (`.dc.html`), dans le dossier de travail de la session.

## Décisions du propriétaire

- **Stade style Milan sans marques du club** : l'image du propriétaire, écussons et « AC MILAN » remplacés par le logo D'Home Barber et « LA COUPE DU GANG ». Jamais de marque d'un club (règle Apple 5.2.1, Google Play).
- **Rouge, noir et blanc sur tous les écrans du jeu, une touche d'or** : rouge pour les boutons, ton camp, ton pion et ton score ; blanc pour l'adversaire et les textes ; noir pour les fonds ; or pour le trophée, les Points de Coupe, le mot « Coupe », la 1re place et la victoire. Palette : `src/components/coupe/palette.js` (`COUPE_COLORS`).
- **Un seul terrain du début à la fin** : celui de l'image (`src/assets/coupe/stade.webp`), gazon refait d'un seul tenant et tracé aux mesures exactes du moteur. Le jeu ne dessine plus son terrain quand l'image est là : il pose les joueurs, le ballon, le score et les effets. Jamais deux terrains superposés, même pendant un zoom.
- **Avant-match** (premier coup d'envoi d'un match seulement) : 4,5 s au lieu de 3. De 0 à 1 s, le stade entier et l'affiche des deux joueurs ; de 1 à 2 s, la caméra zoome sur le terrain ; de 2 à 4,5 s, « 3, 2, 1 » sur le terrain (0,83 s chacun) ; « GO ! » au coup d'envoi. Après un but ou un retour de coupure : comme avant, sans stade.
- **Pendant le match** : caméra sur le terrain ; en haut et en bas de l'écran, les tribunes assombries.
- **Après le match** : « FIN DU MATCH » 0,8 s sur le terrain, puis la caméra recule 1,1 s jusqu'au stade entier, puis le débrief (écran de fin) par-dessus le stade assombri.
- **Pion du joueur en rouge, adversaire en blanc** (maillots domicile et extérieur). À deux sur un téléphone : joueur du bas en rouge, joueur du haut en blanc.

## Ce qui est déjà fait (chef)

- Serveur (`dhomebarber-api`, commits 2d29289 et 269d741, déployés juste avant l'app) : `FIRST_COUNT_MS = 4500` au premier coup d'envoi (revanche comprise) ; `cd` = durée en secondes du compte à rebours en cours, dans `state` (absente hors `count`) et dans `start` (4,5 au coup d'envoi, 3 au retour d'une coupure). Un téléphone qui ne lit pas `cd` compte 3 s.
- `src/assets/coupe/stade.webp` : 1206 × 2129 px, ~330 Ko.
- `src/lib/coupe/stadium.js` : `STADIUM_URL`, taille de l'image, place du terrain dans l'image (`PITCH_X0` 255,4375, `PITCH_Y0` 543, `PITCH_K` 1,928125 px par unité), `pitchRectIn(w, h)` (terrain à l'écran, mêmes calculs que `viewOf`), `pitchPlacement(rect)`, `fullPlacement(w, h)`, `cameraTransform(from, to)`, `cameraCss(t)`, `preloadStadium()`.
- `src/components/coupe/palette.js` : `COUPE_COLORS`.

## Moteur d'affichage (constructeur B1) : `src/lib/coupe/renderer.js`, `localMatch.js`, `onlineMatch.js`

- `frame.countS` : durée du compte à rebours en cours (secondes) quand `frame.phase === 'count'`, sinon `null`. En ligne : `start.cd` jusqu'au premier état (absente : `null`, pas d'avant-match), puis `state.cd` (3 par défaut). En local (`LocalMatch`) : 4,5 au coup d'envoi de `start()` (début de chaque match, revanche comprise), 3 sinon.
- `renderer.setStadium(on)` : `true` = terrain transparent (ni fond, ni gazon, ni lignes, ni filets, ni panneaux, ni « DHB ») ; `false` = le terrain dessiné comme avant, aux nouvelles couleurs (repli quand l'image ne charge pas). Défaut : `false`.
- Couleurs (`COUPE_COLORS`) : joueur 0 (toi, ou le bas à deux) anneau rouge (`rouge` → `rougeSombre`), joueur 1 anneau blanc (`blancCasse` → `#b9bcc2`) ; texte des pastilles en blanc ; ciseaux du barber de la couleur de l'anneau, étoile du salon bleue. Noms dans les marges sur une pastille noire (`rgba(11,11,12,.8)`) : le bas en `rougeVif`, le haut en blanc. Cadre du score noir, chiffre du bas en `rougeVif`, du haut en blanc. Traînée du ballon blanche, étincelles or et blanches, anneau d'engagement blanc ; arc « le ballon doit changer de camp » et surface interdite qui clignote en or (alerte).
- Compte à rebours : `left = countS - phaseT`. Si `countS > 3` (avant-match) : rien tant que `left > 2.5`, puis 3, 2, 1 sur 2,5 s (`n = ceil(left / (2.5 / 3))`) ; sinon 3, 2, 1 comme avant. Chiffres blancs, contour noir.
- « GO ! » : 0,5 s quand le match passe de `count` à `live` (pas après un engagement `ready`), blanc avec une ombre rouge, sans animation si mouvement réduit.
- Bannière de but : bande rouge inclinée derrière « BUT ! » en blanc, puis « TU MARQUES » / « KEVIN MARQUE » et le score en blanc (maquette `StadeAnimation`).
- `victory()` (pluie de lames sur le canvas) reste mais l'écran de jeu ne l'appelle plus en thème stade : la pluie est dans l'écran de fin (B3).
- Aucun changement des calculs (`viewOf`, `toWorld`, `fingerTarget`, physique, réseau) hors `countS`.

## Écran de jeu (constructeur B2) : `CoupeGame.jsx`, `game/GameStyles.jsx`, `game/Hud.jsx`, `game/Panel.jsx`, `game/Pawn.jsx`, `game/hooks.js`, nouveaux `game/StadiumStage.jsx` et `game/MatchIntro.jsx`

- Structure : dans `.cdg-stage`, un calque `.cdg-camera` (`position: absolute; inset: 0; transform-origin: 0 0`) porte l'image du stade (`<img>` absolue, placée en px par `pitchPlacement(pitchRectIn(largeur, hauteur du stage))`, elle déborde du stage : la racine coupe) et le voile des tribunes. Le `<canvas>` (inset 0) est **hors** de ce calque, jamais transformé : le calcul du doigt (`toWorld`) et les tests mesurent son cadre ; son parent garde la taille du stage (le dessin calcule sa vue dessus).
- Canvas caché (`opacity: 0`) quand la caméra est sur le stade entier et pendant le zoom avant ; il apparaît en fondu (~200 ms) à la fin du zoom (`phaseT >= 2` d'un avant-match, `>= 1` si mouvement réduit) et tout de suite hors avant-match ; à la fin du match, visible pendant « FIN DU MATCH », effacé au début du zoom arrière. Attribut posé dans la boucle (ex. `data-play`) seulement quand il change. Aucun verrou des doigts : le joueur peut placer son pion pendant tout le compte à rebours (décision du chef du 29 oct., après le contrat initial).
- État de la caméra sur la racine : `data-cam="full"` (stade entier) ou `"pitch"` (terrain). `"pitch"` = aucune transformation ; `"full"` = `cameraCss(cameraTransform(placeTerrain, placeStadeEntier))`, où la place du stade entier est `fullPlacement` sur toute la racine (l'écran), ramenée dans le repère du stage. Valeur posée en variable CSS (`--cdg-cam-full`), recalculée au redimensionnement (ResizeObserver). Transition `transform 1s cubic-bezier(.65,0,.35,1)` vers le terrain, `1.1s` vers le stade ; aucune transition si mouvement réduit.
- Pilotage par les frames, sans état React par image : dans la boucle, `cam = frame.phase === 'count' && frame.countS > 3 && frame.phaseT < 1 ? 'full' : 'pitch'` posé sur `root.dataset.cam` seulement s'il change (comme `data-phase` aujourd'hui). Hors match (connexion, salle d'attente, défi reçu, erreur) : `full`, stade assombri derrière les panneaux.
- Affiche VS (`MatchIntro.jsx`) : visible pendant `data-cam="full"` d'un avant-match, au centre (maquette `StadeAvant`) : pastilles (initiales, rouge pour toi, blanc pour l'adversaire, ciseaux / étoile), noms, « VS » dans un losange rouge, ligne « Premier à 3 buts · +3 à la victoire, −1 à la défaite » en ligne (or sur « +3 »), « Match amical » à deux et contre le salon. Bandeau du haut « La Coupe du Gang » (« Coupe » en or). Pas de points des joueurs (aucune requête de plus).
- Voile des tribunes : élément du calque caméra à la place du terrain et des filets, `box-shadow: 0 0 0 100vmax rgba(11,11,12,.6)`, opacité 1 en `pitch` pendant un match, 0 sinon.
- `renderer.setStadium(true)` quand l'image est chargée (`onLoad` de l'`<img>` ou `preloadStadium()`), `false` en cas d'erreur (l'image cachée, le terrain dessiné revient).
- Fin du match (`end`) : `data-outro="fin"` (« FIN DU MATCH » sur le terrain, maquette) 0,8 s, puis `data-cam="full"` (zoom arrière 1,1 s), puis `setEndShown(true)` (environ 1,9 s après `end`). Mouvement réduit : coupe nette et écran de fin à 450 ms comme avant. Défaite (ni victoire ni nul ni annulé) : `data-end="defaite"` → image en gris (`filter: grayscale(.85)` sur l'image, pas d'animation de filtre). Plus d'appel à `renderer.victory()`.
- Reprise (`resumed`, ou match repris au montage) : caméra directement sur le terrain, sans transition.
- HUD, panneaux, bulles, horloge, astuce, « Tourne ton téléphone » : couleurs de la palette (fini l'or partout et le vert), fond du HUD transparent (les tribunes passent dessous). L'image déborde du stage : le HUD, les réactions et les panneaux passent au-dessus du calque caméra (`z-index`).

## Fin de match et partage (constructeur B3) : `game/EndScreen.jsx`, nouveau `game/BladeRain.jsx`, `game/StoryShare.jsx`, `game/scoreStory.js`, `game/share.js`, `game/WaitingRoom.jsx`, `game/ChallengeReceived.jsx`, `game/ReportSheet.jsx`, `game/BlockSheet.jsx`, `game/format.js`

- Écran de fin par-dessus le stade (fond transparent, dégradé noir dans le bas), maquettes `StadeVictoire` et `StadeDefaite` : « VICTOIRE » en or avec ombre rouge ; « DÉFAITE » en blanc sur bande noire soulignée de rouge ; nul et annulé en blanc ; carte des points (bord or en victoire, « +3 » en or) ; « Revanche » bouton rouge ; « Partager en story » et « Retour » bordés de blanc ; Signaler / Bloquer gardés. Mêmes props, même export `endTexts` (lu par l'écran de jeu).
- `BladeRain.jsx` : pluie de lames de rasoir (or, blanc, rouge) en DOM, `transform` et `opacity` seulement, `pointer-events: none`, rien si mouvement réduit ; montée par l'écran de fin d'une victoire.
- Story du score (`scoreStory.js`) : fond = le stade (même image, assombrie), « VICTOIRE » en or, score, Points de Coupe ; mêmes textes qu'aujourd'hui.
- Salle d'attente, défi reçu, Signaler, Bloquer : couleurs de la palette.

## Accueil de la Coupe et classement (constructeur B4) : `src/pages/Coupe.jsx`, `src/components/coupe/hub/*`, `src/pages/CoupeClassement.jsx`, `src/components/coupe/CoupeLoadError.jsx`

- Maquette `CoupeAccueilRouge` : en-tête avec le haut du stade (tribune au logo) fondu vers le noir, titre « La Coupe du Gang » (« Coupe » en or), boutons ronds sur l'image ; carte des points bordée d'or, « 42 » en or ombre rouge sombre ; « Défier » rouge ; « Dispo » en blanc ; classement : 1re place en or, ta ligne en rouge. Même contenu et mêmes textes qu'aujourd'hui.
- `preloadStadium()` au montage de l'accueil de la Coupe.

## Jeux et intégrations (constructeur B5) : `src/components/home/GamesSection.jsx`, `src/pages/Jeux.jsx`

- Maquette `JeuxRouge` : carte « Jeux » de l'accueil sur le haut du stade assombri, bord rouge, « Le Gang joue » en rouge, puce « La Coupe du Gang » avec ballon or ; carte de la Coupe sur la page Jeux sur le stade, bord or, trophée et « Coupe » en or, « 42 » en or, « Jouer » rouge ; entrée du fil et bloc de la carte Gang aux nouvelles couleurs. Les constantes exportées (`COUPE_GOLD`, `CoupeBallIcon`, `coupeCardLine`…) gardent leur nom (lues par d'autres écrans). `preloadStadium()` au montage de la page Jeux.

## Règles pour tous

- Aucun autre fichier que les siens ; `src/App.jsx`, `index.css`, `e2e/`, `CLAUDE.md`, `docs/` : au chef seulement.
- Couleurs par `COUPE_COLORS` (ou les variables CSS de `GameStyles`) ; contraste ≥ 4,5:1 ; cibles ≥ 44 px ; titres en Barlow Condensed ; textes du jeu au tutoiement.
- Animations : `transform` et `opacity` seulement, `useReducedMotion` / `prefers-reduced-motion` respecté ; classe CSS animée jamais sur un `motion.*`.
- Aucun texte visible ni nom accessible existant changé sans nécessité (les tests de bout en bout les lisent) ; tout changement listé dans le compte rendu.
- Aucune nouvelle dépendance. Contrôle : `npx eslint <ses fichiers>` puis `npx vite build --outDir <dossier à soi hors du dépôt> --emptyOutDir`. Pas de Playwright (le chef lance les suites après l'assemblage).

## Construit le 29 oct. 2026 : où est quoi

- `src/lib/coupe/stadiumImage.js` : adresse, taille et préchargement de l'image, **sans le moteur** (accueil, fil, page Jeux, accueil de la Coupe l'importent). `src/lib/coupe/stadium.js` : place du terrain dans l'image et calcul de la caméra (`pitchRectIn`, `pitchPlacement`, `fullPlacement`, `cameraTransform`, `cameraCss`), pour l'écran de jeu.
- `src/components/coupe/palette.js` : `COUPE_COLORS`. `src/components/coupe/hub/theme.js` : la palette en variables CSS (`--coupe-rouge`, `--coupe-or`…) pour l'accueil de la Coupe et le classement (Tailwind ne lit pas un objet JS).
- `src/components/coupe/game/StadiumStage.jsx` : image du stade et voile des tribunes dans le calque `.cdg-camera` (seul transformé), et le pilote `createStadiumDirector`, appelé par la boucle de l'écran de jeu. Il pose sur la racine `.cdg-root`, seulement quand ils changent : `data-cam` (`full` / `pitch`), `data-play` (canvas, barre du haut et réactions visibles, absent pendant que la caméra voyage), `data-outro="fin"` (« FIN DU MATCH »). L'écran de jeu pose aussi `data-end="defaite"` (stade en gris) et `data-dim` (stade assombri hors match). `data-instant` coupe les transitions le temps d'un placement.
- `src/components/coupe/game/MatchIntro.jsx` : affiche VS de l'avant-match et « FIN DU MATCH » (textes cachés aux lecteurs d'écran). `src/components/coupe/game/BladeRain.jsx` : pluie de lames de la victoire, dans l'écran de fin.
- Moteur d'affichage : `renderer.setStadium(on)` (terrain transparent sur l'image, terrain dessiné si l'image échoue), `frame.countS` (`localMatch.js` ; `onlineMatch.js` : `start.cd` entre `start` et le premier `state` d'un nouveau match, temps de la phase compté seulement si l'heure du serveur est déjà connue), « GO ! », bannière de but rouge, noms sur pastilles noires (raccourcis au-delà d'environ 15 caractères), plus de tremblement au but en mode stade (les joueurs bougeraient seuls sur un terrain immobile).
- Écran de fin : `endTexts(...)` rend aussi `tone` (`victoire`, `defaite`, `neutre`) ; voile et dégradés en `position: fixed` (aucun `transform`, `filter` ni `contain` sur ses parents). Story du score sur fond de stade (JPEG à 90 %, environ 400 Ko : 2,3 à 2,7 Mo en PNG ; préparée dès l'écran de fin).

Décisions prises pendant l'assemblage (chef) :
- Le canvas n'est **jamais** transformé : la caméra ne bouge que l'image, le canvas est caché pendant le zoom avant et réapparaît en fondu quand le terrain de l'image est revenu sous lui ; aucun verrou des doigts. Mesuré : terrain de l'image et terrain du jeu alignés à moins d'un centième de pixel (390 et 320 px).
- La barre du haut et les réactions suivent `data-play` (pas de Pause ni Quitter pendant les 2 s de l'avant-match ; le retour Android marche toujours).
- Le pilote n'écoute les images qu'après le coup d'envoi (`newMatch`) ou une reprise (`resume`) : une image passée avant posait un instant la caméra sur le terrain, puis l'avant-match la ramenait au stade (aller-retour vu par le test de bout en bout).
- Sans durée (serveur d'avant le thème), le compte à rebours n'est cru qu'après 0,25 s : jamais d'aller-retour si la durée arrive juste après le coup d'envoi.
- L'avant-match se joue une fois par match : dès que la phase quitte `count`, un compte à rebours suivant (but, retour de l'adversaire après une coupure) reste sur le terrain (défaut trouvé par les deux contre-expertises : le joueur resté revoyait le stade et l'affiche au milieu du match).
- Match repris au montage (« Reprendre » de l'accueil) : l'effet « hors match » lit l'état du match lui-même (`matchRef.current.ui.status`), sinon il ramenait la caméra au stade et cachait Quitter jusqu'à la réponse du serveur.
- Au coup d'envoi, le temps de la phase n'est compté que si l'heure du serveur est connue : un `pong` arrivé entre `start` et le premier état faisait sauter ce temps (caméra un instant sur le terrain avant l'avant-match, selon le hasard des messages).
- Barre du haut et réactions cachées aussi au clavier et aux lecteurs d'écran pendant que la caméra voyage (`visibility`, après le fondu) ; plus de `will-change` sur la caméra (Chrome garderait l'image rendue à l'échelle du stade entier, floue sur le terrain) ; écran de fin presque opaque quand l'image du stade manque.
- Affiche : « Match en ligne » et « +3 à la victoire, −1 à la défaite quand vous y avez droit tous les deux » (les droits aux points ne sont connus qu'à la fin).
- Image : le but parasite de l'image d'origine, au-dessus de la tribune du logo, est repeint en tribune (`docs/prototypes/stade-coupe/tribune_haut.py`).

Tests : `e2e/coupe.spec.js`, section « thème stade » (avant-match complet, défaite en gris, retour de l'adversaire sans avant-match, match repris depuis l'accueil sur le terrain, serveur sans durée) ; le faux serveur annonce le vrai premier coup d'envoi avec `api.coupe.avantMatchCd = 4.5` (temps écoulé qui avance) ; « contre le salon » attend 282 images de compte à rebours. Serveur : `test-coupe-rooms.js` (`cd` dans `start` et `state`, 4,5 s au coup d'envoi et à la revanche, 3 s après un retour, même pendant l'avant-match, absent en jeu).
