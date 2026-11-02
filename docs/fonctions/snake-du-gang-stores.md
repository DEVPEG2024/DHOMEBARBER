# Snake du Gang : brouillons stores

> Rédigé le 2 nov. 2026. **Rien n'est publié.** Le Snake est sur le site dès sa mise en ligne, mais il n'arrive dans les apps qu'avec le prochain build (iOS build 20, Android versionCode 21), envoyé seulement sur feu vert explicite du propriétaire. Cahier des charges : `snake-du-gang.md` et `snake-du-gang-contrat.md` (même dossier).

## 0. Avant l'envoi du build qui contient le Snake

- Le jeu est **dans le bundle** (code, dessins, sons synthétisés sur l'appareil) : rien n'est chargé depuis dhomebarber.fr.
- Drapeau `features.snake` **allumé pendant la revue** (variable Heroku `SNAKE` absente). Sinon le jeu est caché et il faudrait le dire dans les notes (règle 2.5.19).
- Le build contient aussi le règlement v2 de la Coupe (31 oct. 2026) et la refonte du tableau de bord (1er nov. 2026) : leurs lignes de notes de revue sont à écrire au même envoi.
- Aucune nouvelle donnée personnelle au sens des étiquettes : scores et parties liés au compte (« Gameplay Content » côté Apple, si l'étiquette actuelle ne le déclare pas encore pour la Coupe : relire l'étiquette avant l'envoi) ; aucune permission nouvelle, aucun SDK tiers, aucun achat.
- Nom : ni « Nokia » ni « 3310 » dans les textes ni les captures (marques, règle 5.2.1).

## 1. Point à ajouter aux notes de revue Apple (anglais)

Garder les notes sous 4 000 **octets** (`Buffer.byteLength`). Ce point fait environ 560 octets.

```
6. "Snake du Gang" mini-game. The classic snake game on a drawn retro phone: the snake moves by itself, swipe or use the 2/4/6/8 keys to turn, eat dots to grow, catch the bonus critters, do not bite your own tail (no walls: you come out on the other side). Open it from Accueil → "Jeux" → "Snake du Gang". Free, no purchase, no prize. Each game's score is checked by our server, which replays the moves. Optional monthly leaderboard (first name + initial only, opt-in in "Vitesse et options"). Offline games are allowed but not ranked.
```

## 2. Nouveautés de la version (fr-FR, à fondre avec celles du build)

```
Nouveau jeu : le Snake du Gang. Le Snake des vieux téléphones, avec les vraies règles : mange, grandis, attrape les bestioles et grimpe au classement du mois.
```
