# Créer la lentille « DHB Couleur cheveux » dans Lens Studio

But : une **seule** lentille publiée dans le groupe Camera Kit du salon, que l'app déploie
automatiquement en **16 pastilles de couleur** (voir `SNAP_HAIR_COLORS` dans
`src/pages/SnapLenses.jsx`). Aucun code à changer côté app.

## Le contrat attendu par l'app

| Élément | Valeur attendue |
|---|---|
| Reconnaissance de la lentille | vendor data `dhb` = `hair-color` **ou** nom commençant par « DHB Couleur » |
| Paramètre de lancement | `color` : couleur hex, ex. `#B4471F` |
| Paramètre de lancement | `mode` : `full` (réservé pour plus tard, peut être ignoré) |

L'app appelle `session.applyLens(lens, { launchParams: { color, mode } })` : c'est **la même
lentille** relancée avec une couleur différente à chaque pastille.

## 1. Installer Lens Studio

- Téléchargement : https://ar.snap.com/download (macOS, gratuit)
- Se connecter avec le compte Snapchat **devnova33** (celui qui porte l'organisation
  « D'Home Barber »), sinon la publication n'ira pas dans le bon groupe.

## 2. Partir du modèle « Hair Color »

- Écran d'accueil → onglet **Templates** → chercher `hair`.
- Choisir **Hair Color** (segmentation des cheveux + teinte). Il existe aussi
  **Hair Simulation** (coupes 3D) pour plus tard.
- Tester dans la fenêtre de prévisualisation avec une vidéo d'exemple ou la webcam.

Dans la hiérarchie (`Scene Hierarchy`), repérer l'objet qui porte le rendu des cheveux
(souvent `Hair Color` / `Hair Segmentation` → un `Image` ou `Screen Image` avec un
**Material**). C'est la propriété couleur de ce material qu'on va piloter. Note son nom
exact dans l'inspecteur (`baseColor`, `hairColor`, `tintColor`… selon la version du modèle).

## 3. Ajouter le script qui lit la couleur envoyée par l'app

`Resources` → **+** → `Script` → nommer `DHB_HairColor.js`, coller :

```js
// DHB_HairColor.js — applique la couleur envoyée par l'app D'Home Barber (Camera Kit launch params)
// @input Asset.Material hairMaterial
// @input string colorProperty = "baseColor"
// @input vec4 defaultColor = {0.36, 0.23, 0.13, 1.0}
// @input bool linearize = true   // décocher si les couleurs paraissent délavées

function hexToVec4(hex) {
    if (!hex) return null;
    hex = hex.replace("#", "").trim();
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length !== 6) return null;
    var r = parseInt(hex.substring(0, 2), 16) / 255;
    var g = parseInt(hex.substring(2, 4), 16) / 255;
    var b = parseInt(hex.substring(4, 6), 16) / 255;
    if (script.linearize) {   // sRGB -> linéaire
        r = Math.pow(r, 2.2); g = Math.pow(g, 2.2); b = Math.pow(b, 2.2);
    }
    return new vec4(r, g, b, 1.0);
}

var color = script.defaultColor;

// `global.launchParams` n'existe que dans Camera Kit : dans Lens Studio et dans Snapchat,
// la lentille garde la couleur par défaut. Ne jamais planter s'il est absent.
if (typeof global.launchParams !== "undefined" && global.launchParams) {
    var parsed = hexToVec4(global.launchParams.getString("color"));
    if (parsed) color = parsed;
    // var mode = global.launchParams.getString("mode"); // "full" pour l'instant
}

if (script.hairMaterial) {
    script.hairMaterial.mainPass[script.colorProperty] = color;
}
```

- Glisser le script sur un objet de la scène (ou `Scene Object` → `Add Component` → `Script`).
- Dans l'inspecteur : glisser le **material des cheveux** dans `hairMaterial`, et écrire dans
  `colorProperty` le nom exact relevé à l'étape 2.
- Si le modèle a déjà son propre script de couleur (palette, boutons…), le **désactiver** :
  sinon il écrasera la couleur reçue.

Vérification : change `defaultColor` → la prévisualisation doit changer de couleur. Les
`launchParams` ne sont pas simulés dans Lens Studio, le vrai test se fait dans l'app.

## 4. Nommer la lentille et poser la vendor data

`File` → **Project Info / Project Settings** :

- **Nom** : `DHB Couleur cheveux` (le nom seul suffit à ce que l'app la reconnaisse).
- **Icône** : carré, fond sombre, logo du salon.
- **Vendor Data** (section Camera Kit) : clé `dhb`, valeur `hair-color`.
  Si le champ est introuvable dans ta version, le nom fait le travail — ne pas bloquer là-dessus.

## 5. Publier dans le groupe Camera Kit du salon

1. Bouton **Publish / Send to My Lenses** en haut à droite → cible **Camera Kit**.
2. Aller sur https://my-lenses.snapchat.com → organisation **D'Home Barber**.
3. `Camera Kit` → **Lens Groups** → *Create Lens Group* → nom : `D'Home Barber`.
4. Ajouter la lentille fraîchement publiée au groupe.
5. Vérifier que le groupe est bien rattaché à l'app Camera Kit « D'Home Barber »
   (`Camera Kit` → `Apps` → *Initial Version*, staging).
6. Copier l'**ID du groupe** (UUID).

## 6. Brancher le groupe sur l'app

```bash
heroku config:set SNAP_LENS_GROUP_ID=<uuid-du-groupe> --app dhomebarber-api
```

C'est tout : la page `/snap` lit l'ID dans les paramètres publics **au chargement**. Pas de
build, pas de `cap:sync`, les apps iOS / Android déjà installées voient le nouveau filtre.

Rappel : sur un groupe du salon, l'app affiche **toutes** les lentilles du groupe (le filtrage
`DEMO_KEEP` ne s'applique qu'au groupe de démonstration de Snap). Ne publier dans ce groupe que
ce que les clients doivent voir.

## 7. Vérifier

- https://dhomebarber.fr/snap → une pastille par couleur, nom français sous chacune.
- Filigrane « Camera Kit Staging » : normal tant que le jeton est celui de staging.
- Passer en production = soumettre l'app dans le portail Camera Kit, puis
  `heroku config:set SNAP_CAMERA_KIT_API_TOKEN=<jeton-prod>`.

## Pièges connus

- **Mauvais compte Lens Studio** → la lentille part dans une autre organisation et le groupe
  ne la voit jamais.
- **Script de palette du modèle laissé actif** → la couleur de l'app est écrasée.
- **Couleurs délavées ou trop saturées** → basculer `linearize` dans l'inspecteur.
- **La lentille n'apparaît pas** → compter quelques minutes de propagation, puis recharger la
  page (la config publique est mise en cache pour la durée de la session).
- Une lentille publiée pour **Snapchat** n'est pas automatiquement dans Camera Kit : c'est une
  publication distincte, depuis le même projet.
