import { api } from '@/api/apiClient';

/**
 * Barbers montrés côté client (accueil, réservation, profil, avis, fil, privatisations), clé
 * React Query partagée `['employees']` : fiches actives dans l'ordre `sort_order`, sans les fiches
 * de test (`is_hidden`). Le serveur ne les envoie déjà jamais à un client ; ce filtre les cache
 * aussi à l'équipe qui parcourt les pages client (sinon l'admin croirait les clients les voir).
 */
export async function fetchPublicBarbers() {
  const rows = await api.entities.Employee.filter({ is_active: true }, 'sort_order', 50);
  return (Array.isArray(rows) ? rows : []).filter((e) => !e.is_hidden);
}
