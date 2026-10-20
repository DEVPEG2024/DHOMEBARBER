# Architecture, déploiement, commandes et infos du salon

> Période : 2 sept. → 20 oct. 2026. Déplacé tel quel depuis `CLAUDE.md` le 20 oct. 2026 (version du commit 7738a11). Les règles à retenir sont résumées dans `CLAUDE.md` ; ce fichier garde le détail. Quand une session modifie cette fonction, elle met ce document à jour.

# D'Home Barber - Guide Projet

## Architecture

- **Frontend** : React + Vite + TailwindCSS, déployé sur **Vercel** (https://dhomebarber.fr)
- **Backend** : Express.js + PostgreSQL, déployé sur **Heroku** (https://dhomebarber-api-3aabb8313cb6.herokuapp.com)
- **Client API** : le frontend utilise un client HTTP maison `src/api/apiClient.js` (le SDK `@base44/sdk` a été retiré). Il expose `api.entities.<Entity>`, `api.auth` et `api.integrations.Core.UploadFile`. Tous les imports se font via `@/api/apiClient`.
- **Apps natives** : iOS et Android via **Capacitor 8** (`capacitor.config.ts`, appId `fr.dhomebarber.app`). Les dossiers `ios/` et `android/` sont **hors git** (gitignorés).
- **Repo GitHub** : https://github.com/DEVPEG2024/DHOMEBARBER (frontend uniquement)
- **Backend repo** : /Users/zoomproject/Downloads/dhomebarber-api/ (push vers Heroku via `git push heroku main`)

## Déploiement

### Frontend (Vercel)
- Push sur `main` → déploiement automatique sur Vercel
- Domaine : dhomebarber.fr
- Hard refresh (Cmd+Shift+R) après chaque déploiement pour vider le cache

### Backend (Heroku)
- App : `dhomebarber-api`
- Déployer : `git push heroku main`
- Logs : `heroku logs --tail --app dhomebarber-api`
- Init DB : `heroku run node init-db.js --app dhomebarber-api`
- PostgreSQL addon : `postgresql-deep-70510` (plan essential-0)
- **Sauvegardes** (activées le 25 sept. 2026, après la perte de 6 images) : `heroku pg:backups:schedule` tous les jours à **03h00 heure de Paris**, donc avant le ramasse-miettes des médias du dimanche (03h30). Première sauvegarde manuelle `b001` (25 sept., 3,16 Mo compressés, base de 17,8 Mo). Sur essential-0, ni rollback ni fork : la « continuous protection » ne sert qu'à Heroku. **Pour récupérer des données perdues, ne pas lancer `pg:backups:restore`** (il écrase tout ce qui a changé depuis) : `heroku pg:backups:download`, puis extraire seulement les lignes voulues
- La session Heroku CLI expire régulièrement : relancer `heroku login` si les commandes renvoient `Invalid credentials`
- Variables d'environnement attendues : `NODE_ENV=production` (**obligatoire** : sans elle les origines `localhost` restent autorisées par CORS, et le serveur accepte un `JWT_SECRET` de repli), `DATABASE_URL`, `JWT_SECRET` (le serveur **refuse de démarrer** en production sans), `API_PUBLIC_URL` (base des URL d'images renvoyées par l'upload), `FRONTEND_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, `SMTP_HOST` (défaut smtp.hostinger.com), `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` ; optionnelles : `FAL_KEY` (active le mode AI ULTRA de l'essayage couleur, release v69), `HAIR_ULTRA_EDIT_MODEL`, `ANTHROPIC_API_KEY` (active l'assistant IA de rédaction des notifications ; **posée le 7 oct. 2026**, release v95, voir `POST /ai/notification-draft`) + `AI_WRITER_MODEL` (défaut `claude-opus-5`), `SNAP_CAMERA_KIT_API_TOKEN` + `SNAP_LENS_GROUP_ID` (activent les filtres Snap), `APNS_KEY_P8` + `APNS_KEY_ID` + `APNS_TEAM_ID` + `APNS_BUNDLE_ID` (push natif iOS) et `FCM_SERVICE_ACCOUNT` (push natif Android), `APPLE_PASS_TYPE_ID` + `APPLE_TEAM_ID` + `APPLE_PASS_CERT_PEM` + `APPLE_PASS_KEY_PEM` + `APPLE_WWDR_PEM` (carte cadeau dans Apple Wallet, **posées le 17 oct. 2026**, release v118), `GOOGLE_WALLET_ISSUER_ID` + `GOOGLE_WALLET_SERVICE_ACCOUNT` (Google Wallet, **pas encore posées**)


## Points importants

### Infos du salon
- Adresse : Sur le côté gauche du bâtiment Odyssée, 3 Rue du Bois Arquet, 74140 Douvaine
- Téléphone : 06 66 08 36 05
- Barbers : Dom, Kevin, Denis, Romain, Sacha

## Commandes utiles

```bash
# Frontend - dev local
cd /Users/zoomproject/Downloads/puzzling-sharp-edge-book
npm run dev

# Frontend - push (auto-deploy Vercel)
git add -A && git commit -m "message" && git push

# Frontend - apps natives
npm run cap:sync        # build + sync iOS/Android
npm run cap:ios         # build + sync + ouvre Xcode
npm run cap:android     # build + sync + ouvre Android Studio

# Backend - deploy
cd /Users/zoomproject/Downloads/dhomebarber-api
git add -A && git commit -m "message" && git push heroku main

# Backend - logs
heroku logs --tail --app dhomebarber-api

# Backend - console DB
heroku pg:psql --app dhomebarber-api

# Backend - init DB (tables + indexes)
heroku run node init-db.js --app dhomebarber-api

# Vérifier que l'API répond
curl -s -o /dev/null -w "%{http_code}\n" https://dhomebarber-api-3aabb8313cb6.herokuapp.com/api/apps/public/prod/public-settings/by-id/prod
```
