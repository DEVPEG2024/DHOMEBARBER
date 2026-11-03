/**
 * Snake du Gang : déroulé d'une partie, sans React (contrat docs/fonctions/snake-du-gang-contrat.md,
 * section 6). L'écran (`SnakeGame.jsx`) le crée une fois et lui passe les gestes ; il rend ce qui
 * change à l'écran par `emit` (statut, score, fin…), seulement quand ça change, jamais à chaque pas.
 *
 * États : 'ready' (PRÊT ?) → 'play' ⇄ 'pause' → 'dying' (le serpent clignote ~1 s) → 'end'.
 *
 * Ticket : demandé à l'arrivée sur l'écran (`newGame`) et dès la fin d'une partie (pour Rejouer
 * sans attente). Au lancement : ticket frais là → partie du serveur (sa graine). Sinon (demande en
 * échec, ticket de plus de 5 h 30, demande encore en route) un ticket est (re)demandé et attendu
 * 1,5 s au plus ; à défaut, graine locale et partie non classée, avec la raison exacte
 * (`local` : 'offline', 'slow', 'server', 'busy' (429), 'update' (409)). Sur PRÊT ?, le retour du
 * réseau (`onOnline`) redemande un ticket.
 *
 * Fin : envoyée dès la mort ; un envoi raté sur le réseau, une panne, un 429 ou un délai dépassé
 * met la fin dans la file de l'appareil (`src/lib/snake/pending.js`), relancée à chaque nouvelle
 * partie, au retour du réseau et au premier plan : un score n'est jamais perdu.
 *
 * Gestes : file de 2 virages au plus (demi-tour et même direction ignorés) ; à chaque pas, le
 * premier virage de la file part dans `play` du moteur, qui le note dans `moves` s'il est permis.
 */
import { createGame, play, isLevel, tickMs, START_DIR } from '@/lib/snake/engine';
import { createLoop } from '@/lib/snake/loop';
import { finishSnakeGame, startSnakeGame } from '@/lib/snake/snakeApi';
import { addPending, flushPending, isDefinitiveRefusal, onPendingSent, removePending } from '@/lib/snake/pending';
import { isNetworkError } from '@/components/shared/LoadError';

/** Attente d'un ticket encore en route au moment de lancer (ms). */
export const TICKET_WAIT_MS = 1500;
/** Clignotement du serpent à la fin (ms) et rythme (ms par moitié). */
export const BLINK_MS = 1000;
const BLINK_HALF_MS = 125;
/** Un ticket vaut 6 h sur le serveur : au-delà de 5 h 30, il est jeté et redemandé. */
export const TICKET_FRESH_MS = 5.5 * 3600 * 1000;
const MAX_QUEUE = 2;
/** Envoi de la fin sans réponse au bout de ce délai : « Réessayer » proposé, fin mise en file (ms). */
export const SLOW_FINISH_MS = 10000;
// Sans ticket pour ces raisons, un nouvel essai a du sens (au lancement, au retour du réseau) ;
// pas après un 429 (trop de parties) ni un 409 (app trop ancienne)
const RETRY_REASONS = ['offline', 'slow', 'server'];

const isTicket = (t) => !!t && typeof t.id === 'string' && t.id.length > 0
  && Number.isInteger(t.seed) && t.seed >= 0 && t.seed <= 0xffffffff && isLevel(t.level);

const statusOf = (err) => err?.status || err?.response?.status || 0;
const deviceOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Graine locale (partie non classée) : hasard de l'appareil. */
function localSeed() {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0];
  } catch {
    return Math.floor(Math.random() * 0x100000000) >>> 0;
  }
}

/** Panne passagère (réseau, délai, serveur en panne, trop de demandes) : le même envoi peut repartir. */
export function isRetryable(err) {
  if (!err) return false;
  if (err.timeout || isNetworkError(err)) return true;
  const status = statusOf(err);
  if (!status) return true;
  return status >= 500 || status === 429 || status === 408;
}

/**
 * Pourquoi pas de ticket : 'offline' (pas de réseau), 'slow' (réseau là, serveur trop lent),
 * 'server' (panne ou réponse inattendue), 'busy' (429), 'update' (409 `update_required`).
 * `err` absent : demande encore en route.
 */
export function noTicketReason(err) {
  if (!err || err.timeout) return deviceOffline() ? 'offline' : 'slow';
  const status = statusOf(err);
  if (status === 409) return err?.data?.code === 'update_required' ? 'update' : 'server';
  if (status === 429) return 'busy';
  if (status) return 'server';
  return 'offline';
}

/** Envoi de fin raté mais à refaire : 'offline', 'slow', 'server' (5xx) ou 'busy' (429). */
function retryReason(err) {
  const status = statusOf(err);
  if (status === 429) return 'busy';
  if (status === 408 || err?.timeout) return 'slow';
  if (status >= 500) return 'server';
  return 'offline';
}

/** Fin refusée pour de bon : 'expired' (410), 'update' (409), 'mismatch' (422), 'other'. */
function refusalReason(err) {
  const status = statusOf(err);
  if (status === 410) return 'expired';
  if (status === 409) return 'update';
  if (status === 422) return 'mismatch';
  return 'other';
}

/**
 * Boîte à ticket : une demande à la fois, gardée jusqu'à la partie suivante.
 * `ensure(level)` lance une demande s'il n'y en a pas d'utilisable (aucune, en échec, trop vieille,
 * autre niveau) ; `take(level)` prend un ticket frais.
 */
function createTicketBox(start) {
  let entry = null;
  const fresh = (e) => Date.now() - e.at < TICKET_FRESH_MS;
  return {
    ensure(level) {
      if (entry && entry.level === level && (entry.status === 'pending' || (entry.status === 'ok' && fresh(entry)))) return entry;
      const e = { level, status: 'pending', ticket: null, error: null, at: Date.now() };
      e.promise = Promise.resolve()
        .then(() => start(level))
        .then((t) => {
          if (isTicket(t)) {
            e.status = 'ok';
            e.ticket = t;
          } else {
            e.status = 'failed';
            e.error = Object.assign(new Error('Ticket illisible'), { status: 500 });
          }
        }, (err) => {
          e.status = 'failed';
          e.error = err;
        });
      entry = e;
      return e;
    },
    peek: () => entry,
    /** Ticket frais, avec l'heure de sa demande (`requestedAt` : le serveur compte ses 6 h de là). */
    take(level) {
      if (entry && entry.status === 'ok' && entry.level === level && fresh(entry)) {
        const t = { ...entry.ticket, requestedAt: entry.at };
        entry = null;
        return t;
      }
      return null;
    },
  };
}

/**
 * @param {object} o
 * @param {number} o.level  niveau de la première partie (1 à 9)
 * @param {(patch: object) => void} o.emit  changements de l'écran
 * @param {(name: string) => void} [o.sfx]  bip ('eat', 'spawn', 'caught', 'die')
 * @param {(kind: string) => void} [o.buzz]  vibration ('eat', 'caught', 'die')
 * @param {() => void} [o.unlockSound]  appelé pendant un geste
 * @param {(result: object) => void} [o.onFinished]  score accepté par le serveur (relire le record)
 * @param {(game: object) => void} [o.onStep]  après chaque pas (compteur de la bestiole)
 * @param {boolean} [o.reducedMotion]  pas de clignotement à la fin
 */
export function createSnakeController({
  level: firstLevel,
  emit,
  sfx = () => {},
  buzz = () => {},
  unlockSound = () => {},
  onFinished = () => {},
  onStep = () => {},
  reducedMotion = false,
  start: startTicket = startSnakeGame,
  finish: sendFinishRequest = finishSnakeGame,
}) {
  let level = isLevel(firstLevel) ? firstLevel : 5;
  let status = 'ready';
  let game = null;
  let seeded = false;
  let ticket = null;
  let local = null; // null | 'offline' | 'slow' | 'server' | 'busy' | 'update'
  let moves = [];
  let queue = [];
  let waiting = false;
  let result = null;
  let resultId = null; // ticket de la partie finie (fin envoyée ou en file)
  let finish = { state: 'idle' };
  let hidden = false;
  let gen = 0;
  let attempt = 0;
  let destroyed = false;
  let drawer = null;
  let reduced = !!reducedMotion;
  let stashedId = null;
  let offSent = null;
  const timers = new Set();
  const box = createTicketBox(startTicket);

  const loop = createLoop({ stepMs: () => tickMs(game ? game.level : level), onStep: () => doStep() });

  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  }
  function clearTimers() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
  }

  function draw() {
    if (drawer) drawer(game, { showSnake: !hidden, showFood: seeded });
  }

  function snapshot() {
    return {
      status,
      score: game ? game.score : 0,
      level: game ? game.level : level,
      local,
      waiting,
      seeded,
      ranked: !!ticket,
      result,
      finish,
      gen,
    };
  }

  function update(extra) {
    if (!destroyed) emit({ ...snapshot(), ...extra });
  }

  function flush() {
    flushPending({ send: sendFinishRequest }).catch(() => {});
  }

  // ─── Graine ──────────────────────────────────────────────────────
  function seedWith(t) {
    game = createGame({ seed: t.seed, level: t.level });
    ticket = t;
    local = null;
    seeded = true;
  }

  function seedLocal(reason) {
    game = createGame({ seed: localSeed(), level });
    ticket = null;
    local = reason || 'offline';
    seeded = true;
  }

  function refresh() {
    onStep(game);
    draw();
    update();
  }

  /** Ticket frais dans la boîte : la partie (pas encore lancée) prend sa graine, même après une graine locale. */
  function applyTicket() {
    if (status !== 'ready') return false;
    const t = box.take(level);
    if (!t) return false;
    seedWith(t);
    refresh();
    return true;
  }

  /** Demande (ou relance) un ticket et le pose sur PRÊT ? dès qu'il arrive. */
  function requestTicket() {
    const myGen = gen;
    const e = box.ensure(level);
    if (e.status === 'ok') {
      applyTicket();
      return e;
    }
    if (e.status === 'pending') {
      e.promise.then(() => {
        if (destroyed || gen !== myGen || status !== 'ready') return;
        if (e.status === 'ok') applyTicket();
        else if (!seeded && !waiting) {
          // Aperçu de PRÊT ? avec une graine locale : bandeau « partie non classée » tout de suite
          seedLocal(noTicketReason(e.error));
          refresh();
        }
      });
    }
    return e;
  }

  // ─── Parties ─────────────────────────────────────────────────────
  function newGame(nextLevel = level) {
    if (isLevel(nextLevel)) level = nextLevel;
    loop.stop();
    clearTimers();
    gen += 1;
    status = 'ready';
    // Aperçu de PRÊT ? avant la graine : le serpent de départ, sans point
    game = createGame({ seed: 0, level });
    seeded = false;
    ticket = null;
    local = null;
    moves = [];
    queue = [];
    waiting = false;
    result = null;
    resultId = null;
    finish = { state: 'idle' };
    hidden = false;
    stashedId = null;
    onStep(game);
    draw();
    update({ live: '' });
    requestTicket();
    // Fins restées sur l'appareil (coupure, page fermée en pleine partie) : nouvel essai
    flush();
  }

  function begin() {
    if (status !== 'ready' || !seeded) return;
    status = 'play';
    waiting = false;
    loop.start();
    update({ live: 'Partie lancée.' });
  }

  /**
   * Lancer (geste). Ticket frais → partie classée. Sinon un ticket est (re)demandé et attendu
   * 1,5 s au plus (ticket trop vieux, échec réseau à l'arrivée, demande encore en route) ; à
   * défaut, partie locale non classée.
   */
  function launch() {
    if (status !== 'ready' || waiting || destroyed) return;
    unlockSound();
    if (seeded && !local) {
      if (Date.now() - ticket.requestedAt < TICKET_FRESH_MS) {
        begin();
        return;
      }
      // PRÊT ? laissé des heures : ticket jeté (le serveur le refuserait), un autre est demandé
      ticket = null;
      seeded = false;
      game = createGame({ seed: 0, level });
      refresh();
    }
    if (applyTicket()) {
      begin();
      return;
    }
    // Partie locale décidée pour une raison qui ne passera pas en 1,5 s (429, app à mettre à jour)
    if (seeded && local && !RETRY_REASONS.includes(local)) {
      begin();
      return;
    }
    const e = box.ensure(level);
    if (e.status === 'ok' && applyTicket()) {
      begin();
      return;
    }
    waiting = true;
    update();
    const myGen = gen;
    let done = false;
    const go = () => {
      if (done || destroyed || gen !== myGen || status !== 'ready') return;
      done = true;
      waiting = false;
      if (!applyTicket()) {
        const reason = e.status === 'failed' ? noTicketReason(e.error) : noTicketReason(null);
        // Graine locale déjà posée (aperçu) : on garde la même partie, seule la raison change
        if (seeded && local) local = reason;
        else seedLocal(reason);
        refresh();
      }
      begin();
    };
    e.promise.then(go);
    later(go, TICKET_WAIT_MS);
  }

  function pause() {
    if (status !== 'play') return;
    loop.stop();
    status = 'pause';
    update({ live: 'Pause.' });
  }

  function resume() {
    if (status !== 'pause') return;
    unlockSound();
    status = 'play';
    loop.start();
    update({ live: 'Reprise.' });
  }

  /** 5, Espace, Entrée : lancer, pause ou reprise. */
  function toggle() {
    if (status === 'ready') launch();
    else if (status === 'play') pause();
    else if (status === 'pause') resume();
  }

  /**
   * Toucher court sur le téléphone : lance ou reprend, jamais de pause (un glisser trop rapide pour
   * être lu ne doit pas arrêter la partie) ; la pause passe par la touche PAUSE.
   */
  function tap() {
    if (status === 'ready') launch();
    else if (status === 'pause') resume();
  }

  /** Virage demandé (0 haut, 1 droite, 2 bas, 3 gauche) ; lance ou reprend la partie. */
  function turn(dir) {
    if (destroyed || status === 'dying' || status === 'end') return;
    if (!Number.isInteger(dir) || dir < 0 || dir > 3) return;
    const last = queue.length ? queue[queue.length - 1] : (game ? game.dir : START_DIR);
    if (dir !== last && dir !== (last + 2) % 4 && queue.length < MAX_QUEUE) queue.push(dir);
    if (status === 'ready') launch();
    else if (status === 'pause') resume();
  }

  function doStep() {
    if (!game || status !== 'play') return false;
    const dir = queue.length ? queue.shift() : undefined;
    const before = game.score;
    const ev = play(game, dir, moves);
    if (ev.caught) {
      sfx('caught');
      buzz('caught');
    } else if (ev.spawned) {
      sfx('spawn');
      buzz('eat');
    } else if (ev.ate) {
      sfx('eat');
      buzz('eat');
    }
    onStep(game);
    draw();
    if (game.over) {
      die();
      return false;
    }
    if (game.score !== before) update();
    return true;
  }

  // ─── Fin ─────────────────────────────────────────────────────────
  function die() {
    status = 'dying';
    queue = [];
    result = {
      score: game.score,
      eaten: game.eaten,
      bonuses: game.bonuses,
      level: game.level,
      ticks: game.tick,
      end: game.end || 'bite',
      moves: moves.slice(),
    };
    sfx('die');
    buzz('die');
    const live = game.end === 'full'
      ? `Bravo, l’écran est plein. Score final : ${game.score}.`
      : `Perdu. Score final : ${game.score}.`;
    if (ticket) {
      resultId = ticket.id;
      sendFinish();
    }
    // Ticket de la partie suivante tout de suite : Rejouer sans attente
    box.ensure(level);
    update({ live });
    const myGen = gen;
    if (!reduced) {
      for (let t = BLINK_HALF_MS; t < BLINK_MS; t += BLINK_HALF_MS) {
        later(() => {
          if (gen !== myGen) return;
          hidden = !hidden;
          draw();
        }, t);
      }
    }
    later(() => {
      if (gen !== myGen) return;
      hidden = false;
      draw();
      status = 'end';
      update();
    }, BLINK_MS);
  }

  function sendFinish() {
    if (!resultId || !result) return;
    const myGen = gen;
    attempt += 1;
    const myAttempt = attempt;
    const id = resultId;
    const payload = { moves: result.moves, ticks: result.ticks, end: result.end, score: result.score };
    finish = { state: 'sending' };
    update();
    // Réseau qui ne répond pas (métro, sous-sol) : au bout de 10 s, la fin part dans la file et
    // « Réessayer » est proposé sans attendre (le même envoi deux fois est sans risque)
    later(() => {
      if (destroyed || gen !== myGen || attempt !== myAttempt || finish.state !== 'sending') return;
      addPending(id, payload);
      finish = { state: 'retry', reason: 'slow' };
      update();
    }, SLOW_FINISH_MS);
    Promise.resolve()
      .then(() => sendFinishRequest(id, payload))
      .then((data) => {
        removePending(id);
        try { onFinished(data); } catch { /* relecture au mieux */ }
        // Une réponse acceptée, même d'un envoi plus ancien, vaut pour la partie
        if (destroyed || gen !== myGen || finish.state === 'done') return;
        finish = { state: 'done', data: data || {} };
        update();
      }, (error) => {
        if (isRetryable(error)) addPending(id, payload);
        else if (isDefinitiveRefusal(error)) removePending(id);
        if (destroyed || gen !== myGen || attempt !== myAttempt || finish.state === 'done') return;
        finish = isRetryable(error)
          ? { state: 'retry', reason: retryReason(error), error }
          : { state: 'rejected', reason: refusalReason(error), error };
        update();
      });
  }

  /** « Réessayer » de l'écran de fin : mêmes données, même ticket (réponse en double sans risque). */
  function retryFinish() {
    if (finish.state === 'retry') sendFinish();
  }

  /** Fin envoyée depuis la file (par n'importe quel écran) : l'écran de fin le dit aussitôt. */
  function onSentFromQueue(data, entry) {
    if (destroyed || !entry || entry.id !== resultId || finish.state === 'done') return;
    finish = { state: 'done', data: data || {} };
    update();
  }

  const quitPayload = () => ({ moves: moves.slice(), ticks: game.tick, end: 'quit', score: game.score });
  const inProgress = () => (status === 'play' || status === 'pause') && !!ticket && !!game && game.tick >= 1;

  /** Partie en cours abandonnée (retour, Rejouer, écran quitté) : `end: 'quit'`, sans attendre. */
  function quit() {
    if (!inProgress()) return;
    const payload = quitPayload();
    const id = ticket.id;
    ticket = null;
    Promise.resolve()
      .then(() => sendFinishRequest(id, payload))
      .then((data) => {
        removePending(id);
        try { onFinished(data); } catch { /* relecture au mieux */ }
      }, (error) => {
        if (isRetryable(error)) addPending(id, payload);
        else removePending(id);
      });
  }

  /**
   * Page fermée ou rechargée en pleine partie (`pagehide`) : la fin `quit` part dans la file,
   * envoyée à la prochaine ouverture. La partie se met en pause (page gardée en mémoire).
   */
  function stash() {
    if (!inProgress()) return;
    stashedId = ticket.id;
    addPending(stashedId, quitPayload());
    pause();
  }

  /** Page revenue de la mémoire du navigateur (`pageshow` persistée) : la partie continue. */
  function unstash() {
    if (!stashedId) return;
    removePending(stashedId);
    stashedId = null;
  }

  /** Rejouer (touche du pavé) : partie en cours abandonnée ; sur PRÊT ?, rien (le ticket est gardé). */
  function restart() {
    if (status === 'ready') return;
    quit();
    newGame(level);
  }

  /** Réseau revenu : fins en file renvoyées, et sur PRÊT ? un ticket redemandé après un échec. */
  function onOnline() {
    flush();
    if (status === 'ready' && !waiting && seeded && local && RETRY_REASONS.includes(local)) requestTicket();
  }

  return {
    start(nextLevel) {
      destroyed = false;
      if (!offSent) offSent = onPendingSent(onSentFromQueue);
      newGame(nextLevel);
    },
    destroy() {
      quit();
      destroyed = true;
      loop.stop();
      clearTimers();
      drawer = null;
      if (offSent) offSent();
      offSent = null;
    },
    setDrawer(fn) {
      drawer = fn;
      draw();
    },
    setLevel(n) {
      if (isLevel(n)) level = n;
    },
    setReducedMotion(v) {
      reduced = !!v;
    },
    redraw: draw,
    launch,
    toggle,
    tap,
    turn,
    pause,
    resume,
    restart,
    retryFinish,
    quit,
    stash,
    unstash,
    onOnline,
    flush,
    newGame: () => newGame(level),
    get status() { return status; },
    get game() { return game; },
  };
}
