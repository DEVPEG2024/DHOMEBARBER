# Backend — « Les bons plans du Gang » (entité `Partner`)

Le frontend (`src/pages/Partners.jsx`, `src/pages/admin/AdminPartners.jsx`, `src/lib/partnersApi.js`)
passe par le CRUD générique : `api.entities.Partner.filter / list / create / update / delete`.
Tant que ce correctif n'est pas déployé, le serveur répond 400 sur l'entité inconnue : la section
reste masquée côté clients et l'admin affiche un bandeau « le serveur ne connaît pas encore les
partenaires ». Rien ne casse.

À appliquer dans `dhomebarber-api/` (hors de ce dépôt), puis `git push heroku main`.

## 1. Table — bloc d'auto-migration de `server.js`

```sql
CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  tagline TEXT,
  description TEXT,
  logo_url TEXT,
  cover_image_url TEXT,
  address TEXT,
  city TEXT,
  phone TEXT,
  website TEXT,
  instagram TEXT,
  offers JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ id, title, percent (1..100 | null), details }]
  promo_code TEXT,
  conditions TEXT,
  valid_until DATE,                             -- NULL = sans date de fin
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_partners_active_order ON partners (is_active, sort_order);
```

(Si les autres tables utilisent `uuid_generate_v4()` plutôt que `gen_random_uuid()`, garder la même fonction.)

## 2. `routes/entities.js`

- Mapping entité → table : `Partner: 'partners'`.
- Ajouter `offers` à la liste des colonnes JSONB auto-parsées de `normalizeRow()` (comme `items`, `skills`…).
- `valid_until` est une colonne `date` : déjà renvoyée en `YYYY-MM-DD` par `normalizeRow()`.

### Lecture (`applyReadPolicy` dans `lib/accessControl.js`)

- **Admin** : tout.
- **Tous les autres** (barber, client, anonyme) : forcer `is_active = true`. Toutes les colonnes sont
  publiques (ce sont des informations de vitrine), aucune donnée personnelle dans la table.

### Création / modification / suppression

- `CREATE_RULES.partners` et `UPDATE_RULES.partners` : **admin seulement** (403 sinon).
- Suppression : **admin seulement**.
- Champs whitelistés et bornés : passer le corps par `validatePartner` ci-dessous (à poser dans
  `lib/accessControl.js` ou en tête d'`entities.js`), qui lève un `HttpError(400)` sur toute valeur invalide.

```js
const PARTNER_CATEGORIES = ['food', 'sport', 'style', 'beauty', 'auto', 'leisure', 'services', 'other'];
const PARTNER_TEXT_LIMITS = {
  name: 120, tagline: 160, description: 2000, address: 200, city: 80, phone: 30,
  website: 300, instagram: 120, promo_code: 40, conditions: 600,
};

/** Corps d'un Partner → colonnes autorisées. `partial` = modification (champs absents ignorés). */
function validatePartner(body, { partial = false } = {}) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  for (const [key, max] of Object.entries(PARTNER_TEXT_LIMITS)) {
    if (!has(key)) continue;
    const v = body[key] == null ? '' : String(body[key]).trim();
    if (v.length > max) throw new HttpError(400, `${key} : ${max} caractères maximum`);
    out[key] = v || null;
  }
  if (!partial || has('name')) {
    if (!out.name) throw new HttpError(400, 'Le nom du partenaire est obligatoire');
  }
  if (has('category')) {
    if (!PARTNER_CATEGORIES.includes(body.category)) throw new HttpError(400, 'Catégorie inconnue');
    out.category = body.category;
  }
  for (const key of ['logo_url', 'cover_image_url']) {
    if (!has(key)) continue;
    const v = body[key] == null ? '' : String(body[key]).trim();
    // URL renvoyée par UploadFile (/api/media/<id>) ou https ; jamais de data: ni de javascript:
    if (v && !/^https:\/\//i.test(v)) throw new HttpError(400, `${key} : URL https attendue`);
    if (v.length > 500) throw new HttpError(400, `${key} trop long`);
    out[key] = v || null;
  }
  if (has('offers')) {
    if (!Array.isArray(body.offers) || body.offers.length > 8) throw new HttpError(400, '8 offres maximum');
    out.offers = JSON.stringify(body.offers.map((o) => {
      const title = String(o?.title || '').trim();
      if (!title || title.length > 120) throw new HttpError(400, 'Chaque offre a un intitulé (120 caractères max)');
      const details = String(o?.details || '').trim();
      if (details.length > 300) throw new HttpError(400, "Précision d'offre : 300 caractères max");
      let percent = null;
      if (o?.percent !== null && o?.percent !== undefined && o?.percent !== '') {
        percent = Number(o.percent);
        if (!Number.isInteger(percent) || percent < 1 || percent > 100) throw new HttpError(400, 'Pourcentage entre 1 et 100');
      }
      const id = String(o?.id || '').slice(0, 40) || crypto.randomUUID();
      return { id, title, percent, details };
    }));
  }
  if (has('valid_until')) {
    const v = body.valid_until;
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new HttpError(400, 'Date de fin invalide');
    out.valid_until = v || null;
  }
  for (const key of ['is_featured', 'is_active']) {
    if (has(key)) out[key] = body[key] === true;
  }
  if (has('sort_order')) {
    const n = Number(body.sort_order);
    if (!Number.isInteger(n) || n < 0 || n > 100000) throw new HttpError(400, 'Ordre invalide');
    out.sort_order = n;
  }
  out.updated_at = new Date();
  return out;
}
```

## 3. Suppression de compte, jobs, médias

- Aucune donnée client dans `partners` : rien à faire dans `DELETE /auth/delete-account`.
- Ramasse-miettes des médias (`jobs/mediaCleanup.js`) : ajouter `partners.logo_url` et
  `partners.cover_image_url` à la liste des colonnes qui citent une image, sinon les logos seraient
  supprimés au bout de 7 jours.

## 4. Test rapide après déploiement

```bash
# Doit répondre 200 et [] (plus 400)
curl -s "https://dhomebarber-api-3aabb8313cb6.herokuapp.com/api/apps/prod/entities/Partner?q=%7B%22is_active%22%3Atrue%7D" | head -c 200
# Un client ne doit pas pouvoir créer : 403 attendu avec un jeton client
```

Ajouter un harnais `test/test-partners.js` sur le modèle de `test-textile.js` : lecture anonyme
filtrée sur `is_active`, création / modification / suppression refusées hors admin, bornes de
`validatePartner` (pourcentage 0 / 101 / 12.5, 9 offres, URL `data:`, catégorie inconnue).
