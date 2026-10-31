# La Coupe du Gang : règlement v2 (brouillon, rien de codé)

Idées du propriétaire du 31 oct. 2026 (« balles en feu, pénalités et penalty, obstacles temporaires »), développées avec lui avant de coder. **Planche animée à valider** : https://claude.ai/artifact/KDxZEPsPh97h8UJ9PLGASM (règlement, balle en feu, balle électrique, penalty, but en or, les trois fautes, écran de match, les six événements, les combos).

Point de départ mesuré le 31 oct. 2026 : 10 matchs en ligne depuis le 29 oct., 3 joueurs, 36 s de jeu en moyenne pour 3 buts, 7 matchs sur 10 finis 3-0 ou 3-1.

## Décisions du propriétaire (31 oct. 2026)

- **Le match** : premier à **5 buts** (au lieu de 3) ; toujours 5 minutes de jeu au plus ; **dans tous les matchs** (en ligne, contre le salon, à deux).
- **But en or** : égalité au bout des 5 minutes = le prochain but gagne, avec **plus aucune règle** : ni faute, ni penalty, ni événement, et **la ligne du milieu devient franchissable** (chacun peut monter dans le camp adverse).
- **Balle en feu** : allumée par une **frappe très forte** ; un but en feu vaut **1 but** (décision finale ; 2 buts au premier tour) ; elle **brûle les obstacles** qu'elle touche ; elle **s'éteint dans l'eau** de l'arrosage.
- **Balle électrique** : le ballon qui traverse un point frappé par la foudre (événement « Éclair ») devient électrique, traînée bleue, plus rapide ; un but électrique vaut **2 buts** ; dans l'eau : **court-circuit**, le ballon fait un bond.
- **Fautes, penalty pour l'adversaire** :
  - **camper** : rester collé devant son but plus de 3 s ;
  - **bloquer** le ballon contre son mur ;
  - **garder le ballon plus de 5 s** dans son camp : un avertissement ; au **3e avertissement**, penalty. Les avertissements **se cumulent sur tout le match** (jamais remis à zéro par un but), le compteur repart après le penalty.
- **Événements** : **un toutes les 30 s**, tiré au hasard, **durée plus longue pour certains**. Retenus : **mousse à raser** (freine le ballon), **gel** (accélère, peut l'enflammer), **éclair**, **buts qui bougent** (les deux cages glissent le long de leur ligne), **arrosage automatique** (quatre jets qui poussent le ballon), **fumigène** (lancé des tribunes, fumée rouge qui cache une zone).
- Écartés au fil de l'échange : objets du salon qui font rebondir (peigne, tondeuse, ciseaux, flacon, poteau de barbier, rasoir-hélice, bulles), mur sur coup franc, zones (sèche-cheveux, siphon, cire, coupure des projecteurs), arbitre, envahisseur, caméra-araignée, chien, flaque, second ballon, plaque de gel, et les séries arcade (buts géants, ballons géant / mini, aimant, ralenti, mascotte…) sauf l'éclair et les buts qui bougent.

## Propositions de la planche, à valider

- Durées : mousse 6 s, gel 6 s, orage (1 à 3 éclairs, chaque point chargé 3 s), buts qui bougent 8 s, arrosage 10 s, fumigène 10 s ; chaque événement annoncé 1 s avant (contour qui clignote), jamais sur un joueur ni dans une cage.
- **Plus réalistes et aléatoires** (demande du 31 oct. 2026, « revois les 6 événements plus réalistes et aléatoires », la règle « en miroir » abandonnée) : un événement **toutes les 20 à 40 s** (30 s en moyenne, au lieu de 30 s pile), et le serveur tire **lequel, où, combien, la forme et le sens** :
  - mousse : flaque de bulles de forme, de taille et d'orientation au hasard, le ballon y ralentit et y creuse un sillon ;
  - gel : flaque brillante de forme et d'orientation au hasard, le ballon y glisse et accélère, jusqu'à prendre feu ;
  - orage : ciel qui s'assombrit, pluie, **1 à 3 éclairs** à des endroits au hasard, chacun laissant une trace brûlée et un point chargé 3 s ;
  - buts qui bougent : chaque cage a son propre trajet (vitesse, sens, arrêts) ;
  - arrosage : **2 à 4 arroseurs** qui sortent de la pelouse au hasard, jets qui balaient (angle et vitesse au hasard), pelouse mouillée plus sombre ;
  - fumigène : lancé d'une tribune au hasard, il roule, la fumée part dans le sens d'un vent tiré au hasard et cache le ballon.
  Le hasard peut avantager un camp sur un événement ; il s'équilibre sur un match (plusieurs événements) et ne touche jamais un joueur ni une cage.
- Balle en feu ou électrique : le reste jusqu'au but, jusqu'à une touche de l'adversaire, ou jusqu'à l'eau.
- Camper = plus de 3 s dans sa **grande surface** (la petite reste interdite, comme aujourd'hui) ; bloquer = ballon coincé plus de 1,5 s contre son propre mur par son joueur.
- Ballon gardé 5 s : l'avertissement s'ajoute à la règle d'aujourd'hui (le ballon change de camp, `KEEP_LIMIT`, `_keepAway` de `localMatch.js`).
- Penalty : ballon au point de penalty devant le but fautif, **3 s pour tirer**, gardien seulement sur sa ligne ; pas tiré à temps ou arrêté = engagement du gardien.
- But en or : la petite surface reste interdite ; balle en feu gardée (le premier but gagne, quelle que soit sa valeur).
- Écran de match : 5 pastilles de buts par joueur, 3 pastilles d'avertissement, jauge « prochain événement », bandeau d'annonce (« ORAGE »).

## La planche en simulation

Demandes du 31 oct. 2026 (« encore beaucoup plus réaliste, le maximum », puis « applique la même logique à toute la planche ») : tous les tableaux sauf le règlement écrit sont des **simulations en direct** dessinées dans un `<canvas>` : vraie image du stade du jeu, ballon et joueurs avec une physique proche du moteur (mêmes mesures `W`, `H`, `GW`, `BR`, `PR`), particules (flammes, étincelles, bulles, gouttes, pluie, fumée), ombres et lumières. Les règles sont des séquences rejouées en boucle (frappe, foudre, penalty, but en or, trois fautes, trois combos), les événements un match joué seul avec un tirage nouveau à chaque passage, l'écran de match une suite d'événements au hasard. Moteur : `docs/prototypes/coupe-regles-v2/coupe-sim.js` (copie de celui de la planche, `CoupeSim.mount(canvas, def, opts)`), base possible pour le dessin du vrai jeu ; contrôlé à blanc (17 simulations, 45 s chacune, sans erreur ; issues comptées sur 80 s : buts en feu, buts électriques, penaltys marqués ou arrêtés, fautes sifflées).

## À savoir avant de coder

- Tout passe par le **moteur en deux copies identiques** (`src/lib/coupe/engine.js`, `lib/coupeEngine.mjs`) et par l'arbitre du serveur (`collidePaddle`, chocs recalculés) : feu, foudre, fautes, événements décidés et tirés par le serveur (graine commune), jamais par un téléphone.
- **Nouvelle version du protocole** (`auth.v` = 3) : les apps publiées (build 18, code 19) gardent les règles d'aujourd'hui des mois. Le serveur joue les règles v2 seulement si les deux téléphones sont en v3, sinon les règles actuelles ; `GOALS_TO_WIN` passe alors à 5.
- Le robot « contre le salon » doit apprendre les nouvelles règles (penalty, événements) ; le mode « à deux » aussi.
- Arrivée dans les apps : un build store (examen Apple et Google).
