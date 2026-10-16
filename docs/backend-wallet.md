# Backend : carte cadeau dans Apple Wallet et Google Wallet

> **État au 16 oct. 2026 : frontend prêt, serveur à faire.** À appliquer dans `dhomebarber-api/`
> (hors de ce dépôt) par la session du Mac, qui a accès au code backend, au portail Apple Developer
> et à Google Cloud. Puis `git push heroku main`.

Demande du propriétaire : le client ajoute sa carte cadeau D'Home Barber à **Apple Wallet** (iPhone)
ou à **Google Wallet** (Android) et la présente au comptoir. L'admin scanne le QR du pass **exactement
comme aujourd'hui** : le pass porte le même QR que la fiche de la carte dans l'app.

## 0. Ce que fait déjà le frontend

- `src/lib/walletApi.js` : lit `features.appleWallet` / `features.googleWallet` dans les paramètres
  publics (`GET /api/apps/public/prod/public-settings/by-id/prod`, clé React Query `['walletFeatures']`,
  tout éteint en cas d'échec), appelle `POST /api/apps/prod/gift-cards/:id/wallet-links`, ouvre le lien.
- `src/components/giftcards/WalletButtons.jsx`, monté dans la fiche d'une carte de
  `src/pages/GiftCards.jsx` : boutons noirs « Ajouter à Apple Wallet » / « Ajouter à Google Wallet »,
  **seulement** sur une carte `validated`, non expirée (date de Paris), avec un solde > 0, et seulement
  si le drapeau correspondant est vrai.
- Choix du Wallet selon l'appareil : iPhone / iPad (app ou Safari) et Safari macOS → Apple ;
  Android (app ou Chrome) → Google ; autre ordinateur → les deux.
- Ouverture : app native → `openExternalUrl` (Safari View Controller sur iOS, qui affiche l'aperçu du
  pass ; onglet Chrome sur Android, qui passe la main à Google Wallet) ; web → `window.location.href`
  pour Apple, nouvel onglet (ou la page elle-même si bloqué) pour Google.
- Erreurs : réseau → « Pas de connexion internet », 404 → « Carte introuvable », 429 → message du
  serveur, sinon message du serveur. Une clé `null` dans la réponse → « Apple Wallet n'est pas encore
  disponible ».

**Tant que le serveur n'est pas configuré, rien n'apparaît** : aucun bouton qui échouerait, aucune
fonction dormante visible (règle App Store 2.5.19, voir § 8).

## 1. Route `POST /api/apps/:appId/gift-cards/:id/wallet-links`

Nouveau fichier `routes/wallet.js`, monté comme `routes/orders.js`.

- `requireAuth` (compte connecté, tout rôle).
- **Propriétaire** : côté client, une carte appartient à son **expéditeur** (`sender_email`, forcé
  depuis le jeton à la création ; c'est le filtre de lecture des cartes d'un client et celui de
  `GiftCards.jsx`). Requête :
  ```sql
  SELECT id, code, amount, remaining_balance, status, recipient_name, recipient_message, valid_until
    FROM gift_cards
   WHERE id = $1 AND LOWER(sender_email) = LOWER($2)
  ```
  Aucune ligne → **404** `{ error: 'Carte introuvable' }`. Un id qui n'est pas un UUID → **404** aussi
  (pas 400 : pas d'oracle). Le staff n'a pas d'exception : une carte d'un autre compte reste 404.
- **Carte utilisable**, sinon **409** `{ error, code }` :
  - `status !== 'validated'` → `card_inactive` « Cette carte n'est pas encore active : réglez-la au salon. »
    (ou « Cette carte a été entièrement utilisée. » pour `used`) ;
  - `valid_until` < date du jour à Paris (`ac.parisToday()`) → `card_expired` « Cette carte a expiré. » ;
  - `COALESCE(remaining_balance, amount) <= 0` → `card_empty` « Cette carte n'a plus de solde. ».
- **Quota** : 20 appels / heure / compte (`express-rate-limit`, `keyGenerator` = id du compte, comme
  `/ai/notification-draft`) → **429** « Trop de demandes : réessayez dans une heure. ».
- Réponse **200** :
  ```json
  { "apple_url": "https://dhomebarber-api-3aabb8313cb6.herokuapp.com/api/wallet/apple/<jeton>.pkpass",
    "google_url": "https://pay.google.com/gp/v/save/<JWT>" }
  ```
  Chaque clé vaut `null` si ce Wallet n'est pas configuré (ou si sa préparation a échoué : journaliser,
  renvoyer `null`, ne pas faire échouer l'autre).
- **Journalisation sans le code** (le code DHB vaut de l'argent) :
  `console.log('[Wallet] links card=%s user=%s apple=%d google=%d', card.id, req.user.id, …)`.
  Jamais le code, jamais le jeton, jamais le JWT Google.

## 2. Lien Apple à jeton court

Le `.pkpass` s'ouvre dans Safari / le système, **sans en-tête `Authorization`** : d'où une URL publique
à jeton signé.

- Jeton = `base64url(payload) + '.' + base64url(HMAC-SHA256(cléWallet, base64url(payload)))`,
  payload `{ t: 'wallet-apple', c: <id carte>, u: <id compte>, exp: <maintenant + 600 s> }`.
- `cléWallet = HMAC-SHA256(JWT_SECRET, 'dhb-wallet-pass-v1')` : clé **dérivée**, donc un jeton Wallet
  n'est jamais accepté comme jeton de session, et inversement. Vérification en `crypto.timingSafeEqual`.
- `GET /api/wallet/apple/:token.pkpass` (public, monté hors de `/api/apps/:appId`, comme `/api/media`) :
  1. jeton illisible, signature fausse, `t` différent ou `exp` passé → **410** avec une petite page HTML
     en français : « Ce lien a expiré. Rouvrez la carte dans l'app D'Home Barber et touchez à nouveau
     « Ajouter à Apple Wallet ». » (la page s'affiche dans Safari, pas du JSON) ;
  2. **relire la carte** (même requête qu'au § 1 avec l'email du compte `u`, et mêmes conditions) :
     carte remise en attente, utilisée, expirée ou compte supprimé entre-temps → 410 aussi ;
  3. générer le pass (§ 3) et répondre `200`, `Content-Type: application/vnd.apple.pkpass`,
     `Cache-Control: no-store`, `Content-Disposition: attachment; filename="carte-cadeau-dhomebarber.pkpass"`.
- Le jeton reste réutilisable pendant ses 10 minutes (Safari peut faire deux requêtes) ; il est lié à
  **une** carte et **un** compte. Il apparaît dans les journaux du routeur Heroku (chemin de l'URL) :
  c'est acceptable vu sa durée, mais ne jamais le journaliser dans l'app.
- Quota de la route de téléchargement : 30 / 15 min / IP (`express-rate-limit`).

## 3. Apple Wallet : le pass

### 3.1 Bibliothèque : `passkit-generator` (choix)

`node:crypto` ne sait pas produire une signature **PKCS#7 détachée** (CMS), et Node n'a pas d'écrivain
de fichiers zip. Deux voies :

- **Retenue : `passkit-generator` (3.x)**. Elle assemble le zip, calcule `manifest.json` (SHA-1 de
  chaque fichier), signe le manifest en PKCS#7 détaché avec le certificat Pass Type ID + WWDR, valide
  `pass.json` contre le schéma d'Apple et refuse un pass mal formé **avant** l'envoi (un pass invalide
  est simplement refusé par l'iPhone, sans message utile). Maintenue, très utilisée, peu de code à
  écrire et à relire. Elle tire `node-forge` et `do-not-zip`.
- Alternative sans elle : `node-forge` seul pour la signature, plus un écrivain zip maison
  (zip « stored » sans compression : en-têtes locaux + répertoire central + CRC32, `zlib.crc32` existe
  depuis Node 20.15 / 22.2, ~60 lignes). Signature :
  ```js
  const forge = require('node-forge');
  function signManifest(manifestBuf, { certPem, keyPem, keyPassphrase, wwdrPem }) {
    const cert = forge.pki.certificateFromPem(certPem);
    const key = keyPassphrase ? forge.pki.decryptRsaPrivateKey(keyPem, keyPassphrase) : forge.pki.privateKeyFromPem(keyPem);
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(manifestBuf.toString('binary'));
    p7.addCertificate(cert);
    p7.addCertificate(forge.pki.certificateFromPem(wwdrPem));
    p7.addSigner({
      key, certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date() },
      ],
    });
    p7.sign({ detached: true });
    return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary'); // fichier « signature »
  }
  ```
  Plus de code à maintenir pour le même résultat : à ne choisir que si l'on refuse la dépendance.

### 3.2 Contenu (`lib/wallet.js`, `buildApplePass(card)`)

Images à générer **une fois** depuis `public/logo.png` du frontend (avec `sharp`, déjà présent pour
AI ULTRA) et à committer dans `dhomebarber-api/wallet/apple/` :
`icon.png` 29 × 29, `icon@2x.png` 58 × 58, `icon@3x.png` 87 × 87 (obligatoires),
`logo.png` ≤ 160 × 50, `logo@2x.png` ≤ 320 × 100, `logo@3x.png` ≤ 480 × 150 (fond transparent).
Facultatif : `strip.png` 375 × 123 (+ @2x, @3x), bandeau sombre derrière le solde.

`pass.json` (le QR est **exactement** celui de l'app : `GiftCardBack` de `GiftCards.jsx` encode
`https://dhomebarber.fr/admin/gift-cards?scan=<code>`) :

```js
const qr = `https://dhomebarber.fr/admin/gift-cards?scan=${card.code}`;
const balance = Number(card.remaining_balance ?? card.amount) || 0;
const pass = {
  formatVersion: 1,
  passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID,        // pass.fr.dhomebarber.giftcard
  teamIdentifier: process.env.APPLE_TEAM_ID,                 // 3NXH4CTJM3
  serialNumber: String(card.id),                             // stable : réajouter la carte remplace le pass
  organizationName: "D'Home Barber",
  description: "Carte cadeau D'Home Barber",
  logoText: "D'Home Barber",
  backgroundColor: 'rgb(17, 17, 17)',                        // fond de la carte dans l'app
  foregroundColor: 'rgb(255, 255, 255)',
  labelColor: 'rgb(46, 158, 102)',                           // vert du salon (--primary 150 55 % 40 %)
  expirationDate: endOfParisDay(card.valid_until),           // ex. « 2027-10-01T23:59:59+02:00 » (ac.parisToUtc)
  barcodes: [{ format: 'PKBarcodeFormatQR', message: qr, messageEncoding: 'iso-8859-1', altText: card.code }],
  locations: [{
    latitude: SALON_LAT, longitude: SALON_LNG,
    relevantText: "Votre carte cadeau D'Home Barber est prête à présenter",
  }],
  storeCard: {
    primaryFields:   [{ key: 'balance', label: `SOLDE AU ${frDate(today)}`, value: balance, currencyCode: 'EUR' }],
    secondaryFields: [
      { key: 'recipient', label: 'POUR', value: card.recipient_name || '—' },
      { key: 'amount', label: 'MONTANT INITIAL', value: Number(card.amount), currencyCode: 'EUR' },
    ],
    auxiliaryFields: [
      { key: 'validUntil', label: "VALABLE JUSQU'AU", value: endOfParisDay(card.valid_until), dateStyle: 'PKDateStyleMedium', timeStyle: 'PKDateStyleNone' },
      { key: 'code', label: 'CODE', value: card.code },
    ],
    backFields: [
      { key: 'balanceNote', label: 'Solde', value: `Solde au ${frDate(today)} : ${eur(balance)}. Le solde à jour est dans l'app D'Home Barber (accueil → Carte Cadeau).` },
      { key: 'howTo', label: 'Utilisation', value: 'Présentez ce QR code au comptoir : le salon le scanne et déduit la prestation du solde.' },
      ...(card.recipient_message ? [{ key: 'message', label: 'Message', value: card.recipient_message }] : []),
      { key: 'address', label: 'Adresse', value: "Sur le côté gauche du bâtiment Odyssée, 3 Rue du Bois Arquet, 74140 Douvaine" },
      { key: 'phone', label: 'Téléphone', value: '06 66 08 36 05' },
      { key: 'web', label: 'Site', value: 'https://dhomebarber.fr' },
    ],
  },
};
```

- Sans `valid_until` : ne pas mettre `expirationDate` ni le champ `validUntil`.
- **Coordonnées du salon à vérifier** : `SALON_LAT = 46.3050`, `SALON_LNG = 6.3040` sont celles du centre
  de Douvaine (**approximatives**). Relever la position exacte de l'entrée du salon (Google Maps, clic
  droit sur le bâtiment Odyssée → la première ligne du menu donne « lat, lng ») et mettre ces deux
  constantes dans `lib/wallet.js`. Elles servent à la suggestion du pass sur l'écran verrouillé
  quand le client arrive au salon.
- Avec `passkit-generator` :
  ```js
  const { PKPass } = require('passkit-generator');
  const files = { ...imagesBuffers, 'pass.json': Buffer.from(JSON.stringify(pass)) };
  const pkpass = new PKPass(files, { wwdr, signerCert, signerKey, signerKeyPassphrase });
  return pkpass.getAsBuffer();
  ```
- Le pass n'interdit pas le partage (`sharingProhibited` absent) : l'expéditeur peut l'envoyer au
  bénéficiaire (AirDrop, Messages), exactement comme il partage déjà le PDF. Le QR vaut le code, comme
  sur le PDF.

### 3.3 Solde : v1 figée, v2 mise à jour

- **v1 (à faire maintenant)** : pas de service web. Le pass montre le solde **au moment de l'ajout**
  (libellé « SOLDE AU 16/10/2026 ») et rappelle au verso que le solde à jour est dans l'app. Réajouter
  la carte depuis l'app remplace le pass (même `serialNumber`) avec le solde du jour.
- **v2 (plus tard)** : mise à jour automatique.
  - `webServiceURL: 'https://dhomebarber-api-3aabb8313cb6.herokuapp.com/api/wallet/apple'` et
    `authenticationToken` (≥ 16 caractères, aléatoire, propre à chaque pass, stocké) dans `pass.json` ;
  - table `wallet_apple_registrations (device_id, push_token, pass_type_id, serial_number, created_at,
    UNIQUE(device_id, pass_type_id, serial_number))` + colonne `gift_cards.wallet_auth_token` ;
  - routes du protocole Apple (en-tête `Authorization: ApplePass <authenticationToken>`) :
    `POST` et `DELETE /v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber`,
    `GET /v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier?passesUpdatedSince=…`,
    `GET /v1/passes/:passTypeIdentifier/:serialNumber` (renvoie le pass à jour, `Last-Modified`),
    `POST /v1/log` ;
  - quand `remaining_balance`, `status` ou `valid_until` change (hook post-update de `entities.js` sur
    `gift_cards`), push APNs **vide** (`{}`) à chaque `push_token` enregistré, `apns-topic` =
    `pass.fr.dhomebarber.giftcard`. **Attention** : les passes exigent l'authentification APNs **par
    certificat** (le certificat Pass Type ID en TLS client sur `api.push.apple.com`), pas la clé `.p8`
    `9Q52VPGNPL` des notifications de l'app. `node:http2` accepte `cert` / `key` dans `connect()`.
  - Avec la v2, passer `primaryFields[0].label` à « SOLDE » et ajouter
    `changeMessage: 'Nouveau solde : %@'` (le client voit une notification à chaque passage au salon).

## 4. Google Wallet : l'objet et le lien

### 4.1 Type : `giftCard` (choix)

Le type **`giftCard`** (vertical cartes cadeau) plutôt que `generic` : il affiche nativement le solde
en euros (`balance`, `balanceUpdateTime`) et le numéro de carte, la carte est rangée avec les cartes
cadeau dans Google Wallet, et un `PATCH` de l'objet met à jour le solde sur le téléphone sans rien
d'autre (Google pousse la mise à jour), ce qui donne la v2 presque gratuitement. `generic` serait
plus libre visuellement mais il faudrait écrire le solde comme un simple texte. Si la console Google
refuse le vertical cartes cadeau pour ce compte, repli sur `genericClass` / `genericObject` avec les
mêmes champs en `textModulesData`.

### 4.2 Classe (une fois) et objet (à chaque demande)

- Identifiants : classe `<ISSUER_ID>.dhb_giftcard_v1`, objet `<ISSUER_ID>.giftcard-<id de la carte>`
  (lettres, chiffres, `.`, `_`, `-` : un UUID convient).
- **Classe**, créée une fois par un script `scripts/wallet-google-class.js` (`POST
  https://walletobjects.googleapis.com/walletobjects/v1/giftCardClass`, 409 → `PUT` pour la mettre à jour) :
  ```json
  { "id": "<ISSUER_ID>.dhb_giftcard_v1",
    "issuerName": "D'Home Barber", "merchantName": "D'Home Barber",
    "programLogo": { "sourceUri": { "uri": "https://dhomebarber.fr/icons/icon-512.png" },
                     "contentDescription": { "defaultValue": { "language": "fr-FR", "value": "D'Home Barber" } } },
    "hexBackgroundColor": "#111111", "countryCode": "FR",
    "cardNumberLabel": "Code",
    "homepageUri": { "uri": "https://dhomebarber.fr", "description": "dhomebarber.fr" },
    "reviewStatus": "UNDER_REVIEW" }
  ```
- **Objet**, inséré ou mis à jour par l'API REST à chaque `wallet-links` (`POST …/giftCardObject`,
  409 → `PATCH …/giftCardObject/<id>`), puis **lien court** qui ne porte que l'id (un JWT qui embarque
  tout l'objet dépasse vite la longueur d'URL acceptée par certains navigateurs) :
  ```js
  const object = {
    id: `${ISSUER}.giftcard-${card.id}`, classId: `${ISSUER}.dhb_giftcard_v1`, state: 'ACTIVE',
    cardNumber: card.code,
    balance: { micros: String(Math.round(balance * 1e6)), currencyCode: 'EUR' },
    balanceUpdateTime: { date: new Date().toISOString() },
    barcode: { type: 'QR_CODE', value: qr, alternateText: card.code },   // même valeur que l'app
    ...(validUntil ? { validTimeInterval: { end: { date: endOfParisDay(card.valid_until) } } } : {}),
    textModulesData: [
      { id: 'recipient', header: 'Pour', body: card.recipient_name || '—' },
      { id: 'amount', header: 'Montant initial', body: eur(card.amount) },
      { id: 'howto', header: 'Utilisation', body: "Présentez le QR code au comptoir. Solde à jour dans l'app D'Home Barber." },
    ],
    linksModuleData: { uris: [
      { id: 'app', uri: 'https://dhomebarber.fr/gift-cards', description: 'Ouvrir mes cartes cadeau' },
      { id: 'tel', uri: 'tel:+33666083605', description: 'Appeler le salon' },
    ] },
  };
  ```
  Google n'utilise plus les `locations` des objets pour les notifications géolocalisées : ne pas
  compter dessus (l'adresse est dans les liens et le texte).
- **Jeton d'accès** pour l'API REST : même mécanique que FCM dans `lib/nativePush.js` (JWT RS256 du
  compte de service signé avec `node:crypto`, échangé sur `https://oauth2.googleapis.com/token`, mis en
  cache jusqu'à expiration), portée `https://www.googleapis.com/auth/wallet_object.issuer`. Idéalement,
  extraire de `nativePush.js` une fonction `getGoogleAccessToken(serviceAccount, scope)` partagée.
- **Lien « Save to Google Wallet »**, signé avec `node:crypto`, sans dépendance :
  ```js
  const b64u = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
  const claims = {
    iss: sa.client_email, aud: 'google', typ: 'savetowallet', iat: Math.floor(Date.now() / 1000),
    origins: ['https://dhomebarber.fr'],
    payload: { giftCardObjects: [{ id: object.id, classId: object.classId }] },
  };
  const unsigned = `${b64u({ alg: 'RS256', typ: 'JWT' })}.${b64u(claims)}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), sa.private_key).toString('base64url');
  const google_url = `https://pay.google.com/gp/v/save/${unsigned}.${sig}`;
  ```
- Échec de l'API Google (réseau, 5xx, 403) : journaliser le statut (sans le code), renvoyer
  `google_url: null` ; le client voit « Google Wallet n'est pas encore disponible ».

## 5. Variables Heroku et paramètres publics

| Variable | Contenu |
|---|---|
| `APPLE_PASS_TYPE_ID` | `pass.fr.dhomebarber.giftcard` |
| `APPLE_TEAM_ID` | `3NXH4CTJM3` |
| `APPLE_PASS_CERT_PEM` | certificat Pass Type ID en PEM |
| `APPLE_PASS_KEY_PEM` | clé privée en PEM (chiffrée ou non) |
| `APPLE_PASS_KEY_PASSPHRASE` | facultatif, si la clé est chiffrée |
| `APPLE_PASS_CERT_P12` + `APPLE_PASS_CERT_PASSWORD` | **alternative** aux deux PEM : le `.p12` exporté du Trousseau, en base64 ; converti au démarrage avec `node-forge` (`forge.pkcs12.pkcs12FromAsn1`) |
| `APPLE_WWDR_PEM` | certificat intermédiaire Apple WWDR **G4** en PEM |
| `GOOGLE_WALLET_ISSUER_ID` | identifiant d'émetteur (chiffres) de la Google Pay & Wallet Console |
| `GOOGLE_WALLET_SERVICE_ACCOUNT` | JSON du compte de service sur une ligne |

- Les PEM acceptent les `\n` littéraux (même normalisation que `APNS_KEY_P8`).
- **Au démarrage**, `lib/wallet.js` essaie de charger les certificats (et la clé avec sa phrase) une
  fois : en cas d'échec, `console.error('[Wallet] Apple : certificat illisible')` et Apple désactivé.
- `routes/public.js` : `features.appleWallet = appleReady`, `features.googleWallet = googleReady`
  (vrais **seulement** si tout est posé et lisible). Le cache de 30 s des paramètres publics suffit.
- Sans ces variables, **comportement strictement identique à aujourd'hui** : drapeaux faux, aucun
  bouton dans l'app ; la route `wallet-links` répond quand même (`{ apple_url: null, google_url: null }`).

## 6. Pas à pas (session du Mac)

### 6.1 Apple : Pass Type ID et certificat

1. Clé et demande de certificat, sans passer par le Trousseau :
   ```bash
   mkdir -p ~/.appstoreconnect/wallet && cd ~/.appstoreconnect/wallet
   openssl genrsa -out pass-key.pem 2048
   openssl req -new -key pass-key.pem -out pass.csr -subj "/emailAddress=contact@dhomebarber.fr/CN=D'Home Barber Pass/C=FR"
   ```
2. [developer.apple.com/account](https://developer.apple.com/account) → Certificates, Identifiers &
   Profiles → **Identifiers** → « + » → **Pass Type IDs** → description « D'Home Barber carte cadeau »,
   identifiant `pass.fr.dhomebarber.giftcard` → Register.
3. **Certificates** → « + » → **Pass Type ID Certificate** → choisir `pass.fr.dhomebarber.giftcard` →
   envoyer `pass.csr` → télécharger `pass.cer`, puis :
   ```bash
   openssl x509 -inform DER -in pass.cer -out pass-cert.pem
   curl -sO https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
   openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr-g4.pem
   chmod 600 pass-key.pem pass-cert.pem
   ```
   Noter la **date d'expiration** du certificat affichée par le portail : passé cette date, plus aucun
   pass ne peut être signé (ceux déjà ajoutés restent). Le renouveler avant (même procédure).
4. Copies de sauvegarde dans `DHomeBarber-keystore-backup/wallet/` (Documents et iCloud Drive), comme
   la clé APNs.
5. Variables (sans faire transiter les clés en clair dans le terminal partagé) :
   ```bash
   heroku config:set APPLE_PASS_TYPE_ID=pass.fr.dhomebarber.giftcard APPLE_TEAM_ID=3NXH4CTJM3 \
     APPLE_PASS_CERT_PEM="$(cat pass-cert.pem)" APPLE_PASS_KEY_PEM="$(cat pass-key.pem)" \
     APPLE_WWDR_PEM="$(cat wwdr-g4.pem)" --app dhomebarber-api
   ```
6. Vérifier : `heroku run "node scripts/wallet-smoke.js <id d'une carte validée>" --app dhomebarber-api`
   (script à écrire : construit le pass, vérifie la signature et le manifest, imprime l'URL Apple à
   10 min) ; ouvrir l'URL dans Safari sur un iPhone → l'aperçu « Ajouter » doit apparaître ; scanner le
   QR du pass avec Admin → Cartes cadeau → la carte doit s'ouvrir.

### 6.2 Google : émetteur et compte de service

1. [pay.google.com/business/console](https://pay.google.com/business/console) avec le compte Google du
   salon → créer le profil professionnel « D'Home Barber » → **Google Wallet API** → noter
   l'**Issuer ID**.
2. Google Cloud, projet `d-home-barber` (celui de FCM) → API et services → activer **Google Wallet API**.
3. IAM → Comptes de service → créer `wallet-issuer@d-home-barber.iam.gserviceaccount.com` **sans aucun
   rôle** dans le projet (l'accès se donne dans la console Wallet) → Clés → JSON. Copie locale
   `~/.wallet-key/dhomebarber-wallet.json` (chmod 600), hors git.
4. Google Pay & Wallet Console → **Utilisateurs** → inviter l'adresse du compte de service avec le
   droit **Développeur**.
5. `node scripts/wallet-google-class.js` (classe `dhb_giftcard_v1`), puis Console → Google Wallet API →
   **Demander l'accès en publication** (« Request publishing access ») avec une capture du pass. Tant
   que l'accès n'est pas accordé, l'émetteur est en **mode démo** : seuls les comptes Google ajoutés
   comme utilisateurs de test de la console peuvent enregistrer le pass, les autres voient une erreur.
6. **Ne poser les variables qu'une fois l'accès en publication accordé** (sinon le bouton apparaîtrait
   pour tous les clients Android et échouerait chez Google) :
   ```bash
   heroku config:set GOOGLE_WALLET_ISSUER_ID=<id> GOOGLE_WALLET_SERVICE_ACCOUNT="$(jq -c . ~/.wallet-key/dhomebarber-wallet.json)" --app dhomebarber-api
   ```
   Avant cela, tester avec `scripts/wallet-smoke.js` (variables passées seulement au `heroku run` :
   `heroku run -e "GOOGLE_WALLET_ISSUER_ID=… GOOGLE_WALLET_SERVICE_ACCOUNT=…" …`) sur un compte de test.

### 6.3 Badges officiels (frontend, avant la mise en production)

Apple et Google imposent leurs **badges officiels**, non retouchés, en français :
- Apple : « Ajouter à Apple Wallet » — [developer.apple.com/wallet/add-to-apple-wallet-guidelines](https://developer.apple.com/wallet/add-to-apple-wallet-guidelines/) (kit de badges FR) ;
- Google : « Ajouter à Google Wallet » — [developers.google.com/wallet/generic/resources/brand-guidelines](https://developers.google.com/wallet/generic/resources/brand-guidelines).

Les déposer dans `public/wallet/` (`add-to-apple-wallet-fr.svg`, `add-to-google-wallet-fr.svg`) et
remplacer le logo + texte des boutons dans `src/components/giftcards/WalletButtons.jsx` (commentaire
« PRODUCTION » en tête du fichier). Les boutons actuels (fond noir, logo simplifié, texte en français)
ne sont qu'un remplaçant.

## 7. Tests serveur (`test/test-wallet.js`, sans base ni réseau, comme les autres harnais)

- Jeton Apple : aller-retour, expiré (410), signature modifiée (410), `t` différent, jeton de session
  refusé comme jeton Wallet et inversement.
- `wallet-links` : anonyme → 401 ; carte d'un autre compte → 404 ; id malformé → 404 ; `pending`,
  `used`, expirée (veille à Paris), solde 0 → 409 avec le bon `code` ; carte du jour de fin → 200 ;
  rien de configuré → `{ apple_url: null, google_url: null }` ; 21ᵉ appel dans l'heure → 429.
- `.pkpass` : relecture de la carte (passée `used` entre-temps → 410) ; `pass.json` porte
  `barcodes[0].message === 'https://dhomebarber.fr/admin/gift-cards?scan=' + code`, le solde, la date
  de fin en fin de journée de Paris, pas de `expirationDate` sans `valid_until` ; `manifest.json` =
  SHA-1 de chaque fichier ; signature vérifiable avec un certificat de test auto-signé généré dans le
  test (`node-forge`).
- Google : JWT décodé (`alg` RS256, `aud` google, `typ` savetowallet, objet `<issuer>.giftcard-<id>`),
  signature vérifiée par `crypto.verify` avec une paire générée dans le test ; faux `fetch` : insertion,
  409 → PATCH avec le nouveau solde, échec 500 → `google_url: null` sans faire tomber `apple_url`.
- Journaux : capturer `console.log` / `console.error` et vérifier que **ni le code DHB, ni le jeton, ni
  le JWT** n'y figurent.
- `routes/public.js` : drapeaux faux sans variables, vrais avec des certificats de test lisibles,
  faux avec un PEM abîmé.
- Ajouter le harnais à `npm test`.

## 8. App Store : règle 2.5.19 et notes de revue

Les boutons n'apparaissent que lorsque le serveur est configuré : une fonction pilotée par le serveur
doit être **décrite dans les notes de revue d'une version approuvée** avant d'être allumée.

- Les apps des stores n'auront les boutons qu'avec un **nouveau build natif** (`npm run cap:sync`, iOS
  build 12, Android versionCode 12) ; le site dhomebarber.fr les a dès le déploiement Vercel.
- **Ordre recommandé** : configurer Apple Wallet **avant** l'envoi du build 12 (le relecteur peut alors
  essayer), coller le paragraphe ci-dessous dans les notes, et donner au compte client de démonstration
  une carte cadeau **validée** (Admin → Cartes cadeau, 10 €). Après la revue, supprimer cette carte de
  test (règle de nettoyage du 16 oct. 2026) sans supprimer le compte de démonstration.
- Ne pas poser les variables Google avant l'accès en publication (§ 6.2).
- Vérifier sur un iPhone réel que l'app native ouvre bien l'aperçu du pass via Safari View Controller
  (`openExternalUrl`). Si ce n'est pas le cas, la voie native est un plugin Capacitor qui présente
  `PKAddPassesViewController` (non fait).

Paragraphe à ajouter aux notes de revue (`docs/app-review-notes.md`, par la session du Mac) :

```
[Gift cards in Apple Wallet]
A client who has bought a gift card can add it to Apple Wallet: Home screen → "Carte Cadeau" block (page "Cartes Cadeau") → tap an active gift card (status "Validée", not expired, with a remaining balance) → "Ajouter à Apple Wallet". The button only appears for active cards, and only once the salon's server has a Wallet pass certificate (it is configured for this review). The app requests a link from our server; the server checks that the card belongs to the signed-in account and returns a short-lived (10 minutes) link to a signed .pkpass, which opens in Safari View Controller and shows the standard Wallet "Add" sheet. The pass is a store card showing the card code, the balance at the time it was added (the up-to-date balance stays in the app), the recipient, the expiry date and the same QR code as in the app; the salon scans it at the counter to deduct services. It contains no payment and no in-app purchase: gift cards are paid in person at the salon (3.1.3(e)). The pass uses the salon's address so Wallet can suggest it on the Lock Screen near the salon. On Android the same button adds the card to Google Wallet. The demo client account has an active 10 € gift card for testing.
```
