/**
 * Écran de jeu de La Coupe du Gang : VERSION PROVISOIRE au bon format, remplacée par le
 * constructeur F1 (contrat : docs/fonctions/coupe-du-gang-contrat.md, section 5.1).
 *
 *   <CoupeGame
 *     mode="online" | "bot" | "local"
 *     level="apprenti" | "barber" | "boss"          // mode "bot"
 *     action={{ t: 'create' } | { t: 'join', code } | { t: 'defi', link } | { t: 'challenge', employeeId }}
 *     onExit={() => …}                              // croix, « Quitter », fin du match
 *     onFinished={(result) => …}                    // relire points et classement
 *   />
 */
export default function CoupeGame({ onExit }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black text-white" role="dialog" aria-label="La Coupe du Gang">
      <button type="button" className="rounded-xl border border-white/20 px-4 py-3" onClick={() => onExit?.()}>
        Fermer
      </button>
    </div>
  );
}
