# Abonnements au mois

> Construits le 4 nov. 2026, d'après la planche https://claude.ai/artifact/JeVmvZeWeZBQxiSGKYr3nZ validée avec les réponses du propriétaire. Contrat : `abonnements-contrat.md`.

## Le parcours

1. Le client choisit une formule (`4 coupes classiques` 100 €, `4 coupes premium` 120 €, `4 coupes + dégradé barbe` 140 €, `4 coupes + barbe premium` 200 €) et ses 4 RDV. Les créneaux sont bloqués tout de suite.
2. Il règle au salon, au plus tard à son premier RDV. Ni paiement en ligne ni annulation pour défaut de paiement.
3. L'admin valide sur l'ordinateur du salon (`/admin/subscriptions`, CB ou espèces) : une carte de 4 coupes naît, valable un an.
4. À chaque visite, le salon scanne le QR (`/admin/gift-cards`), « Débiter 1 coupe · 25 € », le RDV est clôturé.
5. Quand il reste une coupe, le client reçoit un push pour reprendre un abonnement. Aucune reconduction automatique.

## Où est quoi

- **Serveur** : `lib/subscriptions.js` (règles, transactions, vues, notifications), `routes/subscriptions.js` (routes et quotas). Migration dans le bloc d'auto-migration de `server.js`, `subscriptions.state.ready` faux tant qu'elle n'a pas réussi.
- **Réservation** : `claimSlot` de `routes/entities.js` est l'enregistrement sous verrou de `claimLastMinute`, appelable dans une transaction déjà ouverte : les 4 RDV passent ensemble ou aucun.
- **Client** : `src/lib/subscriptions.js`, `src/pages/Abonnement.jsx`, `src/components/abonnement/`, plus `GiftCards.jsx`, `Appointments.jsx`, `Booking.jsx`, `ServicePicker.jsx`.
- **Salon** : `src/pages/admin/AdminSubscriptions.jsx`, `src/components/subscriptions-admin/`, `GiftCardDebitPanel.jsx`, `AdminGiftCards.jsx`, `AppointmentDetailModal.jsx`, `AppointmentEditForm.jsx`, blocs du tableau de bord.
- **Tests** : `test/test-subscriptions.js` (serveur), `e2e/abonnement-client.spec.js`, `e2e/abonnement-salon.spec.js`, faux serveur `e2e/support/fauxAbonnements.js`.

## Pourquoi le solde reste en euros

La carte d'abonnement est une carte cadeau avec `subscription_*` en plus. Débit, annulation sous 24 h, historique, Wallet et CA restent ceux des cartes. L'app affiche des coupes : `floor(solde / prix de la visite)`.

Conséquence au tableau de bord : la vente compte le jour du paiement dans « Cartes cadeau vendues » (« dont abonnements »), le RDV réglé compte 0 € avec sa part carte rappelée à côté. Un RDV d'abonnement pas encore réglé compte 0 € dans « à venir », « à clôturer » et le manque à gagner d'un absent : il est déjà payé ou se paiera à la vente.

## Décisions de construction

- Une seule ligne pour reconnaître une formule : nom qui commence par « 4 coupes » (`isPlanName`, repris par `isVisitLine` de l'app). Une autre formule (« 2 coupes ») reste une prestation ordinaire.
- Prix d'une visite arrondi vers le bas (`unitCentsOf`) : 4 visites ne dépassent jamais le prix payé.
- `to_rebook` compte aussi les RDV passés pas encore clôturés comme ouverts : sinon le client reprendrait une coupe que le salon débitera ensuite.
- Un seul abonnement à régler à la fois par compte (`pending_exists`). Les 4 RDV comptent dans le plafond de 6 (`too_many_upcoming`).
- RDV d'abonnement, staff : ni CB, ni espèces, ni « validé » tant que la coupe n'est pas débitée (`assertClosable`) ; sa coupe ne se retire pas et garde son prix (`assertKeepsVisit`), une prestation peut s'y ajouter. Le débit paie alors une coupe, le reste s'encaisse dans l'agenda.
- Seule la carte de l'abonnement règle son RDV (`assertRightCard`, code `wrong_card`).
- Déplacement par le client (`reschedule_of`) : prestation, prix de la visite et rattachement suivent, quoi que l'app envoie (apps publiées comprises).
- Le dernier RDV annulé d'un abonnement pas encore réglé le ferme (`closeIfEmpty`).
- Annulation par l'admin : RDV pas encore réglés annulés ; carte annulée ; la vente reste comptée, `refund_due` dit ce qui reste à rembourser à la main, et le redit à un renvoi. Abonnement payé avec un RDV passé pas clôturé : refus 409 `past_visits_open`, le salon le scanne ou le marque absent d'abord (sinon montant trop élevé et visite perdue pour la carte Gang). Abonnement pas réglé : ses RDV passés s'annulent aussi.
- La carte d'un abonnement en cours ne s'annule jamais à part (`subscription_card`) : ses RDV ne s'encaisseraient plus.
- Plus aucune coupe sur la carte (débit libre passé, RDV rétabli), abonnement annulé ou `SUBSCRIPTIONS=off` : le RDV s'encaisse normalement. Sans cela il restait impossible à encaisser.
- Rétablir un RDV annulé ou absent : refus si toutes les coupes ont déjà un RDV (`no_visit_left`) ou si l'abonnement est annulé (`subscription_cancelled`).
- Coupe déjà débitée sans clôture : le client ne peut plus annuler ni déplacer ce RDV (`visit_already_debited`) ; sa part resterait sur l'ancienne ligne.
- Déplacement au-delà de `valid_until` : refusé (`after_validity`), comme la reprise.
- Compte supprimé : RDV à venir de ses abonnements annulés, nom retiré de la carte et des notes de ses débits, plus rien à reprogrammer.
- Liens des pushs vers `/gift-cards` et `/admin` : les apps publiées n'ont ni `/abonnement` ni `/admin/subscriptions` (« Page introuvable »).
- Panier moyen hors RDV d'abonnement : ils le faisaient tomber vers 0 ; le nombre de RDV encaissés les garde.
- Débit d'un RDV d'un autre jour : date affichée et deux gestes ; RDV du jour : un geste, annulation sous 10 s.
- Drapeau illisible (panne, coupure) : jamais lu comme « faux », sinon l'écran proposait une seule visite au prix de l'abonnement.
- Suppression définitive d'une carte d'abonnement en cours refusée (`subscription_card`).
- Formules écartées de « Les plus demandées » : 4 RDV pour une seule décision faussaient le classement.
- Lecture de colonnes nouvelles seulement après la migration (`state.ready`) : `chargeAppointment`, `visitOfAppointment`, `purgeClient`. Une migration en échec ne doit bloquer ni un débit, ni un déplacement, ni une suppression de compte.

## Vérifié sur un vrai PostgreSQL

Le 4 nov. 2026, schéma de production copié (`pg_dump --schema-only`) dans un PostgreSQL local vide : parcours complet par `lib/subscriptions.js`, deux clients en même temps sur les mêmes créneaux (un seul gagne, aucun RDV du perdant), plafonds, validation rejouée, débit, absent, reprise, déplacement, annulation, compte supprimé. Ces essais ont trouvé qu'un renvoi de la reprise d'un RDV se heurtait à son propre créneau.

## Essayé avec le vrai serveur

Le même jour, deux passages complets : vrai `server.js`, base locale au schéma de production (`TZ=UTC`, comme Heroku), le site piloté par Playwright, chaque requête vers l'API redirigée vers le serveur local. Client à 390 px, salon à 1366 px, base contrôlée à chaque étape, chiffres du tableau de bord refaits à la main.

Le premier passage a trouvé un défaut invisible pour tous les tests : `subscriptionsLib.detectSchema(pool)` au début du bloc `app.listen`, où `const pool` n'est déclaré que plus bas : une `ReferenceError` arrêtait migrations, jobs et WebSocket pendant que l'API répondait encore 200. **Après tout changement de `server.js` : un vrai démarrage, `DB migration check done` dans les journaux.** Le second passage, sur le code final, n'a trouvé ni défaut bloquant ni défaut d'argent.

## Limites connues

- Le pass Apple Wallet affiche le solde en euros et le libellé « Carte cadeau ».
- Une formule retirée du catalogue : un RDV déjà pris ne se déplace plus en ligne (le client appelle le salon).
- Apps d'avant la 1.0.13 (iOS) et la 1.0.21 (Android), soumises le 5 nov. 2026 : une formule s'y réserve encore comme un seul RDV au prix entier.
- Vente d'un abonnement payé puis annulé : gardée dans le CA, même règle que les cartes cadeau ; le remboursement se fait à la main et n'y est pas retiré.
- Détails laissés : le filtre « Abonnement à encaisser » de l'Activité clients compte aussi les abonnements réglés ; un RDV repris moins de 5 min après la création s'ajoute à la ligne ; le fichier du calendrier dit le nom de la formule, pas « Coupe 2 sur 4 » ; un débit par l'API sur un RDV dont la coupe est déjà débitée reste accepté (l'écran l'empêche).
