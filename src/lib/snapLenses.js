/**
 * Filtres Snap : configuration Camera Kit (jeton d'API client + groupes de lentilles) et
 * catalogue réglé par l'admin, lus dans les paramètres publics du serveur
 * (`snap: { apiToken, lensGroupId, catalog }`, présents seulement filtres allumés).
 * Le jeton Camera Kit est un jeton client public, fait pour être embarqué dans l'app.
 *
 * Partagé entre la page client (pages/SnapLenses.jsx) et l'admin (pages/admin/AdminSnap.jsx) :
 * les deux construisent le carrousel avec `buildEntries`, l'admin voit donc exactement ce que
 * verront les clients.
 */
import { API_SERVER_URL, resolvedAppId, apiRequest, apiUrl } from '@/api/apiClient';

let settingsPromise = null;

/** Paramètres publics du serveur, chargés une seule fois par session. */
function publicSettings() {
  if (!settingsPromise) {
    settingsPromise = fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return settingsPromise;
}

/** À appeler après un enregistrement dans l'admin : la page /snap relira la configuration. */
export function resetSnapSettings() {
  settingsPromise = null;
}

/** `{ apiToken, lensGroupId, catalog }` ou null si les filtres Snap ne sont pas allumés. */
export function snapConfig() {
  return publicSettings().then((data) => (data?.snap?.apiToken && data?.snap?.lensGroupId ? data.snap : null));
}

/**
 * Le salon a-t-il allumé les filtres Snap ? (interrupteur de Admin → Filtres Snap, combiné à
 * la configuration Camera Kit côté serveur). Sert à masquer l'entrée de l'accueil : proposer
 * une carte qui mène à « bientôt disponibles » ne rend service à personne.
 */
export function snapFeatureEnabled() {
  return publicSettings().then((data) => data?.features?.snapLenses === true);
}

/** Le navigateur peut-il faire tourner Camera Kit ? (WebGL2 + caméra) */
export function snapSupported() {
  if (typeof window === 'undefined') return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

// ─── Admin (routes/snap.js du backend) ───

export const SNAP_ADMIN_KEY = ['snap', 'admin'];
export const snapStatsKey = (days) => ['snap', 'stats', days];
export const fetchSnapAdmin = () => apiRequest('GET', apiUrl('/snap/admin'));
export const saveSnapAdmin = (patch) => apiRequest('PUT', apiUrl('/snap/admin'), patch);
export const fetchSnapStats = (days) => apiRequest('GET', apiUrl(`/snap/admin/stats?days=${days}`));

/**
 * Aperçu administrateur : quand les filtres sont éteints pour les clients, l'admin ouvre quand
 * même /snap avec la configuration complète, pour tester avant d'allumer.
 */
export async function snapAdminPreviewConfig() {
  const cfg = await fetchSnapAdmin();
  if (!cfg?.configured) return null;
  return {
    apiToken: cfg.token.value,
    lensGroupId: cfg.groups.value.join(','),
    catalog: { lenses: cfg.lenses, defaultLens: cfg.default_lens, colors: cfg.colors, beardStyles: cfg.beard_styles },
    preview: true,
  };
}

/**
 * Mesure d'usage de la page client (statistiques de l'admin). Ne bloque ni ne casse jamais la
 * page : pas d'await, erreurs avalées. Le serveur ignore les comptes staff.
 */
export function trackSnap(type, extra = {}) {
  try {
    apiRequest('POST', apiUrl('/snap/events'), { type, ...extra }).catch(() => {});
  } catch { /* hors ligne */ }
}

// ─── Camera Kit : chargement du SDK et de la liste des lentilles ───

let bootstrapped = { token: null, promise: null };

/** Instance Camera Kit, créée une fois par jeton (le SDK charge ~3 Mo de WASM). */
export async function getCameraKit(apiToken) {
  if (bootstrapped.token !== apiToken || !bootstrapped.promise) {
    bootstrapped = {
      token: apiToken,
      promise: import('@snap/camera-kit').then(({ bootstrapCameraKit }) => bootstrapCameraKit({ apiToken })),
    };
    bootstrapped.promise.catch(() => { bootstrapped = { token: null, promise: null }; });
  }
  return bootstrapped.promise;
}

/** Lentilles des groupes (`lensGroupId` : identifiants séparés par des virgules) + erreurs par groupe. */
export async function loadSnapLenses(apiToken, lensGroupId) {
  const cameraKit = await getCameraKit(apiToken);
  const groupIds = String(lensGroupId || '').split(',').map((g) => g.trim()).filter(Boolean);
  const { lenses, errors } = await cameraKit.lensRepository.loadLensGroups(groupIds);
  return { cameraKit, lenses: lenses || [], errors: errors || [] };
}

// ─── Catalogue : réglages de l'admin appliqués aux lentilles du groupe ───

// Groupe de démonstration de Snap (23 exemples, surtout des tests pour développeurs) : par
// défaut on n'y garde que ce qui a du sens pour un barbier ; l'admin peut en afficher d'autres.
// `SNAP_LENS_GROUP_ID` accepte plusieurs groupes : chaque lentille porte son `groupId`.
export const SNAP_DEMO_GROUP = '39ed26d4-1931-4d21-98c2-eb2e29b76f6f';
export const SNAP_SALON_GROUP = '7c603de2-5d64-4d22-84e7-6dcfe63f2621';
const DEMO_KEEP = /hair color|face expressions|distort/i;
// Lentilles mises en avant quand l'admin n'a pas fixé d'ordre
const RELEVANT = /hair|cheveu|beard|barbe|colou?r|couleur|coupe|haircut/i;

/**
 * Lentille « couleur de cheveux » du salon (créée dans Lens Studio) : une seule lentille qui lit la
 * couleur dans les paramètres de lancement Camera Kit (`launchParams.color`, hex). L'app la déploie
 * en une pastille par couleur.
 *
 * La reconnaissance passe **uniquement** par la donnée fournisseur `dhb` (Project Info → Vendor Data
 * dans Lens Studio) : `hair-color`, `beard`, ou `hair-color+beard` pour une lentille qui fait les deux.
 * C'est une déclaration du créateur de la lentille : « je lis ce paramètre ». Le nom ne suffit pas —
 * une lentille qui s'appelle « DHB Couleur » mais ignore `launchParams` afficherait 16 pastilles
 * strictement identiques, ce que le client ne peut pas comprendre (constaté le 4 sept. 2026).
 */
export const vendorKind = (lens) => String(lens?.vendorData?.dhb || '');
export const isColorLens = (lens) => /hair-color/.test(vendorKind(lens));
export const isBeardLens = (lens) => /beard/.test(vendorKind(lens));
export const isRelevantLens = (lens) => isColorLens(lens) || isBeardLens(lens) || RELEVANT.test(lens?.name || '');

/** Palette par défaut (l'admin peut la modifier : `catalog.colors`). */
export const DEFAULT_HAIR_COLORS = [
  { id: 'platine', name: 'Blond platine', hex: '#EDE3C8' },
  { id: 'dore', name: 'Blond doré', hex: '#D9B36A' },
  { id: 'miel', name: 'Miel', hex: '#C68E3F' },
  { id: 'chatain-clair', name: 'Châtain clair', hex: '#8B5A2B' },
  { id: 'chatain', name: 'Châtain', hex: '#5B3A21' },
  { id: 'brun', name: 'Brun', hex: '#3B2418' },
  { id: 'noir', name: 'Noir', hex: '#141010' },
  { id: 'cuivre', name: 'Roux cuivré', hex: '#B4471F' },
  { id: 'auburn', name: 'Auburn', hex: '#7A2E1A' },
  { id: 'argent', name: 'Gris argent', hex: '#B9BCC2' },
  { id: 'blanc', name: 'Blanc polaire', hex: '#F1F1F1' },
  { id: 'bleu', name: 'Bleu nuit', hex: '#1D3F8A' },
  { id: 'violet', name: 'Violet', hex: '#6A2C9A' },
  { id: 'rose', name: 'Rose', hex: '#E2559A' },
  { id: 'cerise', name: 'Rouge cerise', hex: '#B4132E' },
  { id: 'emeraude', name: 'Vert émeraude', hex: '#1F8A5B' },
];
/**
 * Styles de barbe que la lentille du salon sait lire (`launchParams.style`). L'admin peut les
 * renommer, les réordonner ou en masquer, pas en inventer : la lentille ne connaît que ces quatre.
 */
export const DEFAULT_BEARD_STYLES = [
  { id: 'full', name: 'Barbe fournie', emoji: '🧔' },
  { id: 'light', name: 'Barbe de 3 jours', emoji: '🪒' },
  { id: 'mustache', name: 'Moustache', emoji: '👨' },
  { id: 'shaved', name: 'Rasé de près', emoji: '✨' },
];

/** Palette complète (activées et désactivées) : celle de l'admin, sinon celle par défaut. */
export const paletteOf = (catalog) => (Array.isArray(catalog?.colors) ? catalog.colors : DEFAULT_HAIR_COLORS.map((c) => ({ ...c, enabled: true })));
export const beardStylesOf = (catalog) => (Array.isArray(catalog?.beardStyles) ? catalog.beardStyles : DEFAULT_BEARD_STYLES.map((b) => ({ ...b, enabled: true })));

/** Réglage effectif d'une lentille : celui de l'admin, sinon la valeur par défaut. */
export function lensSettings(lens, catalog) {
  const o = catalog?.lenses?.[lens.id] || {};
  const defaultHidden = lens.groupId === SNAP_DEMO_GROUP && !DEMO_KEEP.test(lens.name || '');
  return {
    hidden: typeof o.hidden === 'boolean' ? o.hidden : defaultHidden,
    name: o.name || lens.name || 'Lentille',
    order: Number.isInteger(o.order) ? o.order : null,
  };
}

/** Lentilles dans l'ordre de l'admin ; celles qu'il n'a pas classées suivent, pertinentes d'abord. */
export function sortLenses(lenses, catalog) {
  return (lenses || [])
    .map((lens, index) => ({ lens, index, s: lensSettings(lens, catalog) }))
    .sort((a, b) => {
      const oa = a.s.order ?? 1000;
      const ob = b.s.order ?? 1000;
      if (oa !== ob) return oa - ob;
      const ra = Number(isRelevantLens(a.lens));
      const rb = Number(isRelevantLens(b.lens));
      if (ra !== rb) return rb - ra;
      return a.index - b.index;
    })
    .map((x) => x.lens);
}

/**
 * Entrées du carrousel client : les lentilles visibles, dans l'ordre de l'admin ; une lentille
 * paramétrable devient une entrée par style de barbe puis une par teinte (même lentille,
 * `launchParams` différents).
 */
export function buildEntries(lenses, catalog) {
  const colors = paletteOf(catalog).filter((c) => c.enabled !== false);
  const beards = beardStylesOf(catalog).filter((b) => b.enabled !== false);
  const out = [];
  for (const lens of sortLenses(lenses, catalog)) {
    const s = lensSettings(lens, catalog);
    if (s.hidden) continue;
    const color = isColorLens(lens);
    const beard = isBeardLens(lens);
    if (color || beard) {
      if (beard) out.push(...beards.map((b) => ({ key: `${lens.id}:${b.id}`, lens, name: b.name, emoji: b.emoji, launchParams: { style: b.id } })));
      if (color) out.push(...colors.map((c) => ({ key: `${lens.id}:${c.id}`, lens, name: c.name, swatch: c.hex, launchParams: { color: c.hex, mode: 'full' } })));
      continue;
    }
    out.push({ key: lens.id, lens, name: s.name, iconUrl: lens.iconUrl });
  }
  return out;
}

/** Valeur de `catalog.defaultLens` qui laisse la caméra sans filtre à l'ouverture. */
export const NO_DEFAULT_LENS = 'none';

/**
 * Entrée appliquée à l'ouverture : celle choisie par l'admin si elle est encore visible,
 * aucune s'il a choisi « Sans filtre », sinon une teinte (plus parlante qu'une barbe posée
 * d'office), sinon la première lentille pertinente. Jamais une lentille quelconque : les démos
 * de Snap recouvrent la caméra de leur propre interface.
 */
export function pickDefaultEntry(entries, catalog) {
  const wanted = catalog?.defaultLens;
  if (wanted === NO_DEFAULT_LENS) return null;
  if (wanted) {
    const found = entries.find((e) => e.key === wanted);
    if (found) return found;
  }
  return entries.find((e) => e.swatch) || entries.find((e) => isRelevantLens(e.lens)) || null;
}

/** Nom lisible d'un groupe de lentilles. */
export function groupLabel(id) {
  if (id === SNAP_SALON_GROUP) return 'Groupe du salon';
  if (id === SNAP_DEMO_GROUP) return 'Démos Snap';
  return `Groupe ${String(id || '').slice(0, 8)}`;
}

/** Ce que déclare une lentille (donnée fournisseur `dhb`), en clair. */
export function lensKindLabel(lens) {
  const color = isColorLens(lens);
  const beard = isBeardLens(lens);
  if (color && beard) return 'Couleur + barbe';
  if (color) return 'Couleur';
  if (beard) return 'Barbe';
  return null;
}

/**
 * Environnement d'un jeton Camera Kit, lu dans son `sub` (« <app>~STAGING~<id> »), même règle
 * que le serveur (lib/snapConfig.js). Indicatif : le jeton est signé par Snap, on ne le vérifie pas.
 */
export function tokenEnvironment(token) {
  const part = String(token || '').trim().split('.')[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    const sub = String(JSON.parse(json).sub || '');
    if (/~STAGING~/i.test(sub)) return 'staging';
    if (/~PROD(UCTION)?~/i.test(sub)) return 'production';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
