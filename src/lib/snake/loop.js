/**
 * Snake du Gang : boucle de jeu (contrat docs/fonctions/snake-du-gang-contrat.md, section 6).
 *
 * `requestAnimationFrame`, un pas chaque fois que la durée d'un pas est écoulée, 3 pas au plus par
 * image. Le temps en trop (onglet ralenti, image très longue) est perdu, jamais rattrapé : la partie
 * ne va jamais plus vite que le temps réel (le serveur refuse une partie trop rapide, `too_fast`).
 *
 *   const loop = createLoop({ stepMs: () => tickMs(niveau), onStep: () => { … return false pour arrêter } });
 *   loop.start();   // premier pas une durée de pas après le départ (ou la reprise)
 *   loop.stop();
 */

export const MAX_STEPS_PER_FRAME = 3;

export function createLoop({ stepMs, onStep, onFrame = null, maxSteps = MAX_STEPS_PER_FRAME }) {
  let raf = 0;
  let last = null;
  let acc = 0;
  let running = false;

  const request = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(() => fn(Date.now()), 16));
  const cancel = (id) => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
    else clearTimeout(id);
  };

  function frame(now) {
    if (!running) return;
    raf = request(frame);
    if (last === null) {
      last = now;
      if (onFrame) onFrame(now);
      return;
    }
    const dt = Math.max(0, now - last);
    last = now;
    acc += dt;
    const ms = Math.max(1, Number(stepMs()) || 1);
    let n = 0;
    while (running && acc >= ms && n < maxSteps) {
      acc -= ms;
      n += 1;
      if (onStep() === false) {
        stop();
        return;
      }
    }
    // Retard de plus de 3 pas : perdu (jamais deux images d'avance sur le temps réel)
    if (acc >= ms) acc = 0;
    if (running && onFrame) onFrame(now);
  }

  function start() {
    if (running) return;
    running = true;
    last = null;
    acc = 0;
    raf = request(frame);
  }

  function stop() {
    running = false;
    if (raf) cancel(raf);
    raf = 0;
    last = null;
    acc = 0;
  }

  return { start, stop, isRunning: () => running };
}
