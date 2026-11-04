/**
 * Admin des tournois : calculs d'affichage et contrôles du formulaire, sans React. Toujours
 * l'heure de Paris (jamais `toISOString()` pour un jour). Le serveur reste juge : ces contrôles
 * évitent seulement un aller-retour pour une erreur évidente.
 */
import { parisInstant } from '@/lib/calendarLinks';
import { TOURNAMENT_CHECKIN_MS } from '@/lib/coupe/coupeApi';

const TZ = 'Europe/Paris';
const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const CLOCK_FMT = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const MONTH_FMT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long' });

/** Bornes du début (contrat, section 1). */
export const START_MIN = '08:00';
export const START_MAX = '20:00';
export const LEAD_MS = 30 * 60 * 1000;
export const NAME_MAX = 60;

/** Instant (ms) d'une date ISO ; null si illisible. */
export function msOf(iso) {
  if (iso == null || iso === '') return null;
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Jour de Paris d'un instant : `AAAA-MM-JJ`. */
export function parisKeyOf(ms) {
  if (!Number.isFinite(ms)) return '';
  try {
    return DAY_FMT.format(new Date(ms));
  } catch {
    return '';
  }
}

/** Heure de Paris d'un instant : `HH:MM`. */
export function parisClockOf(ms) {
  if (!Number.isFinite(ms)) return '';
  try {
    return CLOCK_FMT.format(new Date(ms));
  } catch {
    return '';
  }
}

/** `AAAA-MM-JJ` décalé de `n` jours (calendrier, sans fuseau). */
export function addDays(key, n) {
  const [y, m, d] = String(key).split('-').map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + n));
  const pad = (v) => String(v).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

const minutesOf = (hhmm) => {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
};

/** `HH:MM` décalé de `delta` minutes (heure murale ; un tournoi ne passe jamais minuit). */
export function shiftClock(hhmm, delta) {
  const base = minutesOf(hhmm);
  if (base == null) return '';
  const t = ((base + delta) % 1440 + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** Instant (ms) d'un début saisi en heure de Paris ; null si incomplet. */
export function startInstant(day, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) || minutesOf(time) == null) return null;
  const t = parisInstant(day, time);
  return Number.isFinite(t) ? t : null;
}

/** Valeur envoyée au serveur : `AAAA-MM-JJTHH:mm`, heure de Paris. */
export const startsAtValue = (day, time) => `${day}T${time}`;

/** Début proposé : aujourd'hui à 19:00 s'il reste le temps, sinon demain. */
export function defaultStart(now = Date.now()) {
  const today = parisKeyOf(now);
  const time = '19:00';
  const at = startInstant(today, time);
  const day = at != null && at >= now + LEAD_MS ? today : addDays(today, 1);
  return { day, time };
}

/** « Coupe de Novembre », « Coupe d'Octobre ». */
export function suggestedName(day) {
  const [y, m] = String(day || '').split('-').map(Number);
  if (!y || !m) return 'Coupe du Gang';
  const month = MONTH_FMT.format(new Date(Date.UTC(y, m - 1, 15)));
  const cap = month.charAt(0).toUpperCase() + month.slice(1);
  return /^[aeiouyàâéèêîôû]/i.test(month) ? `Coupe d’${cap}` : `Coupe de ${cap}`;
}

/** Durée annoncée : ~10 min par tour (3 tours à 8, 4 à 16). */
export const durationMin = (size) => (Number(size) === 16 ? 40 : 30);

/**
 * Contrôle du formulaire avant l'envoi : message à afficher, ou null. `now` = heure de
 * l'appareil (le serveur, juge, revérifie avec la sienne).
 */
export function checkForm({ name, day, time }, now = Date.now()) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return 'Donnez un nom au tournoi.';
  if (trimmed.length > NAME_MAX) return `Le nom fait ${NAME_MAX} caractères au plus.`;
  const minutes = minutesOf(time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) || minutes == null) return 'Choisissez le jour et l’heure du début.';
  if (minutes < minutesOf(START_MIN) || minutes > minutesOf(START_MAX)) {
    return 'Le tournoi commence entre 08:00 et 20:00, heure de Paris (aucune notification ne part entre 21:00 et 08:00).';
  }
  const at = startInstant(day, time);
  if (at == null) return 'Choisissez le jour et l’heure du début.';
  if (at < now + LEAD_MS) {
    return `Le début doit être au moins 30 min après maintenant (il est ${parisClockOf(now)}, heure de Paris).`;
  }
  return null;
}

/** « Inscriptions jusqu'au début · présence de 18:45 à 19:00 · ~30 min, fini vers 19:30 · aucun lot… ». */
export function formSummary({ time, size }) {
  if (minutesOf(time) == null) return 'Inscriptions jusqu’au début · présence 15 min avant · aucun lot : trophée et palmarès.';
  const d = durationMin(size);
  return `Inscriptions jusqu’au début · présence de ${shiftClock(time, -TOURNAMENT_CHECKIN_MS / 60000)} à ${time} · ~${d} min, fini vers ${shiftClock(time, d)} · aucun lot : trophée et palmarès.`;
}

/** Nuit de Paris (21:00–08:00) : aucune notification ne part. */
export function isNight(now = Date.now()) {
  const m = minutesOf(parisClockOf(now));
  return m != null && (m >= 21 * 60 || m < 8 * 60);
}

/** Nom d'un joueur public (« D'Home Barber » pour le salon), « Exempt » sans joueur. */
export function nameOf(p, empty = 'Exempt') {
  if (!p) return empty;
  return String(p.name || '').trim() || 'Ancien joueur';
}

/**
 * Phase d'un tournoi pour l'admin : `registration`, `presence`, `drawing` (début passé, tirage
 * dans les secondes qui viennent), `running`, `finished`, `cancelled`.
 */
export function adminPhase(t, now) {
  if (!t || typeof t !== 'object') return null;
  if (t.status === 'cancelled') return 'cancelled';
  if (t.status === 'finished') return 'finished';
  if (t.status === 'running') return 'running';
  const starts = msOf(t.starts_at);
  if (starts == null) return 'registration';
  const from = msOf(t.checkin_from) ?? starts - TOURNAMENT_CHECKIN_MS;
  if (now >= starts) return 'drawing';
  if (now >= from) return 'presence';
  return 'registration';
}

/** Texte d'un motif de fin de match. */
export function reasonText(m) {
  switch (m?.reason) {
    case 'forfeit': return 'forfait';
    case 'double_forfeit': return 'aucun des deux venu, tiré au sort';
    case 'admin': return 'forfait déclaré par le salon';
    case 'shootout': return Array.isArray(m.so) ? `tirs au but ${m.so[0]} – ${m.so[1]}` : 'tirs au but';
    case 'golden_goal': return 'but en or';
    case 'time_limit': return 'temps écoulé';
    default: return '';
  }
}

// ─── Tableau ────────────────────────────────────────────────────────

const DAY_LONG_FMT = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short' });

/** « Vendredi 20 nov. · 19:00 », heure de Paris. */
export function dateLine(iso) {
  const t = msOf(iso);
  if (t == null) return '';
  try {
    const day = DAY_LONG_FMT.format(new Date(t));
    return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${parisClockOf(t)}`;
  } catch {
    return '';
  }
}

/** « 0:48 » : minutes et secondes d'une durée (ms), jamais négative. */
export function mmss(msLeft) {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Nombre de tours : 3 pour 8 places, 4 pour 16. */
export const roundsCount = (size) => (Number(size) === 16 ? 4 : 3);

/** Nom court d'un tour d'après sa distance à la finale : « Quarts », « Demies », « Finale », « 8es ». */
export function roundShort(round, total) {
  return ['Finale', 'Demies', 'Quarts', '8es'][total - round] || `Tour ${round}`;
}

/** Titre d'un match : « Quart 3 », « Demie 1 », « Finale », « 8e de finale 6 ». */
export function matchTitle(round, slot, total) {
  const n = Number(slot) + 1;
  return ['Finale', `Demie ${n}`, `Quart ${n}`, `8e de finale ${n}`][total - round] || `Match ${n}`;
}

/** Tours du tableau triés, matchs triés par place. */
export function roundsOf(t) {
  const rounds = Array.isArray(t?.rounds) ? t.rounds.filter((r) => r && typeof r === 'object') : [];
  return rounds
    .map((r) => ({ ...r, matches: (Array.isArray(r.matches) ? r.matches.filter(Boolean) : []).sort((a, b) => a.slot - b.slot) }))
    .sort((a, b) => a.round - b.round);
}

export const allMatches = (t) => roundsOf(t).flatMap((r) => r.matches);

const roundDone = (r) => r.matches.length > 0 && r.matches.every((m) => m.status === 'done' || m.status === 'bye');

/** Tour en cours : le premier qui n'est pas fini (le dernier sinon). */
export function currentRound(t) {
  const rounds = roundsOf(t);
  return (rounds.find((r) => !roundDone(r)) || rounds[rounds.length - 1])?.round ?? 1;
}

/** Match du tour suivant que nourrit ce match. */
export const nextMatchOf = (t, m) => allMatches(t).find((x) => x.round === m.round + 1 && x.slot === m.slot >> 1) || null;

/** Match en jeu (les deux joueurs dans la salle, ballon en jeu). */
export const isLive = (m) => m?.status === 'ready' && !!m.live?.playing;

/**
 * Match qui attend un joueur : jouable (heure venue), pas encore lancé. `present` : qui est déjà
 * dans la salle.
 */
export function isWaiting(m, now) {
  if (m?.status !== 'ready' || isLive(m)) return false;
  const at = msOf(m.ready_at);
  if (at != null && now < at) return false;
  const present = Array.isArray(m.live?.present) ? m.live.present : [false, false];
  return !(present[0] && present[1]);
}

/**
 * « Faire rejouer » proposé : match fini (pas un exempt) dont le match suivant n'a pas commencé.
 * Le serveur reste juge (`not_replayable`).
 */
export function canReplay(t, m) {
  if (t?.status !== 'running' || m?.status !== 'done') return false;
  const next = nextMatchOf(t, m);
  if (!next) return false;
  return next.status === 'pending' || (next.status === 'ready' && !isLive(next) && !next.live?.present?.some(Boolean));
}

/**
 * Joueurs que l'admin peut retirer : avant le tirage, tous les inscrits (liste d'attente
 * comprise) ; après, ceux qui sont encore dans le tableau (un match à venir ou en cours).
 */
export function removablePlayers(t) {
  const players = Array.isArray(t?.players) ? t.players.filter((p) => p && p.key_hash) : [];
  if (t?.status === 'open') return players;
  if (t?.status !== 'running') return [];
  const alive = new Set();
  for (const m of allMatches(t)) {
    if (m.status !== 'pending' && m.status !== 'ready') continue;
    for (const p of m.p || []) if (p?.key_hash) alive.add(p.key_hash);
  }
  const byKey = new Map(players.map((p) => [p.key_hash, p]));
  const out = [];
  for (const key of alive) out.push(byKey.get(key) || { key_hash: key, name: 'Ancien joueur' });
  return out.sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));
}
