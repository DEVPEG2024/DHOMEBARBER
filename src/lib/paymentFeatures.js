/**
 * Encaissement « CB + Espèces » d'un rendez-vous (23 oct. 2026) : le client paie une partie en
 * espèces et le reste par carte bancaire.
 *
 * Le serveur annonce `features.splitPayment` dans ses paramètres publics
 * (`GET /api/apps/public/prod/public-settings/by-id/prod`) quand il accepte
 * `payment_method = 'mixte'` et la part en espèces (`cash_amount`, contrôlée par le serveur).
 * Tant que le drapeau est absent (serveur pas encore déployé), le choix « CB + Espèces »
 * n'apparaît pas : l'écriture serait refusée. Répartition au tableau de bord : `paymentSplitOf`
 * (src/lib/revenue.js).
 */
import { useQuery } from '@tanstack/react-query';
import { API_SERVER_URL, resolvedAppId } from '@/api/apiClient';

export const DEFAULT_PAYMENT_FEATURES = { splitPayment: false };
export const PAYMENT_FEATURES_QUERY_KEY = ['paymentFeatures'];

/** Drapeau du serveur. Ne rejette jamais : en cas d'échec, éteint. */
export async function fetchPaymentFeatures() {
  try {
    const res = await fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`);
    if (!res.ok) return { ...DEFAULT_PAYMENT_FEATURES };
    const data = await res.json().catch(() => null);
    return { splitPayment: data?.features?.splitPayment === true };
  } catch {
    return { ...DEFAULT_PAYMENT_FEATURES };
  }
}

/** Drapeau mis en cache 5 min ; éteint tant que rien n'est chargé. */
export function usePaymentFeatures() {
  const { data } = useQuery({
    queryKey: PAYMENT_FEATURES_QUERY_KEY,
    queryFn: fetchPaymentFeatures,
    staleTime: 5 * 60 * 1000,
  });
  return data ?? DEFAULT_PAYMENT_FEATURES;
}
