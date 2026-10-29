/**
 * Catégories de l'accueil masquées par l'admin (« Organiser l'accueil », demande du propriétaire du
 * 29 oct. 2026) : `salon_settings.homepage_hidden`, liste d'identifiants de sections (`games`,
 * `textile`…) bornée par le serveur. [] : tout est visible.
 *
 * Serveur d'avant la colonne : la clé manque sur la ligne lue, rien n'est masqué et l'accueil ne
 * propose pas l'interrupteur (`homeHiddenSupported`). Les apps publiées avant le build 18 ne lisent
 * pas la colonne : elles montrent toutes les catégories.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { queryFailed } from '@/components/shared/LoadError';

/** Même clé et même requête que l'accueil, la réservation et Mes rendez-vous. */
export const SALON_SETTINGS_KEY = ['salonSettings'];
const fetchSalonSettings = () => api.entities.SalonSettings.list();

/** Le serveur connaît-il les catégories masquées ? (clé présente sur la ligne lue, même vide) */
export const homeHiddenSupported = (settings) =>
  !!settings && Object.prototype.hasOwnProperty.call(settings, 'homepage_hidden');

/** Identifiants des catégories masquées (chaînes seulement). */
export function hiddenHomeSections(settings) {
  const raw = settings?.homepage_hidden;
  return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : [];
}

/**
 * Catégorie de l'accueil masquée par l'admin ? `ready` faux tant que les paramètres ne sont pas
 * lus : l'appelant n'affiche rien plutôt qu'une entrée qui disparaîtrait aussitôt. Paramètres
 * illisibles (panne, hors connexion) : la catégorie est tenue pour visible.
 */
export function useHomeSectionHidden(id) {
  const query = useQuery({ queryKey: SALON_SETTINGS_KEY, staleTime: 5 * 60 * 1000, queryFn: fetchSalonSettings });
  return {
    hidden: hiddenHomeSections(query.data?.[0]).includes(id),
    // Données gardées après une relecture ratée : toujours prêt
    ready: query.data !== undefined || queryFailed(query),
  };
}
