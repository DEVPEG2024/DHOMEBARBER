# Backend — « Bugs et suggestions » (entité `Feedback`)

Le frontend (`src/components/feedback/`, `src/pages/admin/AdminFeedback.jsx`, `src/lib/feedbackApi.js`)
passe par le CRUD générique : `api.entities.Feedback.list / create / update / delete`.
Tant que ce correctif n'est pas déployé, le serveur répond 400 sur l'entité inconnue : le client voit
« Envoyer par email » (message pré-rédigé vers l'email du salon) et l'admin un bandeau. Rien ne casse.

À appliquer dans `dhomebarber-api/` (hors de ce dépôt), puis `git push heroku main`.

## 1. Table — bloc d'auto-migration de `server.js`

```sql
CREATE TABLE IF NOT EXISTS feedbacks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),   -- même fonction que les autres tables
  type TEXT NOT NULL DEFAULT 'bug',                   -- bug | idea
  message TEXT NOT NULL,
  area TEXT,                                          -- endroit de l'app (liste FEEDBACK_AREAS), facultatif
  screenshot_url TEXT,                                -- URL renvoyée par UploadFile
  context JSONB,                                      -- { platform, app_version, screen, user_agent }
  status TEXT NOT NULL DEFAULT 'new',                 -- new | in_progress | done | dismissed
  admin_reply TEXT,
  replied_at TIMESTAMPTZ,
  client_email TEXT,
  client_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedbacks_client ON feedbacks (client_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON feedbacks (status, created_at DESC);
```

## 2. `routes/entities.js` + `lib/accessControl.js`

- Mapping : `Feedback: 'feedbacks'` ; `context` dans les colonnes JSONB auto-parsées ; table triée par
  `created_at` (pas de `created_date`), comme `partners`.
- **Lecture** (`applyReadPolicy`) : admin tout ; tout autre compte connecté → filtre `client_email` forcé
  sur le sien ; anonyme → 401.
- **Création** (`CREATE_RULES.feedbacks`) : tout compte connecté (clients et staff).
  - `client_email` / `client_name` depuis le jeton et `users`, jamais du corps ;
  - `type` ∈ `bug|idea` ; `message` trimé, 10 à 2000 caractères ; `area` ≤ 40 ; `screenshot_url`
    https ≤ 500 (pas de `data:`) ; `context` objet, sérialisé ≤ 2000 caractères (sinon ignoré) ;
  - `status` forcé à `new`, `admin_reply` ignoré ;
  - quota : **10 envois par 24 h et par compte** (`SELECT COUNT(*) … created_at > NOW() - INTERVAL '24 hours'`) → 429
    « Tu as déjà envoyé beaucoup de messages aujourd'hui, réessaie demain ».
  - Après insertion : push à tous les admins (`sendPushToRole('admin', …)`, titre « 🐞 Nouveau bug » ou
    « 💡 Nouvelle suggestion », texte = nom + 100 premiers caractères, URL `/admin/feedback`).
- **Modification** (`UPDATE_RULES.feedbacks`) : admin seulement, champs `status` (liste ci-dessus) et
  `admin_reply` (≤ 1000). Quand `admin_reply` change et n'est pas vide : `replied_at = NOW()` puis push
  au client (`sendPushToEmail(client_email, …)`, titre « 💬 Le salon t'a répondu », texte = début de la
  réponse, URL `/settings`).
- **Suppression** : admin seulement.

## 3. Suppression de compte, médias

- `DELETE /auth/delete-account` : `DELETE FROM feedbacks WHERE client_email = $1` (messages personnels).
- `jobs/mediaCleanup.js` : ajouter `feedbacks.screenshot_url` aux colonnes protégées (règle du
  ramasse-miettes, et le test `test-cleanup-media.js` l'exige).

## 4. Tests

`test/test-feedback.js` sur le modèle de `test-partners.js` : lecture client limitée à ses envois,
anonyme refusé, identité forcée, statut forcé, bornes (message 9 / 2001 caractères, type inconnu,
URL `data:`), quota de 10 / 24 h, modification et suppression refusées hors admin, push au client
quand l'admin répond.
