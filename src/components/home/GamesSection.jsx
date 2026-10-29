/**
 * Les jeux dans les écrans existants (contrat de la Coupe : docs/fonctions/coupe-du-gang-contrat.md,
 * section 5.3). Un jeu n'apparaît que s'il est ouvert (`useGames` de src/lib/games.js ; la Coupe :
 * `features.coupe`, faux tant que rien n'est chargé, avec `COUPE_WS=off` ou un serveur d'avant) :
 *  - `GamesSection` (défaut) : section « Jeux » de l'accueil (`games` de homepage_order, après
 *    « Comme la dernière fois », déplaçable et masquable par l'admin dans « Organiser l'accueil ») :
 *    une carte « Jeux » avec le nom de chaque jeu, qui mène à la page « Jeux » (/jeux, demande du
 *    29 oct. 2026). Aucun jeu ouvert : rien, le conteneur `.auto-section` vide est caché par l'accueil ;
 *  - `CoupeGameCard` : carte « La Coupe du Gang » de la page « Jeux » (tes Points de Coupe de la
 *    saison, « Jouer » → /coupe, et deux accès directs, contre le salon et à deux sur ce téléphone,
 *    `/coupe?mode=…`, contrat 5.1) ;
 *  - `GamesFeedEntry` : entrée « Jeux » en tête du fil, sous la Team of the Season, vers /jeux ;
 *    absente quand l'admin a masqué la catégorie « Jeux » de l'accueil ;
 *  - `CoupeGangBlock` : bloc de la page de la carte Gang, SOUS la carte (jamais dessus : aucun
 *    bandeau écrit sur la carte Gang) ;
 *  - petits outils d'affichage partagés (saison, rang, ligne « COUPE · pts · rang » de la carte FUT,
 *    marque du rôle de l'adversaire).
 * Identité des maquettes validées (or #ebc15e sur fond sombre, titres condensés `font-fut`) : fonds
 * sombres et textes clairs écrits en dur, lisibles avec les deux thèmes (comme la Carte Cadeau).
 * Textes au tutoiement, comme les écrans du jeu.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Bot, ChevronRight, Gamepad2, Scissors, Smartphone, Star, Trophy } from 'lucide-react';
import { queryFailed } from '@/components/shared/LoadError';
import CoupeLoadError from '@/components/coupe/CoupeLoadError';
import { COUPE_PAUSED, isCoupeClosed } from '@/components/coupe/coupeErrors';
import { useAuth } from '@/lib/AuthContext';
import { useCoupeEnabled, useCoupeMe } from '@/lib/coupe/coupeApi';
import { useGames } from '@/lib/games';
import { useHomeSectionHidden } from '@/lib/homeSections';

export const COUPE_GOLD = '#ebc15e';
const GOLD_SOFT = '#c9b27a';
const MUTED = '#9db0a6';
const ON_GOLD = '#1a1205';
const GOLD_BORDER = 'rgba(235, 193, 94, 0.3)';
const CARD_BG = 'linear-gradient(135deg, #1d180a 0%, #12161a 70%)';
const BLOCK_BG = 'linear-gradient(160deg, #1b170b 0%, #12161a 60%)';

const plural = (n, one, many) => (Math.abs(n) === 1 ? one : many);

// ─── Outils d'affichage ─────────────────────────────────────────────

/** Mois de la saison 'YYYY-MM' (mois civil de Paris) : « novembre », null si illisible. */
export function coupeSeasonMonth(season) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(season || ''));
  const month = m ? Number(m[2]) : 0;
  if (month < 1 || month > 12) return null;
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(Number(m[1]), month - 1, 15)));
}

/** « Saison de novembre », « Saison d’octobre » ; « Saison en cours » sans mois lisible. */
export function coupeSeasonLabel(season) {
  const month = coupeSeasonMonth(season);
  if (!month) return 'Saison en cours';
  return /^[aeiouyàâéèêîôû]/i.test(month) ? `Saison d’${month}` : `Saison de ${month}`;
}

/** Saison en cours d'après l'heure de Paris ('YYYY-MM'). */
export function currentCoupeSeason(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}`;
}

/** Rang du classement (entier ≥ 1) ou null (absent du classement). */
export function coupeRank(rank) {
  const n = Number(rank);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** Suffixe d'un rang : 1er, 2e, 3e… */
export const rankSuffix = (n) => (n === 1 ? 'er' : 'e');

/** « 8e », avec le suffixe en exposant. */
export function CoupeRankText({ rank }) {
  return <>{rank}<sup className="text-[0.6em] align-baseline relative -top-[0.55em] ml-px">{rankSuffix(rank)}</sup></>;
}

/** Points et rang de la saison pour la ligne « COUPE · pts · rang » de la carte FUT (`BarberCard`). */
export function coupeCardLine(stats) {
  if (!stats || typeof stats !== 'object') return null;
  return { points: Math.max(0, Math.round(Number(stats.points) || 0)), rank: coupeRank(stats.rank) };
}

/** Nom affiché d'un joueur (texte ou `{ name }`) ; compte supprimé → « un ancien joueur » (contrat 1). */
export function coupePlayerName(player) {
  const name = typeof player === 'string' ? player : player?.name;
  return String(name || '').trim() || 'un ancien joueur';
}

/** Marque du rôle à côté d'un nom : ciseaux pour un barber, étoile bleue pour le salon. */
export function CoupeRoleMark({ role, className = 'w-3 h-3' }) {
  if (role === 'barber') {
    return (
      <span className="inline-flex shrink-0 align-[-0.1em]" title="Barber">
        <Scissors className={className} style={{ color: MUTED }} aria-hidden="true" />
        <span className="sr-only"> (barber)</span>
      </span>
    );
  }
  if (role === 'salon') {
    return (
      <span className="inline-flex shrink-0 align-[-0.1em]" title="Le salon">
        <Star className={`${className} text-blue-500 fill-blue-500`} aria-hidden="true" />
        <span className="sr-only"> (le salon)</span>
      </span>
    );
  }
  return null;
}

/** Ballon (rond + pentagone, comme les maquettes) : lucide n'a pas de ballon de foot. */
export function CoupeBallIcon({ className = 'w-5 h-5', style }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7l4 3-1.5 4.5h-5L8 10z" />
    </svg>
  );
}

/** Décor : un terrain vu du dessus en traits dorés très discrets (statique). */
function PitchLines({ className = '', style }) {
  return (
    <svg viewBox="0 0 120 160" className={className} style={style} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="112" height="152" rx="8" />
      <line x1="4" y1="80" x2="116" y2="80" />
      <circle cx="60" cy="80" r="19" />
      <circle cx="60" cy="80" r="2.5" fill="currentColor" />
      <rect x="32" y="4" width="56" height="24" />
      <rect x="32" y="132" width="56" height="24" />
    </svg>
  );
}

/** Pictogramme d'un jeu (`id` de GAMES) : le ballon pour la Coupe, une manette sinon. */
export function GameIcon({ id, className = 'w-4 h-4', style }) {
  if (id === 'coupe') return <CoupeBallIcon className={className} style={style} />;
  return <Gamepad2 className={className} style={style} aria-hidden="true" />;
}

// ─── Accueil : section « Jeux » ─────────────────────────────────────

/** Carte « Jeux » de l'accueil : le nom de chaque jeu ouvert, et tout mène à la page « Jeux ». */
export default function GamesSection() {
  const { games } = useGames();
  const reduceMotion = useReducedMotion();
  if (games.length === 0) return null;

  return (
    <section aria-label="Jeux">
      <Link to="/jeux" className="block rounded-3xl" aria-label={`Jeux : ${games.map((g) => g.title).join(', ')}`}>
        <motion.div whileTap={reduceMotion ? undefined : { scale: 0.98 }} className="rounded-3xl">
          <div className="shine-sweep relative overflow-hidden rounded-3xl border p-5" style={{ background: CARD_BG, borderColor: GOLD_BORDER }}>
            <Gamepad2 className="absolute -right-5 -bottom-8 w-36 h-36 rotate-[-14deg] pointer-events-none" style={{ color: COUPE_GOLD, opacity: 0.09 }} aria-hidden="true" />
            <div className="relative flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] tracking-[0.3em] uppercase font-medium" style={{ color: GOLD_SOFT }}>Le Gang joue</p>
                <h2 className="mt-1 font-fut text-[34px] font-extrabold uppercase leading-none tracking-wide text-white">Jeux</h2>
                <p className="mt-1.5 text-xs leading-snug text-white/60">Choisis ton jeu et défie le Gang.</p>
              </div>
              <span className="w-11 h-11 shrink-0 rounded-full grid place-items-center" style={{ background: COUPE_GOLD, color: ON_GOLD }}>
                <ChevronRight className="w-5 h-5" aria-hidden="true" />
              </span>
            </div>
            <ul className="relative mt-4 flex flex-wrap gap-2">
              {games.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-white/90 min-w-0"
                  style={{ background: 'rgba(235, 193, 94, 0.1)', borderColor: GOLD_BORDER }}
                >
                  <GameIcon id={g.id} className="w-3.5 h-3.5 shrink-0" style={{ color: COUPE_GOLD }} />
                  <span className="truncate">{g.title}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </Link>
    </section>
  );
}

// ─── Page « Jeux » : carte de La Coupe du Gang ──────────────────────

function ModeTile({ to, icon: Icon, iconColor, title, text }) {
  return (
    <Link to={to} className="glass rounded-2xl p-3 flex flex-col gap-1.5 min-w-0 active:bg-white/10 transition-colors">
      <Icon className="w-5 h-5" style={{ color: iconColor }} aria-hidden="true" />
      <span className="font-fut text-base font-extrabold uppercase tracking-wide leading-tight text-foreground">{title}</span>
      <span className="text-[11px] leading-snug text-muted-foreground">{text}</span>
    </Link>
  );
}

/**
 * « La Coupe du Gang » sur la page « Jeux » (ouverte seulement quand le jeu l'est, `useGames`) :
 * tes Points de Coupe et ta place, « Jouer », contre le salon et à deux sur ce téléphone.
 */
export function CoupeGameCard() {
  const { user } = useAuth();
  const meQuery = useCoupeMe({ enabled: !!user });
  const reduceMotion = useReducedMotion();

  const me = meQuery.data || null;
  const failed = queryFailed(meQuery);
  // Jeu coupé par le serveur depuis la lecture du drapeau : « La Coupe fait une pause », jamais une panne
  const closed = failed && isCoupeClosed(meQuery.error);
  const stats = me?.season_stats || null;
  const points = me ? Math.max(0, Math.round(Number(stats?.points) || 0)) : null;
  const rank = coupeRank(stats?.rank);
  let standing = null;
  if (me) {
    if (me.eligible === false) standing = 'Matchs amicaux jusqu’à ta carte Gang';
    else if (rank) standing = <><CoupeRankText rank={rank} /> de la {coupeSeasonLabel(me.season).toLowerCase()}</>;
    else standing = 'Pas encore au classement';
  }

  return (
    <article aria-labelledby="coupe-game-title">
      <div className="shine-sweep relative overflow-hidden rounded-3xl border p-5" style={{ background: CARD_BG, borderColor: GOLD_BORDER }}>
        <PitchLines className="absolute -right-5 -top-4 w-32 rotate-[-10deg] pointer-events-none" style={{ color: COUPE_GOLD, opacity: 0.13 }} />
        <div className="relative">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 shrink-0" style={{ color: COUPE_GOLD }} aria-hidden="true" />
            <p className="text-[10px] tracking-[0.3em] uppercase text-white/50 font-medium">Mini-jeu de foot</p>
          </div>
          <h2 id="coupe-game-title" className="mt-1.5 font-fut text-[28px] font-extrabold uppercase leading-none tracking-wide text-white">
            La <span style={{ color: COUPE_GOLD }}>Coupe</span> du Gang
          </h2>
          <p className="mt-1.5 text-xs leading-snug text-white/60">Défie un barber, un pote ou le salon : premier à 3 buts.</p>

          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: GOLD_SOFT }}>Tes Points de Coupe</p>
              <p className="mt-1 font-fut text-5xl font-extrabold leading-[0.85] tabular-nums" style={{ color: COUPE_GOLD }}>
                {points ?? '–'}
              </p>
              {closed ? (
                <p className="mt-1.5 text-xs leading-snug text-white/75 min-h-[1rem]">{COUPE_PAUSED}</p>
              ) : failed ? (
                <button
                  type="button"
                  onClick={() => meQuery.refetch()}
                  className="mt-1.5 text-xs text-white/70 underline underline-offset-2"
                >
                  Points indisponibles · Réessayer
                </button>
              ) : (
                <p className="mt-1.5 text-xs leading-snug text-white/75 min-h-[1rem]">{standing}</p>
              )}
            </div>
            <Link to="/coupe" className="shrink-0 rounded-xl">
              <motion.span
                whileTap={reduceMotion ? undefined : { scale: 0.95 }}
                className="flex items-center gap-1.5 h-11 px-5 rounded-xl font-fut text-lg font-extrabold uppercase tracking-[0.06em]"
                style={{ background: COUPE_GOLD, color: ON_GOLD, boxShadow: '0 8px 24px rgba(235, 193, 94, 0.25)' }}
              >
                Jouer <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </motion.span>
            </Link>
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <ModeTile to="/coupe?mode=bot&level=apprenti" icon={Bot} iconColor="#86adff" title="Contre le salon" text="3 niveaux · sans points" />
        <ModeTile to="/coupe?mode=local" icon={Smartphone} iconColor={COUPE_GOLD} title="À deux" text="Sur ce téléphone · amical" />
      </div>
    </article>
  );
}

// ─── Fil : entrée compacte ──────────────────────────────────────────

/**
 * Entrée « Jeux » en tête du fil, vers la page « Jeux » : rien sans jeu ouvert, ni quand l'admin a
 * masqué la catégorie « Jeux » de l'accueil (rien non plus tant que les paramètres ne sont pas lus).
 */
export function GamesFeedEntry({ className = '' }) {
  const { games } = useGames();
  const { hidden, ready } = useHomeSectionHidden('games');
  if (games.length === 0 || !ready || hidden) return null;
  return (
    <Link
      to="/jeux"
      className={`flex items-center gap-3 rounded-2xl border p-3 active:opacity-90 transition-opacity ${className}`}
      style={{ background: CARD_BG, borderColor: GOLD_BORDER }}
    >
      <span className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center" style={{ background: 'rgba(235, 193, 94, 0.14)' }}>
        <Gamepad2 className="w-5 h-5" style={{ color: COUPE_GOLD }} aria-hidden="true" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-fut text-lg font-extrabold uppercase tracking-wide leading-none text-white">Jeux</span>
        <span className="block mt-1 text-xs truncate" style={{ color: MUTED }}>{games.map((g) => g.title).join(' · ')}</span>
      </span>
      <ChevronRight className="w-5 h-5 shrink-0" style={{ color: COUPE_GOLD }} aria-hidden="true" />
    </Link>
  );
}

// ─── Page de la carte Gang : bloc sous la carte ─────────────────────

function StatTile({ value, label, gold = false }) {
  return (
    <div className="rounded-xl px-1 py-2.5 text-center min-w-0" style={{ background: gold ? 'rgba(235, 193, 94, 0.1)' : 'rgba(255, 255, 255, 0.04)' }}>
      <p className="font-fut text-[26px] font-extrabold leading-none tabular-nums" style={{ color: gold ? COUPE_GOLD : '#eef3ef' }}>{value}</p>
      <p className="mt-1 text-[11px] truncate" style={{ color: gold ? GOLD_SOFT : MUTED }}>{label}</p>
    </div>
  );
}

// Issue d'un match récent (`recent[].reason` du serveur : 'cancelled', 'too_short', 'time_limit',
// 'time_limit_draw' ou null ; `cancelled` vaut reason === 'cancelled')
const matchCancelled = (m) => m.cancelled === true || m.reason === 'cancelled';
const matchDraw = (m) => m.reason === 'time_limit_draw';

function ResultBadge({ match }) {
  const kind = matchCancelled(match) ? 'cancelled' : matchDraw(match) ? 'draw' : match.won ? 'won' : 'lost';
  const look = {
    won: { text: 'V', label: 'Victoire', bg: 'rgba(51, 181, 116, 0.18)', color: '#6fd39f' },
    lost: { text: 'D', label: 'Défaite', bg: 'rgba(255, 255, 255, 0.08)', color: '#c6d1cb' },
    draw: { text: 'N', label: 'Match nul', bg: 'rgba(235, 193, 94, 0.12)', color: COUPE_GOLD },
    cancelled: { text: '–', label: 'Match annulé', bg: 'rgba(255, 255, 255, 0.05)', color: '#8a9a92' },
  }[kind];
  return (
    <span className="w-[22px] h-[22px] shrink-0 rounded-md grid place-items-center font-fut text-[13px] font-extrabold leading-none" style={{ background: look.bg, color: look.color }}>
      <span aria-hidden="true">{look.text}</span>
      <span className="sr-only">{look.label}</span>
    </span>
  );
}

function MatchDelta({ match }) {
  const delta = Math.round(Number(match.delta) || 0);
  const counted = !matchCancelled(match) && match.ranked !== false;
  const text = delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : '0';
  const color = !counted || delta === 0 ? '#8a9a92' : delta > 0 ? COUPE_GOLD : '#eef3ef';
  return (
    <span className="shrink-0 font-fut text-base font-extrabold leading-none tabular-nums" style={{ color }}>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{`${text} ${plural(delta, 'point', 'points')}`}</span>
    </span>
  );
}

function RecentMatch({ match }) {
  const score = Array.isArray(match.score) && match.score.length === 2 ? match.score : null;
  const tag = matchCancelled(match) ? 'annulé'
    : matchDraw(match) ? 'nul au temps'
      : match.reason === 'too_short' ? 'trop court'
        : match.ranked === false ? 'amical' : null;
  return (
    <li className="flex items-center gap-2.5 py-2.5 border-b border-white/[0.06] last:border-b-0 text-[13.5px] text-[#eef3ef]">
      <ResultBadge match={match} />
      <span className="flex-1 min-w-0 leading-snug">
        {score && <span className="tabular-nums">{score[0]} – {score[1]} </span>}
        contre <span className="font-semibold">{coupePlayerName(match.opponent)}</span>
        {' '}<CoupeRoleMark role={match.opponent?.role} />
        {tag && <span style={{ color: '#8a9a92' }}> · {tag}</span>}
      </span>
      <MatchDelta match={match} />
    </li>
  );
}

/**
 * « La Coupe du Gang » sur la page de la carte Gang (maquette « Page de la carte Gang, client ») :
 * points, rang, victoires et défaites de la saison, les 3 derniers matchs et « Jouer à la Coupe ».
 * Aussi sans carte Gang : on joue quand même, en amical (les points arrivent avec la carte).
 */
export function CoupeGangBlock({ className = '' }) {
  const enabled = useCoupeEnabled();
  const meQuery = useCoupeMe({ enabled });
  if (!enabled) return null;

  const { data: me, isPending, error, refetch, isFetching } = meQuery;
  // Échec sans données, ou requête en pause hors connexion : jamais des zéros trompeurs. Jeu coupé
  // par le serveur (`disabled`) : « La Coupe fait une pause », sans « Jouer »
  const failed = queryFailed(meQuery);
  const closed = failed && isCoupeClosed(error);
  const stats = me?.season_stats || {};
  const points = Math.max(0, Math.round(Number(stats.points) || 0));
  const wins = Math.max(0, Math.round(Number(stats.wins) || 0));
  const losses = Math.max(0, Math.round(Number(stats.losses) || 0));
  const rank = coupeRank(stats.rank);
  const recent = Array.isArray(me?.recent) ? me.recent.filter((m) => m && typeof m === 'object').slice(0, 3) : [];
  let note = null;
  if (me?.eligible === false) {
    note = me.eligible_reason === 'no_card'
      ? 'Tes matchs sont amicaux : les Points de Coupe arrivent avec ta carte Gang, après ta première visite au salon.'
      : 'Tes matchs sont amicaux pour l’instant : ils ne rapportent pas de points.';
  } else if (me && !rank && me.opt_in === false) {
    note = 'Pas de rang : tu n’apparais pas au classement. Tu peux l’activer sur la page de la Coupe.';
  }

  return (
    <section
      aria-labelledby="coupe-gang-title"
      className={`rounded-[20px] border p-4 flex flex-col gap-3.5 ${className}`}
      style={{ background: BLOCK_BG, borderColor: GOLD_BORDER }}
    >
      {/* Le titre ne se coupe jamais : sur un écran étroit, la saison passe en dessous */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="coupe-gang-title" className="flex items-center gap-2 font-fut text-xl font-extrabold uppercase tracking-wide leading-none whitespace-nowrap text-[#eef3ef]">
          <Trophy className="w-5 h-5 shrink-0" style={{ color: COUPE_GOLD }} aria-hidden="true" />
          La Coupe du Gang
        </h2>
        {me && <span className="text-[11px]" style={{ color: GOLD_SOFT }}>{coupeSeasonLabel(me.season)}</span>}
      </div>

      {isPending && !failed && (
        <div className="grid grid-cols-2 min-[360px]:grid-cols-4 gap-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-[60px] rounded-xl bg-white/[0.05] animate-pulse" />)}
        </div>
      )}

      {failed && (
        <CoupeLoadError compact what="tes Points de Coupe" error={error} onRetry={refetch} retrying={isFetching} />
      )}

      {me && (
        <>
          <div className="grid grid-cols-2 min-[360px]:grid-cols-4 gap-2">
            <StatTile gold value={points} label={plural(points, 'point', 'points')} />
            <StatTile value={rank ? <CoupeRankText rank={rank} /> : '–'} label="rang" />
            <StatTile value={wins} label={plural(wins, 'victoire', 'victoires')} />
            <StatTile value={losses} label={plural(losses, 'défaite', 'défaites')} />
          </div>
          {note && <p className="-mt-1 text-[11px] leading-snug" style={{ color: MUTED }}>{note}</p>}

          <div>
            <p className="mb-0.5 font-fut text-[13px] font-bold uppercase tracking-[0.12em]" style={{ color: MUTED }}>Derniers matchs</p>
            {recent.length > 0 ? (
              <ul>
                {recent.map((m, i) => <RecentMatch key={`${m.ended_at || ''}-${i}`} match={m} />)}
              </ul>
            ) : (
              <p className="py-2 text-xs leading-snug" style={{ color: MUTED }}>
                Aucun match pour l’instant : défie un barber, un pote ou le salon.
              </p>
            )}
          </div>
        </>
      )}

      {!closed && (
        <Link
          to="/coupe"
          className="min-h-[50px] rounded-[14px] grid place-items-center font-fut text-lg font-extrabold uppercase tracking-[0.06em] active:opacity-90 transition-opacity"
          style={{ background: COUPE_GOLD, color: ON_GOLD }}
        >
          Jouer à la Coupe
        </Link>
      )}
    </section>
  );
}
