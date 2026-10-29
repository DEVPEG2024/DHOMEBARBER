# Restes à faire, limites connues, points non corrigés

> Rassemblé le 20 oct. 2026 depuis l'ancien `CLAUDE.md` (commit 7738a11) : « Restes connus », « Reste à faire », « Restent ouverts », « Non corrigé, et pourquoi », « Limites », « à vérifier ». Dédoublonné : un point signalé par plusieurs tours n'apparaît qu'une fois, avec la date de son premier signalement et la source (document de `docs/` où lire le contexte). Les points réglés depuis sont listés à la fin, pour ne pas les rouvrir.
>
> Quand un point est réglé : le déplacer dans « Réglés depuis » avec la date et la version. Quand un tour en découvre un nouveau : l'ajouter ici (une ligne), pas dans `CLAUDE.md` sauf s'il entre dans les plus importants.

## À faire dès que possible (actions datées)

- **Ajouter au calendrier dans les apps** (21 oct. 2026) : « Calendrier Apple » (iPhone) et « Autre agenda » (Android) n'arrivent qu'avec le build iOS 16 / code Android 17. L'essayer sur un vrai iPhone et un vrai Android avec ce build : tap → Safari → fiche « Ajouter » ; Android → fichier téléchargé puis ouvert par l'agenda. Seul Safari a été vérifié (simulateur iPhone), pas le tap dans l'app native. Source : `docs/fonctions/reservation-rendez-vous.md`.

- ~~**Contenus de démonstration** du compte `reviewer@dhomebarber.fr`~~ : **fait le 29 oct. 2026** (après la mise en ligne d’iOS 1.0.9 / Android 1.0.17). Rien à supprimer : 0 avis, 0 publication, 0 commentaire, 0 réaction pour `reviewer@` et `snap.review@` (aucun compte `qa.*`) ; ses 3 RDV des 20, 21 et 22 oct. étaient déjà `cancelled`. Lecture seule, aucune écriture.
- **Activité clients** : retirer la seconde requête des annulations sans auteur (`cancelled_by` absent) vers le **27 oct. 2026** ; elle ne sert qu'aux annulations antérieures au tour 5. Source : tour 5 du 18 oct. 2026, `docs/historique/2026-10-18-verification-tours-5-a-7.md`.
- **Compte barber « Sacha »** (fiche barber supprimée) : il a perdu l'accès au tour 3, mais le compte et son abonnement push restent. À supprimer par l'admin dans Comptes barbers (écriture en production, jamais par une session d'audit). Source : tour 3 du 18 oct. 2026.
- **Barbers non abonnés aux notifications** (19 oct. 2026) : Dom (compte « DhomeBarber ») et Romain (« DimiShop ») sans aucun abonnement, Kevin un abonnement web seulement ; leurs pushs « Nouveau RDV » ne partent vers aucun téléphone. Leur faire mettre l'app à jour et accepter les notifications. Source : `docs/fonctions/notifications-jobs.md`.
- **Snap** : revue approuvée (vu le 24 sept. 2026). Reste : *Push to Production* dans le portail Camera Kit, puis coller le jeton de production dans Admin → Filtres Snap → Camera Kit. Source : `docs/fonctions/snap-essayage.md`.
- **RDV de production signalés au salon le 18 oct. 2026** (aucune écriture faite) : absence du 14 oct. 10:00 avec Kevin probablement à requalifier (client venu à 10:30). Source : `docs/fonctions/reservation-rendez-vous.md`.

- **Audit de la réservation du 24 oct. 2026, suites** (source : `docs/fonctions/reservation-rendez-vous.md`, « Audit de la réservation sur le site ») :
  - à voir avec le propriétaire : heures du jour sous la ligne de flottaison à l'arrivée sur l'écran Créneau ; barber habituel choisi d'office même complet ce jour-là ;
  - données : « Huile de barbe » existe deux fois dans les produits (deux fois dans « Ajouter un produit » de la réservation) ; Denis n'est plus parmi les barbers réservables (24 oct.) ;
  - afficher la mesure `booking_error` dans Admin → Trafic (aujourd'hui lisible seulement en base, `analytics_events`) ;
  - journaux Heroku qui écrivent encore un email : `jobs/birthdayReminder.js:105`, `routes/auth.js` (803, 816, 823, 1203), `routes/push.js:178`, `routes/aiWriter.js:30`, `routes/hairUltra.js:44` ;
  - apps antérieures au build 12 (déplacement en deux temps, sans `reschedule_of`) : un déplacement vers exactement son créneau dans les 10 min de la réservation peut encore perdre le RDV (renvoi rendu tel quel, puis annulé par le `PUT` de l'app) ;
  - bouton de fermeture des fenêtres nommé « Close » pour les lecteurs d'écran (`src/components/ui/dialog.jsx:64`) : « Fermer » demanderait d'adapter les tests qui cherchent `Close` ;
  - tests sous WebKit instables avec l'horloge simulée (`page.clock.install` gèle les animations de sortie des étapes) : nos tests restent en Chromium ;
  - les créneaux proposés par « Déplacer » (Mes rendez-vous) partent d'aujourd'hui : pour reculer un RDV lointain, passer par « Choisir une autre date » ; l'événement de calendrier ne dit pas « Pour Léo ».

## Échéances

- **Certificat Pass Type ID** `pass.fr.dhomebarber.giftcard` valable jusqu'au **16 nov. 2027** : le renouveler avant (passé cette date, le serveur éteint seul `features.appleWallet`). Source : `docs/fonctions/cartes-cadeau-wallet.md`.
- **Crédit Anthropic** (assistant IA des notifications) : prépayé (2,92 $ au 7 oct. 2026), rechargement automatique désactivé : recharger dans Billing quand l'admin voit « Crédit de l'assistant IA épuisé ». Source : `docs/fonctions/entites-api-auth.md` (endpoint `/ai/notification-draft`).

## Stores et apps natives

- **Android 1.0.14 (code 15)** en ligne depuis le 20 oct. 2026 vers 4 h **sans le correctif du clavier** : la demande de privatisation plein écran peut s'écraser clavier ouvert jusqu'à la publication de la 1.0.15 (code 16, en examen). Source : `docs/historique/stores.md`.
- **Anciennes apps encore installées** : les apps d'avant le build 12 / code 12 n'envoient pas `reschedule_of` (pas de lien `rescheduled_to`, CA Last Minute 0 pour leurs déplacements) ; celles d'avant le 14 oct. expirent un Last Minute sans motif (un job serveur d'expiration réglerait le cas, non fait). Sources : tours 6, 8 et 9 du 18 oct. 2026.
- **Page publique `delete-account.html`** alignée le 18 oct. (tour 2) : vérifier que la section « Sécurité des données » du Play Console décrit bien la même chose (menu « Paramètres », `contact@dhomebarber.fr`, contenus du fil supprimés). Source : tour 2.
- **Galerie des réalisations** : ne la mentionner dans les fiches des stores qu'une fois remplie (refus Google du 10 sept. 2026 pour une promesse absente). Source : `docs/fonctions/barbers.md`.
- **Last Minute sur l’accueil, looks de la galerie, Ajouter au calendrier** (20–21 oct. 2026) : en ligne sur dhomebarber.fr, dans les apps avec iOS 1.0.8 (build 16) / Android 1.0.16 (code 17), en examen depuis le 21 oct. ; les apps plus anciennes gardent l’ancien parcours de la galerie (une prestation par photo), le serveur garde les looks entiers. Sources : `docs/fonctions/interface-accueil-animations.md`, `barbers.md`, `reservation-rendez-vous.md`.
- **Réservation pour un proche** (24 oct. 2026) : en ligne sur dhomebarber.fr ; dans les apps avec iOS build 17 / Android code 18 (envoyées le 26 oct. 2026). Les apps publiées avant réservent comme avant (au nom du parent, sans prénom) ; un déplacement depuis elles garde le proche (serveur). Données des stores : le prénom d'un proche entre dans la donnée « Nom » déjà déclarée aux deux stores (vérifié dans l'historique le 26 oct. ; étiquettes non relues dans les consoles, sessions expirées) ; `public/privacy.html` mis à jour le 24 oct. Limites assumées : relance « Ça fait un moment » par compte (la visite d'un fils remet à zéro celle du père), pas de réservation groupée en un seul passage ; une app antérieure au build 12 qui déplace le RDV d'un proche (création sans `reschedule_of`) le remet au nom du parent. Source : `docs/fonctions/reservation-rendez-vous.md`.
- **Encaissement « CB + Espèces »** (23 oct. 2026) : en ligne sur dhomebarber.fr ; dans les apps avec iOS build 17 / Android code 18. Avant, le tableau de bord des apps compte ces RDV dans le CA mais ni en CB ni en Espèces, et la fiche les affiche « Espèces » : encaisser et lire les chiffres sur le site en attendant. Source : `docs/fonctions/agenda-menage.md`.
- **Last Minute automatiques dans le fil** (22 oct. 2026) : la carte orange (Réserver, Envoyer à un ami) dans le fil arrive dans les apps avec iOS build 17 / Android code 18 ; avant, les apps montrent le texte de la publication. Au prochain envoi, décrire dans les notes de revue (2.3.1(a)) les Last Minute automatiques et leur publication par le salon dans le fil. Source : `docs/fonctions/reservation-rendez-vous.md`.
- **iPhone Duo (pliable d’Apple, en vente le 23 oct. 2026)** : sur l’écran intérieur déplié, une app compilée avec un kit antérieur à iOS 27.1 s’affiche réduite au centre avec des bandes noires ; le build 16 (Xcode 26.3, kit iOS 26.2) est dans ce cas. La mise en page web est prête (vérifiée le 22 oct. 2026 à 640 × 904 et 904 × 640 avec l’API simulée : accueil, réservation, fil, profil, profil barber, rendez-vous, agenda et tableau de bord admin, aucun débordement, colonne centrée). Le build 17 (envoyé le 26 oct. 2026) est encore compilé avec Xcode 26.3 (kit iOS 26.2) : le Mac était toujours en macOS 26.5.1, et la mise à jour redémarre le Mac. À faire : macOS ≥ 26.6 (Tahoe 26.7.1 proposé), puis **Xcode 27.1** (App Store, sorti le 15 oct. 2026), puis un iOS build 18 compilé avec le kit iOS 27.1, vérifié sur le simulateur iPhone Duo (plié, déplié, clavier, zone de la charnière à demi plié), envoyé après la revue du build 17. Android : pliables déjà gérés (orientation libre, `configChanges` de taille d’écran).
- **Plugin natif Snap** (SDK iOS / Android via un plugin Capacitor) : non fait, seulement si les performances de la WebView ne suffisent pas. Source : `docs/fonctions/snap-essayage.md`.

## Contrôles jamais faits sur un vrai appareil ou dans un navigateur

- Clavier sur iPad Air 11-inch (M3) pour le composeur du fil, le signalement et Bugs et suggestions ; barre d'état Android API 35 / 36 (tour 6).
- Clavier sur iPad Air 11-inch (M3) pour le build 17 (26 oct. 2026) : touchers non refaits (simulateur sur un autre bureau que celui affiché, voir `stores.md`) ; code du clavier inchangé depuis le build 16. À refaire au build 18, avec en plus le prénom du proche (« Pour qui ? » → « Un proche », compte de démonstration, sans confirmer la réservation).
- Panneau de débit des cartes cadeau, fenêtre Last Minute, `NotificationPrompt`, toast « Activer » du textile, barre d'état sur un vrai iPhone (tour 5).
- Écrans admin modifiés aux tours 7, 8 et 9 : aucun passage Playwright du chef (build, ESLint et tests serveur seulement).
- Privatiser le salon (refonte du 19 oct.) : vrais téléphones (clavier, retour Android, lecteurs d'écran).
- Wallet : aperçu du pass depuis l'app native sur un vrai iPhone (sinon plugin `PKAddPassesViewController`) ; mise à jour réelle d'un pass après un débit (aucun appareil enregistré au 19 oct. au soir). Les passes ajoutés avant le 19 oct. 2026 ne se mettront jamais à jour : les retirer de Wallet et les rajouter depuis l'app (2 cartes validées au 19 oct.).
- Volume réel de la musique d'ambiance sur iPhone (`AudioContext` + `GainNode`, tour 6).
- Rien d'essayé sur un vrai iPhone pour le pass Apple au 17 oct. (aucune carte en base alors).

## Serveur, données, sécurité

- **Google Wallet** : en attente de l'accès en publication de l'émetteur ; poser `GOOGLE_WALLET_ISSUER_ID` + `GOOGLE_WALLET_SERVICE_ACCOUNT` seulement après. Avant la production, remplacer les logos simplifiés par les **badges officiels** Apple / Google (commentaire « PRODUCTION » dans `WalletButtons.jsx`). `validTimeInterval` de l'objet Google inchangé (tour 5).
- **Achats hors RDV payés par carte cadeau** (commandes, précommandes, privatisations) : pas de colonne `gift_card_amount` ni de rattachement, seul un avertissement est en place (tour 7).
- **Contrôle du prix envoyé** réservé aux commandes de la Boutique avec `client_ref` (sinon `test-orders.js`, qui envoie exprès un faux prix, est à réécrire) ; garde-fou serveur des doubles commandes au-delà de 60 s non ajouté (bloquerait une seconde commande voulue). Tours 6 et 7.
- **Last Minute** : anti-doublon par compte (et par barber) et `already` compté dans le quota de 6 / h — choix maintenu (course entre deux comptes du staff seulement) ; colonne `lm_announced_at` pour un vrai anti-doublon durable non faite ; contrôle privatisation dans `lib/lastMinutePush.js` non fait (le contrôle à la création suffit) ; un Last Minute « non pris » puis réservé reste en `no_show` à côté du RDV (non compté dans « Convertis »). Tours 4, 5, 9 et 15 oct.
- **Médias** : 6 lignes `media` gardent l'email de comptes supprimés avant le tour 2 (nettoyage = écriture en production) ; alerte à 60 % de `pg_database_size` et baisse des plafonds d'envoi par compte non faites (`test-t4-5-upload-quota.js` les fige) ; relever `MEDIA_TABLE_MAX_BYTES` si la galerie grossit (base de 1 Go au plus).
- **Galerie des réalisations** : pas de contrôle 409 côté serveur (fenêtre d'environ 1 s entre relecture et écriture). Tour 4.
- **Textile** : création d'une réservation par le staff sans contrôle du stock (tour 2) ; une précommande dont la réponse échoue **après** la validation garde sa clé « en cours » 10 min (409 au nouvel essai, très rare, tour 4).
- **Sessions** : révocation `did:` immédiate sur le dyno qui reçoit la déconnexion, au plus 30 s ailleurs (tour 3).
- **Push** : liste blanche stricte des services de push seulement à l'abonnement (à l'envoi : http / IP / noms internes bloqués ; la liste stricte cassait `test-last-minute-push.js`). Tour 2. Les envois réussis ne sont pas journalisés.
- **Déverrouillage d'un compte client** par l'admin : route non créée (« Mot de passe oublié » suffit). Tour 7.
- **Inscriptions** : au-delà du seuil de 500 en 24 h, seul le journal le dit (pas d'alerte admin). Tour 9.
- **Mot de passe oublié** : pas de limiteur par email ni d'alerte admin (options du tour 5).
- **À confirmer côté serveur** (revue du 14 oct. 2026, en partie traité depuis) : `User.delete` sans cascade sur les RDV, `employee_name` accepté sur un avis, `PostLike.update` par l'auteur, `/push/unsubscribe` par endpoint.
- **Recherche** : pas d'opérateur `LIKE` dans `buildConditions` (la recherche de la page Clients complète la liste côté app) ; Stats et Clients limités à 2000 RDV avec mention à l'écran (5 sept. puis 14 oct. 2026).
- **Pagination des avis** côté serveur : non faite (tour 8).

## App : options et finitions non faites

- Filtre des contenus : faux positifs connus « Mon vieux téléphone va crever », « Kevin va crever de jalousie », « Mon grand-père va crever » ; lettres espacées et `1 → l` non gérés (faux positifs) ; « n3gr0 » seul passe (tour 2). « pd » seul reste refusé (choix du propriétaire).
- Débordements à 320 px signalés le 7 oct. : Entretien, barre de l'agenda et horaires de Mes paramètres corrigés au tour 5 ; restent à revoir Comptes barbers, Bons plans, Agenda IA, horaires des Paramètres du salon.
- Catégories des prestations toutes vides en base (32 prestations, 7 oct. ; toujours vrai le 19 oct.) : la page Prestations déduit des rubriques du nom ; de vraies `ServiceCategory` primeraient dès qu'elles existent.
- `exportCSV.js` (export des prestations) toujours avec point décimal (tour 4).
- « Stats à venir » reste sur la carte FUT quand les compétences ne se chargent pas (LoadError affiché dessous, tour 2).
- L'app relit le RDV après l'annulation d'un débit au lieu d'utiliser `appointment` renvoyé par le serveur (tour 3).
- « Me prévenir » (textile) abandonne à 8 s sur iPhone pendant l'attente de 10 s de l'enregistrement natif (aucune fausse réussite, tour 7).
- Options non faites : refus serveur d'une validation sans prestation, mention dans Clients / Notifications, classement sur `/admin/feed` (tour 3) ; « N places prises » sous la capacité, pastille « Annulé » dans `ActivityRow` / `ActivityBell`, « Rouvrir le RDV » dans l'historique des débits (tour 5) ; email de rappel « expire bientôt » du textile, phrase serveur sur le renvoi Last Minute, repli de `BarberSettings.jsx` sur les horaires du salon, confort de `Notifications.jsx` pour les clients supprimés (tour 6) ; flèches d'ordre des barbers dans Équipe, « avec <barber> » retiré des rappels d'un barber inactif, message au client retiré d'un événement (tour 7) ; modèles « Promotion » / « Fermeture » de Notifications en repères à compléter, signalement des tâches de ménage d'un barber inactif dans `Cleaning.jsx` (tour 8) ; avertissement dans `DropDialog` quand un autre drop est ouvert, jauges d'invités au-delà de 2000 invitations, détail du solde des cartes cadeau avant suppression de compte, « Rendre sur la carte » sur une carte annulée (tour 9).
- `BackgroundMusic.jsx` : code mort à supprimer (tour 6).
- Last Minute de l'accueil (20 oct. 2026) : la carte arrive après le reste de l'accueil (décalage CLS 0,09 mesuré avec une réponse à 1,5 s ; lancer la lecture plus tôt le réduirait) ; sur iOS Safari, sans ancrage du défilement, une carte qui apparaît en tête pendant que le client a défilé plus bas peut décaler la page. Source : `docs/fonctions/interface-accueil-animations.md`.
- Carte Gang, niveau choisi par l'admin (21 oct. 2026) : impossible pour un client sans visite terminée (409 `no_card`, pas de carte). Un habitué d'avant l'app reçoit d'abord sa carte par « Ajouter un client » dans l'agenda (prestation déjà terminée), puis l'admin choisit son niveau. Aucune notification au client quand sa carte monte (révélation à la prochaine ouverture de l'app seulement). Source : `docs/fonctions/carte-gang.md`.
- Code mort : l'option `suggestionsOnly` de `ServicePicker.jsx` n'a plus d'appelant depuis la suppression de `GalleryQuickStep.jsx` (looks, 21 oct. 2026). À retirer.
- Tests de bout en bout : à étendre à la Boutique, Privatiser le salon, tableau de bord (profil barber : looks couverts depuis le 21 oct. 2026) ; le chemin animé (animations non réduites) n'est pas couvert.
- Activité clients v1 (13 oct.) : une action dont la ligne a été supprimée disparaît du fil, un RDV saisi par le staff avec l'email d'un client apparaît comme une action client, lu / non lu propre au navigateur, ~14 requêtes / min par onglet admin. Réglé par la table d'audit `admin_activity` (v2 de `docs/backend-admin-alerts.md`, § 5), non faite.

## Dépendances

- `node-forge` (via `passkit-generator`) : aucun correctif publié, 2 alertes « high » de `npm audit --omit=dev` (17 oct. et tour 2).
- Alertes `npm audit` de `@capacitor/cli` / `@capacitor/assets` : outils de développement, non embarqués.
- Frontend : `quill` / `react-quill` et `react-router` restent en majeures non montées (5 sept. 2026).

## À décider avec le salon ou le propriétaire

- Export comptable des cartes cadeau : part carte retirée (choix fait au tour 7), **format à voir plus tard** (propriétaire, 21 oct. 2026), à confirmer aussi avec le comptable du salon.
- Fenêtre « Publier aussi sur Google » proposée après tout avis (Google interdit la sollicitation sélective) : à confirmer avec le salon (tour 6).
- Assouplir le délai de 24 h (déplacer dans les 24 h vers un créneau plus tard le même jour) : proposé, non fait, refusé sans accord du propriétaire (18 oct.).

## Snap (filtres) : état technique

- La lentille « DHB Couleur » est un projet vide (aucun effet visible) : à refaire dans Lens Studio (script de lecture des `launchParams`, puis vendor data `dhb`), voir `docs/lens-studio-couleur-cheveux.md`.
- Publication bloquée depuis le 4 sept. 2026 (Lens Studio répond `success`, rien n'arrive dans My Lenses) : probablement une limite du compte en staging, à retenter après le passage en production. La version avec barbe est prête dans `~/Documents/DHB Lenses/HairColor/`.
- Vidéo de démonstration à refilmer si Snap demande à voir l'effet (la lentille n'en a aucun et le sujet porte une casquette).

## Réglés depuis (pour mémoire, ne pas rouvrir)

- Remontée des erreurs de l’app déclarée aux deux stores le 21 oct. 2026 avant l’envoi du build 16 / code 17 (App Store Données de plantage ; Play Journaux de plantage). Voir `docs/historique/stores.md`.
- Décisions du propriétaire du 21 oct. 2026 : **pas de vérification de l'email à l'inscription** (l'email de bienvenue part toujours ; le risque de l'historique d'un compte supprimé était déjà fermé, tours 6 et 8) ; **push à l'acheteur après chaque débit de carte cadeau : oui** (`GIFT_CARD_DEBIT_NOTIFY_OWNER=true` sur Heroku ; la valeur l'était déjà depuis le 17 oct., v116, alors que la doc la disait coupée : un débit de 20 € le 19 oct. a donc pu être notifié).

- Relevés par les tests de bout en bout le 20 oct. 2026, corrigés le même jour : fenêtre du gyroscope montrée sur Chrome ordinateur et Android web (Chromium expose `requestPermission` : `isAppleTouchDevice` dans `src/lib/motion.js`, tests dans les deux sens) ; `expired=1` jamais posé dans l'adresse à l'expiration de la session (état `sessionExpired` d'AuthContext lu par RequireAuth / RequireAdmin, test resserré) ; titre de la réservation resté sur « Vérifiez et confirmez » après un 409 sous forte charge (`AnimatePresence mode="wait"` retiré du titre, 40 répétitions du test 409 en parallèle sans échec).

- Ramasse-miettes des médias (restes du 5 sept.) : `jobs/mediaCleanup.js`, dimanche 03h30 (v81), puis chaque nuit pour les comptes clients supprimés (tour 9).
- `POST /cleaning/notify-today` en UTC : corrigé le 5 sept. 2026 (`ac.parisToday()`).
- Pass Wallet mis à jour à distance (tours 4 et 5) : fait le 19 oct. 2026 (service web PassKit, backend v139 / v140).
- Objet Google Wallet d'une carte supprimée (tour 8) : passé `INACTIVE` à 0 au tour 9.
- Ramasse-miettes plus rapide des photos des clients (tour 4) : passage chaque nuit (tour 9).
- Le staff modifiait les articles d'une commande sans ajuster le stock (audit du 16 oct.) : le staff ne modifie plus que `status`, `cancellation_reason`, `notes` (tour 5).
- Recherche du Last Minute de `AppointmentDetailModal` qui chargeait tous les comptes (audit du 16 oct.) : `ClientAccountPicker` (tour 6).
- CA Last Minute d'un créneau déplacé (tour 7) : `rescheduled_to` et `lastMinuteRevenueOf` (tour 8).
- Étiquette App Store et Sécurité des données du Play Console alignées sur la politique de confidentialité (tour 5) : faites le 18 oct. 2026 au soir.
- Langue française et `allowBackup="false"` des projets natifs (tour 8) : contrôlés et livrés avec les builds 12 à 15.
- Aucun iPhone ne pouvait s'abonner aux notifications (17 oct.) : réglé avec iOS 1.0.6 build 13 (3 abonnements iOS le 19 oct.).
- Carte Gang, produits liés à un RDV, Wallet, commandes et annulations « pas encore dans les apps » : livrés par les builds 11 à 15.
- `nodemailer` 10 : monté en 10.1.2 (tour 2).
