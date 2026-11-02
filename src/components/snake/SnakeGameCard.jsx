/**
 * « Snake du Gang » sur la page « Jeux » (/jeux), sous la carte de la Coupe (planche du 2 nov. 2026,
 * `Jeux.dc.html`) : carte sombre, mini-écran vert (titre à pixels, serpent, bouchée, bestiole, ton
 * record), pastille « Nouveau » jusqu'au 2 déc. 2026 inclus (date de Paris), accroche de `GAMES`,
 * « Ton record » en or quand tu en as un, « Jouer » vers /snake.
 *
 * Un seul lien : « Jouer », étendu sur toute la carte (`after:inset-0`), rien d'autre de cliquable.
 * Le record n'apparaît qu'une fois lu : rien pendant le chargement, rien sur une panne (la carte ne
 * montre jamais d'erreur ; le jeu dira lui-même s'il ne joint pas le serveur).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useSnakeMe } from '@/lib/snake/snakeApi';
import { lcdScore } from '@/lib/snake/format';
import Lcd from './Lcd';
import { SNAKE_COLORS as C } from './palette';
import { BugSprite, DiamondSprite } from './pages/sprites';

/** Dernier jour (Paris) de la pastille « Nouveau » : un mois après l'ouverture du 2 nov. 2026. */
const NEW_UNTIL = '2026-12-02';
// Largeur du décor de la planche (écran vert de la carte à 390 px)
const SCENE_WIDTH = 316;

/** Jour de Paris, `YYYY-MM-DD`. */
function parisDayKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Serpent de la planche : 15 cases de 9 px (pas de 10 px), du bout de la queue à la tête
const SNAKE_CELLS = [
  [20, 100], [30, 100], [40, 100], [50, 100], [60, 100], [70, 100], [80, 100],
  [80, 90], [80, 80],
  [90, 80], [100, 80], [110, 80], [120, 80], [130, 80], [140, 80], [150, 80],
];

/**
 * Décor de l'écran vert, aux mesures de la planche (316 × 130 px). Plus étroit (téléphone de
 * 320 px) : le décor reste calé à droite et la queue du serpent sort par la gauche, comme dans le
 * jeu (pas de murs) ; jamais une bestiole coupée.
 */
function Scene() {
  return (
    <div
      className="absolute inset-y-0"
      style={{ width: SCENE_WIDTH, left: `min(0px, calc(100% - ${SCENE_WIDTH}px))` }}
    >
      {SNAKE_CELLS.map(([x, y]) => (
        <span key={`${x}-${y}`} className="absolute h-[9px] w-[9px]" style={{ left: x, top: y, background: C.encre }} />
      ))}
      {/* Yeux de la tête */}
      <span className="absolute h-[2px] w-[2px]" style={{ left: 156, top: 82, background: C.lcd }} />
      <span className="absolute h-[2px] w-[2px]" style={{ left: 156, top: 86, background: C.lcd }} />
      <DiamondSprite size={10} className="absolute" style={{ left: 198, top: 79 }} fill={C.encre} />
      <BugSprite kind="araignee" width={56} height={28} className="absolute" style={{ left: 238, top: 26 }} fill={C.encre} />
    </div>
  );
}

export default function SnakeGameCard({ game }) {
  const { user } = useAuth();
  const meQuery = useSnakeMe({ enabled: !!user });
  const me = meQuery.data || null;
  const record = me?.record && Number.isFinite(Number(me.record.score)) ? Math.max(0, Math.round(Number(me.record.score))) : null;
  const isNew = parisDayKey() <= NEW_UNTIL;
  const tagline = game?.tagline;

  return (
    <article
      aria-labelledby="jeu-snake"
      className="relative flex flex-col gap-3.5 rounded-3xl border p-3.5"
      style={{ background: C.carte, borderColor: 'rgba(61, 190, 126, 0.4)', colorScheme: 'dark' }}
    >
      <Lcd aria-hidden="true" innerClassName="relative h-[130px] overflow-hidden">
        <div className="absolute left-[14px] top-3 text-[30px] font-bold leading-[28px]">SNAKE</div>
        <div className="absolute left-4 top-[46px] text-[11px] tracking-[0.3em]">DU GANG</div>
        <Scene />
        {/* Écran du jeu : ton record sur 4 chiffres (0000 sans partie), rien tant qu'il n'est pas lu */}
        {me && <div className="absolute right-3 top-2.5 text-xs">{lcdScore(record ?? 0)}</div>}
      </Lcd>

      <div className="flex items-center gap-2.5 px-1">
        <h2 id="jeu-snake" className="min-w-0 flex-1 font-fut text-[26px] font-extrabold uppercase leading-none tracking-[0.02em] text-white">
          Snake du Gang
        </h2>
        {isNew && (
          <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: 'rgba(61, 190, 126, 0.16)', color: C.vertTexte }}>
            Nouveau
          </span>
        )}
      </div>
      {tagline && <p className="-mt-1 mx-1 text-sm leading-[1.45]" style={{ color: C.gris }}>{tagline}</p>}

      <div className="flex items-center gap-3 px-1 pb-1">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {record != null && record > 0 && (
            <>
              <span className="text-xs" style={{ color: C.gris }}>Ton record</span>
              <span className="font-pixel text-lg font-bold leading-tight" style={{ color: C.or }}>{record}</span>
            </>
          )}
        </div>
        {/* Seul lien de la carte, étendu sur toute la carte (l'article est le bloc positionné) */}
        <Link
          to="/snake"
          className="flex h-12 shrink-0 items-center gap-2 rounded-[14px] px-[22px] font-fut text-xl font-extrabold uppercase tracking-[0.06em] text-white after:absolute after:inset-0 after:rounded-3xl hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3DBE7E]"
          style={{ background: C.vert }}
        >
          Jouer<span className="sr-only"> au Snake du Gang</span>
          <ArrowRight className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
