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

- Durées : mousse 6 s, gel 6 s, éclair 3 s (point chargé), buts qui bougent 8 s, arrosage 10 s, fumigène 10 s ; chaque événement annoncé 1 s avant (contour qui clignote), placé **en miroir** dans les deux camps, jamais devant un but ni sur un joueur.
- Balle en feu ou électrique : le reste jusqu'au but, jusqu'à une touche de l'adversaire, ou jusqu'à l'eau.
- Camper = plus de 3 s dans sa **grande surface** (la petite reste interdite, comme aujourd'hui) ; bloquer = ballon coincé plus de 1,5 s contre son propre mur par son joueur.
- Ballon gardé 5 s : l'avertissement s'ajoute à la règle d'aujourd'hui (le ballon change de camp, `KEEP_LIMIT`, `_keepAway` de `localMatch.js`).
- Penalty : ballon au point de penalty devant le but fautif, **3 s pour tirer**, gardien seulement sur sa ligne ; pas tiré à temps ou arrêté = engagement du gardien.
- But en or : la petite surface reste interdite ; balle en feu gardée (le premier but gagne, quelle que soit sa valeur).
- Écran de match : 5 pastilles de buts par joueur, 3 pastilles d'avertissement, jauge « prochain événement », bandeau d'annonce (« ORAGE »).

## À savoir avant de coder

- Tout passe par le **moteur en deux copies identiques** (`src/lib/coupe/engine.js`, `lib/coupeEngine.mjs`) et par l'arbitre du serveur (`collidePaddle`, chocs recalculés) : feu, foudre, fautes, événements décidés et tirés par le serveur (graine commune), jamais par un téléphone.
- **Nouvelle version du protocole** (`auth.v` = 3) : les apps publiées (build 18, code 19) gardent les règles d'aujourd'hui des mois. Le serveur joue les règles v2 seulement si les deux téléphones sont en v3, sinon les règles actuelles ; `GOALS_TO_WIN` passe alors à 5.
- Le robot « contre le salon » doit apprendre les nouvelles règles (penalty, événements) ; le mode « à deux » aussi.
- Arrivée dans les apps : un build store (examen Apple et Google).
