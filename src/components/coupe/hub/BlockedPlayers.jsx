import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Ban, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { COUPE_BLOCKS_KEY, invalidateCoupe, unblockCoupePlayer, useCoupeBlocks } from '@/lib/coupe/coupeApi';
import { coupeErrorText } from '../coupeErrors';

/**
 * Joueurs bloqués à la Coupe (`GET /coupe/blocks`), sur l'accueil de la Coupe : seul endroit où
 * débloquer un joueur bloqué en fin de match qui n'est pas au classement. Rien n'est affiché tant
 * que la liste est vide (ou illisible : la section est secondaire, le reste de la page suffit).
 */
export default function BlockedPlayers() {
  const queryClient = useQueryClient();
  const query = useCoupeBlocks();
  const [busyKey, setBusyKey] = useState(null);
  const list = Array.isArray(query.data) ? query.data.filter((b) => b?.key_hash) : [];

  if (list.length === 0) return null;

  const unblock = async (entry) => {
    if (busyKey) return;
    const key = String(entry.key_hash);
    setBusyKey(key);
    try {
      await unblockCoupePlayer(key);
      queryClient.setQueryData(COUPE_BLOCKS_KEY, (rows) => (Array.isArray(rows) ? rows.filter((b) => String(b?.key_hash) !== key) : rows));
      invalidateCoupe(queryClient);
      toast.success(`${entry.name || 'Ce joueur'} peut de nouveau te défier`);
    } catch (err) {
      toast.error(coupeErrorText(err, 'Déblocage impossible. Réessaie.'));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section aria-labelledby="coupe-blocked-title" className="flex flex-col gap-2.5">
      <h2 id="coupe-blocked-title" className="font-fut text-lg font-extrabold uppercase leading-none tracking-[0.04em] text-[#9db0a6]">
        Joueurs bloqués
      </h2>
      <ul className="overflow-hidden rounded-2xl border border-white/8 bg-[#12171a]">
        {list.map((entry, i) => (
          <li key={entry.key_hash} className={`flex items-center gap-3 px-3.5 py-2.5 ${i < list.length - 1 ? 'border-b border-white/6' : ''}`}>
            <Ban className="h-4 w-4 shrink-0 text-[#9db0a6]" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.name || 'Joueur'}</span>
            <button
              type="button"
              onClick={() => unblock(entry)}
              disabled={!!busyKey}
              aria-label={`Débloquer ${entry.name || 'ce joueur'}`}
              className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-white/15 px-3 text-[13px] font-semibold text-[#eef3ef] transition-colors hover:bg-white/6 disabled:opacity-50"
            >
              {busyKey === String(entry.key_hash) && <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />}
              Débloquer
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
