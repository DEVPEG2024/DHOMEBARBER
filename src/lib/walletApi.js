/**
 * Carte cadeau dans le Wallet : Apple Wallet (iPhone, iPad, Mac) et Google Wallet (Android).
 *
 * Le serveur (Heroku, hors de ce dépôt) annonce ce qu'il sait faire dans ses paramètres publics
 * (`GET /api/apps/public/prod/public-settings/by-id/prod`), comme `features.orderCancel` :
 *  - `features.appleWallet` : certificat Pass Type ID posé, le serveur sait signer un `.pkpass` ;
 *  - `features.googleWallet` : compte de service Google Wallet posé, le serveur sait signer le lien
 *    « Save to Google Wallet ».
 * Tant que ces drapeaux sont faux ou absents, aucun bouton n'apparaît (règle App Store 2.5.19 : pas de
 * fonction dormante visible). Détails côté serveur : docs/backend-wallet.md.
 *
 * `POST /gift-cards/:id/wallet-links` (compte connecté, carte dont il est l'expéditeur, validée,
 * non expirée, solde > 0) → `{ apple_url, google_url }`, chaque clé `null` si ce Wallet n'est pas
 * configuré. `apple_url` est une URL publique à jeton court (10 min) : Safari / le système l'ouvrent
 * sans en-tête Authorization. `google_url` = `https://pay.google.com/gp/v/save/<JWT>`.
 */
import { useQuery } from '@tanstack/react-query';
import { API_SERVER_URL, resolvedAppId, apiRequest, apiUrl } from '@/api/apiClient';
import { isNative, platform, openExternalUrl } from '@/lib/capacitor';
import { isNetworkError } from '@/components/shared/LoadError';

export const DEFAULT_WALLET_FEATURES = { appleWallet: false, googleWallet: false };
export const WALLET_FEATURES_QUERY_KEY = ['walletFeatures'];

/** Drapeaux du serveur. Ne rejette jamais : en cas d'échec, tout est éteint. */
export async function fetchWalletFeatures() {
  try {
    const res = await fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`);
    if (!res.ok) return { ...DEFAULT_WALLET_FEATURES };
    const data = await res.json().catch(() => null);
    const f = data?.features || {};
    return { appleWallet: f.appleWallet === true, googleWallet: f.googleWallet === true };
  } catch {
    return { ...DEFAULT_WALLET_FEATURES };
  }
}

/** Drapeaux mis en cache 5 min ; tout éteint tant que rien n'est chargé. */
export function useWalletFeatures() {
  const { data } = useQuery({
    queryKey: WALLET_FEATURES_QUERY_KEY,
    queryFn: fetchWalletFeatures,
    staleTime: 5 * 60 * 1000,
  });
  return data ?? DEFAULT_WALLET_FEATURES;
}

/** Environnement de l'appareil : `ios`, `android`, `mac` ou `desktop`. */
export function walletDevice() {
  if (isNative) return platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'desktop';
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  // iPadOS se présente comme un Mac : on le reconnaît à l'écran tactile
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  // macOS ouvre un .pkpass avec Pass Viewer, quel que soit le navigateur, puis le synchronise sur l'iPhone
  if (/Macintosh/i.test(ua)) return 'mac';
  return 'desktop';
}

/**
 * Wallets à proposer sur cet appareil, parmi ceux que le serveur sait servir :
 * iPhone / iPad / Mac → Apple ; Android et autres ordinateurs → Google.
 */
export function walletsForDevice(features, device = walletDevice()) {
  const apple = !!features?.appleWallet;
  const google = !!features?.googleWallet;
  if (device === 'ios' || device === 'mac') return apple ? ['apple'] : [];
  if (device === 'android') return google ? ['google'] : [];
  return google ? ['google'] : []; // Windows / Linux : aucun système ne sait ouvrir un .pkpass
}

/**
 * `POST /gift-cards/:id/wallet-links`, corps `{ wallet: 'apple' | 'google' }` → `{ apple_url, google_url }`
 * (erreurs telles quelles). Seul le Wallet demandé est préparé : l'autre clé revient à `null`. Sans `kind`
 * valable, le corps est vide et le serveur prépare les deux.
 */
export async function fetchWalletLinks(cardId, kind) {
  const body = kind === 'apple' || kind === 'google' ? { wallet: kind } : {};
  const data = await apiRequest('POST', apiUrl(`/gift-cards/${encodeURIComponent(cardId)}/wallet-links`), body);
  const safe = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : null);
  return { apple_url: safe(data?.apple_url), google_url: safe(data?.google_url) };
}

/** Ouvre le lien du Wallet choisi : le système prend le relais (aperçu du pass, « Ajouter »). */
export async function openWalletUrl(kind, url) {
  if (isNative) {
    // iOS : la WebView de l'app n'ouvre pas un .pkpass, Safari (SFSafariViewController) affiche
    // l'aperçu « Ajouter à Apple Wallet ». Android : l'onglet Chrome passe la main à Google Wallet.
    await openExternalUrl(url);
    return;
  }
  if (kind === 'apple') {
    // Safari télécharge le .pkpass et affiche l'aperçu du pass : pas besoin d'un nouvel onglet
    window.location.href = url;
    return;
  }
  // Ouvert après un appel réseau : un bloqueur de fenêtres peut refuser le nouvel onglet
  const w = window.open(url, '_blank');
  if (!w) window.location.href = url;
}

/** Erreur → message en français pour le toast. */
export function friendlyWalletError(err) {
  if (isNetworkError(err) || (!err?.status && err?.name === 'TypeError')) return 'Pas de connexion internet : vérifiez votre réseau puis réessayez.';
  const raw = err?.data?.error || err?.data?.message || err?.message;
  const serverMsg = err?.status && typeof raw === 'string' && raw.trim() && !/^HTTP \d+$/.test(raw.trim()) ? raw.trim() : '';
  if (err.status === 404) return 'Carte introuvable.';
  if (err.status === 401) return 'Votre session a expiré : reconnectez-vous.';
  if (err.status === 429) return serverMsg || 'Trop de demandes : réessayez dans un moment.';
  return serverMsg || 'Le Wallet est indisponible pour le moment. Réessayez dans un instant.';
}
