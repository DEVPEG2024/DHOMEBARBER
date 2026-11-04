/*
 * Match de tournoi dans l'écran de jeu de La Coupe du Gang (docs/fonctions/coupe-tournois-contrat.md,
 * sections 4 à 6) : textes et petites lectures partagés par la salle d'attente, la bande des tirs au
 * but, l'affiche et l'écran de fin. Tutoiement, comme tout le jeu.
 */

// Tirs au but : 3 tirs chacun, puis un tir chacun (mort subite) ; la bande montre les 4 derniers tours
export const SO_ROUNDS = 3;
export const SO_SLOTS = 4;

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Joueur public du tournoi (`{ name, role, me }`) en { name, role }, ou null. */
function playerOf(p) {
  if (!p || typeof p !== 'object' || !p.name) return null;
  return { name: clean(p.name, 60), role: clean(p.role, 20) || 'user' };
}

/**
 * Adversaire du match de tournoi `action` ({ matchId, tournamentId, opponent? }) pour la salle
 * d'attente, en attendant `tour.opp` du serveur (`room`, qui passe toujours avant : voir
 * `_readTour` d'onlineMatch.js) : celui donné par la page, sinon celui du tournoi déjà lu par la
 * page (cache React Query sous ['coupe', 'tournaments', …] : `me.match`, ou le match dans
 * `rounds`). Aucune requête : sans les deux (notification, serveur sans `tour.opp`), la salle dit
 * « ton adversaire ».
 */
export function tournamentOpponent(queryClient, action) {
  const given = playerOf(action?.opponent);
  if (given) return given;
  const mid = String(action?.matchId ?? '');
  if (!mid || !queryClient?.getQueriesData) return null;
  try {
    for (const [, data] of queryClient.getQueriesData({ queryKey: ['coupe', 'tournaments'] })) {
      if (!data || typeof data !== 'object') continue;
      const mine = data.me?.match;
      if (mine && String(mine.id) === mid && Array.isArray(mine.p)) {
        const side = mine.side === 1 ? 1 : 0;
        const opp = playerOf(mine.p[1 - side]);
        if (opp) return opp;
      }
      for (const round of Array.isArray(data.rounds) ? data.rounds : []) {
        const m = (Array.isArray(round?.matches) ? round.matches : []).find((x) => String(x?.id) === mid);
        if (!m || !Array.isArray(m.p)) continue;
        const opp = playerOf(m.p.find((p) => p && !p.me));
        if (opp) return opp;
      }
    }
  } catch { /* cache illisible : « ton adversaire » */ }
  return null;
}

/** Nombre de buts d'une liste de tirs (1 but, 0 raté). */
export const soGoals = (shots) => (Array.isArray(shots) ? shots.reduce((n, v) => n + (v ? 1 : 0), 0) : 0);

/**
 * Pastilles des tirs au but des deux joueurs (repère local), pour la bande : chaque pastille
 * 'goal', 'miss', 'next' (le tir en cours) ou 'todo' (à venir), sur les SO_SLOTS derniers tours au
 * plus (3 tirs chacun, puis un de plus chacun en mort subite). `shooter` : tireur en cours (0 / 1)
 * ou null entre deux tirs.
 */
export function shootoutPips(shots, shooter = null) {
  const a = Array.isArray(shots?.[0]) ? shots[0] : [];
  const b = Array.isArray(shots?.[1]) ? shots[1] : [];
  const rounds = Math.max(
    SO_ROUNDS,
    a.length + (shooter === 0 ? 1 : 0),
    b.length + (shooter === 1 ? 1 : 0),
  );
  const shown = Math.min(rounds, SO_SLOTS);
  const from = rounds - shown;
  const row = (list, side) => Array.from({ length: shown }, (_, k) => {
    const i = from + k;
    if (i < list.length) return list[i] ? 'goal' : 'miss';
    return i === list.length && shooter === side ? 'next' : 'todo';
  });
  return [row(a, 0), row(b, 1)];
}

/** Mort subite : les 3 tirs de chacun sont tirés. */
export const suddenDeath = (shots) => Array.isArray(shots) && shots.every((s) => Array.isArray(s) && s.length >= SO_ROUNDS);

/** « Tir 2 sur 3 », ou « Mort subite », pour le tir qui commence du joueur `side`. */
export function shotLabel(shots, side) {
  const n = (Array.isArray(shots?.[side]) ? shots[side].length : 0) + 1;
  return n <= SO_ROUNDS ? `Tir ${n} sur ${SO_ROUNDS}` : 'Mort subite';
}

/** Dernier tour du tournoi : la finale (libellés de roundLabels, contrat 3.1). */
export const isFinal = (label) => /^finale$/i.test(clean(label, 40));
