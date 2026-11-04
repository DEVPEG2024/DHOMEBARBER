/**
 * Écran du salon de La Coupe du Gang (planche validée, écrans 14 et 15 ; contrat
 * docs/fonctions/coupe-spectateurs-contrat.md, sections 2 et 4.2) : petits calculs d'affichage, sans
 * React. Toujours l'heure de Paris, et l'heure du serveur (`server_now`), jamais celle de l'écran seule.
 *
 * Données lues : la réponse de `GET /coupe/screen` (src/lib/coupe/screenApi.js). Noms seulement,
 * jamais de photo : aucune fonction d'ici ne lit un champ d'image.
 */
import { coupeTournamentUrl } from '@/lib/coupe/coupeApi';
import { watchUrl } from '@/lib/coupe/watch';
import { parisDayKey, seasonMonth } from '../hub/coupeFormat';

const TZ = 'Europe/Paris';
const DAY_LONG = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short' });
const CLOCK = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const NUMBER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** Adresse publique du site : les QR montrent toujours celle-ci, jamais `window.location.origin`. */
export const SITE = 'https://dhomebarber.fr';
/** QR « Joue sur ton téléphone » quand aucun tournoi n'est annoncé. */
export const COUPE_URL = `${SITE}/coupe`;

/** 8 s sur le score final avant le match suivant (ou le retour au mode libre). */
export const FINAL_HOLD_MS = 8000;

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Instant (ms) d'une date ISO ; null si illisible. */
export function msOf(iso) {
  if (iso == null || iso === '') return null;
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Nombre entier ≥ 0 (0 pour une valeur absente). */
export const count = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
};

/** « 1 240 » (espace fine insécable de fr-FR). */
export const bigNumber = (v) => NUMBER.format(count(v));

/** « 19:00 », heure de Paris. */
export const clockOf = (t) => (t == null ? '' : CLOCK.format(new Date(t)));

/** « Vendredi 20 nov. · 19:00 », heure de Paris. */
export const dateLine = (t) => (t == null ? '' : `${cap(DAY_LONG.format(new Date(t)))} · ${clockOf(t)}`);

/** Jours de calendrier (Paris) entre deux instants. */
export function daysUntil(t, now) {
  if (t == null || now == null) return null;
  const a = parisDayKey(new Date(now)).split('-').map(Number);
  const b = parisDayKey(new Date(t)).split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000);
}

/** « J − 17 », « Demain », « Aujourd'hui » ; '' si la date est passée ou illisible. */
export function countdownText(t, now) {
  const days = daysUntil(t, now);
  if (days == null || days < 0) return '';
  if (days === 0) return 'Aujourd’hui';
  if (days === 1) return 'Demain';
  return `J − ${days}`;
}

/** « Novembre » pour la saison `2026-11`. */
export const seasonLabel = (season) => cap(seasonMonth(season));

/** Nom affiché d'un joueur (déjà public : « Lucas M. », prénom du barber, « D'Home Barber »). */
export function nameOf(p) {
  if (!p || typeof p !== 'object') return '';
  return String(p.name || '').trim() || 'Joueur';
}

/** Score « 3 – 2 » ; '' sans score lisible. */
export function scoreText(sc) {
  if (!Array.isArray(sc) || sc.length < 2) return '';
  const a = Number(sc[0]);
  const b = Number(sc[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
  return `${Math.trunc(a)} – ${Math.trunc(b)}`;
}

/** Tournoi en direct (tableau tiré) ; sinon présence ou tirage dans les 15 min. */
export const isTournamentLive = (t) => !!t && (t.status === 'running' || t.status === 'live');

/**
 * Lien public sûr : l'adresse du serveur si elle est bien sur https://dhomebarber.fr, sinon celle de
 * repli (jamais un lien vers un autre site sur l'écran du salon).
 */
export function publicUrl(url, fallback) {
  const s = String(url || '');
  return s.startsWith(`${SITE}/`) ? s : fallback;
}

/** QR d'inscription au prochain tournoi. */
export const registerUrl = (next) => publicUrl(next?.url, coupeTournamentUrl(next?.id));

/** QR d'un match montré en grand (`watchUrl` : adresse publique). */
export function matchWatchUrl(target) {
  if (!target) return COUPE_URL;
  if (target.kind === 'tour') return watchUrl({ m: target.id, tournoi: target.tour?.tid || null });
  return watchUrl({ w: target.id });
}

// ─── Matchs en direct (`live`) ──────────────────────────────────────

/** Lignes de `live` lisibles (`kind` et `id` présents). */
export function liveRows(data) {
  const rows = Array.isArray(data?.live) ? data.live : [];
  return rows.filter((r) => r && typeof r === 'object' && (r.kind === 'tour' || r.kind === 'room') && r.id);
}

/** Clé d'un match en direct (un id de tournoi et un id de salle ne se mélangent jamais). */
export const liveKey = (row) => (row ? `${row.kind}:${row.id}` : '');

/**
 * Match à montrer en grand : le commencé le plus tôt parmi `rows`, hors `exclude` (clés déjà
 * finies ou pas regardables). Tournoi : seulement ses matchs (`tid`) ; mode libre : tout match.
 */
export function pickLive(rows, { tid = null, exclude = null } = {}) {
  const candidates = rows.filter((r) => {
    if (exclude?.has(liveKey(r))) return false;
    if (tid) return r.kind === 'tour' && (!r.tour?.tid || String(r.tour.tid) === String(tid));
    return true;
  });
  if (!candidates.length) return null;
  const startOf = (r) => msOf(r.started_at) ?? Number.MAX_SAFE_INTEGER;
  return candidates.reduce((best, r) => (startOf(r) < startOf(best) ? r : best));
}

/**
 * Nom d'un match de tournoi de `live` : « Quart 1 », « Demie 2 », « Finale » (`tour.title`), sinon
 * le nom du tour (`tour.label`, serveur d'avant `title`) ; '' pour un match ordinaire.
 */
export function liveTitle(row) {
  if (!row || row.kind !== 'tour' || !row.tour || typeof row.tour !== 'object') return '';
  const pick = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 40) : '');
  return pick(row.tour.title) || pick(row.tour.label);
}

/** « Lucas M. – Dom » d'une ligne de `live`. */
export function livePair(row) {
  const names = Array.isArray(row?.names) ? row.names : [];
  return `${String(names[0] || 'Joueur')} – ${String(names[1] || 'Joueur')}`;
}

// ─── Tableau du tournoi ─────────────────────────────────────────────

/** Tours lisibles, matchs dans l'ordre du serveur (place 0, 1…). */
export function roundsOf(t) {
  const rounds = Array.isArray(t?.rounds) ? t.rounds.filter((r) => r && typeof r === 'object') : [];
  return rounds.map((r) => ({
    label: String(r.label || ''),
    matches: (Array.isArray(r.matches) ? r.matches : []).filter((m) => m && typeof m === 'object'),
  }));
}

const finished = (m) => m.status === 'done' || m.status === 'bye';

/** Tour en cours : le premier qui a encore un match à jouer, sinon le dernier. */
export function currentRoundIndex(rounds) {
  const i = rounds.findIndex((r) => r.matches.some((m) => !finished(m)));
  return i === -1 ? rounds.length - 1 : i;
}

/** Deux tours montrés à côté du match en grand : le tour en cours et le suivant (la finale : demies et finale). */
export function boardWindow(rounds) {
  if (!rounds.length) return [];
  const i = currentRoundIndex(rounds);
  const start = i >= rounds.length - 1 ? Math.max(0, rounds.length - 2) : i;
  return rounds.slice(start, start + 2).map((r, k) => ({ ...r, index: start + k }));
}

/** Vainqueur d'un match fini (`{ name, role }`), sinon null. */
export function winnerOf(m) {
  if (!m || !Array.isArray(m.p)) return null;
  if (m.status === 'bye') return m.p[0] || m.p[1] || null;
  if (m.status !== 'done' || (m.winner !== 0 && m.winner !== 1)) return null;
  return m.p[m.winner] || null;
}

/**
 * Nom d'une place du tableau : le joueur s'il est connu ; sinon « Lucas M. ou Dom » (les deux
 * joueurs du match qui y mène : place `2s + côté` du tour d'avant) ; sinon « Vainqueur Demie 1 ».
 */
export function slotName(rounds, roundIndex, slot, side) {
  const m = rounds[roundIndex]?.matches?.[slot];
  const p = Array.isArray(m?.p) ? m.p[side] : null;
  if (p) return nameOf(p);
  if (roundIndex <= 0) return m?.status === 'bye' ? 'Exempt' : '?';
  const feeder = rounds[roundIndex - 1]?.matches?.[slot * 2 + side];
  if (!feeder) return '?';
  const w = winnerOf(feeder);
  if (w) return nameOf(w);
  const a = Array.isArray(feeder.p) ? feeder.p[0] : null;
  const b = Array.isArray(feeder.p) ? feeder.p[1] : null;
  if (a && b) return `${nameOf(a)} ou ${nameOf(b)}`;
  // Un des deux joueurs du match d'avant n'est pas encore connu : jamais l'autre seul (il n'est pas qualifié)
  return feeder.label ? `Vainqueur ${String(feeder.label)}` : '?';
}

/**
 * Ligne d'un match du tableau :
 * `{ mid, label, names: [a, b], known: [bool, bool], state: 'live' | 'done' | 'bye' | 'next' | 'later',
 *    score, sc: [a, b] | null, so, winner }` (`known` : joueur connu, sinon « X ou Y » ou « ? »).
 * `liveByMid` : lignes de `live` des matchs de tournoi (score en direct).
 */
export function boardRow(rounds, roundIndex, slot, liveByMid) {
  const m = rounds[roundIndex].matches[slot];
  const names = [slotName(rounds, roundIndex, slot, 0), slotName(rounds, roundIndex, slot, 1)];
  const known = [0, 1].map((side) => !!(Array.isArray(m.p) && m.p[side]));
  const live = m.mid ? liveByMid.get(String(m.mid)) : null;
  const base = {
    mid: m.mid ? String(m.mid) : null, label: String(m.label || ''), names, known, so: null, score: '', sc: null, winner: null,
  };
  if (m.status === 'bye') return { ...base, state: 'bye' };
  if (m.status === 'done') {
    const winner = m.winner === 0 || m.winner === 1 ? m.winner : null;
    return { ...base, state: 'done', score: scoreText(m.sc), sc: scoreText(m.sc) ? m.sc : null, so: scoreText(m.so) || null, winner };
  }
  if (live) {
    const sc = scoreText(live.sc) ? live.sc : (scoreText(m.sc) ? m.sc : null);
    return { ...base, state: 'live', score: scoreText(sc), sc };
  }
  if (m.status === 'ready') return { ...base, state: 'next' };
  return { ...base, state: 'later' };
}

/**
 * Prochain match du tableau (« Prochain match ») : un match prêt qui n'est pas encore en direct,
 * sinon le premier match à venir dont un joueur au moins est connu. `null` sans rien à annoncer.
 * Rend `{ names, ready }` (`ready` : les deux joueurs sont attendus maintenant).
 */
export function nextBoardMatch(rounds, liveByMid) {
  for (let r = 0; r < rounds.length; r += 1) {
    const slot = rounds[r].matches.findIndex((m) => m.status === 'ready' && !(m.mid && liveByMid.has(String(m.mid))));
    if (slot !== -1) return { names: [slotName(rounds, r, slot, 0), slotName(rounds, r, slot, 1)], ready: true };
  }
  for (let r = 0; r < rounds.length; r += 1) {
    const slot = rounds[r].matches.findIndex((m) => m.status === 'pending' && Array.isArray(m.p) && (m.p[0] || m.p[1]));
    if (slot !== -1) return { names: [slotName(rounds, r, slot, 0), slotName(rounds, r, slot, 1)], ready: false };
  }
  return null;
}

/** « quarts » pour « Quarts de finale » (pastille « En direct · quarts »). */
export function roundShort(label) {
  const s = String(label || '').trim();
  const known = {
    'Quarts de finale': 'quarts', 'Demi-finales': 'demies', Finale: 'finale', '8es de finale': '8es',
  };
  return known[s] || s.toLowerCase();
}

/** Lignes du classement : 8 au plus, noms et points seulement. */
export function leaderboardRows(data) {
  const rows = Array.isArray(data?.leaderboard) ? data.leaderboard : [];
  return rows
    .filter((r) => r && typeof r === 'object')
    .slice(0, 8)
    .map((r, i) => ({ rank: count(r.rank) || i + 1, name: nameOf(r), role: r.role, points: count(r.points) }));
}

/** Barbers : nom et « Dispo » / « Pas dispo », 5 au plus. */
export function barberRows(data) {
  const rows = Array.isArray(data?.barbers) ? data.barbers : [];
  return rows.filter((r) => r && typeof r === 'object').slice(0, 5).map((r) => ({ name: nameOf(r), available: r.available === true }));
}

/** Derniers matchs du jour : 5 au plus (4 si la liste des barbers est longue, pour tenir sans défiler). */
export function recentRows(data, max = 5) {
  const rows = Array.isArray(data?.recent) ? data.recent : [];
  return rows
    .filter((r) => r && typeof r === 'object' && Array.isArray(r.p))
    .slice(0, max)
    .map((r) => ({ names: [nameOf(r.p[0]) || 'Joueur', nameOf(r.p[1]) || 'Joueur'], score: scoreText(r.sc) }));
}

/** « 14 matchs joués aujourd'hui ». */
export function playedTodayText(n) {
  const v = count(n);
  if (v === 0) return 'Aucun match joué aujourd’hui';
  return v === 1 ? '1 match joué aujourd’hui' : `${v} matchs joués aujourd’hui`;
}

/**
 * « 34 spectateurs en ce moment ». `n` compte les écrans du salon (contrat 1.5) : l'écran qui
 * l'affiche ne se compte pas lui-même (`screen` : un écran regarde ce match).
 */
export function watchersText(n, screen = false) {
  const v = Math.max(0, count(n) - (screen === true ? 1 : 0));
  if (v === 0) return 'Sois le premier à regarder';
  return v === 1 ? '1 spectateur en ce moment' : `${v} spectateurs en ce moment`;
}
