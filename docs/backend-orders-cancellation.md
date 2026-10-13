# Backend — Commandes et annulations (commandes boutique, rendez-vous)

> **À déployer** (session Mac, `dhomebarber-api/`, hors de ce dépôt), puis `git push heroku main`.
> Le frontend du 13 oct. 2026 fonctionne **avant et après** ce déploiement : tout ce qui dépend d'une
> nouvelle règle serveur est conditionné par trois drapeaux des paramètres publics (§ 7), et chaque refus
> (400 / 403 / 404 / 405 / 409 / 429) est traduit en message utile par `src/lib/cancellation.js`
> (`friendlyCancelError`), jamais en erreur brute.

Fichiers frontend concernés : `src/lib/cancellation.js` (module commun), `src/pages/Orders.jsx`,
`src/pages/Shop.jsx`, `src/pages/Appointments.jsx`, `src/pages/Booking.jsx`,
`src/pages/admin/AdminOrders.jsx`, `src/components/agenda/AppointmentDetailModal.jsx`,
`src/lib/adminActivity.js`.

Ton des textes : messages d'erreur renvoyés aux pages Boutique / Mes commandes / Mes rendez-vous au
**vouvoiement** ; pushs au **tutoiement** (ton habituel des pushs) ; pushs admin neutres.

## 0. Ce qui ne va pas aujourd'hui (constaté dans le frontend et CLAUDE.md)

- Un client **ne peut pas annuler une commande** : `orders` n'est modifiable que par le staff.
- Le stock n'est **contrôlé** qu'à la création (409 au-delà du stock, 7 oct. 2026) mais, d'après le code
  connu, **jamais décrémenté** : deux clients peuvent commander la dernière pièce, et une annulation
  ne peut rien « rendre ». À vérifier dans `routes/entities.js` avant d'appliquer le § 4.
- Lignes de commande : `items[].name` / `items[].price` viennent du corps (seul `total_price` est
  recalculé) ; deux lignes du même produit (`{p, 3}, {p, 3}`) passent chacune le contrôle de stock.
- `created_date` vient du client (le Shop envoyait une **date seule en UTC** : une commande passée à
  0 h 30 à Paris était datée de la veille). Le frontend envoie désormais un ISO complet, mais le serveur
  doit poser `NOW()` lui-même.
- RDV : le client ne peut envoyer que `{ status: 'cancelled' }` ; aucun motif, aucune trace de **qui** a
  annulé (`cancellation_reason` sert aussi au last minute expiré), d'où « Annulé (client ou salon) »
  dans l'Activité clients.

## 1. Migrations — bloc d'auto-migration de `server.js`

Vérifier d'abord le type de `orders.created_date` (`\d orders` dans `heroku pg:psql`). S'il est en
`DATE`, le passer en `TIMESTAMPTZ` (les valeurs existantes deviennent minuit, heure du serveur : sans
gravité) ; le frontend masque l'heure quand la valeur est une date seule.

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by TEXT;            -- client | staff | system
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by_email TEXT;      -- jamais renvoyé hors staff
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_restored BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
-- si created_date est en DATE :
-- ALTER TABLE orders ALTER COLUMN created_date TYPE TIMESTAMPTZ USING created_date::timestamptz;
CREATE INDEX IF NOT EXISTS idx_orders_client ON orders (client_email, created_date DESC);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_by TEXT;      -- client | staff | system
```

- Les commandes existantes gardent `stock_reserved = false` : leur annulation **ne rend rien au stock**
  (rien n'avait été retiré). Seules les commandes créées après le déploiement (§ 4) réservent du stock.
- Ajouter ces colonnes aux whitelists de lecture (§ 5) ; aucune n'est modifiable directement par le corps
  d'une requête (elles sont posées par le serveur).

## 2. `POST /api/apps/prod/orders/:id/cancel` — annulation par le client

Nouvelle route (`routes/orders.js` montée comme les autres, ou dans `routes/entities.js`), **auth
obligatoire**. Quota conseillé : 20 / heure / compte.

Corps : `{ reason? }`.

| Cas | Réponse |
|-----|---------|
| `reason` (trimé) > 300 caractères | 400 `{ error: 'Le motif est limité à 300 caractères.' }` |
| `:id` mal formé, commande inexistante **ou d'un autre compte** (`client_email` ≠ jeton) | 404 `{ error: 'Commande introuvable.' }` (même réponse : pas d'oracle) |
| déjà `cancelled` | 200 `{ order, already: true }` — rien n'est touché, pas de push |
| statut `ready` (et `ready` absent des statuts annulables) | 409 `{ error: "Votre commande est prête au salon : pour l'annuler, appelez le 06 66 08 36 05.", code: 'order_ready' }` |
| statut `delivered` / `completed` | 409 `{ error: 'Cette commande a déjà été retirée.', code: 'order_closed' }` |
| statut ∈ statuts annulables (`ORDER_CANCEL_STATUSES`, défaut `['pending','confirmed']`, la même constante que `features.orderCancelStatuses`) | 200 `{ order, already: false }` |

Un compte staff peut appeler la route pour **ses propres** commandes ; pour celles des clients il passe
par `Order.update` (§ 3).

Déroulé, dans une transaction (`client = await pool.connect()`) :

```js
await client.query('BEGIN');
const { rows: [order] } = await client.query(
  'SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
if (!order || order.client_email !== req.user.email) → ROLLBACK, 404
if (order.status === 'cancelled') → ROLLBACK, 200 { order: projectForClient(order), already: true }
if (!ORDER_CANCEL_STATUSES.includes(normalize(order.status))) → ROLLBACK, 409 (voir tableau)
const restored = await restoreStock(client, order);         // fonction partagée, § 3
const { rows: [updated] } = await client.query(
  `UPDATE orders SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = 'client',
          cancelled_by_email = $2, cancellation_reason = $3, stock_restored = $4
     WHERE id = $1 RETURNING *`,
  [id, req.user.email, reason || null, restored]);
await client.query('COMMIT');
```

`restoreStock(client, order)` : seulement si `order.stock_reserved && !order.stock_restored`. Agréger
`items` par `product_id` (somme des `quantity` entières), puis
`UPDATE products SET stock = stock + $2 WHERE id = $1 AND stock IS NOT NULL` pour chaque produit
(un produit non suivi, `stock` NULL, reste NULL ; un produit supprimé depuis est ignoré). Renvoie
`true` si la remise a été faite.

**Après le `COMMIT`, hors transaction et sans bloquer la réponse** (`.catch(console.error)`) :

- push à tous les admins (`sendPushToRole('admin', …)`) : titre « 🛍️ Commande annulée », corps
  `<Client> · <n> article(s) · <total> € · <motif sur 80 caractères>` (motif nettoyé : retours à la
  ligne → espace), URL `/admin/orders`, tag `admin-order_cancelled`. C'est le type `order_cancelled` de
  `docs/backend-admin-alerts.md` : si `notifyAdminsOfClientAction` existe déjà, passer par elle (pas de
  doublon) ;
- email de confirmation au client : nouvelle fonction `sendOrderCancelled(order)` dans
  `lib/emailHelper.js` (même gabarit que la confirmation de commande ; articles, total, motif s'il y en a,
  « Vous pouvez repasser commande à tout moment dans l'app »). Silencieuse si SMTP absent.

Un échec de push ou d'email ne fait **jamais** échouer la requête.

## 3. Fonction partagée `cancelOrderTx(client, order, actor, { reason, email })`

Le code du § 2 vit dans une fonction réutilisée par trois chemins, pour que le stock soit toujours rendu
une fois et une seule (`stock_restored`) :

1. **Client** : `POST /orders/:id/cancel` (§ 2), `actor = 'client'`.
2. **Staff, `Order.update` vers `cancelled`** (`UPDATE_RULES.orders`, staff seulement comme aujourd'hui) :
   - accepte `cancellation_reason` (≤ 300, trimé) dans le corps — le frontend ne l'envoie que si
     `features.orderCancel` est vrai, la colonne n'existant qu'après la migration ;
   - `cancelled_by = 'staff'`, `cancelled_by_email = req.user.email`, `cancelled_at = NOW()`, remise en
     stock ;
   - push au client (`sendPushToEmail(client_email, …)`) : « ❌ Ta commande a été annulée », corps
     `<n> article(s) · <total> €` + `· <motif>` s'il y en a, URL `/orders`.
3. **Suppression** d'une commande (`DELETE`, staff) dont le statut n'est ni `cancelled` ni
   `delivered` / `completed` : remise en stock **dans la même transaction** que le `DELETE`.

Autres transitions staff (même `UPDATE_RULES.orders`, sous `SELECT … FOR UPDATE`) :

- **Rétablir** (`cancelled` → `pending` / `confirmed` / `ready`) : si la commande avait rendu son stock
  (`stock_restored = true`), le **re-décompter** sous verrou des produits (`SELECT … FROM products
  WHERE id = ANY($1) FOR UPDATE`) ; stock insuffisant → 409 « Plus que N en stock pour <produit> :
  impossible de rétablir la commande. ». Puis `cancelled_at`, `cancelled_by`, `cancelled_by_email`,
  `cancellation_reason` à NULL, `stock_restored = false`, `stock_reserved = true` (s'il y a eu décompte).
- Depuis `delivered` (ou `completed`) vers un autre statut : 409 « Commande close : elle a déjà été
  retirée. » (sauf vers `delivered` lui-même, idempotent).
- Passage à `delivered` : `delivered_at = NOW()`.
- Passage à `ready` : push au client **une seule fois** (flag : `ready` atteint pour la première fois,
  par ex. via une colonne `ready_notified_at TIMESTAMPTZ` ajoutée au § 1 si besoin) : « 🛍️ Ta commande
  est prête », corps « Elle t'attend au salon, tu la paies au retrait. », URL `/orders`.

## 4. Création de commande renforcée (`CREATE_RULES.orders`)

Tout dans une transaction :

1. **Lignes** : `items` tableau non vide ; agréger par `product_id` (contre `{p,3},{p,3}`) ; quantité
   **entière** 1..20 par produit (après agrégation), sinon 400 « Quantité invalide. » ; ≤ 20 produits
   distincts ; `notes` trimé ≤ 500.
2. `SELECT id, name, price, stock, is_active FROM products WHERE id = ANY($1) FOR UPDATE` : produit
   inconnu ou `is_active = false` → 400 « Le produit <nom envoyé, nettoyé, ≤ 60> n'est plus
   disponible. » ; stock suivi insuffisant → 409 « Plus que N en stock pour … » / « … est en rupture de
   stock » (messages du 7 oct. 2026 inchangés).
3. **Décrément** : `UPDATE products SET stock = stock - $2 WHERE id = $1 AND stock IS NOT NULL` ;
   `stock_reserved = true` sur la commande.
4. `items[].name` et `items[].price` **réécrits** depuis `products` (le client garde `image_url` s'il le
   veut, sinon reprise de `products.image_url`) ; `total_price` recalculé (déjà le cas).
5. `created_date = NOW()` quelle que soit la valeur envoyée ; `status` forcé à `pending` ; identité
   depuis le jeton (déjà le cas).
6. **Quotas** (comptés dans la transaction, sur le compte du jeton) :
   - 5 commandes ouvertes (`pending` / `confirmed` / `ready`) → 429 « Vous avez déjà 5 commandes en
     cours : retirez-en ou annulez-en une avant d'en passer une nouvelle. » ;
   - 10 créations par 24 h → 429 « Vous avez passé beaucoup de commandes aujourd'hui : réessayez
     demain ou appelez le salon au 06 66 08 36 05. » ;
   - **doublon** : même compte, mêmes lignes agrégées (même `product_id` → même quantité) et commande
     créée il y a moins de 60 s, non annulée → 200 `{ ...commande existante, duplicate: true }`, sans
     rien créer (double tap, réseau qui retente). Le frontend a aussi une garde contre le double envoi.
7. Après le `COMMIT` : email et push existants (inchangés).

## 5. Lecture (`applyReadPolicy`)

- Client : ses commandes avec `cancelled_at`, `cancelled_by`, `cancellation_reason`, `delivered_at` ;
  **jamais** `cancelled_by_email`, `stock_reserved`, `stock_restored` (ajouter à une liste de colonnes
  retirées, comme `USER_SECRET_COLUMNS`).
- Staff : tout.
- Appointments : `cancelled_at`, `cancelled_by`, `cancellation_reason` lisibles par le client sur ses
  propres RDV (pas dans les lignes projetées de disponibilité).

## 6. Rendez-vous : annulation avec motif et traçabilité

`UPDATE_RULES.appointments`, compte client (`role = 'user'`) sur son propre RDV :

- Corps accepté : `{ status: 'cancelled', cancellation_reason? }` et **rien d'autre** (tout autre champ →
  403 comme aujourd'hui). `cancellation_reason` trimé ≤ 300, sinon 400 « Le motif est limité à 300
  caractères. » Le frontend l'envoie préfixé « Client : <motif> » et seulement si
  `features.appointmentCancelReason` est vrai ; préfixer côté serveur s'il manque.
- Délai `salon_settings.cancellation_hours` (heure de Paris) **inchangé**, mais le refus doit porter un
  message français dans `error` avec le téléphone : 403 `{ error: "Ce rendez-vous est dans moins de
  <N> h : pour l'annuler, appelez le salon au 06 66 08 36 05." }` (le frontend l'affiche tel quel).
- Écriture atomique :
  `UPDATE appointments SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = 'client',
  cancellation_reason = $2 WHERE id = $1 AND client_email = $3 AND status = 'confirmed' RETURNING *` ;
  aucune ligne → relire : déjà `cancelled` → 200 avec la ligne, **sans** push ni email ;
  `completed` / `no_show` → 409 « Ce rendez-vous ne peut plus être annulé. »
- Après l'écriture (non bloquant) :
  - push au barber concerné (`sendPushToEmployee(employee_id, …)`) : « ❌ <Client> a annulé », corps
    `<sam. 18 oct. 10:00> · <prestations>` (+ motif nettoyé ≤ 80), URL
    `/admin/agenda?view=day&date=<date>&barber=<employee_id>` ;
  - push admins `appointment_cancelled` de `docs/backend-admin-alerts.md` (sans doublon si l'admin est
    aussi ce barber) ;
  - **vérifier** que l'email d'annulation (`lib/emailHelper.js`) part bien quand c'est le client qui
    annule.

Staff :

- passage à `cancelled` : `cancelled_by = 'staff'`, `cancelled_at = NOW()` ; `cancellation_reason`
  accepté (déjà le cas ; le frontend envoie « Salon » ou « Salon : <motif> ») ;
- le last minute expiré (motif « Personne n'a pris le créneau last minute ») : `cancelled_by = 'system'` ;
- **rétablir** (retour à `confirmed`) : `cancelled_at`, `cancelled_by`, `cancellation_reason` à NULL.

À vérifier en passant : `idx_appointments_unique_slot` exclut bien `status = 'cancelled'` (sinon un
créneau annulé reste bloqué) et `appointmentReminder` ne vise que `confirmed`.

**Option (non requise)** : déplacement par le client via `PUT` `{ date, start_time, employee_id }` hors du
délai d'annulation, contrôlé par `assertSlotAvailable` en ignorant le RDV lui-même. Il remplacerait le
« créer le nouveau puis annuler l'ancien » que fait aujourd'hui `Booking.jsx` (`?reschedule=<id>`), qui a
deux défauts : l'ancien créneau du client peut bloquer un nouveau créneau qui le chevauche, et le plafond
de 6 RDV à venir compte l'ancien pendant l'opération. Le frontend devrait alors être adapté (drapeau
`features.appointmentMove`).

## 7. Paramètres publics — `routes/public.js`

```js
features: {
  ...,
  orderCancel: true,
  appointmentCancelReason: true,
  orderCancelStatuses: ORDER_CANCEL_STATUSES,   // ['pending', 'confirmed']
}
```

- Pour autoriser l'annulation d'une commande **prête** (pièce mise de côté), ajouter `'ready'` à
  `ORDER_CANCEL_STATUSES` : la route et le bouton suivent, **aucun build nécessaire**.
- Vider le cache des paramètres publics (30 s) au déploiement : rien à faire, le redémarrage le vide.

## 8. Suppression de compte

`DELETE /auth/delete-account` : en plus de l'anonymisation actuelle des commandes, mettre
`cancelled_by_email = NULL` (ou « Compte supprimé ») sur les commandes que le compte a annulées.

## 9. Tests

`test/test-orders.js` (faux pool transactionnel comme `test-textile.js`), à ajouter à `npm test` :

- annulation par le propriétaire → `cancelled`, `cancelled_by = 'client'`, stock remis ;
- 404 pour un autre compte et pour un id inexistant (même message) ;
- idempotence : deuxième appel → `already: true`, aucune double remise en stock ;
- 409 `order_ready` sur `ready`, 409 `order_closed` sur `delivered` et `completed` ;
- motif de 301 caractères → 400 ; motif de 300 accepté ;
- staff annule via `Order.update` → stock remis + push client ; suppression d'une commande ouverte → stock
  remis ; rétablir → re-décompte, 409 si stock manquant ; `delivered` → autre statut refusé ;
- création : lignes en double agrégées, quantité négative / décimale / 21 refusée, produit inactif → 400,
  stock décrémenté, quota de 5 ouvertes → 429, 10 / 24 h → 429, doublon < 60 s → `duplicate: true`,
  `created_date` forcé à `NOW()`, `items[].name` / `price` réécrits ;
- lecture client : `cancelled_by_email` absent.

Cas à ajouter dans `test/test-routes.js` : RDV client avec motif accepté, autre champ refusé, motif
301 → 400, `cancelled_by` posé dans les trois cas (client / staff / system), déjà annulé → 200 sans
push, `no_show` → 409, push au barber, drapeaux publics présents.

## 10. Dégradation et ordre de déploiement

- **Avant ce déploiement** (drapeaux absents ou faux), le frontend :
  - n'affiche **pas** de bouton « Annuler la commande » : sous chaque commande ouverte, « Besoin de
    modifier ou d'annuler ? Appelez le salon au 06 66 08 36 05 » (lien `tel:`) ;
  - n'envoie **pas** de motif à l'annulation d'un RDV (`{ status: 'cancelled' }` exactement comme
    aujourd'hui) ;
  - l'admin n'envoie pas de `cancellation_reason` sur une commande (colonne inexistante) ;
  - un refus 403 / 404 sans message / 405 est traduit en « Pour annuler cette commande, appelez le salon
    au 06 66 08 36 05. » ; un 409 / 400 avec message affiche le message du serveur et recharge.
- **Ordre** : appliquer les migrations (§ 1, auto-migration au démarrage), les règles (§ 2 à 6) et les
  tests, puis le § 7 dans le même déploiement : les drapeaux s'allument seuls, sans rien republier côté
  frontend.
- **Apps des stores** : elles n'ont le nouveau frontend qu'avec un nouveau build natif (`npm run
  cap:sync` puis build iOS / Android). **Non fait le 13 oct. 2026 : ne rien pousser sur les stores pour
  l'instant**, d'autres modifications sont prévues. Les anciennes apps continuent d'annuler les RDV comme
  avant (le serveur accepte toujours `{ status: 'cancelled' }` seul) et n'ont pas d'annulation de
  commande.
