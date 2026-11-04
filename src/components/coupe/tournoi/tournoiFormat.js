/**
 * Tournois de La Coupe du Gang : petits calculs d'affichage, sans React (contrat :
 * docs/fonctions/coupe-tournois-contrat.md, sections 1 et 3.4). Toujours l'heure de Paris, et
 * toujours l'heure du serveur (`server_now`), jamais celle du téléphone seule.
 */
import { TOURNAMENT_CHECKIN_MS, TOURNAMENT_DRAW_SHOW_MS } from '@/lib/coupe/coupeApi';
import { ROLE_SALON, initialsOf, parisDayKey } from '../hub/coupeFormat';

const TZ = 'Europe/Paris';
const DAY_LONG = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short' });
const CLOCK = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });

/** Instant (ms) d'une date ISO ; null si illisible. */
export function msOf(iso) {
  if (iso == null || iso === '') return null;
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** « 19:00 », heure de Paris. */
export const clockOf = (t) => (t == null ? '' : CLOCK.format(new Date(t)));

/** « Vendredi 20 nov. », jour de Paris. */
export const dayOf = (t) => (t == null ? '' : cap(DAY_LONG.format(new Date(t))));

/** « Vendredi 20 nov. · 19:00 ». */
export const dateLine = (t) => (t == null ? '' : `${dayOf(t)} · ${clockOf(t)}`);

/** Jours de calendrier (Paris) entre deux instants. */
function daysBetween(from, to) {
  const a = parisDayKey(new Date(from)).split('-').map(Number);
  const b = parisDayKey(new Date(to)).split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000);
}

/** « dans 17 jours », « demain à 19:00 », « dans 2 h 05 », « dans 12 min », « maintenant ». */
export function startsIn(t, now) {
  if (t == null) return '';
  const days = daysBetween(now, t);
  if (days >= 2) return `dans ${days} jours`;
  if (days === 1) return `demain à ${clockOf(t)}`;
  const minutes = Math.ceil((t - now) / 60_000);
  if (minutes <= 0) return 'maintenant';
  if (minutes < 60) return `dans ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `dans ${h} h ${String(m).padStart(2, '0')}` : `dans ${h} h`;
}

/** « 12:48 » : minutes et secondes d'une durée (ms), jamais négative. */
export function mmss(msLeft) {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** « 20 nov. 2026 » pour la date d'un titre (`AAAA-MM-JJ` ou instant ISO). */
export function titleDate(date) {
  const s = String(date || '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return DAY_MONTH_YEAR.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
  const t = msOf(s);
  if (t == null) return '';
  const [y, mo, d] = parisDayKey(new Date(t)).split('-').map(Number);
  return DAY_MONTH_YEAR.format(new Date(Date.UTC(y, mo - 1, d)));
}

// ─── Tours ──────────────────────────────────────────────────────────

/** Nombre de tours : 3 pour 8 places, 4 pour 16. */
export const roundsCount = (size) => (Number(size) === 16 ? 4 : 3);

/** Durée annoncée : ~10 min par tour (5 min de jeu au plus, plus l'attente). */
export const durationMin = (size) => roundsCount(size) * 10;

// Noms d'un tour d'après sa distance à la finale (mêmes textes que `roundLabels` du serveur)
// `mine` : avec le bon possessif (« Ton quart de finale », « Ta demi-finale »)
const ROUND_NAMES = [
  { plural: 'Finale', singular: 'Finale', short: 'Finale', mine: 'Ta finale', of: () => 'de la finale' },
  { plural: 'Demi-finales', singular: 'Demi-finale', short: 'Demies', mine: 'Ta demi-finale', of: (n) => `de la demie ${n}` },
  { plural: 'Quarts de finale', singular: 'Quart de finale', short: 'Quarts', mine: 'Ton quart de finale', of: (n) => `du quart ${n}` },
  { plural: '8es de finale', singular: '8e de finale', short: '8es', mine: 'Ton 8e de finale', of: (n) => `du 8e de finale ${n}` },
];

/** `{ plural, singular, short, mine, of(n) }` d'un tour (1 = premier tour). */
export function roundNames(round, total) {
  const names = ROUND_NAMES[total - round];
  if (names) return names;
  return {
    plural: `Tour ${round}`, singular: `Tour ${round}`, short: `Tour ${round}`, mine: `Ton tour ${round}`,
    of: (n) => `du match ${n} du tour ${round}`,
  };
}

/** Titre d'un match dans le tableau : « Quart 3 », « Demie 1 », « Finale », « 8e de finale 6 ». */
export function matchTitle(round, slot, total) {
  const fromEnd = total - round;
  const n = Number(slot) + 1;
  if (fromEnd === 0) return 'Finale';
  if (fromEnd === 1) return `Demie ${n}`;
  if (fromEnd === 2) return `Quart ${n}`;
  if (fromEnd === 3) return `8e de finale ${n}`;
  return `Match ${n}`;
}

// ─── Joueurs ────────────────────────────────────────────────────────

/** Nom affiché d'un joueur : « Toi » pour soi (l'admin garde « D'Home Barber »), « Exempt » sans joueur. */
export function playerName(p, { exempt = 'Exempt' } = {}) {
  if (!p) return exempt;
  if (p.me && p.role !== ROLE_SALON) return 'Toi';
  return String(p.name || 'Joueur');
}

/** Initiales d'un pion : « DHB » pour le salon. */
export const pawnText = (p) => (p?.role === ROLE_SALON ? 'DHB' : initialsOf(p?.name));

// ─── État du tournoi ────────────────────────────────────────────────

/**
 * Phase de la page d'après le statut et l'heure du serveur :
 * `registration` (inscriptions), `presence` (15 min avant), `drawing` (début passé, le serveur n'a
 * pas encore tiré : quelques secondes), `draw` (tirage montré 30 s), `board` (tableau en direct),
 * `finished`, `cancelled`.
 */
export function phaseOf(t, now) {
  if (!t || typeof t !== 'object') return null;
  if (t.status === 'cancelled') return 'cancelled';
  if (t.status === 'finished') return 'finished';
  if (t.status === 'running') {
    const drawn = msOf(t.drawn_at);
    if (drawn != null && now < drawn + TOURNAMENT_DRAW_SHOW_MS) return 'draw';
    return 'board';
  }
  const starts = msOf(t.starts_at);
  if (starts == null) return 'registration';
  const from = msOf(t.checkin_from) ?? starts - TOURNAMENT_CHECKIN_MS;
  if (now >= starts) return 'drawing';
  if (now >= from) return 'presence';
  return 'registration';
}

/** Tours du tableau, triés, matchs triés par place. */
export function roundsOf(t) {
  const rounds = Array.isArray(t?.rounds) ? t.rounds.filter(Boolean) : [];
  return rounds
    .map((r) => ({ ...r, matches: (Array.isArray(r.matches) ? r.matches.filter(Boolean) : []).sort((a, b) => a.slot - b.slot) }))
    .sort((a, b) => a.round - b.round);
}

/** Tous les matchs du tableau, à plat. */
export const allMatches = (t) => roundsOf(t).flatMap((r) => r.matches);

/** Match d'une place du tableau (ou undefined). */
export const matchAt = (t, round, slot) => allMatches(t).find((m) => m.round === round && m.slot === slot);

/** Côté où l'on joue dans ce match (0 ou 1), -1 si l'on n'y est pas. */
export const mySide = (m) => (Array.isArray(m?.p) ? m.p.findIndex((p) => p?.me) : -1);

/** Mes matchs du tableau, dans l'ordre des tours. */
export const myMatches = (t) => allMatches(t).filter((m) => mySide(m) >= 0).sort((a, b) => a.round - b.round);

/** Mon dernier match joué (fini ou exempt), ou null. */
export function myLastPlayed(t) {
  const done = myMatches(t).filter((m) => m.status === 'done' || m.status === 'bye');
  return done.length ? done[done.length - 1] : null;
}

/** Ai-je gagné ce match ? */
export const iWon = (m) => {
  const side = mySide(m);
  return side >= 0 && Number(m?.winner) === side;
};

/** Un tour est-il fini (tous ses matchs joués ou exempts) ? */
export const roundDone = (r) => r.matches.length > 0 && r.matches.every((m) => m.status === 'done' || m.status === 'bye');

/** Tour en cours : le premier qui n'est pas fini (le dernier sinon). */
export function currentRound(t) {
  const rounds = roundsOf(t);
  return (rounds.find((r) => !roundDone(r)) || rounds[rounds.length - 1])?.round ?? 1;
}

/** Match jouable maintenant (`ready` et l'heure venue) ? */
export function isPlayable(m, now) {
  if (m?.status !== 'ready') return false;
  const at = msOf(m.ready_at);
  return at == null || now >= at;
}

/**
 * Échéance du forfait passée (heure du serveur) sans coup d'envoi : le serveur va déclarer le
 * forfait (`forfeit_at` est null une fois le match commencé).
 */
export function forfeitPassed(m, now) {
  const fa = msOf(m?.forfeit_at);
  return m?.status === 'ready' && fa != null && now >= fa && !m.live?.playing;
}

/** Peut-on rejoindre ce match maintenant (jouable, échéance du forfait pas passée) ? */
export const canJoin = (m, now) => isPlayable(m, now) && !forfeitPassed(m, now);

/** Match sans aucun joueur (deux exempts au tirage) : pas de match du tout. */
export const isEmptyBye = (m) => m?.status === 'bye' && !m.p?.[0] && !m.p?.[1];

/** Score affiché : en direct pendant le jeu, le score final après ; rien avant le coup d'envoi. */
export function scoreOf(m) {
  if (m?.status === 'ready') return m.live?.playing && Array.isArray(m.live.sc) ? m.live.sc : null;
  return Array.isArray(m?.sc) ? m.sc : null;
}

/**
 * Texte d'un côté d'un match du tour suivant : le joueur s'il est connu, sinon « le gagnant de
 * Lucas M. – Dom » (ou « le gagnant du quart 1 » quand ses joueurs ne sont pas encore connus).
 */
export function sideText(t, m, side, total) {
  const p = m?.p?.[side];
  if (p) return playerName(p);
  const feeder = matchAt(t, m.round - 1, m.slot * 2 + side);
  if (feeder?.p?.[0] && feeder?.p?.[1]) return `le gagnant de ${playerName(feeder.p[0])} – ${playerName(feeder.p[1])}`;
  return `le gagnant ${roundNames(m.round - 1, total).of(m.slot * 2 + side + 1)}`;
}

/** « X contre Y », le second « celui de » quand les deux sont des gagnants à venir. */
export function pairingText(t, m, total) {
  const a = sideText(t, m, 0, total);
  const b = sideText(t, m, 1, total);
  const both = a.startsWith('le gagnant') && b.startsWith('le gagnant');
  return `${cap(a)} contre ${both ? b.replace(/^le gagnant/, 'celui') : b}`;
}

/** Résultat d'un match fini, vu du gagnant : « 5 – 3 », « 3 – 3, t.a.b. 2 – 1 », « forfait », « qualifié d'office ». */
export function resultShort(m) {
  if (!m) return '';
  if (m.status === 'bye') return 'qualifié d’office';
  if (m.reason === 'forfeit' || m.reason === 'double_forfeit' || m.reason === 'admin') return 'forfait';
  const sc = Array.isArray(m.sc) ? m.sc : null;
  if (!sc) return '';
  const w = Number(m.winner) === 1 ? 1 : 0;
  const score = `${sc[w]} – ${sc[1 - w]}`;
  if (m.reason === 'shootout' && Array.isArray(m.so)) return `${score}, t.a.b. ${m.so[w]} – ${m.so[1 - w]}`;
  return score;
}
