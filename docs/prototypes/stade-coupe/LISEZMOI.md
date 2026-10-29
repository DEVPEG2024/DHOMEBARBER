# Image du stade de La Coupe du Gang

`src/assets/coupe/stade.webp` vient de l'image fournie par le propriétaire le 29 oct. 2026 (stade vu du ciel, tribunes rouges et noires, logo D'Home Barber), retouchée en trois passes :

1. `nettoyer_stade.py` : écussons et « AC MILAN » remplacés par le logo du salon (`public/logo.png`) et « LA COUPE DU GANG » en Barlow Condensed ExtraBold (choix du propriétaire du 29 oct. 2026 : style Milan **sans les marques du club**, règle Apple 5.2.1). L'image d'origine, qui porte ces marques, n'est jamais versionnée.
2. `gazon_neuf.py` : gazon refait d'un seul tenant (14 bandes calées sur le terrain du jeu, éclairage, ombre des tribunes, grain), anciennes lignes et anciens buts effacés, personnes derrière les nouveaux filets retirées, puis terrain du jeu tracé aux mesures de `src/lib/coupe/engine.js` (mêmes tracés que `renderer.js`), et **logo Nova** au centre du rond central (demande du propriétaire du 29 oct. 2026, à la place de l'ancien « DHB » pâle) : `nova-spirale.png`, spirale découpée de l'image du propriétaire sans la croix bleue de repère, 64 unités de large, son œil sur le point central, peinte comme les lignes à 50 % ; ligne médiane coupée à ± 38 unités.
3. `tribune_haut.py` : le but parasite de l'image d'origine (filet et carré de gazon au-dessus de la tribune du logo, x 392 à 810, y 0 à 176) repeint en tribune : rangée haute, allée grise et bandes rouges et noires reprises à côté, rangées de sièges alignées (16 px), morceaux fondus.

Place du terrain dans l'image (reprise dans `src/lib/coupe/stadium.js`) : coin haut gauche (255,4375 ; 543), 694,125 × 1234 px, soit 1,928125 px par unité du moteur. Une nouvelle version de l'image doit garder ces valeurs, sinon les joueurs ne tombent plus sur le terrain.

Fabrication (Python 3 et Pillow, police Barlow Condensed ExtraBold de Google Fonts) :

```bash
python3 nettoyer_stade.py <image-du-proprietaire.jpg> ../../../public/logo.png BarlowCondensed-ExtraBold.ttf stade-propre.png
python3 gazon_neuf.py stade-propre.png nova-spirale.png stade-gazon.png
python3 tribune_haut.py stade-gazon.png stade-final.png
python3 -c "from PIL import Image; Image.open('stade-final.png').convert('RGB').save('stade.webp', 'WEBP', quality=80, method=6)"
```

Contrôle avant de remplacer l'image : contraste poussé sur tout le terrain (aucun raccord), gros plans des coins et des buts, et les deux vues du téléphone (stade entier, terrain zoomé).
