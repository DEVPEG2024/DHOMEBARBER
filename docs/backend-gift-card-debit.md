# Débit des cartes cadeau au comptoir : notice serveur

> **Appliquée le 17 oct. 2026** (backend v113, commit 280e4e4 : `lib/giftCardDebit.js`, `routes/giftCardDebit.js` monté avant `entitiesRouter`, table `gift_card_transactions` créée, `test/test-gift-card-debit.js`). Écarts : table absente → 501 `not_configured` ; `nothing_to_restore` (409) si le solde est déjà au montant initial ; barber → 404 sur l'historique ; push à l'acheteur coupé (`GIFT_CARD_DEBIT_NOTIFY_OWNER`).

Pour la session du Mac qui a le code de `dhomebarber-api`. Le frontend (17 oct. 2026) est **déjà en
place et fonctionne sans ces routes** : il les essaie d'abord, puis se replie sur l'entité générique
`GiftCard.update` (solde relu juste avant, calcul côté client, pas d'historique). Déployer ce qui
suit rend le débit sûr (verrou), traçable (historique) et annulable côté serveur, sans nouveau build.

Côté app : `src/lib/giftCardDebit.js` (appels, repli, messages), `src/components/giftcards-admin/`
(`GiftCardDebitPanel`, `GiftCardHistory`, `GiftCardSummary`), `src/pages/admin/AdminGiftCards.jsx`.

## 1. Parcours côté admin (pour comprendre les appels)

1. L'admin scanne le QR code au dos de la carte (ou ouvre `/admin/gift-cards?scan=DHB-XXXX-XXXX`).
2. « Que paie-t-on ? » : un **RDV du jour à encaisser** (`confirmed`, sans `payment_method`, tous
   barbers, date de Paris), des **prestations du catalogue** (somme) ou un **montant libre**.
3. Si le montant dépasse le solde, l'app débite le solde (« reste Y € à régler au comptoir »).
4. Deux taps : « Débiter 35 € de la carte DHB-… » puis « Confirmer » → `POST /gift-cards/:id/debit`.
5. RDV entièrement couvert : l'app clôture elle-même le RDV par `Appointment.update`
   (`payment_method: 'carte_cadeau'`, `payment_status: 'paid'`, `status: 'completed'`, `tip: 0`,
   `grand_total`, repère `[Carte cadeau DHB-… : 35 €]` ajouté à `internal_notes`). **Le serveur n'a
   pas à clôturer le RDV.** Partiellement couvert : rien n'est clôturé, l'admin finit dans l'agenda.
6. Toast « Annuler » (10 s) → `POST /gift-cards/:id/debit/:txId/undo`, puis l'app rouvre le RDV.

## 2. Table `gift_card_transactions` (auto-migration de `server.js`)

```sql
CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gift_card_id    UUID NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('debit', 'credit', 'undo')),
  amount          NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  balance_after   NUMERIC(10,2) NOT NULL CHECK (balance_after >= 0),
  appointment_id  UUID NULL,              -- pas de clé étrangère : un RDV supprimé ne doit rien casser
  services        JSONB,                  -- [{ id, name, price }] (≤ 20), ou NULL
  note            TEXT,                   -- ≤ 300 caractères (« RDV de Paul à 10:00 (Romain) : Coupe »)
  staff_email     TEXT,                   -- jeton de l'admin
  staff_name      TEXT,
  reverses_id     UUID NULL REFERENCES gift_card_transactions(id),  -- pour kind = 'undo'
  undone_at       TIMESTAMPTZ NULL,       -- posé sur le débit annulé
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gct_card ON gift_card_transactions (gift_card_id, created_at DESC);
```

Si `gift_cards.id` n'est pas un UUID, aligner le type. `ON DELETE CASCADE` : seule la suppression
d'une carte par l'admin efface son historique (la suppression d'un **compte** ne supprime pas la
carte, voir § 6).

## 3. `POST /gift-cards/:id/debit` (admin)

Corps : `{ amount, appointment_id?, services?, note? }`. `requireAdmin` (comme la modification des
`gift_cards` aujourd'hui). Quota conseillé : 120 / heure / compte.

Dans **une transaction** :

1. `SELECT * FROM gift_cards WHERE id = $1 FOR UPDATE` → 404 `{ error: 'Carte introuvable', code: 'gift_card_not_found' }`.
   **Important** : toute erreur de ces routes est du JSON avec un `code`. L'app considère un 404 sans
   `code` (ou la page HTML « Cannot POST ») comme « route absente » et passe au repli.
2. Contrôles, chacun en 409 avec un message en français et un `code` :
   - `status = 'pending'` → « Carte pas encore validée : encaissez-la d'abord. » (`not_validated`)
   - `status = 'used'` ou solde ≤ 0 → « Carte déjà entièrement utilisée. » (`used`)
   - `status = 'expired'` → « Carte annulée ou expirée. » (`expired`)
   - `valid_until < date du jour à Paris` (`ac.parisToday()`) → « Validité dépassée depuis le … » (`outdated`)
3. `amount` : nombre, arrondi au centime, > 0 sinon 400 (`invalid_amount`) ; **> solde → 409**
   « Solde insuffisant : il reste 15 € sur la carte. » (`insufficient_balance`, et `balance` dans la
   réponse). Pas de débit partiel silencieux : l'app envoie déjà le montant plafonné.
4. `appointment_id` facultatif : s'il est fourni, vérifier qu'il existe (sinon 400
   `appointment_not_found`) ; aucun lien obligatoire, pas de clôture côté serveur.
5. `services` : tableau ≤ 20 de `{ id, name ≤ 120, price ≥ 0 }`, sinon ignoré ; `note` tronquée à 300.
6. `UPDATE gift_cards SET remaining_balance = solde - amount` ; si le nouveau solde est 0 :
   `status = 'used'`, `used_at = NOW()`.
7. `INSERT` de la transaction `kind = 'debit'`, `balance_after`, `staff_email` / `staff_name` du jeton.
8. Réponse 200 : `{ card, transaction }` (carte entière normalisée comme l'entité `GiftCard`,
   nombres convertis par `normalizeRow`).

## 4. `POST /gift-cards/:id/debit/:txId/undo` (admin)

Transaction, verrou `FOR UPDATE` sur la carte puis sur la transaction.

- Transaction inconnue ou d'une autre carte → 404 (`transaction_not_found`) ; `kind ≠ 'debit'` → 400.
- Déjà annulée (`undone_at` non NULL) → 409 « Ce débit a déjà été annulé. » (`already_undone`).
- Plus de 24 h → 409 « Trop tard pour annuler ce débit (24 h). » (`undo_too_late`).
- Solde rendu : `LEAST(remaining_balance + amount, amount_initial)` ; `status = 'validated'`,
  `used_at = NULL` (même si la carte était `used`). Ne pas rouvrir une carte `expired` (annulée
  entre-temps) → 409 `expired`.
- `UPDATE … SET undone_at = NOW()` sur le débit ; `INSERT` d'une ligne `kind = 'undo'`,
  `reverses_id = txId`, `amount` = montant rendu, `balance_after` = nouveau solde.
- Réponse 200 `{ card, transaction }` (la ligne `undo`).

## 5. `GET /gift-cards/:id/transactions`

- Admin : toutes les lignes de la carte, plus récentes d'abord (`{ transactions: [...] }`, 100 max).
- Client : seulement si `gift_cards.sender_email` = email du jeton (pour afficher l'historique de sa
  propre carte dans l'app plus tard) ; **sans** `staff_email` / `staff_name` / `appointment_id`.
  Autre compte → 404 (pas d'oracle d'existence).
- Champs lus par l'app : `id, kind, amount, balance_after, appointment_id, services, note,
  staff_email, staff_name, undone_at, created_at`. Tant que la route répond 404, la section
  « Historique » n'apparaît pas dans la fiche admin.

## 6. Le reste

- **Notification au propriétaire** (facultatif, **à confirmer avec le salon** avant de l'activer) :
  push `sendPushToEmail(sender_email)` + email « 35 € utilisés sur ta carte cadeau, solde 15 € »
  après un débit (rien après une annulation). La carte est souvent offerte : le bénéficiaire n'a pas
  forcément de compte, c'est l'acheteur qui serait prévenu.
- **Suppression de compte** : les transactions sont **conservées** (la carte est déjà anonymisée,
  « Compte supprimé ») ; ne pas les cascader depuis `users`.
- **Activité clients / alertes admin** : un débit est une action du staff, pas d'alerte.
- **Tableau de bord** : inchangé. Le CA d'une carte est compté à sa validation ; les RDV payés
  `carte_cadeau` ne sont pas recomptés dans le CA global.
- **Entité générique** : garder `GiftCard.update` admin tel quel (repli des apps déjà publiées et
  correction manuelle). Option : refuser via l'entité une baisse de `remaining_balance` une fois la
  route déployée, pour que tout débit laisse une trace — à faire seulement quand plus aucune version
  de l'app n'utilise le repli (le panneau admin est web et natif : prochain build).
- **Ramasse-miettes des médias** : rien (aucune image).

## 7. Tests (`test/test-gift-card-debit.js`, faux pool transactionnel comme `test-textile.js`)

1. Débit nominal : solde 50, débit 35 → 15, statut `validated`, une ligne `debit`, `balance_after` 15.
2. Débit du solde entier → 0, `used`, `used_at` posé.
3. Montant > solde → 409 `insufficient_balance` avec le solde dans le message, rien d'écrit.
4. Montant 0, négatif, texte → 400.
5. Carte `pending`, `used`, `expired`, `valid_until` d'hier (Paris, autour de minuit UTC) → 409.
6. Client ou barber → 403 ; anonyme → 401.
7. Deux débits simultanés de 30 sur un solde de 50 : un seul passe (verrou `FOR UPDATE`).
8. `appointment_id` inexistant → 400 ; existant → enregistré, RDV non modifié.
9. Undo : solde rendu, `validated`, `used_at` NULL, `undone_at` posé, ligne `undo` ; second undo
   → 409 ; après 24 h → 409 ; carte `expired` entre-temps → 409.
10. Historique : admin voit tout ; client propriétaire voit sa carte sans les champs staff ; autre
    client → 404.
11. Erreurs JSON avec `code` partout (le repli du frontend en dépend).
