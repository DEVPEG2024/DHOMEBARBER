import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Star } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { hapticFeedback } from '@/lib/capacitor';
import { COUPE_BANNED_TEXT, coupeErrorText } from '../coupeErrors';
import { COUPE_ME_KEY, invalidateCoupe, setCoupeOptIn } from '@/lib/coupe/coupeApi';

/**
 * Interrupteur « Apparaître dans le classement » de la Coupe (à part de celui de la carte Gang,
 * décision du 29 oct. 2026). Affiché tout de suite, rétabli si le serveur refuse ; après l'envoi,
 * les caches gardent la valeur du serveur puis la Coupe est relue (rangs, ligne « Toi »).
 *
 * L'admin joue sous « D'Home Barber » : cette ligne est toujours au classement, pas d'interrupteur.
 * Compte exclu des classements par le salon (`banned` de `GET /coupe/me`) : interrupteur éteint et
 * bloqué, avec la raison (le serveur refuserait en 403 `banned`).
 */
export default function OptInSwitch({ value, isSalon = false, banned = false, id = 'coupe-optin' }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(null);
  const checked = banned ? false : pending ?? !!value;

  if (isSalon) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-white/8 bg-[#12171a] p-3.5">
        <Star className="mt-0.5 h-4 w-4 shrink-0 fill-[#3b82f6] text-[#3b82f6]" strokeWidth={1.5} aria-hidden="true" />
        <p className="text-[12.5px] leading-snug text-[#9db0a6]">
          <span className="font-semibold text-[#eef3ef]">La ligne « D&apos;Home Barber » est toujours au classement.</span>{' '}
          Les points de tous les comptes du salon y sont additionnés.
        </p>
      </div>
    );
  }

  const toggle = async (next) => {
    if (pending !== null) return;
    setPending(next);
    hapticFeedback();
    try {
      const res = await setCoupeOptIn(next);
      const saved = typeof res?.opt_in === 'boolean' ? res.opt_in : next;
      queryClient.setQueryData(COUPE_ME_KEY, (d) => (d && typeof d === 'object' ? { ...d, opt_in: saved } : d));
      queryClient.setQueriesData({ queryKey: ['coupe', 'leaderboard'] }, (d) => (
        d && typeof d === 'object' && d.me ? { ...d, me: { ...d.me, opt_in: saved } } : d
      ));
      invalidateCoupe(queryClient);
      toast.success(saved ? 'Tu apparais dans le classement de la Coupe' : 'Tu n’apparais plus dans le classement de la Coupe');
    } catch (err) {
      // Compte exclu des classements par le salon : 403 `banned` (« Tu ne peux plus apparaître… »)
      toast.error(coupeErrorText(err, 'Impossible d’enregistrer ton choix. Réessaie.'));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-white/8 bg-[#12171a] p-3.5">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-sm font-semibold text-[#eef3ef]">
          Apparaître dans le classement
        </label>
        <p className="mt-1 text-xs leading-snug text-[#9db0a6]">
          {banned ? COUPE_BANNED_TEXT : 'Sinon tu joues quand même, sans figurer ici.'}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={toggle}
        disabled={banned || pending !== null}
        className="data-[state=checked]:bg-[#33b574] data-[state=unchecked]:bg-white/15 focus-visible:ring-[#ebc15e] focus-visible:ring-offset-[#12171a] [&>span]:bg-[#eef3ef]"
      />
    </div>
  );
}
