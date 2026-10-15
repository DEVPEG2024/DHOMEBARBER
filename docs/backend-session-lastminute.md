# Notice backend : créneau Last Minute réservable, session de 30 jours

> **Appliquée le 15 oct. 2026.** Point 1 : backend v106 (commit 102102b), index `idx_appointments_unique_slot_v2`, tests `test/test-last-minute.js` (40). Point 2 : session d'un an pour tous les rôles, renouvelée à chaque ouverture (commits 4db8cc4 et 3c4a382, v104 / v105), plus long que les 30 jours demandés. Détail dans CLAUDE.md.

> Constatés par la revue du 14 oct. 2026. Ces deux points se règlent dans `dhomebarber-api`
> (Heroku), pas dans le frontend. À appliquer par la session du Mac, avec tests, puis
> `git push heroku main`.

## 1. Un client doit pouvoir réserver le créneau Last Minute qu'on vient de lui annoncer

### Ce qui se passe

Quand l'admin envoie un Last Minute, l'agenda (`src/pages/admin/Agenda.jsx`, `handleSendLastMinute`)
crée d'abord une ligne qui bloque le créneau :

```js
{ client_name: 'Last Minute', client_email: '', employee_id, date, start_time, end_time,
  status: 'last_minute', services: [], total_price: 0 }
```

Ensuite `POST /last-minute` envoie le push « Créneau Last Minute » à tous les clients.

Le client ouvre la réservation et voit l'heure libre. Les créneaux ne tiennent compte que des
statuts `confirmed` et `break`, ce qui est voulu : c'est ce créneau qu'on veut lui vendre. Mais à
la création du RDV, le serveur risque de le refuser :

- **l'index unique partiel `idx_appointments_unique_slot`** (barber + date + heure de début) : il
  refuse si sa condition ne se limite pas à `status <> 'cancelled'` mais compte aussi `last_minute` ;
- **`assertSlotAvailable`** : il refuse si le contrôle de chevauchement compte les lignes
  `last_minute`.

Dans les deux cas, le client reçoit 409 « Ce créneau vient d'être réservé », alors que personne ne
l'a pris.

### À vérifier d'abord

1. Lire la définition de l'index : `\d appointments` dans `heroku pg:psql`, ou dans `server.js`.
2. Lire les statuts comptés par le chevauchement de `assertSlotAvailable`.
3. Si ni l'un ni l'autre ne compte `last_minute`, il n'y a rien à faire : le noter ici.

### Correctif attendu

À la création d'un `Appointment` par un **client**, dans la même transaction :

1. Chercher une ligne `status = 'last_minute'` du même barber, même date, dont la plage chevauche
   le créneau demandé.
2. Si elle existe, la **transformer** en RDV du client au lieu d'en créer un second : identité
   depuis le jeton, prestations, prix et `end_time` recalculés comme d'habitude, `status =
   'confirmed'`, et `internal_notes` préfixé de `[last_minute]`.
   - Ce marqueur alimente le compteur « Convertis ce mois » du tableau de bord.
   - Le frontend l'écrit déjà quand l'admin assigne un client à la main.
3. Sinon, faire comme aujourd'hui. Ne pas compter les lignes `last_minute` dans le chevauchement
   ni dans l'index (index : `WHERE status NOT IN ('cancelled', 'last_minute', 'no_show')`, à
   adapter à l'existant).

**Règles :**

- Les autres contrôles restent appliqués : créneau passé, horaires du barber, congé, fermeture,
  plafond de 6 RDV à venir.
- La course entre deux clients reste protégée par un verrou `SELECT … FOR UPDATE` sur la ligne
  `last_minute`.
- Le premier client gagne. Le second reçoit 409 « Ce créneau Last Minute vient d'être pris ».

**Tests :**

- Un client réserve l'heure exacte d'un Last Minute : RDV `confirmed`, et plus aucune ligne
  `last_minute` à cette heure.
- Un deuxième client sur la même heure reçoit 409.
- Un staff qui crée un RDV dessus reste soumis à la règle actuelle (pas de transformation).

## 2. Les clients sont déconnectés toutes les 24 h

Le JWT vit 24 h et rien ne le renouvelle. Un client qui rouvre l'app le lendemain tombe sur
« Votre session a expiré », ce qui donne la plainte typique « l'app me déconnecte tout le temps ».
Le frontend gère déjà proprement l'expiration (`dhb:unauthorized` → `/login?expired=1`). Il manque
seulement une durée adaptée à une app installée.

**Correctif attendu (le plus simple) :**

- `expiresIn` : **30 jours** pour le rôle `user`, et garder une durée courte (24 h ou 7 jours) pour
  `admin` / `barber`. Le changement est à faire dans `routes/auth.js`, dans le login et le register.
- Au `GET /me` (appelé à chaque lancement), si le jeton a plus de 7 jours, renvoyer en plus un
  jeton neuf dans `token`. Le frontend pourra le reprendre plus tard : il ne le lit pas encore, ce
  n'est pas bloquant.
- La suppression du compte et le changement de mot de passe invalident déjà l'accès : vérifier
  que le middleware relit l'utilisateur en base (sinon un jeton de 30 jours survivrait à la
  suppression du compte), et l'ajouter si besoin.

**Tests :**

- Un jeton client est émis avec 30 jours.
- Un jeton admin est émis avec la durée courte.
- Un jeton d'un compte supprimé reçoit 401.
