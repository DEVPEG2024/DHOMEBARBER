#!/usr/bin/env node
/**
 * Publication Android de bout en bout : build web → sync Capacitor → incrément de version →
 * bundle signé → téléversement sur le Play Console (piste de test interne).
 *
 *   npm run android:release              # tout, jusqu'au téléversement
 *   npm run android:release -- --no-upload   # s'arrête après le bundle signé
 *   npm run android:release -- --track=alpha # autre piste (internal par défaut)
 *   npm run android:release -- --dry-run     # n'écrit rien, dit ce qu'il ferait
 *
 * Identifiants : un compte de service Google Play, cherché dans cet ordre —
 *   1. la variable PLAY_SERVICE_ACCOUNT_JSON (contenu du fichier)
 *   2. la variable PLAY_SERVICE_ACCOUNT_FILE (chemin)
 *   3. ~/.play-console/dhomebarber-play.json
 * Sans lui, le bundle est construit et le script explique comment obtenir la clé.
 *
 * Aucune dépendance npm : l'authentification passe par un JWT signé avec node:crypto,
 * échangé contre un jeton OAuth, exactement comme lib/nativePush.js côté serveur.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRADLE_FILE = join(ROOT, 'android', 'app', 'build.gradle');
const AAB = join(ROOT, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
const PACKAGE_NAME = 'fr.dhomebarber.mobile';
const DEFAULT_KEY_PATH = join(homedir(), '.play-console', 'dhomebarber-play.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const noUpload = args.includes('--no-upload');
const track = (args.find((a) => a.startsWith('--track=')) || '--track=internal').split('=')[1];

const step = (msg) => console.log(`\n▸ ${msg}`);
const info = (msg) => console.log(`  ${msg}`);
const human = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;

/** Le JDK n'est pas forcément sur le PATH : celui d'Android Studio fait l'affaire. */
function resolveJavaHome() {
  if (process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  const bundled = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
  if (existsSync(bundled)) return bundled;
  throw new Error("Aucun JDK trouvé. Installez Android Studio, ou renseignez JAVA_HOME.");
}

function run(cmd, cmdArgs, options = {}) {
  return execFileSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}

// ─── Version ────────────────────────────────────────────────────────────
function readVersion() {
  const src = readFileSync(GRADLE_FILE, 'utf8');
  const code = Number((src.match(/versionCode\s+(\d+)/) || [])[1]);
  const name = (src.match(/versionName\s+"([^"]+)"/) || [])[1];
  if (!Number.isInteger(code) || !name) throw new Error('versionCode / versionName illisibles dans build.gradle');
  return { code, name, src };
}

/** versionCode +1, et dernier segment du versionName +1 (1.0.2 → 1.0.3). */
function bumpVersion() {
  const { code, name, src } = readVersion();
  const parts = name.split('.');
  parts[parts.length - 1] = String(Number(parts[parts.length - 1] || 0) + 1);
  const next = { code: code + 1, name: parts.join('.') };
  if (!dryRun) {
    writeFileSync(GRADLE_FILE, src
      .replace(/versionCode\s+\d+/, `versionCode ${next.code}`)
      .replace(/versionName\s+"[^"]+"/, `versionName "${next.name}"`));
  }
  info(`${name} (${code}) → ${next.name} (${next.code})${dryRun ? '  [simulation]' : ''}`);
  return next;
}

// ─── Compte de service ──────────────────────────────────────────────────
function loadServiceAccount() {
  let raw = null;
  if (process.env.PLAY_SERVICE_ACCOUNT_JSON) raw = process.env.PLAY_SERVICE_ACCOUNT_JSON;
  else {
    const path = process.env.PLAY_SERVICE_ACCOUNT_FILE || DEFAULT_KEY_PATH;
    if (existsSync(path)) raw = readFileSync(path, 'utf8');
  }
  if (!raw) return null;
  const key = JSON.parse(raw);
  if (key.type !== 'service_account' || !key.client_email || !key.private_key) {
    throw new Error("Ce fichier n'est pas une clé de compte de service Google valide.");
  }
  return key;
}

const b64url = (input) => Buffer.from(input).toString('base64url');

async function accessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  const assertion = `${signingInput}.${signer.sign(key.private_key.replace(/\\n/g, '\n')).toString('base64url')}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`OAuth ${res.status} : ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).access_token;
}

async function play(token, method, path, { body, headers = {}, base = 'https://androidpublisher.googleapis.com' } = {}) {
  const res = await fetch(`${base}/androidpublisher/v3/applications/${PACKAGE_NAME}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...headers },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Play API ${method} ${path} → ${res.status} : ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function upload(version) {
  const key = loadServiceAccount();
  if (!key) {
    console.log(`
  ⚠  Aucun compte de service Google Play trouvé — le bundle est prêt, mais pas téléversé.

  Pour automatiser le téléversement, une seule fois :
    1. console.cloud.google.com → API et services → activer « Google Play Android Developer API »
    2. IAM → Comptes de service → Créer → Clés → Ajouter une clé → JSON (le fichier se télécharge)
    3. Play Console → Utilisateurs et autorisations → Inviter → l'adresse du compte de service,
       avec le droit « Gérer les versions » sur l'application
    4. Déposer le fichier ici :  ${DEFAULT_KEY_PATH}

  Ensuite \`npm run android:release\` fera tout, téléversement compris.

  En attendant : Play Console → Test interne → Créer une version → déposer le fichier ci-dessus.`);
    return false;
  }

  step(`Téléversement sur la piste « ${track} »`);
  if (dryRun) { info('[simulation] rien n\'est envoyé'); return true; }

  const token = await accessToken(key);
  info(`authentifié : ${key.client_email}`);

  const edit = await play(token, 'POST', '/edits');
  info(`édition ouverte : ${edit.id}`);

  const bytes = readFileSync(AAB);
  const uploaded = await play(token, 'POST', `/edits/${edit.id}/bundles?uploadType=media`, {
    base: 'https://androidpublisher.googleapis.com/upload',
    body: bytes,
    headers: { 'content-type': 'application/octet-stream' },
  });
  info(`bundle reçu : versionCode ${uploaded.versionCode}`);

  await play(token, 'PUT', `/edits/${edit.id}/tracks/${track}`, {
    body: JSON.stringify({
      track,
      releases: [{ versionCodes: [String(uploaded.versionCode)], status: 'completed', name: version.name }],
    }),
    headers: { 'content-type': 'application/json' },
  });
  info(`piste « ${track} » mise à jour`);

  await play(token, 'POST', `/edits/${edit.id}:commit`);
  info('édition validée — la version est en ligne sur la piste');
  return true;
}

// ─── Enchaînement ───────────────────────────────────────────────────────
(async () => {
  const JAVA_HOME = resolveJavaHome();

  step('Build du bundle web');
  run('npm', ['run', 'build']);
  info('dist/ à jour');

  step('Synchronisation Capacitor');
  run('npx', ['cap', 'sync', 'android']);
  info('bundle web copié dans android/');

  step('Version');
  const version = bumpVersion();

  step('Bundle signé');
  if (dryRun) {
    info('[simulation] gradlew bundleRelease non lancé');
  } else {
    run(join(ROOT, 'android', 'gradlew'), ['bundleRelease', '--console=plain', '-q'], {
      cwd: join(ROOT, 'android'),
      env: { ...process.env, JAVA_HOME },
    });
    if (!existsSync(AAB)) throw new Error('Le bundle attendu est introuvable après la compilation.');
    info(`${AAB.replace(ROOT + '/', '')} — ${human(statSync(AAB).size)}`);

    // Une signature manquante ne se voit qu'au refus du Play Console : on vérifie ici.
    const verify = run(join(JAVA_HOME, 'bin', 'jarsigner'), ['-verify', AAB]);
    if (!/jar verified/i.test(verify)) throw new Error('Le bundle produit n\'est pas signé.');
    info('signature vérifiée');
  }

  const sent = await upload(version);

  console.log(`\n✓ ${version.name} (${version.code}) ${sent ? `publiée sur « ${track} »` : 'prête à téléverser'}.`);
  if (!dryRun) {
    console.log('  Pensez à noter le versionCode : le dossier android/ est hors git.');
  }
})().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  if (err.stdout) console.error(String(err.stdout).slice(-1500));
  if (err.stderr) console.error(String(err.stderr).slice(-1500));
  process.exit(1);
});
