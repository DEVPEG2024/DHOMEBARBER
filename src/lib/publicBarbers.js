import { api } from '@/api/apiClient';

/**
 * Barbers montrés côté client (accueil, réservation, profil, avis, fil, privatisations), clé
 * React Query partagée `['employees']` : fiches actives dans l'ordre `sort_order`. Les fiches de
 * test (`is_hidden`) ne sont envoyées par le serveur qu'à l'équipe et aux comptes clients testeurs
 * (Équipe → Comptes testeurs) : aucun filtre ici, pour qu'eux les voient en vue client.
 */
export async function fetchPublicBarbers() {
  const rows = await api.entities.Employee.filter({ is_active: true }, 'sort_order', 50);
  return Array.isArray(rows) ? rows : [];
}
