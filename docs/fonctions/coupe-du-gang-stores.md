# La Coupe du Gang : brouillons stores et confidentialité

> Brouillons rédigés le 29 oct. 2026. **Rien n'est publié** : ni notes de revue, ni étiquettes, ni `public/privacy.html`, tant que le jeu n'est pas dans un build (iOS build 18, Android versionCode 19). Cahier des charges du jeu : `docs/fonctions/coupe-du-gang.md`. Sources officielles consultées le 29 oct. 2026 : liste en fin de fichier.
>
> État constaté le 29 oct. 2026 : iOS **1.0.9 (build 17)** et Android **1.0.17 (code 18)** sont **en ligne** depuis le 27 oct. 2026 à 03:56 (`~/store-watch/state.json`), classement App Store **4+** sans mention particulière, catégorie Style de vie (`itunes.apple.com/lookup`). La session App Store Connect du Chrome dédié (port 9333) était déconnectée : l'étiquette actuelle n'a pas été relue, elle est reprise de `docs/historique/stores.md` (11 lignes au 21 oct. 2026).

## 0. Avant tout envoi avec le jeu

- **Retirer l'écran `/coupe-test` du build** (garde `RequireCoupeTester` de `src/App.jsx`, page `CoupeTest.jsx`), ou le remplacer par le vrai jeu. Un écran réservé aux testeurs dans l'app des stores est une « fonction cachée » au sens de la règle Apple 2.5.19. Le site web n'est pas concerné, mais `cap sync` embarque tout `dist/` : dès que `/coupe-test` est sur `main`, il part dans le prochain build.
- Le jeu doit être **dans le bundle** (code, sons, images). Ne jamais le charger depuis dhomebarber.fr dans l'app : il relèverait alors des règles 2.5.2 et 4.7 (voir § 5).
- Drapeau `features.*` du jeu (et, si besoin, un second pour le mode en ligne) allumé **pendant la revue**. Sinon, utiliser la phrase « mode en ligne éteint » du § 1 et ne l'allumer qu'après l'approbation d'une version qui le décrit.

## 1. Notes de revue Apple

### Taille : 4 000 octets au plus

App Store Connect limite le champ Notes à **4 000 octets**, pas 4 000 caractères. Les notes de la 1.0.9 font 3 793 octets, dont 2 579 pour le bloc de conformité : le jeu n'y entre pas tel quel. Le bloc ci-dessous **resserre les points 1 à 4** (même contenu) et ajoute un **point 5** pour le jeu. Total : **3 289 octets** avant remplissage des `<…>`. Il reste environ 700 octets pour la ligne « autres changements » et les valeurs à remplir.

`submit109.mjs` contrôle `NOTES.length > 4000` (en caractères). En le copiant pour le build 18, contrôler plutôt `Buffer.byteLength(NOTES, 'utf8') > 4000` : accents, « — », « → », « ··· » et émojis comptent pour 2 à 4 octets.

### Avant le collage

- Remplir `<x>` (numéro de version : 1.0.10, ou 1.1 pour marquer la nouveauté), la ligne des autres changements du build et le chemin réel du jeu (`<Accueil → "La Coupe du Gang">`).
- **Second compte de démonstration** pour le mode en ligne. Apple demande que les comptes en plus figurent dans les notes. Le créer au moment de l'envoi, par exemple `reviewer2@dhomebarber.fr`, mot de passe hors git. L'ajouter aux « comptes à ne jamais supprimer » et au nettoyage après revue. Sinon, retirer la dernière phrase du point 5 et dire seulement que le mode en ligne demande deux téléphones connectés.
- Vérifier en base que `reviewer@dhomebarber.fr` n'a **aucune visite comptée** : pas de carte Gang, donc des matchs amicaux. Sinon, retirer « so the demo account plays friendly matches ». Le nettoyage après la revue de la 1.0.8 n'a pas été fait.
- Réactions : le prototype a 👏 « Bravo », 🔥 « En feu » et 😂 « Mort de rire ». Reporter les trois réactions finales.
- Si le mode en ligne est éteint pendant la revue, remplacer « (c) "En ligne": … the server referees. » et la dernière phrase par cette phrase, puis retirer ce qui parle des points en ligne :
  `The online mode is switched OFF on the server for this review: the "En ligne" tab only says "bientôt disponible" and no connection is opened; we will describe it in the notes of a submitted version before switching it on.`

### Bloc à coller (anglais, lu par App Review)

```
[Version <x> — build 18] No new permission, no new third-party SDK, no in-app purchase. New: "La Coupe du Gang", a free football mini-game, described in point 5 below. <Other changes of this build, one line.>

[Guideline compliance — October 2026 update]
1. User-generated content (1.2). Feed ("Ca dit quoi le Gang ?"), comments, reviews and display names are user content. Filtering: insults, hate speech, sexual terms and threats are refused before posting, in the app and on the server (try commenting "connard"). Reporting: "···" on every post, "Signaler" under every comment; admins are notified and act within 24 h. Blocking: "···" → "Bloquer"; Paramètres → "Utilisateurs bloqués". Contact: Paramètres → "Nous contacter" (contact@dhomebarber.fr, +33 6 66 08 36 05). Zero tolerance: Terms section 7, accepted at sign-up.
2. No hidden or dormant features (2.5.19). Everything is reachable from the visible navigation. The staff area (/admin) is for salon staff only (agenda, sales, clients, gift cards, notifications with an AI writing assistant whose drafts the admin reviews, moderation). Snap camera filters (Camera Kit) are in the binary but OFF for everyone: the page says "bientôt disponibles", the camera is never requested; we will describe them in a submitted version before switching them on. "Nouvelle tête" colour try-on runs on-device; its "AI ULTRA" mode appears only when enabled by the server; photos are not stored. No obfuscation.
3. Payments (3.1). No digital content is sold. Appointments, shop orders, gift cards and clothing pre-orders are paid in person at the salon (3.1.3(e)). No in-app payment, no external purchase link.
4. Apple Wallet. Home → "Carte Cadeau" → an active card → "Ajouter à Apple Wallet". The server checks the card belongs to the account and returns a 10-minute link to a signed .pkpass (standard Wallet sheet). The pass shows recipient, validity, balance, code and the QR scanned at the counter, kept up to date by a PassKit web service. No payment inside. No Wallet button on Android.
5. "La Coupe du Gang" mini-game. Top-down football played like air hockey: drag your player in your half, first to 3 goals (1-2 min). Open it from <Accueil → "La Coupe du Gang">. Modes: (a) "Contre le salon": vs the computer, 3 levels, fully on-device, works offline, no points: the quickest test with the demo account. (b) "À deux": two people on one phone, no points. (c) "En ligne": each on their own phone, vs a barber marked "Dispo pour un match" or a friend invited by link or by a 4-digit code; the server referees. Only online wins earn "Points de Coupe" (+3 win, -1 loss, never below 0), and only for clients with a real salon visit, so the demo account plays friendly matches. Leaderboards (season, all-time) show first name, initial and photo, opt-in only. The admin plays as "D'Home Barber" (blue star). No prize, reward or real-world value; points can't be bought or exchanged: not a contest under 5.3. No chat: only 3 preset reactions (👏 🔥 😂). "Signaler" and "Bloquer" on the end screen and the leaderboard; a blocked user can't challenge you. Challenge pushes are optional, never 21:00-08:00. To test online: 2nd device signed in as <email / mot de passe>, "Défier un ami" on one, open the link on the other.
```

Le point 5 reste dans le bloc de conformité **tant que le jeu existe** : la règle 2.5.19 vaut pour chaque version, pas seulement pour la première. Une fois la version approuvée, recopier ce bloc dans `docs/app-review-notes.md` comme nouveau « Bloc à coller ».

## 2. Étiquettes de confidentialité

### Ce que le jeu envoie, et ce qui compte comme « collecté »

| Donnée | Quand | Gardée ? |
|---|---|---|
| Rien | Contre le salon, à deux sur un téléphone | Jeu entièrement sur l'appareil (seule la mesure d'audience voit la page ouverte, déjà déclarée) |
| Position de son joueur, frappes, horloge (`in`, `hit`, `ping`) | Pendant un match en ligne | **Non** : en mémoire, le temps d'arbitrer (historique de 600 ms) |
| Réaction toute faite (`react`) | Pendant un match en ligne | **Non** : relayée à l'adversaire |
| Résultat (date, adversaire, score, vainqueur, forfait), Points de Coupe, totaux de saison et généraux | Fin d'un match en ligne | **Oui**, liés au compte |
| Accord pour figurer au classement, interrupteur « Dispo pour un match » d'un barber | Réglage | **Oui** |
| Prénom + initiale et rôle montrés à l'adversaire ; photo seulement au classement, avec accord | Match en ligne, classement | Données déjà collectées pour le compte |

Apple ne compte comme « collectée » qu'une donnée gardée plus longtemps que le traitement de la requête en temps réel : les positions et les réactions n'entrent pas dans l'étiquette. Google compte toute donnée qui quitte l'appareil, même traitée en mémoire. Mais les résultats sont enregistrés, donc la réponse « traitement éphémère » est **non** pour ce type de donnée.

### App Store : « Confidentialité de l'app »

**À ajouter (une ligne, l'étiquette passe de 11 à 12 lignes) :**

| Champ | Réponse |
|---|---|
| Catégorie | **Contenu utilisateur → Gameplay Content** (libellé français attendu « Contenu de jeu », à confirmer dans App Store Connect : la page française d'Apple ne le montre pas). Définition officielle : « Such as saved games, multiplayer matching or gameplay logic, or user-generated content in-game ». Apple écrit aussi : « Your app includes game saves, multiplayer matching, or gameplay logic. Declare Gameplay Content on your label. » |
| Finalité | **Fonctionnalité de l'app** (App Functionality). Elle couvre « enable features, prevent fraud » : matchs, points, classement, garde-fous anti-triche. |
| Liée à l'utilisateur | **Oui**, « Données établissant un lien avec vous » (matchs et points rattachés au compte, affichés avec le prénom) |
| Suivi | **Non** : ni données tierces, ni publicité, ni courtier de données |
| Ligne de l'API iris | `GAMEPLAY_CONTENT · APP_FUNCTIONALITY · DATA_LINKED_TO_YOU` : identifiant attendu, à vérifier dans la liste de l'API avant le `POST /iris/v1/appDataUsages`. Publier ensuite (`PATCH /iris/v1/appDataUsagesPublishState/6791332174`), comme le 21 oct. 2026. |

**Ne pas ajouter, sauf si :**

- **Analyses** sur le contenu de jeu : seulement si un écran du staff affiche des chiffres tirés de la table des matchs (matchs par semaine, joueurs actifs…). Les pages du jeu dans Admin → Trafic sont déjà couvertes par `PRODUCT_INTERACTION · ANALYTICS`.
- **Données de performance** (Diagnostics) : seulement si le build enregistre côté serveur des mesures de latence (ping) par joueur. Dans le prototype, le ping reste en temps réel, sans enregistrement.
- Inchangés : Nom, Photos ou vidéos, Identifiant de la personne utilisatrice (lignes « Fonctionnalité de l'app » déjà présentes). Ils couvrent le prénom, la photo et le compte montrés à l'adversaire.

**Quand :** l'étiquette se change sans nouvelle version et vaut tout de suite. La publier **le jour de la soumission du build 18** : quelques jours de déclaration en trop sur la 1.0.9 valent mieux qu'une version en ligne avec une donnée non déclarée.

### Google Play : « Sécurité des données »

**À ajouter :**

| Champ | Réponse |
|---|---|
| Catégorie → type | **Activité dans les applications → Autres actions**. Définition officielle : « Any other user activity or actions in-app not listed here such as gameplay, likes, and dialog options. » En français : « par exemple les actions dans les jeux ». |
| Collectée / partagée | **Collectée** oui, **partagée** non. Un « tiers » est une organisation autre que le développeur ou ses sous-traitants. L'adversaire et le classement passent par une action de l'utilisateur ou par son accord, deux exceptions prévues par Google. Même réponse que pour le fil, déjà déclaré sans partage. |
| Traitement éphémère | **Non** (résultats et points enregistrés) |
| Obligatoire ou facultative | **Facultative** : on peut ne jamais jouer en ligne |
| Finalités | **Fonctionnement de l'application** et **Prévention des fraudes, sécurité et conformité** (carte Gang exigée pour les points, frappes vérifiées par le serveur ; décision du 29 oct. : tous les matchs comptent, sans limite par adversaire ni par jour) |
| Liée à l'identité, suivi | Google ne pose pas ces deux questions. Ce qui s'en approche : « partagée » = non, et aucune finalité « Publicité ou marketing ». |

**À vérifier dans l'export avant l'import :**

- **Informations personnelles → ID utilisateur** : le compte sert à apparier les joueurs et à ranger les matchs. Si la ligne manque (non retrouvée dans l'historique), l'ajouter : collecté, non partagé, obligatoire, Fonctionnement de l'application et Gestion du compte.
- **Nom** et **Photos** : déjà déclarés (« Fonctionnement de l'application ») ; rien à changer.
- **Interactions avec l'appli · Analyse** : déjà déclaré ; couvre les pages du jeu dans la mesure d'audience.
- **Autre contenu généré par l'utilisateur** : **non**, les réactions ne sont pas enregistrées. À revoir si un jour elles le sont.
- Rubrique Sécurité : chiffrement en transit **oui** (`wss://`), suppression sur demande **oui** (déjà).

**Comment :** comme le 21 oct. 2026 : export CSV de la console (il arrive dans `~/Downloads/data_safety_export.csv`), ligne « Autres actions » renseignée, envoi par l'API `applications.dataSafety`, puis réexport pour contrôle. La déclaration part en examen **avec la release du code 19**.

## 3. `public/privacy.html` : appliqué le 29 oct. 2026

La section « 7 bis. La Coupe du Gang (mini-jeu) » et les retouches des sections 1 à 4 sont **en ligne dans `public/privacy.html`** depuis le 29 oct. 2026 (le jeu ouvre sur le site ce jour-là). Le texte de référence est celui du fichier, plus ce brouillon. Différences avec le brouillon, imposées par les décisions du 29 oct. et le contrat : plus de limite de matchs à points (tous les matchs comptent), interrupteur du classement sur la page La Coupe du Gang, matchs détachés du compte supprimé (« un ancien joueur ») au lieu d'être effacés, l'adversaire voit le prénom et l'initiale **sans la photo** (la photo n'apparaît qu'au classement, avec accord), abandon tout au début du match annulé, paragraphe « Signaler et bloquer » ajouté.

## 4. Questionnaires et fiches

### Classification par âge : App Store (App Information → Age Rating)

| Question | Réponse | Effet |
|---|---|---|
| **Contests** (Concours) | **Infrequent** (Peu fréquent), aujourd'hui sans doute « None » | Reste **4+** |
| Gambling (Jeux d'argent) | Non | — |
| Simulated Gambling (Jeux d'argent simulés) | None | — |
| Loot Boxes | Non | — |
| Cartoon or Fantasy Violence | None (aucun contact, aucune blessure ; le tremblement d'écran est un effet de but) | — |
| User-Generated Content, Messaging and Chat | Inchangés (déjà « oui » à cause du fil). Le jeu n'ajoute ni texte libre ni message. | — |
| Advertising, Unrestricted Web Access, contrôles parentaux | Inchangés | — |

- **Concours** : Apple définit « Contests » comme « Events that allow users to compete with one another for rankings, rewards, or the achievement of personal goals. May include: skill-based competitions… ». Un classement suffit, **même sans lot** : la réponse « None » serait inexacte. « Infrequent contests » est permis en 4+, « Frequent contests » donne **13+**. « Peu fréquent » se défend : jeu facultatif, un des modules d'une app de réservation. Choisir « Fréquent » si le jeu devient un pilier de l'app ; pour une clientèle adulte, 13+ ne coûte presque rien.
- **Jeux d'argent simulés** : Apple parle de « Betting or wagering ». Les Points de Coupe sont un score calculé, jamais misé par le joueur. **Ne jamais ajouter « parier ses points »** ni une mise avant un match : on passerait en jeux d'argent simulés (13+ ou 18+).
- Lot, achat de points, coffre au hasard : chacun change ces réponses (voir § 5).

### Classification du contenu : Google Play (questionnaire IARC)

- **Catégorie** : garder la catégorie actuelle, pas « Jeu ». L'objet de l'app reste la réservation ; le jeu est une fonction secondaire.
- Réponses attendues, à confronter aux questions de la console : jeux d'argent **non** ; jeux d'argent simulés **non** ; violence **non** ; « les utilisateurs interagissent » **oui** (déjà, à cause du fil : le jeu ajoute matchs et réactions sans changer la réponse) ; achats numériques **non** ; partage de la position **non**.
- Google demande de refaire le questionnaire quand une modification change une réponse. Si aucune ne change, ce n'est pas obligatoire. Le rouvrir quand même au lancement pour le vérifier.
- **Public cible et contenu** : garder « 18 ans et plus ». Google regarde si la fiche attire les enfants (« des animations juvéniles ou certains personnages jeunes dans les assets graphiques »). Pas de capture du jeu au style enfantin, pas de mascotte. Sinon, il faudrait suivre les règles « Familles ».

### Fiches des stores (`docs/store-listing.md`, refus Google du 10 sept. 2026)

- **Ne citer le jeu qu'à partir du build qui le contient**, et le mode en ligne seulement s'il est allumé. Mettre à jour la fiche **le jour où la version est publiée**, pas avant (la fiche Play part en examen à part).
- Puce proposée pour la description longue :
  `• La Coupe du Gang : un mini-jeu de foot à jouer contre le salon, à deux sur un téléphone ou en ligne contre un barber ou un ami, avec un classement par saison. Pour le plaisir : aucun lot à gagner.`
  Si le mode en ligne est éteint : `• La Coupe du Gang : un mini-jeu de foot à jouer contre le salon ou à deux sur un téléphone.`
- **À ne jamais écrire** : « Gagne ta coupe » ou « Remporte la Coupe ». Le jeu de mots ferait croire qu'on gagne une coupe de cheveux (un lot, donc un concours promis et absent). Pas non plus de « récompenses », « cadeaux », « affronte tous les barbers » (seuls les barbers « Dispo » sont défiables), « classement mondial » ou « n° 1 ».
- Ne pas ajouter « jeu » ni « foot » aux mots-clés App Store, et ne pas ajouter la catégorie secondaire Jeux : l'app reste en Style de vie.
- Une capture du jeu doit montrer un vrai match de l'app (règle 2.3.3), sans score ni lot inventé.
- Nouveautés iOS (fr-FR) et notes de version Play, brouillon :
  `• La Coupe du Gang : un mini-jeu de foot façon air hockey. Joue contre le salon (3 niveaux), à deux sur un téléphone, ou en ligne contre un barber ou un ami. Points de Coupe et classement de la saison, sur volontariat. Aucun lot : juste pour le plaisir.`

## 5. Règles Apple et Google qui touchent le jeu

| Règle | Ce qu'elle dit (résumé) | À faire |
|---|---|---|
| **Apple 2.5.19** | Aucune fonction cachée, dormante ou non documentée ; les fonctions doivent être claires pour l'utilisateur **et pour App Review**. | Point 5 des notes, à chaque version. `/coupe-test` hors du build (§ 0). Ne jamais allumer le mode en ligne (ou tout autre mode) par drapeau sans qu'une version approuvée l'ait décrit, comme pour les filtres Snap. |
| **Apple 2.3.1(a)** | Toute nouveauté décrite précisément dans les notes ; pas de promesse que l'app ne tient pas. | Notes précises (§ 1) ; fiche fidèle (§ 4). |
| **Apple 4.2** (fonctionnalité minimale) | L'app doit dépasser le site emballé et apporter une utilité ou un divertissement durable. 4.2.3(ii) : annoncer un téléchargement de ressources au premier lancement. | Le jeu renforce ce point. Sons et images dans le bundle, aucun téléchargement au premier lancement. |
| **Apple 4.7 et 2.5.2** | 4.7 vise les mini-jeux HTML5 **non embarqués** dans le binaire (filtrage, signalement, blocage, index avec liens universels, contrôle de l'âge). 2.5.2 interdit de télécharger du code qui change les fonctions de l'app. | Le jeu est embarqué par `cap sync` : 4.7 ne s'applique pas. **Ne jamais charger le jeu à distance** dans l'app : il tomberait sous 4.7 et 2.5.2. |
| **Apple 1.2** (contenu des utilisateurs) | Filtrer, signaler (et répondre vite), bloquer, publier des coordonnées. | Les noms affichés (adversaire, classement) sont du contenu d'utilisateur : filtre `hasObjectionableName` déjà à l'inscription et au profil, nom « D'Home Barber » refusé aux clients. **Ajouter « Signaler » et « Bloquer »** sur l'écran de fin de match et sur une ligne du classement (même circuit que le fil, `PostReport` / `UserBlock`). Un joueur bloqué ne peut plus défier (refusé par le serveur, lien de défi compris) et disparaît de mon classement. Réactions toutes faites : rien à filtrer ; un bouton « Couper les réactions » limiterait la moquerie (😂 après une défaite). |
| **Apple 5.3** (jeux, concours, loteries) | 5.3.1 concours organisés par le développeur ; 5.3.2 règlement officiel **dans l'app**, qui dit qu'Apple n'est ni organisateur ni impliqué ; 5.3.3 pas d'achat intégré pour des jeux d'argent ; 5.3.4 jeux d'argent réels sous licence. | **Aujourd'hui non concerné** (aucun lot, décision du 28 oct. 2026). **Si un lot apparaissait un jour** (une coupe offerte au premier de la saison…) : règlement dans l'app avec la mention sur Apple, organisateur = la société qui publie l'app, réponses du questionnaire d'âge revues. Les points exigent une carte Gang, donc une visite payée : un lot deviendrait un jeu lié à un achat. Faire relire le règlement (droit français des jeux-concours). Côté Google, ce serait un « programme de fidélité ludifié » : règlement publié dans l'app. Ce serait aussi revenir sur la carte de fidélité retirée le 3 sept. 2026 : décision du propriétaire d'abord. |
| **Apple 3.1.1** | Tout contenu numérique vendu passe par l'achat intégré. | Ne jamais vendre de points, de matchs ou d'apparences. Ne jamais échanger des points contre une remise ou une prestation (ce serait un lot, voir 5.3). |
| **Apple 4.5.4** | Notifications jamais obligatoires, pas de marketing sans accord explicite. | Défi d'un ami = notification de service (déjà : quota, jamais entre 21:00 et 08:00). Une annonce groupée (« Kevin est dispo, viens le défier ! ») serait du marketing : seulement aux clients qui l'ont accepté. |
| **Apple 5.1.1(v)** | Suppression du compte depuis l'app. | Matchs, points et place au classement effacés (`purgeClientContent`, check-list des entités, point 4). |
| **Google : Contenu généré par l'utilisateur** | Conditions acceptées avant de publier, modération continue, « un système intégré à l'application pour signaler et bloquer les utilisateurs et les contenus » ; blocage obligatoire pour toute interaction entre deux utilisateurs. | Même « Signaler » / « Bloquer » que pour Apple 1.2 : un match en ligne est une interaction entre deux utilisateurs. |
| **Google : Jeux d'argent, jeux et concours** | Interdit les jeux qui demandent de l'argent pour tenter de gagner un prix de valeur réelle ; programmes de fidélité ludifiés encadrés. | Non concerné sans lot ni mise. Voir la ligne Apple 5.3 si un lot apparaissait. |
| **Google : Déclarations trompeuses, métadonnées** | Fiche fidèle à l'app (refus du 10 sept. 2026). | § 4 : rien de promis qui n'existe pas, pas de « gagne ta coupe ». |
| **Google : Sécurité des données** | Déclaration exacte, mise à jour avec la version. | § 2, envoyée avec la release du code 19. |
| **Google : Public cible et contenu** | Fiche non destinée aux enfants : pas d'éléments qui les attirent. | Garder 18+, visuels du jeu sobres. |

## Points ouverts (à trancher avant le lancement)

- Libellé français exact de « Gameplay Content » dans App Store Connect (« Contenu de jeu » attendu, non confirmé par une page officielle) et identifiant `GAMEPLAY_CONTENT` de l'API iris, à relire dans la console.
- Contests : « Peu fréquent » (4+) ou « Fréquent » (13+). Recommandation : peu fréquent.
- Durée de conservation du détail des matchs : le brouillon dit « tant que le compte existe ». Une durée plus courte pour le détail (13 mois, comme la mesure d'audience) et des totaux gardés serait plus sobre. À décider avec le propriétaire.
- À la suppression d'un compte, l'historique de l'adversaire : match effacé chez lui aussi, ou gardé sous « Compte supprimé » ? Le cahier des charges dit « matchs et points effacés » ; ce que deviennent les points déjà gagnés contre ce compte reste à écrire.
- Questionnaire d'âge Apple, hors jeu : Apple définit « Social Media » comme un fil où l'on peut aimer, commenter et partager le contenu des utilisateurs (descripteur classé 13+). Le fil du Gang y ressemble alors que l'app est 4+. À relire la prochaine fois que le questionnaire est ouvert.

## Sources (consultées le 29 oct. 2026)

- Apple, App privacy details (types de données, finalités, « collect », lien à l'identité, suivi, « Declare Gameplay Content ») : https://developer.apple.com/app-store/app-privacy-details/
- Apple, libellés français des étiquettes (« Données établissant un lien avec vous », « Fonctionnalité de l'app », « Identifiant de la personne utilisatrice ») : https://www.apple.com/befr/privacy/labels/
- Apple, Age ratings values and definitions (Contests, Simulated Gambling, Social Media, niveaux 4+ à 18+) : https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/
- Apple, App Review Guidelines, « Last Updated: October 16, 2026 » (1.2, 2.3.1(a), 2.5.2, 2.5.19, 4.2, 4.7, 5.3) : https://developer.apple.com/app-store/review/guidelines/
- Apple, App Review information (Notes : 4 000 octets ; comptes en plus dans les notes) : https://developer.apple.com/help/app-store-connect/reference/app-review-information
- Google Play, Sécurité des données (« Autres actions », ID utilisateur, partage et exceptions, traitement éphémère, finalités) : https://support.google.com/googleplay/android-developer/answer/10787469?hl=fr (version anglaise : `?hl=en`)
- Google Play, Classification du contenu (refaire le questionnaire quand une réponse change) : https://support.google.com/googleplay/android-developer/answer/9898843?hl=fr et https://support.google.com/googleplay/android-developer/answer/188189?hl=fr
- Google Play, Jeux d'argent et de hasard utilisant de l'argent réel, jeux et concours (programmes de fidélité ludifiés) : https://support.google.com/googleplay/android-developer/answer/9877032?hl=fr
- Google Play, Contenu généré par l'utilisateur (signaler et bloquer) : https://support.google.com/googleplay/android-developer/answer/9876937?hl=fr
- Google Play, Public cible et contenu (fiche qui attire les enfants) : https://support.google.com/googleplay/android-developer/answer/9867159?hl=fr
