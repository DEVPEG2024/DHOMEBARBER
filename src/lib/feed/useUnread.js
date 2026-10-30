/**
 * Fil « New Gang » v2 : nouveautés du fil pour la pastille de l'onglet « New's Gang ! »
 * (docs/fonctions/fil-new-gang-contrat.md, sections 4 et 5).
 *
 *   const { activity, posts } = useFeedUnread();
 *
 * `activity` : lignes d'activité non lues (réactions, commentaires, réponses… à moi) ; `posts` :
 * publications d'autres membres parues depuis ma dernière visite du fil. Les deux valent 0 tant
 * que rien n'est lu : hors connexion, sans compte, sans `features.feedV2` (serveur plus ancien),
 * pendant le chargement et sur une panne. Jamais de message d'erreur : une pastille absente vaut
 * mieux qu'une alerte sur la barre de navigation.
 *
 * Relu toutes les 60 s quand l'app est au premier plan (jamais en arrière-plan) et au retour sur
 * l'app. La clé `FEED_KEYS.unread()` est sous le préfixe `['feed']` : `invalidateFeed` la relit
 * (fil vu, activité lue).
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { FEED_KEYS, fetchUnread, useFeedV2 } from '@/lib/feed/feedApi';

const REFETCH_MS = 60 * 1000;
/** Plafond du serveur (99 au plus chacun) : rien au-delà, même si une réponse le dépasse. */
const MAX = 99;

const count = (n) => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v > 0 ? Math.min(v, MAX) : 0;
};

export function useFeedUnread() {
  const { user, isAuthenticated } = useAuth();
  const feedV2 = useFeedV2();
  const enabled = !!(isAuthenticated && user && feedV2);
  const query = useQuery({
    // Clé du contrat (le fil la remet à jour quand il est vu) ; le cache est vidé à chaque connexion,
    // les nouveautés d'un compte ne passent jamais à un autre
    queryKey: FEED_KEYS.unread(),
    queryFn: () => fetchUnread(),
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: REFETCH_MS,
    refetchIntervalInBackground: false,
    // Retour sur l'app (onglet de nouveau visible, app native revenue au premier plan)
    refetchOnWindowFocus: 'always',
    retry: 1,
  });
  if (!enabled || !query.data) return { activity: 0, posts: 0 };
  return { activity: count(query.data.activity), posts: count(query.data.posts) };
}

export default useFeedUnread;
