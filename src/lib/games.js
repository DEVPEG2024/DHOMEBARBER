/**
 * Les jeux du salon : page « Jeux » (/jeux), section « Jeux » de l'accueil et entrée « Jeux » du fil
 * (demande du propriétaire du 29 oct. 2026 : « une section jeux, quand on clique dessus, on voit la
 * Coupe du Gang et les autres jeux que j'ajouterai »).
 *
 * Ajouter un jeu : une entrée dans GAMES (ordre d'affichage) et la lecture de son drapeau dans
 * `useGames` : un jeu n'apparaît que si le serveur l'a ouvert. La page « Jeux » lui donne une carte
 * simple (titre, accroche, « Jouer ») tant qu'il n'a pas la sienne (`GAME_CARDS` de pages/Jeux.jsx),
 * et l'accueil un nom dans la carte « Jeux ».
 */
import { queryFailed } from '@/components/shared/LoadError';
import { useCoupeFlagQuery, useCoupeRulesV2 } from '@/lib/coupe/coupeApi';

// `taglineV2` : accroche quand le serveur annonce le règlement v2 de la Coupe (premier à 5 buts)
export const GAMES = [
  {
    id: 'coupe',
    title: 'La Coupe du Gang',
    tagline: 'Foot façon air hockey : premier à 3 buts.',
    taglineV2: 'Foot façon air hockey : premier à 5 buts.',
    to: '/coupe',
  },
];

/**
 * Jeux ouverts, dans l'ordre de GAMES ; aucun tant que rien n'est lu. `ready` : tous les drapeaux
 * lus ; `failed` : la première lecture ratée (panne, hors connexion), pour « Réessayer ».
 */
export function useGames() {
  const flags = [{ id: 'coupe', query: useCoupeFlagQuery() }];
  const coupeV2 = useCoupeRulesV2();
  const open = new Set(flags.filter((f) => f.query.data === true).map((f) => f.id));
  return {
    games: GAMES.filter((g) => open.has(g.id)).map((g) => (g.id === 'coupe' && coupeV2 ? { ...g, tagline: g.taglineV2 } : g)),
    ready: flags.every((f) => f.query.data !== undefined),
    failed: flags.map((f) => f.query).find((q) => queryFailed(q)) || null,
  };
}
