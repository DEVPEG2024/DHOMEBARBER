# Notice backend : « j'envoie un Last Minute, rien n'est envoyé »

> **Appliquée le 17 oct. 2026** (backend v113, commit 280e4e4 : `lib/lastMinutePush.js`, jointures `LOWER` de `lib/pushHelper.js`, `test/test-last-minute-push.js`). Diagnostic : 47 abonnements Android clients, **0 iOS** — `AppDelegate.swift` n'avait pas les méthodes d'enregistrement APNs (corrigé localement, nouveau build iOS nécessaire). Écarts : `end_time` vide toléré (anciennes apps) ; `url` limitée à `/booking` suivi d'une requête ou d'une ancre ; quota en mémoire.

> Signalé par le propriétaire le 16 oct. 2026 : quand l'admin pose un Last Minute dans l'agenda et
> touche « Envoyer la notification », aucun client ne reçoit rien. Le diagnostic et la correction se
> font dans `dhomebarber-api` (Heroku), depuis la session du Mac. Le frontend est déjà corrigé (voir
> § 0) ; il marche avec le serveur actuel comme avec le serveur corrigé.

## 0. Ce qui a changé côté frontend (16 oct. 2026)

`src/pages/admin/Agenda.jsx`, fenêtre « Notification Last Minute » (`LastMinuteForm`) :

- **Le barber est obligatoire** : plus de choix « Tous les barbers », qui prenait un barber au hasard
  (`employees[0]`). Proposé : le barber connecté, sinon celui affiché dans l'agenda, sinon le premier.
- **Seules les heures qu'un client peut réserver sont proposées.** Avant, la fenêtre proposait des
  quarts d'heure de 08:00 à 20:00. La réservation client, elle, ne propose que des demi-heures dans
  les horaires du barber (`generateTimeSlots` dans `lib/slots.js`) : un Last Minute à 15:15 ou à
  20:00 était annoncé mais introuvable. Maintenant : la grille de la réservation pour ce barber et
  ce jour, sans les heures passées (heure de Paris), sans celles où un RDV ou une pause commence ou
  chevauche. Barber en repos ou en congé ce jour-là : message, bouton désactivé.
- **La fin est obligatoire et toujours après le début** (défaut : début + 30 min). Avant, une fin
  vide donnait `end_time = start_time` : une ligne de durée nulle, que la reprise serveur (« la
  ligne `last_minute` qui chevauche la plage demandée ») ne pouvait pas trouver.
- **Compte rendu honnête** : si `sent` vaut 0 ou manque, plus de toast vert « Notification envoyée
  à 0 client(s) » mais un avertissement (« Créneau bloqué, mais aucun client n'a reçu la
  notification : aucun téléphone client n'a encore activé les notifications »), avec `total`,
  `failed` et `skippedNative` s'ils sont dans la réponse.
- **Envoi en échec** : la ligne `last_minute` existe déjà, la fenêtre reste ouverte avec « Créneau
  bloqué, mais la notification n'est pas partie : <message du serveur> » et un bouton « Renvoyer la
  notification » qui ne rappelle que `POST /last-minute` (sans recréer la ligne).
- **Deux champs en plus dans `POST /last-minute`** : `employee_id` et
  `url: '/booking?barber=<id>&date=AAAA-MM-JJ&time=HH:MM'`. Un serveur qui les ignore ne casse rien.

`src/pages/Booking.jsx` comprend désormais `date=AAAA-MM-JJ` et `time=HH:MM` (avec `barber`) : le
client choisit ses prestations, puis arrive à l'étape Date & Heure avec la date et l'heure du Last
Minute déjà choisies si elles sont encore libres pour ses prestations. Tant que le serveur ne met
pas `url` dans le push, la notification ouvre ce qu'elle ouvrait avant.

## 1. Diagnostic pas à pas

### a. Regarder les journaux pendant un envoi

```bash
heroku logs --tail --app dhomebarber-api | grep -iE "last.?minute|push|apns|fcm|webpush|429"
```

Puis, depuis l'app (compte admin), envoyer un Last Minute sur une demi-heure libre. À relever :

- la ligne de la requête `POST /api/apps/prod/last-minute` et son **statut** (200, 4xx, 5xx) ;
- ce que `pushHelper` journalise (lots, abonnements supprimés en 410 / 404, `skippedNative`,
  `BadDeviceToken`, `UNREGISTERED`…) ;
- une erreur éventuelle (exception, `VAPID` non configuré, timeout de 10 s).

Si le statut est 200 et qu'aucune ligne de `pushHelper` n'apparaît, la route n'a trouvé **aucun
abonnement** à qui envoyer : passer au point b.

### b. Compter les abonnements push des clients

`heroku pg:psql --app dhomebarber-api` :

```sql
-- Abonnements par type d'appareil et par rôle du compte
SELECT
  CASE
    WHEN ps.endpoint LIKE 'native://ios/%'     THEN 'native://ios'
    WHEN ps.endpoint LIKE 'native://android/%' THEN 'native://android'
    ELSE 'web'
  END                                  AS type,
  COALESCE(u.role, '(aucun compte)')   AS role,
  COUNT(*)                             AS abonnements,
  COUNT(DISTINCT LOWER(ps.user_email)) AS comptes
FROM push_subscriptions ps
LEFT JOIN users u
  ON LOWER(u.email) = LOWER(ps.user_email)
  OR u.id::text = ps.user_id::text
GROUP BY 1, 2
ORDER BY 2, 1;
```

```sql
-- Abonnements dont l'email ne correspond à aucun compte (casse, compte supprimé, user_email vide)
SELECT ps.id, ps.user_id, ps.user_email, LEFT(ps.endpoint, 40) AS endpoint, ps.created_at
FROM push_subscriptions ps
LEFT JOIN users u ON LOWER(u.email) = LOWER(ps.user_email)
WHERE u.id IS NULL;
```

Lecture :

- **0 ligne `role = user`** : la cause est là, personne côté clients n'a activé les notifications
  (au 7 oct. 2026 : 1 Android et 2 web, sans doute du staff). Rien à corriger dans le code ; la
  fenêtre « Ne rate rien du Gang » (`NotificationPrompt`) n'atteint les apps des stores qu'avec la
  1.0.3 / 1.0.8 ou plus récentes. Le nouvel avertissement de l'agenda le dit désormais à l'admin.
- **des lignes `native://…` mais `sent = 0`** : voir c (la route ignore peut-être le natif) et
  vérifier que les variables sont posées, **sans afficher leurs valeurs** :
  `heroku config --app dhomebarber-api --json | jq -r 'keys[]' | grep -E 'APNS|FCM|VAPID'`.
- **des lignes `(aucun compte)` ou un email de casse différente** : la jointure de la route (point c)
  les perd peut-être ; comparer en `LOWER()`.

### c. Vérifier ce que fait `POST /last-minute`

Dans `server.js` (endpoint last-minute), vérifier :

1. **Destinataires** : tous les comptes `role = 'user'`, via `sendPushToRole('user', payload)` de
   `lib/pushHelper.js` (ou une requête équivalente suivie de `sendToSubscriptions`). L'endpoint date
   d'avant `pushHelper` et du push natif (v74) : s'il appelle encore `webpush.sendNotification` sur
   ses propres lignes, **les téléphones iOS / Android ne reçoivent jamais rien** (leurs endpoints
   `native://…` ne sont pas des URL Web Push). Il doit passer par `sendToSubscriptions`, qui route
   le natif vers APNs / FCM.
2. **Jointure** : `push_subscriptions` ↔ `users` comparée en `LOWER(email)` (ou par `user_id`).
3. **Attente** : l'envoi doit être `await` avant de répondre. Une réponse partie avant la fin de
   l'envoi renvoie `sent: 0` ou un nombre faux.
4. **Réponse** : ce que la route renvoie aujourd'hui (le frontend affichait `result.sent` sans le
   contrôler). Voir f.
5. **Rôle** : réservé au staff (`requireStaff`), comme décrit dans CLAUDE.md.

### d. Quota de 6 envois par heure et par compte

Un 429 répond au 7e envoi de l'heure par le même compte. Le frontend affiche désormais le message
du serveur (ou « Trop d'envois Last Minute cette heure-ci (6 par heure) »). Vérifier que le message
du 429 est en français et que le quota n'est pas global (un barber ne doit pas épuiser celui de
l'admin). Les essais de diagnostic comptent dans le quota : prévoir de patienter ou de tester avec
deux comptes staff.

## 2. Correction à apporter

### e. Accepter `employee_id` et `url`, et un texte précis

Champs facultatifs, en plus de `date`, `start_time`, `end_time`, `employee_name` :

- `employee_id` : s'il est fourni, relire le barber en base (`employees`, actif) et prendre **son**
  nom pour le texte plutôt que `employee_name` venu du corps. Inconnu ou inactif : 400.
- `url` : chaîne ≤ 200 caractères, commençant par `/` mais pas par `//`, sans `\`, sans retour à la
  ligne (même règle que `safeUrl` côté client). Sinon : ignorée (repli sur la valeur actuelle, par
  exemple `/booking`). La mettre dans le push : `data: { url }` (le service worker lit
  `data.data.url`, l'app native `notification.data.url`). Si `url` est absente, la construire :
  `/booking?barber=<employee_id>&date=<date>&time=<start_time>`.
- Valider aussi `date` (`AAAA-MM-JJ`, aujourd'hui ou plus tard à Paris) et `start_time` / `end_time`
  (`HH:MM`, fin > début) : 400 sinon.

Texte du push (titre ≤ 45, corps ≤ 120) :

- titre : `⚡ Créneau Last Minute` ;
- corps : `Créneau Last Minute avec <barber> aujourd'hui à 15:30` / `… demain à 10:00` /
  `… jeudi 22 octobre à 10:00` (jour calculé à l'heure de Paris, `ac.parisToday()`) ; sans barber
  connu : `Un créneau vient de se libérer aujourd'hui à 15:30`. Puis ` : réserve vite !`.

Ne pas envoyer de push pour un créneau déjà passé (400 « Ce créneau est déjà passé »).

### f. Réponse

```json
{ "sent": 12, "failed": 1, "total": 13, "skippedNative": 0 }
```

- `total` : abonnements visés (tous types) ;
- `sent` : envois acceptés (Web Push 201, APNs 200, FCM 200) ;
- `failed` : refus et erreurs (abonnements périmés supprimés compris) ;
- `skippedNative` : endpoints natifs ignorés faute de configuration APNs / FCM.

Le frontend lit ces quatre champs (et `subscribers` / `count` / `errors` / `skipped_native` en
repli) ; seul `sent > 0` donne un message de succès.

## 3. Tests à ajouter (`test/test-last-minute-push.js`, faux pool et faux `pushHelper`)

1. Client (`role = user`) → 403 ; anonyme → 401 ; barber et admin → 200.
2. Trois clients abonnés (un web, un `native://ios`, un `native://android`) et un barber abonné :
   `sendToSubscriptions` reçoit exactement les trois abonnements clients, natif compris ;
   réponse `{ sent: 3, failed: 0, total: 3 }`.
3. Aucun abonnement client → 200 `{ sent: 0, total: 0 }` (pas d'erreur).
4. Email d'abonnement en majuscules → bien rattaché au client.
5. `url` valide → reprise telle quelle dans `data.url` ; `url` = `https://evil.fr`, `//evil.fr`,
   `/a\nb` ou > 200 caractères → ignorée (repli sur l'URL construite).
6. `employee_id` → nom du barber lu en base dans le corps du push ; `employee_id` inconnu → 400.
7. Texte : « aujourd'hui » / « demain » / jour en toutes lettres, à l'heure de Paris (tester autour
   de minuit UTC, quand Paris est déjà au lendemain).
8. Fin ≤ début, date ou heure mal formée, créneau passé → 400.
9. 7e envoi de l'heure par le même compte → 429 avec message français ; un autre compte staff
   passe encore.
10. Réponse envoyée seulement après la fin de l'envoi (faux `sendToSubscriptions` qui résout après
    un délai : `sent` juste).

Puis `npm test`, `git push heroku main`, et un essai réel depuis l'agenda avec un téléphone client
(compte de test `qa.<tag>.<horodatage>@dhomebarber.fr`, notifications acceptées) : la notification
doit arriver et ouvrir la réservation sur le bon barber, la bonne date et la bonne heure. **Ensuite,
effacer** le compte de test, la ligne `last_minute` et le RDV éventuellement réservé (règle de
nettoyage de CLAUDE.md).
