/**
 * Page « Jeux » (/jeux, demande du propriétaire du 29 oct. 2026) : les jeux ouverts du salon, chacun
 * avec sa carte. On y arrive par la section « Jeux » de l'accueil et par l'entrée « Jeux » du fil.
 * Liste des jeux et drapeaux : src/lib/games.js. Textes au tutoiement, comme les écrans du jeu.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Gamepad2 } from 'lucide-react';
import LoadError from '@/components/shared/LoadError';
import { CoupeGameCard, GameIcon } from '@/components/home/GamesSection';
import { useGames } from '@/lib/games';

/** Cartes propres à un jeu ; un jeu qui n'a pas la sienne prend `GameCard`. */
const GAME_CARDS = { coupe: CoupeGameCard };

/** Carte simple d'un jeu : nom, accroche, « Jouer ». */
function GameCard({ game }) {
  const titleId = `jeu-${game.id}`;
  return (
    <article aria-labelledby={titleId} className="glass rounded-3xl p-5 flex items-center gap-4">
      <span className="w-12 h-12 shrink-0 rounded-2xl bg-primary/15 border border-primary/25 grid place-items-center">
        <GameIcon id={game.id} className="w-6 h-6 text-primary" />
      </span>
      <div className="flex-1 min-w-0">
        <h2 id={titleId} className="font-fut text-xl font-extrabold uppercase leading-none text-foreground">{game.title}</h2>
        {game.tagline && <p className="mt-1 text-xs leading-snug text-muted-foreground">{game.tagline}</p>}
      </div>
      <Link
        to={game.to}
        className="shrink-0 flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold"
      >
        Jouer <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </Link>
    </article>
  );
}

export default function Jeux() {
  const { games, ready, failed } = useGames();
  const reduceMotion = useReducedMotion();

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-28">
      <motion.header initial={{ opacity: 0, y: reduceMotion ? 0 : -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Le Gang joue</p>
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
        <div className="h-48 rounded-3xl bg-card border border-border animate-pulse" aria-busy="true" />
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
