# Backend — Alertes admin « Activité clients » (push 🔔)

> **v1 déployée le 13 oct. 2026** (Heroku v102, commit `5d83696` de `dhomebarber-api`) : `lib/adminAlerts.js`, tests
> `test/test-admin-alerts.js`. La v2 (table d'audit, § 5) et l'écran des préférences ne sont pas faits.
> Le frontend n'en dépend pas : la page **Activité clients** (`/admin/activity`), la cloche de l'en-tête
> admin et les toasts fonctionnent déjà en lisant les entités (`src/lib/adminActivity.js`). Mais ils ne
> préviennent que **pendant qu'un admin a l'app ouverte**. Ce correctif ajoute le push hors de l'app
> (écran verrouillé, iOS / Android / web) à **tous les admins**, pour chaque action d'un client.

## 1. Principe

- Une fonction unique, `lib/adminAlerts.js` :

  ```js
  // type ∈ clés de ADMIN_ALERT_TYPES ci-dessous ; actor = req.user (ou la ligne users) ; payload = { title, body, url }
  async function notifyAdminsOfClientAction(type, actor, { title, body, url }) {
    if (!actor || actor.role !== 'user') return { skipped: 'staff' };          // jamais pour une action du staff
    const prefs = await getAdminAlertPrefs();                                   // salon_settings.admin_alerts (cache 30 s)
    if (prefs[type] === false) return { skipped: 'disabled' };
    return sendPushToRole('admin', {                                            // lib/pushHelper.js, Web Push + APNs + FCM
      title: clamp(title, 45), body: clamp(body, 120), url, tag: `admin-${type}`,
    });
  }
  ```

  - `clamp` coupe au caractère près avec « … » ; les champs saisis par le client (nom, commentaire,
    message) sont **nettoyés** (retours à la ligne → espace, trim) avant d'entrer dans le texte.
  - **Jamais bloquant** : appelé après la réponse HTTP ou dans un `try/catch` + `.catch(console.error)`.
    Un échec de push ne doit jamais faire échouer une réservation ou une commande.
  - **Jamais pour le staff** : un RDV saisi par un barber dans l'agenda, une commande créée par l'admin,
    un avis supprimé, un statut changé par le staff… ne déclenchent rien. Le test se fait sur le **rôle du
    jeton** (`req.user.role === 'user'`), pas sur le contenu de la ligne.
  - Un compte admin qui est aussi barber reçoit déjà certains pushs (voir § 3) : pas de deuxième push pour
    le même fait (`excludeEmails` à passer à `sendPushToRole` si la fonction l'accepte, sinon l'ajouter).

## 2. Préférences par type — `salon_settings.admin_alerts`

Auto-migration de `server.js` :

```sql
ALTER TABLE salon_settings ADD COLUMN IF NOT EXISTS admin_alerts JSONB;
```

- `NULL` ou clé absente = **activé** (défaut : tout activé). `{ "user_new": false }` coupe les inscriptions.
- Ajouter `admin_alerts` aux colonnes JSONB auto-parsées et à la whitelist de `SalonSettings.update`
  (admin seulement) ; validation : objet dont les clés ∈ `ADMIN_ALERT_TYPES` et les valeurs booléennes,
  sinon 400. Ne **pas** l'exposer dans les paramètres publics (`routes/public.js`).
- Le cache des préférences est vidé quand l'admin enregistre les paramètres (comme le cache public).
- Frontend (plus tard, hors de ce correctif) : une section « Alertes push » dans la page Activité clients
  ou dans Paramètres, une case par type. Tant qu'elle n'existe pas, tout est activé.

## 3. Les types, leur déclencheur et leur texte

`url` = le lien admin de l'élément (le même que `link` dans `src/lib/adminActivity.js`). Titre ≤ 45
caractères, corps ≤ 120. Dates à l'heure de Paris (« sam. 18 oct. 10:00 »).

| Type | Déclencheur (hook existant) | Titre | Corps | URL |
|------|-----------------------------|-------|-------|-----|
| `appointment_new` | `routes/entities.js`, après la création d'un `Appointment` par un client (là où partent déjà l'email de confirmation et le push au barber) | 🔔 Nouveau rendez-vous | `<Client> · <prestations> · <sam. 18 oct. 10:00> avec <barber>` | `/admin/agenda?view=day&date=<date>&barber=<employee_id>` |
| `appointment_cancelled` | `UPDATE_RULES.appointments`, passage à `cancelled` **par le client** (seule modification qu'il peut faire) | 🔔 Rendez-vous annulé | `<Client> a annulé <sam. 18 oct. 10:00> avec <barber>` | `/admin/agenda?view=day&date=<date>&barber=<employee_id>` |
| `order_new` | `routes/entities.js`, après la création d'un `Order` (après l'email de commande) | 🔔 Nouvelle commande | `<Client> · <n> article(s) · <total> €` | `/admin/orders` |
| `review_new` | `routes/entities.js`, après la création d'une `Review` | 🔔 Nouvel avis <★★★★☆> | `<Client> pour <barber> : « <80 premiers caractères> »` | `/admin/reviews` |
| `giftcard_new` | `routes/entities.js`, après la création d'une `GiftCard` (statut `pending`) | 🔔 Carte cadeau à valider | `<Client> · <montant> € pour <bénéficiaire>` | `/admin/gift-cards` |
| `event_request` | `routes/entities.js`, après la création d'un `Event` (privatisation) | 🔔 Demande de privatisation | `<Client> · <type> · <date> · <n> pers.` | `/admin/events` |
| `event_answer` | `UPDATE_RULES.events`, le client **accepte ou refuse** le devis | 🔔 Devis accepté / 🔔 Devis refusé | `<Client> · <type> du <date> · <prix> €` | `/admin/events` |
| `textile_reservation` | `POST /textile/concepts/:id/reserve` | — **déjà notifié** | — | — |
| `salon_event_rsvp` | `POST /salon-events/:id/rsvp` | — **déjà notifié** | — | — |
| `feedback_new` | création d'un `Feedback` | — **déjà notifié** (🐞 / 💡) | — | — |
| `report_new` | création d'un `PostReport` (`notifyAdminsOfReport`) | — **déjà notifié** (push + email) | — | — |
| `user_new` | `routes/auth.js`, `register`, après l'insertion (rôle forcé `user`) | 🔔 Nouvelle inscription | `<Nom> vient de créer son compte` | `/admin/clients` |

**Pas de doublon** : la réservation textile, la réponse à un événement du salon, les bugs et suggestions
et les signalements envoient **déjà** un push à tous les admins. Ne pas en ajouter un second : seulement
faire passer ces appels par `notifyAdminsOfClientAction` pour qu'ils respectent les préférences
(`admin_alerts.textile_reservation === false` → rien) et la règle « jamais pour le staff » (un barber qui
répond à une invitation ne doit pas notifier). Garder leurs titres actuels.

Pour `appointment_new` : le barber concerné reçoit déjà un push (« nouveau rendez-vous »). Si ce barber
est l'admin lui-même, l'exclure de l'envoi admin (`excludeEmails`).

Volume : un salon reçoit quelques dizaines de RDV par jour ; si cela devient bruyant, l'admin coupera
`appointment_new` dans les préférences. Pas de regroupement automatique en v1.

## 4. Tests — `test/test-admin-alerts.js` (+ `npm test`)

Même harnais que les autres (pool, `http2` et `fetch` remplacés, `sendPushToRole` espionné) :

1. RDV créé par un client → 1 appel `sendPushToRole('admin', …)`, titre ≤ 45, corps ≤ 120, URL de l'agenda
   avec la bonne date et le bon barber.
2. RDV créé par un barber ou l'admin → aucun appel.
3. `admin_alerts = { appointment_new: false }` → aucun appel ; autres types toujours envoyés.
4. `admin_alerts` NULL → tous les types activés.
5. Annulation par le client → `appointment_cancelled` ; annulation par le staff → rien.
6. Commande, avis (étoiles dans le titre, commentaire tronqué et nettoyé des retours à la ligne), carte
   cadeau, privatisation (demande puis acceptation / refus du devis), inscription.
7. Réservation textile, RSVP, feedback, signalement : **toujours un seul** push admin (pas de doublon) et
   aucun quand l'auteur est du staff.
8. `sendPushToRole` qui rejette → la création répond quand même 201.
9. `SalonSettings.update` : `admin_alerts` refusé pour un barber (403), clé inconnue ou valeur non booléenne → 400.

## 5. Option v2 — table d'audit `admin_activity`

La v1 reconstruit la chronologie côté client depuis les entités, d'où ses limites :

- une action **effacée** (RDV supprimé, avis supprimé, compte supprimé et anonymisé) disparaît du fil ;
- un RDV saisi par le **staff** dans l'agenda avec l'email d'un client apparaît comme une action client
  (aucune colonne ne dit qui a créé la ligne) ;
- une **annulation** n'indique pas qui l'a faite (client ou salon) ;
- l'heure d'une annulation ou d'une réponse à un devis vient de `updated_date` / `updated_at`, colonnes
  non confirmées côté serveur : si aucune n'existe, ces deux sources ne s'affichent pas (pas de repli sur la
  date de création). Et comme ces colonnes bougent à chaque modification, un devis retouché par l'admin
  (notes, prix, confirmation) remonte en tête du fil. Correctif simple en attendant la table d'audit :
  une colonne `events.answered_at` posée par le serveur quand le **client** accepte ou refuse son devis
  (et `appointments.cancelled_at` + `cancelled_by` pour les annulations), que `src/lib/adminActivity.js`
  utilisera en priorité ;
- le lu / non lu vit dans le `localStorage` : propre à chaque navigateur ;
- chaque onglet admin ouvert envoie environ 14 requêtes par minute (une par source), même en arrière-plan.

La table d'audit les règle : l'acteur et son rôle sont connus au moment de l'écriture (on n'écrit que pour
un compte `user`, donc ni RDV saisi par le staff ni annulation du salon), l'instant est celui de l'action,
une seule requête remplace les ~14, et le dernier instant vu peut être stocké côté serveur
(`users.activity_seen_at`, `PUT /admin/activity/seen`) pour suivre l'admin d'un appareil à l'autre :

```sql
CREATE TABLE IF NOT EXISTS admin_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL,                 -- clés de ADMIN_ALERT_TYPES
  entity TEXT, entity_id TEXT,
  actor_email TEXT, actor_name TEXT,  -- anonymisés à la suppression de compte
  title TEXT NOT NULL, detail TEXT, amount NUMERIC(10,2), link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_activity_created ON admin_activity (created_at DESC);
```

- Écrite par `notifyAdminsOfClientAction` (avant le test des préférences : on journalise tout, on ne
  pousse que ce qui est activé).
- Lecture : `GET /admin/activity?days=14` (admin seulement, `requireAdmin`), et purge des lignes de plus
  de 180 jours par un job hebdomadaire.
- `DELETE /auth/delete-account` : `UPDATE admin_activity SET actor_email = NULL, actor_name = 'Compte supprimé'`.
- Le frontend basculerait alors `fetchAdminActivity` sur cette route (même forme `ActivityEvent`), en
  gardant l'agrégation actuelle comme repli si la route répond 404.
