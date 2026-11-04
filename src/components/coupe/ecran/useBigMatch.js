/*
 * Match montré en grand sur l'écran du salon (contrat docs/fonctions/coupe-spectateurs-contrat.md,
 * section 4.2) :
 *  - tournoi : le match du tournoi commencé le plus tôt encore en cours ; mode libre : le match
 *    regardable commencé le plus tôt ;
 *  - une fois choisi, il reste jusqu'à sa fin (un match qui commence ensuite ne le remplace pas) ;
 *  - à sa fin, 8 s sur le score final (`FINAL_HOLD_MS`), puis le suivant, sinon le tableau ou le
 *    mode libre ;
 *  - pas regardable (`unavailable`, `disabled`) ou retiré par un joueur (`wend` de raison
 *    `private`) : écarté tout de suite, sans score final ; plus trouvé après avoir été regardé en
 *    direct (fin du match pendant une reconnexion, `missed`) : « Fin du direct » 8 s avec le
 *    dernier score (`final.cut`), sans annoncer de vainqueur ;
 *  - écran refusé (`full` : 50 spectateurs, serveur plein) : le match reste en grand (noms et score
 *    de `live`), nouvel essai 30 s plus tard (MatchStage) ; jamais abandonné en silence ;
 *  - socket de l'écran coupée (`revoked`, après `error screen_revoked`) : `onRevoked()`, que la
 *    page fait vérifier par `GET /coupe/screen` (seul son 403 fait oublier la clé : décision A1).
 *
 * La fin vient de la vue du match (`report(ui)` : `status: 'ended'`, `result`) ; sans vue en direct
 * (`socket` faux : bloc provisoire), de la liste `live` du serveur (le match en disparaît).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FINAL_HOLD_MS, liveKey, pickLive } from './screenFormat';

const DROP = new Set(['unavailable', 'disabled']);
// Vue en direct perdue (connexion) alors que le serveur ne liste plus le match : on passe au suivant
const MISSING_GRACE_MS = 15 * 1000;

/**
 * `rows` : lignes de `live` ; `tid` : tournoi en cours (null = mode libre) ; `socket` : la vue du
 * match vient du serveur de jeu (sinon bloc provisoire). Rend `{ target, final, report }` :
 * `target` = ligne du match montré (dernière connue), `final` = `{ result }` pendant les 8 s du score
 * final, `report(ui)` à appeler par la vue du match à chaque changement d'état.
 */
export function useBigMatch(rows, { tid = null, socket = false, onRevoked } = {}) {
  const mode = tid ? `tour:${tid}` : 'libre';
  const [state, setState] = useState({ mode, target: null, final: null });
  const doneRef = useRef(new Set());
  const missingSinceRef = useRef(null);
  const statusRef = useRef(null);
  // Le match montré a été vu en direct (`live` ou `paused`) par la vue de l'écran
  const seenLiveRef = useRef(false);
  const latest = useRef({ rows, mode, tid, socket, onRevoked });
  latest.current = { rows, mode, tid, socket, onRevoked };

  /** État suivant à partir de `s`, d'après la dernière liste du serveur. */
  const advance = useCallback((s) => {
    const { rows: list, mode: m, tid: t, socket: live } = latest.current;
    // Autre mode (un tournoi commence ou finit) : on repart de rien, sauf pendant le score final
    const base = s.mode === m || s.final ? s : { mode: m, target: null, final: null };
    if (base.final) return base;
    if (base.target) {
      const fresh = list.find((r) => liveKey(r) === liveKey(base.target));
      if (fresh) return fresh === base.target ? base : { ...base, target: fresh };
      // Plus dans la liste : sans vue en direct, c'est la fin du match (score final 8 s)
      return live ? base : { ...base, final: { result: null, cut: false } };
    }
    const next = pickLive(list, { tid: t, exclude: doneRef.current });
    if (next) return { mode: m, target: next, final: null };
    return base;
  }, []);

  // Match fini ou écarté : noté, puis le suivant tout de suite (sans attendre la lecture suivante)
  const drop = useCallback(() => {
    statusRef.current = null;
    missingSinceRef.current = null;
    seenLiveRef.current = false;
    setState((s) => {
      if (s.target) doneRef.current.add(liveKey(s.target));
      return advance({ mode: latest.current.mode, target: null, final: null });
    });
  }, [advance]);

  // Liste du serveur relue : match montré mis à jour, fin sans vue en direct, choix du suivant
  useEffect(() => {
    const keys = new Set(rows.map(liveKey));
    for (const k of [...doneRef.current]) if (!keys.has(k)) doneRef.current.delete(k);
    setState(advance);
  }, [rows, mode, tid, socket, advance]);

  const shown = state.mode === mode || state.final ? state : { target: null, final: null };
  const shownKey = liveKey(shown.target);
  useEffect(() => { seenLiveRef.current = false; }, [shownKey]);

  // Vue en direct perdue et match absent de la liste depuis un moment : au suivant
  const listed = !!shown.target && rows.some((r) => liveKey(r) === liveKey(shown.target));
  useEffect(() => {
    if (!socket || !shown.target || shown.final || listed) {
      missingSinceRef.current = null;
      return undefined;
    }
    if (missingSinceRef.current == null) missingSinceRef.current = Date.now();
    const id = setInterval(() => {
      const st = statusRef.current;
      if (st === 'live' || st === 'paused' || st === 'ended') return;
      if (Date.now() - (missingSinceRef.current ?? Date.now()) >= MISSING_GRACE_MS) drop();
    }, 1000);
    return () => clearInterval(id);
  }, [socket, shown.target, shown.final, listed, drop]);

  // Score final : 8 s, puis le suivant
  useEffect(() => {
    if (!shown.final) return undefined;
    const id = setTimeout(drop, FINAL_HOLD_MS);
    return () => clearTimeout(id);
  }, [shown.final, drop]);

  const report = useCallback((ui) => {
    const status = ui?.status || null;
    statusRef.current = status;
    if (status === 'live' || status === 'paused') seenLiveRef.current = true;
    // Plus trouvé à la reprise d'un match déjà vu (`missed` : SpectatorMatch garde le dernier score)
    if (status === 'unavailable' && (seenLiveRef.current || ui.missed === true)) {
      seenLiveRef.current = false;
      setState((s) => (s.target && !s.final ? { ...s, final: { result: null, cut: true } } : s));
    } else if (status === 'ended' && ui.result?.reason === 'private') {
      // Un joueur a éteint « Laisser regarder mes matchs » : le match continue sans l'écran
      drop();
    } else if (status === 'ended') {
      setState((s) => (s.target && !s.final ? { ...s, final: { result: ui.result || null, cut: false } } : s));
    } else if (DROP.has(status)) {
      drop();
    } else if (status === 'revoked') {
      latest.current.onRevoked?.();
    }
  }, [drop]);

  return { target: shown.target, final: shown.final, report };
}
