# Notice backend : filtre des contenus choquants (App Store 1.2)

> Directives Apple mises à jour en oct. 2026. La 1.2 précise qu'une app avec du contenu publié par
> les utilisateurs doit avoir **un moyen de filtrer les contenus choquants avant leur publication**,
> en plus du signalement, du blocage et des coordonnées publiées. Un développeur qui ne met pas en
> place ces protections, ou qui ne corrige pas les manquements qu'on lui signale, enfreint le Code de
> conduite.
>
> Le frontend filtre depuis le 16 oct. 2026 (`src/lib/contentFilter.js`). Un client modifié, ou une
> ancienne version de l'app, passe outre : **le serveur doit appliquer la même règle**. À appliquer
> par la session du Mac, avec tests, puis `git push heroku main`.

## Ce qui est filtré

Tout texte que d'autres utilisateurs voient :

| Entité / route | Champ |
|---|---|
| `Post` (création et modification) | `content` |
| `PostComment` (création et modification) | `content` |
| `Review` (création) | `comment` |
| `POST /auth/register` | `full_name` |
| `User` (modification par le compte lui-même) | `full_name` |

Ne pas filtrer les textes privés : bugs et suggestions, demandes de privatisation, notes des
commandes, notes internes du staff. Ne pas filtrer les actions du staff non plus : l'admin doit
pouvoir citer un contenu signalé.

## Règle

1. Copier `src/lib/contentFilter.js` du frontend dans `lib/contentFilter.js` du backend. C'est un
   module ES sans dépendance : le convertir en CommonJS si le backend l'est (`module.exports`).
   Garder la **même liste** de mots et d'expressions, et la même normalisation : minuscules, sans
   accents, chiffres « leet » remplacés, lettres doublées réduites, lettres isolées recollées.
2. Dans les `CREATE_RULES` / `UPDATE_RULES` concernés, et dans `register`, si
   `hasObjectionableContent(texte)` est vrai, répondre **400** avec
   `{ error: OBJECTIONABLE_MESSAGE }`. Le frontend affiche déjà le message du serveur.
3. Journaliser le refus sans le texte (`[ContentFilter] refusé : post` + l'id du compte), pour
   savoir si un compte insiste.

## Tests (`test/test-content-filter.js`, ajouté à `npm test`)

Ces textes doivent être **refusés** :
- « Espèce de connard », « CONNNNARD », « c.o.n.n.a.r.d », « s a l o p e », « sal0pe » ;
- « fils de pute ! », « Nique ta mère », « je vais te tuer » ;
- « fuuuuck », « enculés », « n1gger », « Tue-toi ».

Ces textes doivent être **acceptés** :
- « Désolé du retard », « Le Niger c'est loin », « putain c'est propre » ;
- « Un baiser à tous », « cocktail party », « Un con ».

Côté routes :
- `Post.create` avec un texte refusé renvoie 400 et n'écrit rien ;
- la même publication faite par un admin passe ;
- `register` avec un nom refusé renvoie 400.

## À dire à Apple (déjà dans `docs/app-review-notes.md`)

Les contenus du fil, les avis et les noms passent par un filtre automatique, côté app et côté
serveur. On peut signaler chaque publication et chaque commentaire, et l'admin traite les
signalements sous 24 h. On peut aussi bloquer un utilisateur. Les coordonnées du salon figurent dans
Paramètres → Nous contacter, et dans les CGU.
