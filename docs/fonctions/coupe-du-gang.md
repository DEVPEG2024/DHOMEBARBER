# La Coupe du Gang : mini-jeu de foot façon air hockey

> Cahier des charges validé par le propriétaire le 28 oct. 2026. **Rien n'est encore codé dans l'app** : maquettes et prototype jouable d'abord, code ensuite. Ce fichier sert de référence aux sessions qui coderont le jeu ; il sera complété par le détail des fichiers quand ils existeront.
>
> - Planche des écrans (28 oct. 2026, en attente de validation) : https://claude.ai/artifact/6sEgcJPvzCvPtBQsGPP3vU
> - Prototype jouable (contre le salon, à deux sur un téléphone) : https://claude.ai/artifact/TDdZxv5v9xYGQwW28zSrxf ; source dans `docs/prototypes/coupe-du-gang.html` (moteur physique, ordinateur à 3 niveaux, effets : à reprendre pour l'app).

## Décisions du propriétaire (28 oct. 2026)

- Nom : **La Coupe du Gang** (coupe de cheveux / coupe du vainqueur).
- Jeu **en temps réel, façon air hockey, sur un terrain de foot vu du dessus** (le tour par tour à la pichenette, proposé d'abord, est écarté).
- **Points de Coupe séparés du niveau Gang** : ils ne changent ni le niveau, ni les stats 0–99, ni les écussons (le niveau reste calculé sur les visites).
- **L'admin joue sous le nom « D'Home Barber »** (logo, petite étoile bleue), comme dans le fil.
- **Interrupteur « Dispo pour un match »** pour chaque barber.
- **Aucun lot** : seulement un classement (donc pas de concours au sens de la règle Apple 5.3).
- Match à deux sur un seul téléphone : amical, sans points (recommandation non contestée).

## Règles du match

- Terrain vertical (téléphone tenu droit), vu du dessus ; ta cage toujours en bas. Bords = panneaux lumineux « D'Home Barber » où le ballon rebondit.
- Chaque joueur = un rond avec sa photo, qui suit le doigt **dans sa moitié** (jamais au-delà de la ligne médiane), placé un peu au-dessus du doigt pour que le pouce ne le cache pas.
- **Interdit d'entrer dans sa petite surface** : on ne gare pas son joueur devant sa cage.
- Ballon gardé plus de 5 s dans une moitié : rendu à l'adversaire (anti-jeu).
- Après un but, le ballon est posé devant celui qui l'a encaissé.
- **Premier à 3 buts.** Ballon qui ralentit doucement (plus qu'un palet), vitesse plafonnée. Match de 1 à 2 minutes.
- Ressenti : traînée et étincelles, vibration selon la force, ralenti + « BUT ! » + léger tremblement + foule sur un but, pluie de lames de rasoir à la victoire, score partageable en story. Animations réduites si le téléphone le demande.

## Trois façons de jouer

1. **Contre le salon** (ordinateur), niveaux Apprenti, Barber, Boss : sans points, sans réseau.
2. **À deux sur un téléphone** (posé à plat, chacun son bout) : amical, sans points.
3. **En ligne, chacun son téléphone** : seul mode qui compte. Défier un barber (bouton sur sa page, seulement s'il est « Dispo », invitation de 2 minutes), défier un ami (lien `https://dhomebarber.fr/defi/<code>` ou QR code), revanche. Déconnexion : 10 s pour revenir, sinon forfait (= défaite). Match coupé par le serveur (redémarrage quotidien d'Heroku) : annulé, sans points.

On ne cherche jamais un client par son nom (pas d'oracle sur l'identité).

## Points de Coupe et classement

- Victoire **+3**, défaite **−1**, **jamais sous 0**. Forfait = défaite.
- Affichés dans un bloc de la page de la carte Gang (jamais en bandeau sur la carte) et sur la carte FUT d'un barber.
- Classement de la saison et classement général ; clients et barbers ensemble (barbers marqués d'une icône ciseaux, admin = « D'Home Barber » + étoile bleue) ; prénom + initiale + avatar ; on n'y figure que si on l'accepte (même logique que le classement Gang existant). Durée d'une saison : **à fixer** (proposition : un mois).

## Garde-fous

- Points seulement avec une **carte Gang** (au moins une visite réelle au salon) : un faux compte ne peut pas gonfler un ami. Sans carte : matchs amicaux.
- Contre un même adversaire, points au **premier match du jour** seulement ; au plus **5 matchs à points par jour** par joueur.
- Le serveur arbitre : il calcule le ballon, compte les buts, plafonne la vitesse des joueurs. Le téléphone n'envoie que la position du doigt.
- Pas de discussion, seulement des réactions toutes faites. Invitations par notification jamais entre 21:00 et 08:00, avec quota par compte.
- Suppression de compte : matchs et points effacés (check-list des entités, point 4).

## Réseau (risque principal)

- Le serveur est en région **us** (Heroku, constaté le 28 oct. 2026) : ~100 ms d'aller-retour depuis la France.
- Principe retenu : le joueur bouge sur le téléphone sans attendre, le téléphone anticipe le ballon dans sa moitié, le serveur garde le dernier mot. Le WebSocket `/ws/live` actuel est anonyme (compteur de visiteurs) : il faudra un canal authentifié pour les matchs.
- **Prototype réseau à deux téléphones avant de construire le reste.** Si le ressenti n'est pas bon : garder les modes 1 et 2, revoir le mode en ligne.

## Stores

- Nouveau build (iOS build 18, Android versionCode 19) ; drapeau `features.*` ; jeu décrit dans les notes de revue (règle 2.5.19), le compte de démonstration peut jouer contre le salon.
- Nouvelle donnée : « Contenu de jeu » à déclarer (App Store, Play « Sécurité des données ») et `public/privacy.html`.
