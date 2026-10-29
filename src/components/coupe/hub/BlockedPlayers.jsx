import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Ban, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { COUPE_BLOCKS_KEY, invalidateCoupe, unblockCoupePlayer, useCoupeBlocks } from '@/lib/coupe/coupeApi';
import { coupeErrorText } from '../coupeErrors';

/**
 * Ligne « Joueurs bloqués » de « Tes réglages » (accueil repensé, planche validée le 29 oct. 2026 au
 * soir) : le nombre (« Aucun » sinon), et dépliée la liste avec « Débloquer ». Seul endroit où
 * débloquer un joueur bloqué en fin de match qui n'est pas au classement (`GET /coupe/blocks`).
 * Liste illisible : « Aucun » n'est pas affirmé, la ligne dit seulement de réessayer plus tard.
 */
export default function BlockedPlayers() {
  const queryClient = useQueryClient();
  const query = useCoupeBlocks();
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const list = Array.isArray(query.data) ? query.data.filter((b) => b?.key_hash) : [];
  const count = list.length;
  const summary = query.isError && !query.data ? 'Indisponible' : query.isPending ? '…' : count === 0 ? 'Aucun' : String(count);

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
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={count === 0}
        aria-expanded={count > 0 ? open : undefined}
        aria-controls={count > 0 ? 'coupe-bloques' : undefined}
        className="flex min-h-[52px] w-full items-center gap-3 px-3.5 py-3 text-left text-white enabled:hover:bg-white/4 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
      >
        <span className="min-w-0 flex-1 text-sm font-semibold">Joueurs bloqués</span>
        <span className="text-[13px] text-[color:var(--coupe-gris)]">{summary}</span>
        {count > 0 && <ChevronDown className={`h-4 w-4 shrink-0 text-[color:var(--coupe-gris)] ${open ? 'rotate-180' : ''}`} aria-hidden="true" />}
      </button>
      {open && count > 0 && (
        <ul id="coupe-bloques" className="border-t border-white/8">
          {list.map((entry) => (
            <li key={entry.key_hash} className="flex items-center gap-3 border-b border-white/8 px-3.5 py-2 last:border-b-0">
              <Ban className="h-4 w-4 shrink-0 text-[color:var(--coupe-gris)]" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm">{entry.name || 'Joueur'}</span>
              <button
                type="button"
                onClick={() => unblock(entry)}
                disabled={!!busyKey}
                aria-label={`Débloquer ${entry.name || 'ce joueur'}`}
                className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-white/15 px-3 text-[13px] font-semibold text-white hover:bg-white/6 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                {busyKey === String(entry.key_hash) && <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />}
                Débloquer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
