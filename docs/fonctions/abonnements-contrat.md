# Abonnements au mois : contrat

Planche validée le 4 nov. 2026 : https://claude.ai/artifact/JeVmvZeWeZBQxiSGKYr3nZ (12 écrans). Fichiers de la planche : `project/*.dc.html`.

Réponses du propriétaire (4 nov. 2026) :

- Tout se valide et se scanne sur **l'ordinateur du salon, connecté en admin** : routes admin seul, aucune permission nouvelle pour un barber. Cet écran doit donc être parfait **à la souris, sur grand écran** (1024, 1366, 1920 px), avec une webcam ou une douchette, et sans lecteur (« Saisir le code »).
- **Un client absent garde sa coupe** : rien n'est débité, la coupe redevient à reprogrammer.
- Coupes non utilisées **valables 1 an**, comme les cartes cadeau.

Autres décisions de la planche, retenues sans changement : une carte à part par abonnement ; créneaux bloqués dès la réservation, à régler au plus tard au premier RDV, jamais d'annulation automatique pour défaut de paiement ; 4 RDV dans les 5 semaines après le premier, 3 jours d'écart au moins, même barber d'office et changeable RDV par RDV, les 4 comptent dans le plafond de 6 RDV à venir ; RDV annulé ou déplacé : règle actuelle des 24 h, la coupe reste sur la carte ; aucune reconduction automatique ; CA compté le jour du paiement dans « Cartes cadeau vendues », avec « dont abonnements », les visites ne recomptent rien ; site d'abord, apps au prochain build.

## 1. Données

- `subscriptions` : `status` `pending` (à régler), `active` (payé), `cancelled`. Une ligne par abonnement. Prix, prix de la visite et nom figés à la création.
- `appointments.subscription_id`, `subscription_visit` (1 à 4) : écrits par le serveur seul. Chaque RDV coûte le prix de la visite (`total_price` = 25 € pour 100 €), prestation au nom de la formule.
- `gift_cards.subscription_id`, `subscription_name`, `subscription_unit_price`, `subscription_visits` : carte créée à la validation, `status = validated`, `amount` = prix, valable un an à partir du paiement, au nom du client (`sender_email`, `recipient_name`).

Le solde reste en euros. Coupes restantes = `floor(solde / prix de la visite)` : `cardVisits(card)` dans l'app.

## 2. Routes

Préfixe `/apps/:appId` (`apiUrl('/subscriptions…')`). Toute erreur porte `{ error, code }`. Tout est dans `src/lib/subscriptions.js` : ne pas appeler ces routes ailleurs.

| Route | Qui | Réponse |
|---|---|---|
| `GET /subscriptions/plans` | public | `{ plans: [{ service_id, name, description, price, unit_price, duration, visits }] }` |
| `GET /subscriptions/mine` | client | `{ subscriptions: [vue] }` |
| `POST /subscriptions` `{ service_id, request_key, slots: [{ employee_id, date, start_time }] × 4 }` | client | `{ subscription: vue, duplicate }` |
| `POST /subscriptions/:id/rebook` `{ employee_id, date, start_time }` | client, le sien | `{ subscription: vue, duplicate }` |
| `GET /subscriptions?status=pending\|active\|cancelled` | admin | `{ subscriptions: [vue équipe] }` (300 au plus) |
| `GET /subscriptions/:id` | admin, barber avec Agenda | `{ subscription: vue équipe }` (`card.code` absent pour un barber) |
| `POST /subscriptions/:id/validate` `{ payment_method: 'cb'\|'especes' }` | admin | `{ subscription: vue équipe, replayed }` |
| `POST /subscriptions/:id/cancel` | admin | `{ subscription, refund_due, cancelled_appointments, replayed }` |

Vue :

```
{ id, status, display_status: pending|active|finished|cancelled, service_id, service_name, service_duration,
  price, unit_price, visits, visits_left, to_rebook, outdated, valid_until, payment_method, created_at,
  validated_at, cancelled_at, client_name,
  card: { id, code?, status, amount, remaining_balance, valid_until } | null,
  appointments: [{ id, date, start_time, end_time, employee_id, employee_name, status, visit, payment_method,
                   paid_by_card, calendar_url (client seulement) }] }  // RDV annulés retirés, absents gardés
```

Vue équipe : en plus `client_phone`, `client_email`, `validated_by`, `cancellation_reason`, sans `calendar_url`.

`to_rebook` = coupes sans RDV ouvert (RDV annulé, client absent) : le client peut en reprendre un.

Codes d'erreur : `disabled` (404), `staff_account` (403), `plan_not_found`, `invalid_slots`, `slots_too_close`, `slots_too_far`, `invalid_payment`, `after_validity` (400), `slot_unavailable` (409, porte `slot`, `date`, `start_time` : l'indice du RDV dans l'ordre chronologique et son créneau), `too_many_upcoming` (409, `upcoming`), `pending_exists` (409), `no_visit_left` (409), `subscription_cancelled` (409), `subscription_not_found` (404), `past_visits_open` (409, annulation d'un abonnement payé avec un RDV passé pas clôturé, porte `past_open`), `visit_already_debited` (409, le client annule ou déplace une coupe déjà débitée), `subscription_card` (409, carte annulée à part), `rate_limited` (429), `server_error` (500). `slot_unavailable` existe aussi en 400 (passé, horaires, fermeture). Message du serveur affiché tel quel (`friendlyError`).

Déjà en place côté serveur :

- `features.subscriptions` : faux sans migration ou avec `SUBSCRIPTIONS=off`. L'app doit marcher avec et sans. Sans lui, une formule du catalogue se réserve comme aujourd'hui.
- RDV d'abonnement déplacé par `reschedule_of` : prix de la visite et rattachement suivent, même si l'app envoie autre chose.
- Staff qui encaisse un RDV d'abonnement non débité (CB, espèces, mixte, « validé ») : 409 `subscription_appointment` avec un message à afficher.
- Carte qui ne correspond pas au RDV : débit refusé 409 `wrong_card` (message à afficher).
- Suppression définitive d'une carte d'abonnement en cours : 409 `subscription_card`.
- Dernier RDV annulé d'un abonnement pas encore réglé : l'abonnement passe `cancelled`.
- Push du client : « Ton abonnement est validé », « Coupe utilisée · Il te reste 3 coupes… », « Plus qu'une coupe », « Abonnement terminé ».

## 3. Écrans du client (planche 1 à 6), vouvoiement

- **Catalogue** (`ServicePicker` sur `/services` et à l'étape 1 de `/booking`) : drapeau vrai et prestation reconnue par `isPlanId` : la ligne affiche `{unit_price} € la coupe` et son action mène à `/abonnement?service=<id>`, jamais à l'ajout au panier de la réservation. La note de la rubrique devient « 4 rendez-vous réservés d'un coup, réglés au salon. ». Drapeau faux : **strictement le comportement d'aujourd'hui**, note comprise.
- `/booking?services=<id de formule>` drapeau vrai : redirection vers `/abonnement?service=<id>`. Un déplacement (`reschedule`) d'un RDV d'abonnement reste sur `/booking` : il ne doit pas proposer de changer de prestation.
- **`/abonnement`** (nouvelle route, connexion requise comme `/booking`, redirige vers `/services` si le drapeau est faux) :
  - sans `service` : choix de la formule (planche 1), avec « Comment ça marche » en 3 lignes ;
  - étape 1 : barber (`BarberStrip`, sans « peu importe ») puis jour (`DayStrip`) et heure (`SlotGroups`) du premier RDV, bouton « Proposer les 3 suivants » ;
  - étape 2 : les 4 RDV proposés (`proposeNextSlots`), « Changer » sur chaque ligne (mêmes composants, barber changeable, écart contrôlé par `slotsIssue` avant envoi). Ligne avec `note: 'time'` : « 17:00 est déjà pris ce jour-là : 17:30 proposé. » ; `note: 'day'` : même idée pour le jour ; `time: null` : ligne à choisir, bouton Continuer inactif ;
  - étape 3 : récapitulatif (planche 4), « À régler au salon 100 € », « Réglez au plus tard à votre premier rendez-vous. Vos créneaux sont réservés dès maintenant. », « Une fois réglé, vos 4 coupes sont créditées sur votre carte. Elles restent valables 1 an. », « Un RDV annulé garde sa coupe sur la carte. Moins de 24 h avant un RDV, appelez le salon au 06 66 08 36 05. » (`SALON_PHONE`), bouton « Réserver mes 4 RDV » ;
  - succès (planche 5) : frise 3 étapes, liste des RDV, « Voir mes rendez-vous », et sur chaque RDV l'ajout au calendrier existant (`calendar_url`, voir `Booking.jsx` et `calendarLinks.js`).
  - Clé d'essai (`newRequestKey`) gardée après une erreur réseau. `slot_unavailable` : retour à l'étape 2, relecture des créneaux, la ligne `slot` est signalée. `too_many_upcoming` et `pending_exists` : message et lien vers Mes rendez-vous. Avant tout état vide : `queryFailed`. Retour du navigateur = étape précédente.
  - Lignes lues comme à la réservation : `Appointment.filter({ date: [...] }, 'start_time', 2000)` filtrées par `blocksClient` (`src/lib/reschedule.js`), `Event.filter({ date: [...], status: 'confirmed' })`, `TimeOff.list('-start_date', 200)`, barbers `fetchPublicBarbers` (`['employees']`). Clés sous `appointments-day`.
- **`/abonnement?reprendre=<id d'abonnement>`** : un seul RDV à choisir (barber, jour, heure), `rebookVisit`, succès puis retour à la carte.
- **`/gift-cards`** : une carte avec `subscription_id` (planche 6) : « Abonnement » à la place de « Carte Cadeau », `{left} coupes` en grand avec une barre de `total` segments, nom de la formule, au verso QR identique, « Solde 100 € », « 25 € par coupe ». Boutons Wallet inchangés. Si l'abonnement a `to_rebook > 0` : bouton « Reprendre un RDV » vers `/abonnement?reprendre=<id>`. Abonnement `pending` : une carte « À régler au salon » avec montant et RDV, sans QR. Lecture `fetchMySubscriptions` seulement avec le drapeau.
- **`/appointments`** : un RDV avec `subscription_visit` : « Coupe 2 sur 4 » à la place du nom de la formule, jamais le prix de la formule. Annuler et Déplacer restent ceux d'aujourd'hui.

## 4. Écrans du salon (planche 7 à 12), vouvoiement, admin seul

- **`/admin/subscriptions`** (menu `AdminLayout` adminOnly, près de « Cartes Cadeau », route dans `App.jsx`, lazy comme les autres) : onglets À valider / En cours / Terminés (terminés + annulés). Ligne : client, formule, barber, montant, premier RDV ; pastille orange si le premier RDV est dans moins de 48 h, rouge « Pas réglé » si un RDV est déjà passé. Pensé pour l'ordinateur : grille sur grand écran, utilisable à la souris.
- **Valider** (fenêtre, planche 8) : client, téléphone, formule, 4 RDV, montant, CB ou Espèces (aucun choix par défaut, comme `ValidateModal` des cartes), « Encaissé : créditer les 4 coupes », puis succès avec le code de la carte et « Ouvrir la carte ». « Annuler l'abonnement et ses 4 RDV » : confirmation en deux temps ; abonnement payé : montant `refund_due` à rembourser à la main, annoncé avant et après.
- **Tableau de bord** (planche 12) : « À faire » → ligne « N abonnements à valider » avec le montant, vers `/admin/subscriptions`, admin seulement, avec `features.subscriptions`. « Ventes » → « Cartes cadeau vendues » : précision « dont abonnements X € » (aussi dans « Mois passés »). `SalesChannels` : panneau Cartes cadeau, ligne « Abonnements : N en cours, M coupes à faire, X € à honorer », calculée sur les cartes lues. Règles dans `salesChannels.js`, jamais dans un bloc.
- **`dashboardStats.js`** : un RDV d'abonnement non encaissé ne compte ni dans « à venir », ni dans « à clôturer » en euros, ni dans le manque à gagner d'un absent (il est déjà payé ou se paiera à la vente) : montant 0 pour ces calculs, le nombre reste. Encaissé : rien à changer (`outsideGift` vaut déjà 0, la part carte est à côté). Test `test-t7-3-dashboard.js` du serveur : ne pas toucher au bloc `<calculs-purs>`.
- **Agenda** (fiche d'un RDV) : RDV avec `subscription_id` : pastille « Abo 1/4 » sur la carte du RDV, dans la fiche « Abonnement · Coupe 1 sur 4 », état lu par `fetchSubscription` : « Payé · 3 coupes restantes » ou « Pas encore réglé : 100 € ». Admin : « Scanner le QR de la carte » (vers `/admin/gift-cards?scan=<code>&apt=<id>` après lecture, ou le scanner existant) et, pas réglé, « Encaisser l'abonnement » (même fenêtre que Valider). Barber : pas de boutons d'encaissement, le mot « À débiter sur l'ordinateur du salon ». Le choix CB / espèces de l'encaissement est retiré tant que la coupe n'est pas débitée. Absent : aucune case, la coupe reste (décision du 4 nov. 2026) ; le message le dit : « La coupe reste sur la carte. »
- **Débit** (`GiftCardDebitPanel`, planche 10 et 11) : carte d'abonnement : « 3 coupes restantes », mode « RDV du jour » par défaut, ses RDV en tête avec « Coupe 1 sur 4 » et le RDV à l'heure présélectionné (`?apt=` prime), bouton « Débiter 1 coupe · 25 € » (`appointmentDue` du RDV), « Après ce débit : 2 coupes restantes, solde 50 € », « Clôturer le RDV » coché comme aujourd'hui. Les autres modes restent disponibles. RDV d'abonnement dans la liste d'une autre carte : retiré (le serveur refuserait). Écran de succès : « 1 coupe débitée », coupes restantes, prochain RDV, « Annuler » 10 s comme aujourd'hui. Carte d'abonnement dans la liste : pastille « Abonnement ».
- **`GiftCardDeletePanel`** : carte d'un abonnement en cours : le message du serveur, lien vers Abonnements.
- Le scanner QR et « Saisir le code » doivent marcher sur l'ordinateur : c'est le poste de scan du salon.

## 5. Partage du travail

Réservés au chef : `CLAUDE.md`, `src/App.jsx`, `src/index.css`, `src/lib/subscriptions.js`, `src/lib/slots.js`, `e2e/support/mockApi.js`, `e2e/support/fauxAbonnements.js`, tout le dépôt serveur. Si l'un de ces fichiers doit changer, le dire dans le compte rendu.
