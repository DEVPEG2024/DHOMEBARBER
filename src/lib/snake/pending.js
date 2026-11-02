/**
 * Snake du Gang : fins de partie pas encore envoyées, gardées sur l'appareil jusqu'à ce que le
 * serveur les reçoive (un score n'est jamais perdu pour une coupure de réseau).
 *
 * Stockage : `localStorage['dhb-snake-pending']`, 20 entrées au plus, chacune réduite à
 * `{ id, moves, ticks, end, score, at }` (ticket, gestes, nombre de pas, fin, score annoncé, heure
 * de mise en file) : rien de personnel. Lecture et écriture jamais bloquantes (navigation privée,
 * stockage plein : la file vit le temps de la visite).
 *
 * Une fin entre dans la file quand son envoi échoue sur le réseau, une panne du serveur (5xx), un
 * 429 ou un délai dépassé, et quand la page se ferme en pleine partie (`end: 'quit'`). Elle en sort
 * au succès, sur un refus définitif (400, 404, 409, 410, 422) ou passé 6 h (le ticket du serveur
 * ne vaut plus rien).
 *
 *   addPending(id, { moves, ticks, end, score });
 *   flushPending();                                  // relance tout, une à la fois
 *   const off = onPendingSent((data, entry) => …);   // après chaque envoi réussi depuis la file
 */
import { finishSnakeGame } from './snakeApi';
import { isNetworkError } from '@/components/shared/LoadError';

const STORAGE_KEY = 'dhb-snake-pending';
export const PENDING_MAX = 20;
export const PENDING_MAX_AGE_MS = 6 * 3600 * 1000;
const END_VALUES = ['bite', 'full', 'quit'];
// Refus définitifs : la même demande ne passera jamais
const DEFINITIVE = [400, 404, 409, 410, 422];

// Copie en mémoire : stockage refusé, la file sert quand même le temps de la visite
let memory = [];

const isEntry = (e) => !!e && typeof e === 'object'
  && typeof e.id === 'string' && e.id.length > 0 && e.id.length <= 100
  && Array.isArray(e.moves) && e.moves.every((v) => Number.isInteger(v))
  && Number.isInteger(e.ticks) && e.ticks >= 0
  && END_VALUES.includes(e.end)
  && Number.isInteger(e.score) && e.score >= 0
  && Number.isFinite(e.at);

const clean = (e) => ({ id: e.id, moves: e.moves.slice(), ticks: e.ticks, end: e.end, score: e.score, at: e.at });

function read() {
  let list = memory;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== null) list = JSON.parse(raw);
  } catch {
    list = memory;
  }
  const now = Date.now();
  return (Array.isArray(list) ? list : []).filter((e) => isEntry(e) && now - e.at < PENDING_MAX_AGE_MS).map(clean);
}

function write(list) {
  memory = list.slice(-PENDING_MAX);
  try {
    if (memory.length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* stockage plein ou refusé : la copie en mémoire suffit pour cette visite */
  }
}

/** Fins en attente (les plus anciennes d'abord), sans celles de plus de 6 h. */
export function listPending() {
  return read();
}

/** Met une fin en file (remplace celle du même ticket). */
export function addPending(id, { moves, ticks, end, score }) {
  const entry = { id: String(id || ''), moves: Array.isArray(moves) ? moves.slice() : [], ticks, end, score, at: Date.now() };
  if (!isEntry(entry)) return false;
  write([...read().filter((e) => e.id !== entry.id), entry]);
  return true;
}

/** Retire la fin d'un ticket (reçue par le serveur, ou refusée pour de bon). */
export function removePending(id) {
  const list = read();
  const next = list.filter((e) => e.id !== id);
  if (next.length !== list.length) write(next);
}

/** Erreur après laquelle on ne renvoie plus jamais la même fin. */
export function isDefinitiveRefusal(err) {
  if (!err || err.timeout || isNetworkError(err)) return false;
  const status = err.status || err.response?.status;
  return DEFINITIVE.includes(status);
}

let running = null;
let again = false;
const listeners = new Set();

/**
 * Prévenu après chaque fin envoyée depuis la file : `fn(data, entry)` (réponse du serveur, entrée).
 * Rend la fonction qui retire l'écouteur.
 */
export function onPendingSent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Renvoie les fins en file, une à la fois. `onSent(data, entry)` et les écouteurs d'`onPendingSent`
 * après chaque succès (relire le record et le classement). S'arrête à la première panne (inutile
 * d'insister) ; un refus définitif retire la fin et passe à la suivante.
 * Un appel pendant un envoi en cours relance un tour à la fin de celui-ci.
 */
export function flushPending({ send = finishSnakeGame, onSent = () => {} } = {}) {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      for (const entry of read()) {
        try {
          const data = await send(entry.id, { moves: entry.moves, ticks: entry.ticks, end: entry.end, score: entry.score });
          removePending(entry.id);
          for (const fn of [onSent, ...listeners]) {
            try { fn(data, entry); } catch { /* relecture au mieux */ }
          }
        } catch (err) {
          if (isDefinitiveRefusal(err)) {
            removePending(entry.id);
            continue;
          }
          // Réseau coupé, serveur en panne ou débordé : la file attend la prochaine occasion
          break;
        }
      }
    } while (again);
  })().finally(() => { running = null; });
  return running;
}
