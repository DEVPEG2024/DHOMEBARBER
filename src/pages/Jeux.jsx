/**
 * Page « Jeux » (/jeux, demande du propriétaire du 29 oct. 2026) : les jeux ouverts du salon, chacun
 * avec sa carte. On y arrive par la section « Jeux » de l'accueil et par l'entrée « Jeux » du fil.
 * Liste des jeux et drapeaux : src/lib/games.js. Textes au tutoiement, comme les écrans du jeu.
 * Thème stade (29 oct. 2026, maquette « JeuxRouge », docs/fonctions/coupe-du-gang-stade.md) : rouge,
 * noir et blanc (`COUPE_COLORS`) ; l'en-tête suit le thème de l'app, les cartes restent sombres.
 */
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Gamepad2 } from 'lucide-react';
import LoadError from '@/components/shared/LoadError';
import { CoupeGameCard, GameIcon } from '@/components/home/GamesSection';
import { COUPE_COLORS as C } from '@/components/coupe/palette';
import { preloadStadium } from '@/lib/coupe/stadiumImage';
import { useGames } from '@/lib/games';
import { useTheme } from '@/lib/ThemeContext';

/** Cartes propres à un jeu ; un jeu qui n'a pas la sienne prend `GameCard`. */
const GAME_CARDS = { coupe: CoupeGameCard };

/** Carte simple d'un jeu : nom, accroche, « Jouer » (sombre, comme la carte de la Coupe). */
function GameCard({ game }) {
  const titleId = `jeu-${game.id}`;
  return (
    <article
      aria-labelledby={titleId}
      className="rounded-3xl border p-5 flex items-center gap-4"
      style={{ background: C.noir2, borderColor: 'rgba(255, 255, 255, 0.1)' }}
    >
      <span className="w-12 h-12 shrink-0 rounded-2xl grid place-items-center" style={{ background: 'rgba(224, 31, 38, 0.16)' }}>
        <GameIcon id={game.id} className="w-6 h-6" style={{ color: C.rougeVif }} />
      </span>
      <div className="flex-1 min-w-0">
        <h2 id={titleId} className="font-fut text-xl font-extrabold uppercase leading-none text-white">{game.title}</h2>
        {game.tagline && <p className="mt-1 text-xs leading-snug" style={{ color: C.gris }}>{game.tagline}</p>}
      </div>
      <Link
        to={game.to}
        className="shrink-0 flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl font-fut text-base font-extrabold uppercase tracking-[0.06em]"
        style={{ background: C.rouge, color: C.blanc }}
      >
        Jouer <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </Link>
    </article>
  );
}

export default function Jeux() {
  const { games, ready, failed } = useGames();
  const reduceMotion = useReducedMotion();
  const { theme = 'dark' } = useTheme() || {};
  const coupeOpen = games.some((g) => g.id === 'coupe');

  // Stade de la Coupe chargé et décodé dès la page des jeux : l'avant-match n'attend pas le réseau.
  // Seulement quand la Coupe est ouverte (rien à télécharger sinon) ; jamais d'erreur (repli du jeu).
  useEffect(() => {
    if (coupeOpen) preloadStadium();
  }, [coupeOpen]);

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-28">
      <motion.header initial={{ opacity: 0, y: reduceMotion ? 0 : -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        {/* Rouge vif sur le fond sombre, rouge sombre sur le fond clair (contraste ≥ 4,5:1 des deux côtés) */}
        <p
          className="text-[11px] uppercase tracking-[0.2em] font-semibold mb-1"
          style={{ color: theme === 'light' ? C.rougeSombre : C.rougeVif }}
        >
          Le Gang joue
        </p>
        <h1 className="font-fut text-4xl font-extrabold uppercase leading-none text-foreground">Jeux</h1>
        <p className="text-sm text-muted-foreground mt-2">Choisis ton jeu et défie le Gang.</p>
      </motion.header>

      {games.length > 0 ? (
        <div className="flex flex-col gap-5">
          {games.map((game) => {
            const Card = GAME_CARDS[game.id] || GameCard;
            return <Card key={game.id} game={game} />;
          })}
        </div>
      ) : failed ? (
        <LoadError what="les jeux" error={failed.error} onRetry={() => failed.refetch()} retrying={failed.isFetching} />
      ) : !ready ? (
        <div
          className="h-48 rounded-3xl border animate-pulse"
          style={{ background: C.noir2, borderColor: 'rgba(255, 255, 255, 0.1)' }}
          aria-busy="true"
        />
      ) : (
        <div className="glass rounded-3xl p-8 text-center">
          <Gamepad2 className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground">Aucun jeu ouvert pour l’instant</p>
          <p className="text-xs text-muted-foreground mt-1">Reviens un peu plus tard.</p>
        </div>
      )}
    </div>
  );
}
