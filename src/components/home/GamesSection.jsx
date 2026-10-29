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
 * Thème stade (planche validée le 29 oct. 2026, docs/fonctions/coupe-du-gang-stade.md, maquette
 * « JeuxRouge ») : rouge, noir et blanc, une touche d'or (`COUPE_COLORS`), titres condensés
 * `font-fut`. La carte « Jeux » de l'accueil et la carte de la Coupe de la page « Jeux » sont posées
 * sur le haut du stade assombri (tribune au logo). Fonds sombres et textes clairs écrits en dur,
 * lisibles avec les deux thèmes de l'app (comme la Carte Cadeau). Textes au tutoiement, comme les
 * écrans du jeu.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Bot, ChevronRight, Gamepad2, Scissors, Smartphone, Star, Trophy } from 'lucide-react';
import { queryFailed } from '@/components/shared/LoadError';
import CoupeLoadError from '@/components/coupe/CoupeLoadError';
import { COUPE_PAUSED, isCoupeClosed } from '@/components/coupe/coupeErrors';
import { COUPE_COLORS as C } from '@/components/coupe/palette';
import { useAuth } from '@/lib/AuthContext';
import { useCoupeEnabled, useCoupeMe } from '@/lib/coupe/coupeApi';
import { useGames } from '@/lib/games';
import { useHomeSectionHidden } from '@/lib/homeSections';
// Image du stade par stadiumImage.js, sans le moteur du jeu : ce fichier est dans le paquet
// principal (accueil, fil, profil d'un barber), stadium.js y tirerait engine.js et renderer.js
import { STADIUM_URL as stadiumUrl } from '@/lib/coupe/stadiumImage';

/** Or de la Coupe (`COUPE_COLORS.or`, #ebc15e) : aussi lu par le profil d'un barber et Mon espace. */
export const COUPE_GOLD = C.or;
// Rouge presque noir des maquettes du thème stade (fonds des cartes, voile de la carte de la Coupe)
const ROUGE_NUIT = '#2a0b0d';
const LINE = 'rgba(255, 255, 255, 0.1)';
const BLOCK_BG = `linear-gradient(160deg, ${ROUGE_NUIT} 0%, ${C.noir2} 60%)`;
// Carte « Jeux » de l'accueil et entrée du fil : au vert de l'app (bouton « + » du fil, green-500),
// pas au rouge du stade (demande du propriétaire, 29 oct. 2026)
const VERT = '#22c55e';
const VERT_CLAIR = '#4ade80';
const FEED_BG = `linear-gradient(135deg, #0b2416 0%, ${C.noir2} 65%)`;
const FEED_BORDER = 'rgba(34, 197, 94, 0.5)';
const FEED_TINT = 'rgba(34, 197, 94, 0.16)';
// Voiles sur le stade : noir à gauche sous les textes, l'image à droite. Carte de l'accueil au vert
// de l'app (demande du propriétaire, 29 oct. 2026) : stade en gris sous un voile vert nuit, sinon
// ses tribunes rouges juraient avec le vert
const HOME_VEIL = 'linear-gradient(90deg, rgba(6, 20, 12, 0.97) 0%, rgba(6, 20, 12, 0.85) 60%, rgba(9, 38, 22, 0.5) 100%)';
const HOME_IMAGE = { filter: 'grayscale(1)' };
const COUPE_VEIL = 'linear-gradient(100deg, rgba(11, 11, 12, 0.96) 0%, rgba(11, 11, 12, 0.82) 55%, rgba(42, 11, 13, 0.55) 100%)';
// Textes clairs posés sur l'image : une ombre légère les détache des tribunes éclairées
const ON_IMAGE = { textShadow: '0 1px 2px rgba(0, 0, 0, 0.6)' };

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
        <Scissors className={className} style={{ color: C.gris }} aria-hidden="true" />
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

/**
 * Décor : le haut du stade (tribune au logo D'Home Barber) derrière une carte, assombri par `veil`
 * pour garder les textes lisibles. Image décorative (alt vide), statique ; `position` la cadre
 * (`object-position`). Image absente (hors connexion sur le web) : cachée, le fond noir de la carte
 * reste.
 */
function StadiumBackdrop({ position, veil, lazy = false, imageStyle }) {
  return (
    <>
      <img
        src={stadiumUrl}
        alt=""
        loading={lazy ? 'lazy' : undefined}
        decoding="async"
        draggable={false}
        onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        style={{ objectPosition: position, ...imageStyle }}
      />
      <div className="absolute inset-0 pointer-events-none" style={{ background: veil }} aria-hidden="true" />
    </>
  );
}

/** Pictogramme d'un jeu (`id` de GAMES) : le ballon pour la Coupe, une manette sinon. */
export function GameIcon({ id, className = 'w-4 h-4', style }) {
  if (id === 'coupe') return <CoupeBallIcon className={className} style={style} />;
  return <Gamepad2 className={className} style={style} aria-hidden="true" />;
}

// ─── Accueil : section « Jeux » ─────────────────────────────────────

/**
 * Carte « Jeux » de l'accueil : sur le haut du stade, en gris sous un voile vert, au vert de l'app
 * comme l'entrée du fil (bord, « Le Gang joue », puces, flèche), le nom de chaque jeu ouvert, et
 * tout mène à la page « Jeux ». Image en chargement différé : la carte est sous « Comme la dernière
 * fois », rarement à l'écran à l'arrivée.
 */
export default function GamesSection() {
  const { games } = useGames();
  const reduceMotion = useReducedMotion();
  if (games.length === 0) return null;

  return (
    <section aria-label="Jeux">
      <Link to="/jeux" className="block rounded-3xl" aria-label={`Jeux : ${games.map((g) => g.title).join(', ')}`}>
        <motion.div whileTap={reduceMotion ? undefined : { scale: 0.98 }} className="rounded-3xl">
          <div className="shine-sweep relative overflow-hidden rounded-3xl border" style={{ background: C.noir, borderColor: FEED_BORDER }}>
            <StadiumBackdrop position="50% 12%" veil={HOME_VEIL} imageStyle={HOME_IMAGE} lazy />
            <div className="relative flex items-center gap-4 p-5" style={ON_IMAGE}>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] tracking-[0.3em] uppercase font-semibold" style={{ color: VERT_CLAIR }}>Le Gang joue</p>
                <h2 className="mt-1 font-fut text-[34px] font-extrabold uppercase leading-none tracking-wide text-white">Jeux</h2>
                <p className="mt-1.5 text-xs leading-snug" style={{ color: C.grisClair }}>Choisis ton jeu et défie le Gang.</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {games.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-white min-w-0 max-w-full"
                      style={{ background: FEED_TINT, borderColor: 'rgba(255, 255, 255, 0.25)' }}
                    >
                      <GameIcon id={g.id} className="w-3.5 h-3.5 shrink-0" style={{ color: VERT_CLAIR }} />
                      <span className="truncate">{g.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <span className="w-11 h-11 shrink-0 rounded-full grid place-items-center" style={{ background: VERT, color: C.blanc }}>
                <ChevronRight className="w-5 h-5" aria-hidden="true" />
              </span>
            </div>
          </div>
        </motion.div>
      </Link>
    </section>
  );
}

// ─── Page « Jeux » : carte de La Coupe du Gang ──────────────────────

function ModeTile({ to, icon: Icon, iconColor, title, text }) {
  return (
    <Link
      to={to}
      className="rounded-2xl border p-3 flex flex-col gap-1.5 min-w-0 active:opacity-80 transition-opacity"
      style={{ background: C.noir2, borderColor: LINE }}
    >
      <Icon className="w-5 h-5" style={{ color: iconColor }} aria-hidden="true" />
      <span className="font-fut text-base font-extrabold uppercase tracking-wide leading-tight text-white">{title}</span>
      <span className="text-[11px] leading-snug" style={{ color: C.gris }}>{text}</span>
    </Link>
  );
}

/**
 * « La Coupe du Gang » sur la page « Jeux » (ouverte seulement quand le jeu l'est, `useGames`) :
 * tes Points de Coupe et ta place, « Jouer », contre le salon et à deux sur ce téléphone. Maquette
 * « JeuxRouge » : sur le stade, bord or ; trophée, « Coupe » et points en or ; « Jouer » rouge.
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
      <div className="shine-sweep relative overflow-hidden rounded-3xl border" style={{ background: C.noir, borderColor: C.orBord }}>
        <StadiumBackdrop position="50% 14%" veil={COUPE_VEIL} />
        <div className="relative min-h-[236px] flex flex-col p-5" style={ON_IMAGE}>
          <div className="flex items-center gap-2">
            <Trophy className="w-3.5 h-3.5 shrink-0" style={{ color: C.or }} aria-hidden="true" />
            <p className="text-[10px] tracking-[0.3em] uppercase font-semibold" style={{ color: C.grisClair }}>Mini-jeu de foot</p>
          </div>
          <h2 id="coupe-game-title" className="mt-1.5 font-fut text-[30px] font-extrabold uppercase leading-none tracking-wide text-white">
            La <span style={{ color: C.or }}>Coupe</span> du Gang
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-snug" style={{ color: C.grisClair }}>Défie un barber, un pote ou le salon : premier à 3 buts.</p>

          <div className="mt-auto pt-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.grisClair }}>Tes Points de Coupe</p>
              <p
                className="mt-1.5 font-fut text-[50px] font-extrabold leading-[0.85] tabular-nums"
                style={{ color: C.or, textShadow: `0 3px 0 ${C.rougeSombre}` }}
              >
                {points ?? '–'}
              </p>
              {closed ? (
                <p className="mt-1.5 text-xs leading-snug min-h-[1rem]" style={{ color: C.grisClair }}>{COUPE_PAUSED}</p>
              ) : failed ? (
                <button
                  type="button"
                  onClick={() => meQuery.refetch()}
                  className="min-h-[44px] inline-flex items-center text-left text-xs underline underline-offset-2"
                  style={{ color: C.grisClair }}
                >
                  Points indisponibles · Réessayer
                </button>
              ) : (
                <p className="mt-1.5 text-xs leading-snug text-white min-h-[1rem]">{standing}</p>
              )}
            </div>
            <Link to="/coupe" className="shrink-0 rounded-xl">
              <motion.span
                whileTap={reduceMotion ? undefined : { scale: 0.95 }}
                className="flex items-center gap-1.5 min-h-[46px] px-5 rounded-xl font-fut text-lg font-extrabold uppercase tracking-[0.06em]"
                style={{ background: C.rouge, color: C.blanc, boxShadow: '0 8px 24px rgba(224, 31, 38, 0.3)' }}
              >
                Jouer <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </motion.span>
            </Link>
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <ModeTile to="/coupe?mode=bot&level=apprenti" icon={Bot} iconColor={C.blanc} title="Contre le salon" text="3 niveaux · sans points" />
        <ModeTile to="/coupe?mode=local" icon={Smartphone} iconColor={C.rougeVif} title="À deux" text="Sur ce téléphone · amical" />
      </div>
    </article>
  );
}

// ─── Fil : entrée compacte ──────────────────────────────────────────

/**
 * Entrée « Jeux » en tête du fil, vers la page « Jeux » : rien sans jeu ouvert, ni quand l'admin a
 * masqué la catégorie « Jeux » de l'accueil (rien non plus tant que les paramètres ne sont pas lus).
 * Petite sœur de la carte de l'accueil, sans image (le fil est déjà lourd) : fond noir teinté de
 * rouge, bord rouge, flèche dans un rond rouge, pictogramme de chaque jeu en or.
 */
export function GamesFeedEntry({ className = '' }) {
  const { games } = useGames();
  const { hidden, ready } = useHomeSectionHidden('games');
  if (games.length === 0 || !ready || hidden) return null;
  return (
    <Link
      to="/jeux"
      className={`flex items-center gap-3 rounded-2xl border p-3 active:opacity-90 transition-opacity ${className}`}
      style={{ background: FEED_BG, borderColor: FEED_BORDER }}
    >
      <span className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center" style={{ background: FEED_TINT }}>
        <Gamepad2 className="w-5 h-5" style={{ color: VERT_CLAIR }} aria-hidden="true" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-fut text-lg font-extrabold uppercase tracking-wide leading-none text-white">Jeux</span>
        <span className="block mt-1 text-xs truncate" style={{ color: C.grisClair }}>
          {games.map((g, i) => (
            <React.Fragment key={g.id}>
              {i > 0 && ' · '}
              <GameIcon id={g.id} className="inline-block w-3.5 h-3.5 mr-1 align-[-0.2em]" style={{ color: VERT_CLAIR }} />
              {g.title}
            </React.Fragment>
          ))}
        </span>
      </span>
      <span className="w-8 h-8 shrink-0 rounded-full grid place-items-center" style={{ background: VERT, color: C.blanc }}>
        <ChevronRight className="w-4 h-4" aria-hidden="true" />
      </span>
    </Link>
  );
}

// ─── Page de la carte Gang : bloc sous la carte ─────────────────────

// Points de Coupe en or (ombre rouge sombre, comme l'accueil de la Coupe), le reste en blanc
function StatTile({ value, label, gold = false }) {
  return (
    <div className="rounded-xl px-1 py-2.5 text-center min-w-0" style={{ background: gold ? 'rgba(235, 193, 94, 0.1)' : 'rgba(255, 255, 255, 0.05)' }}>
      <p
        className="font-fut text-[26px] font-extrabold leading-none tabular-nums"
        style={gold ? { color: C.or, textShadow: `0 2px 0 ${C.rougeSombre}` } : { color: C.blanc }}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] truncate" style={{ color: gold ? C.grisClair : C.gris }}>{label}</p>
    </div>
  );
}

// Issue d'un match récent (`recent[].reason` du serveur : 'cancelled', 'too_short', 'time_limit',
// 'time_limit_draw' ou null ; `cancelled` vaut reason === 'cancelled')
const matchCancelled = (m) => m.cancelled === true || m.reason === 'cancelled';
const matchDraw = (m) => m.reason === 'time_limit_draw';

// Victoire en or, défaite en blanc sur rouge (comme la bande soulignée de rouge de l'écran de fin),
// nul en blanc, annulé en gris ; la lettre et le texte lu (sr-only) disent l'issue sans la couleur
function ResultBadge({ match }) {
  const kind = matchCancelled(match) ? 'cancelled' : matchDraw(match) ? 'draw' : match.won ? 'won' : 'lost';
  const look = {
    won: { text: 'V', label: 'Victoire', bg: 'rgba(235, 193, 94, 0.16)', color: C.or },
    lost: { text: 'D', label: 'Défaite', bg: 'rgba(224, 31, 38, 0.24)', color: C.blanc },
    draw: { text: 'N', label: 'Match nul', bg: 'rgba(255, 255, 255, 0.1)', color: C.blanc },
    cancelled: { text: '–', label: 'Match annulé', bg: 'rgba(255, 255, 255, 0.05)', color: C.gris },
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
  const color = !counted || delta === 0 ? C.gris : delta > 0 ? C.or : C.blanc;
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
    <li className="flex items-center gap-2.5 py-2.5 border-b border-white/[0.07] last:border-b-0 text-[13.5px] text-white">
      <ResultBadge match={match} />
      <span className="flex-1 min-w-0 leading-snug">
        {score && <span className="tabular-nums">{score[0]} – {score[1]} </span>}
        contre <span className="font-semibold">{coupePlayerName(match.opponent)}</span>
        {' '}<CoupeRoleMark role={match.opponent?.role} />
        {tag && <span style={{ color: C.gris }}> · {tag}</span>}
      </span>
      <MatchDelta match={match} />
    </li>
  );
}

/**
 * « La Coupe du Gang » sur la page de la carte Gang (maquette « Page de la carte Gang, client », aux
 * couleurs du thème stade) : points, rang, victoires et défaites de la saison, les 3 derniers matchs
 * et « Jouer à la Coupe ». Aussi sans carte Gang : on joue quand même, en amical (les points
 * arrivent avec la carte).
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
      style={{ background: BLOCK_BG, borderColor: C.orBord }}
    >
      {/* Le titre ne se coupe jamais : sur un écran étroit, la saison passe en dessous. Texte dans un
          seul élément (le flex de h2 espacerait « La », « Coupe » et « du Gang ») */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="coupe-gang-title" className="flex items-center gap-2 font-fut text-xl font-extrabold uppercase tracking-wide leading-none whitespace-nowrap text-white">
          <Trophy className="w-5 h-5 shrink-0" style={{ color: C.or }} aria-hidden="true" />
          <span>La <span style={{ color: C.or }}>Coupe</span> du Gang</span>
        </h2>
        {me && <span className="text-[11px]" style={{ color: C.grisClair }}>{coupeSeasonLabel(me.season)}</span>}
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
          {note && <p className="-mt-1 text-[11px] leading-snug" style={{ color: C.gris }}>{note}</p>}

          <div>
            <p className="mb-0.5 font-fut text-[13px] font-bold uppercase tracking-[0.12em]" style={{ color: C.gris }}>Derniers matchs</p>
            {recent.length > 0 ? (
              <ul>
                {recent.map((m, i) => <RecentMatch key={`${m.ended_at || ''}-${i}`} match={m} />)}
              </ul>
            ) : (
              <p className="py-2 text-xs leading-snug" style={{ color: C.gris }}>
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
          style={{ background: C.rouge, color: C.blanc }}
        >
          Jouer à la Coupe
        </Link>
      )}
    </section>
  );
}
