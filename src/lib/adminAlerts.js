/**
 * Alertes de l'admin, type par type (« Activité clients » → Réglages des alertes).
 * Rangées dans `salon_settings.admin_alerts` (backend v102, `lib/adminAlerts.js` côté serveur) :
 * clé absente ou `null` = **activé** ; `false` = pas de push sur le téléphone ni de toast dans
 * l'app. Une action client coupée reste notée dans le fil Activité clients ; le ménage et les
 * congés de l'équipe restent visibles dans Entretien et Congés.
 * On n'envoie que les types coupés (`{ user_new: false }`) : tout réactiver = `{}`.
 */
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';

/** Même clé et même requête que la page Paramètres du salon (cache partagé). */
export const SALON_SETTINGS_KEY = ['salonSettings'];
const fetchSalonSettings = () => api.entities.SalonSettings.list('-created_date', 1);

/** Ordre et regroupement des types dans l'écran des réglages. */
export const ALERT_GROUPS = [
  { title: 'Rendez-vous', types: ['appointment_new', 'appointment_cancelled'] },
  { title: 'Boutique et ventes', types: ['order_new', 'order_cancelled', 'giftcard_new', 'textile_reservation'] },
  { title: 'Événements', types: ['event_request', 'event_answer', 'salon_event_rsvp'] },
  { title: 'Clients', types: ['review_new', 'user_new', 'feedback_new', 'report_new'] },
  // Actions de l'équipe (ménage coché, demande de congé d'un barber) : réglables, jamais dans le fil
  { title: 'Équipe', types: ['cleaning_done', 'leave_request'] },
];

/** Préférences normalisées `{ type: false }` (seulement les types coupés). */
export function normalizeAlertPrefs(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  const out = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) if (v === false) out[k] = false;
  }
  return out;
}

/**
 * @returns {{ settings: object|null, prefs: Record<string, false>, isLoading: boolean,
 *   isEnabled: (type: string) => boolean, save: (prefs: Record<string, boolean>) => Promise<void>, saving: boolean }}
 */
export function useAdminAlertPrefs() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: SALON_SETTINGS_KEY,
    queryFn: fetchSalonSettings,
    enabled: isAdmin,
    staleTime: 60 * 1000,
  });
  const settings = Array.isArray(query.data) ? query.data[0] || null : null;
  const prefs = normalizeAlertPrefs(settings?.admin_alerts);

  const mutation = useMutation({
    mutationFn: async (next) => {
      if (!settings?.id) throw new Error('Paramètres du salon introuvables');
      return api.entities.SalonSettings.update(settings.id, { admin_alerts: normalizeAlertPrefs(next) });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SALON_SETTINGS_KEY }),
  });

  return {
    settings,
    prefs,
    isLoading: query.isLoading,
    // Échec sans donnée : la fenêtre affiche LoadError, jamais « paramètres introuvables »
    // (hors ligne, la requête reste en pause : même traitement)
    isError: (query.isError && !query.data) || (isAdmin && query.isPending && query.fetchStatus === 'paused'),
    error: query.error,
    refetch: query.refetch,
    isFetching: query.isFetching,
    isEnabled: (type) => prefs[type] !== false,
    save: (next) => mutation.mutateAsync(next),
    saving: mutation.isPending,
  };
}
