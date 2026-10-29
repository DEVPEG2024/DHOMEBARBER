import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Star } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { hapticFeedback } from '@/lib/capacitor';
import { COUPE_BANNED_TEXT, coupeErrorText } from '../coupeErrors';
import { COUPE_COLORS } from '../palette';
import { COUPE_ME_KEY, invalidateCoupe, setCoupeChallengeOptIn, setCoupeOptIn } from '@/lib/coupe/coupeApi';

/**
 * Interrupteur « Apparaître dans le classement » de la Coupe (à part de celui de la carte Gang,
 * décision du 29 oct. 2026). Affiché tout de suite, rétabli si le serveur refuse ; après l'envoi,
 * les caches gardent la valeur du serveur puis la Coupe est relue (rangs, ligne « Toi »).
 *
 * L'admin joue sous « D'Home Barber » : cette ligne est toujours au classement, pas d'interrupteur.
 * Compte exclu des classements par le salon (`banned` de `GET /coupe/me`) : interrupteur éteint et
 * bloqué, avec la raison (le serveur refuserait en 403 `banned`).
 * Thème stade : allumé en rouge ; zone de toucher agrandie à 44 px autour de l'interrupteur.
 *
 * `kind="challenge"` (29 oct. 2026) : « Me proposer aux défis », figurer dans la liste « Défier un
 * joueur » (`challenge_opt_in`, clients seulement : la section ne le montre pas à l'équipe), à part
 * du classement, avec les mêmes règles (compte exclu : bloqué).
 */
const STAR_STYLE = { color: COUPE_COLORS.etoile, fill: COUPE_COLORS.etoile };

const KINDS = {
  leaderboard: {
    field: 'opt_in',
    save: setCoupeOptIn,
    label: 'Apparaître dans le classement',
    hint: 'Sinon tu joues quand même, sans y figurer.',
    on: 'Tu apparais dans le classement de la Coupe',
    off: 'Tu n’apparais plus dans le classement de la Coupe',
  },
  challenge: {
    field: 'challenge_opt_in',
    save: setCoupeChallengeOptIn,
    label: 'Me proposer aux défis',
    hint: 'Les joueurs te voient dans l’onglet Joueurs et peuvent te défier. Tu reçois le défi si le jeu est ouvert ou si les notifications du site sont activées.',
    on: 'Tu es dans la liste des joueurs à défier',
    off: 'Tu n’es plus dans la liste des joueurs à défier',
  },
};

/**
 * Envoi d'un choix (`kind` : `leaderboard` | `challenge`) : `{ pending, save(next) }`. Les caches
 * gardent la valeur du serveur, puis la Coupe est relue ; refus : message du serveur en toast.
 * Sert à l'interrupteur et au bouton « Activer » de l'onglet Joueurs.
 */
export function useCoupeOptIn(kind = 'leaderboard') {
  const k = KINDS[kind] || KINDS.leaderboard;
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(null);

  const save = async (next) => {
    if (pending !== null) return;
    setPending(next);
    hapticFeedback();
    try {
      const res = await k.save(next);
      const saved = typeof res?.[k.field] === 'boolean' ? res[k.field] : next;
      queryClient.setQueryData(COUPE_ME_KEY, (d) => (d && typeof d === 'object' ? { ...d, [k.field]: saved } : d));
      if (kind === 'leaderboard') {
        queryClient.setQueriesData({ queryKey: ['coupe', 'leaderboard'] }, (d) => (
          d && typeof d === 'object' && d.me ? { ...d, me: { ...d.me, opt_in: saved } } : d
        ));
      }
      invalidateCoupe(queryClient);
      toast.success(saved ? k.on : k.off);
    } catch (err) {
      // Compte exclu des classements par le salon : 403 `banned` (« Tu ne peux plus apparaître… »)
      toast.error(coupeErrorText(err, 'Impossible d’enregistrer ton choix. Réessaie.'));
    } finally {
      setPending(null);
    }
  };

  return { pending, save };
}

/**
 * `row` : une ligne de la carte « Tes réglages » de l'accueil (sans cadre à elle) ; sinon une carte
 * (classement).
 */
export default function OptInSwitch({ value, isSalon = false, banned = false, id = 'coupe-optin', kind = 'leaderboard', row = false }) {
  const k = KINDS[kind] || KINDS.leaderboard;
  const { pending, save } = useCoupeOptIn(kind);
  const checked = banned ? false : pending ?? !!value;
  const frame = row ? 'p-3.5' : 'rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)] p-3.5';

  if (isSalon && kind === 'leaderboard') {
    return (
      <div className={`flex items-start gap-3 ${frame}`}>
        <Star className="mt-0.5 h-4 w-4 shrink-0" style={STAR_STYLE} strokeWidth={1.5} aria-hidden="true" />
        <p className="text-[12.5px] leading-snug text-[color:var(--coupe-gris)]">
          <span className="font-semibold text-white">La ligne « D&apos;Home Barber » est toujours au classement.</span>{' '}
          Les points de tous les comptes du salon y sont additionnés.
        </p>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3.5 ${frame}`}>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-sm font-semibold text-white">
          {k.label}
        </label>
        <p className="mt-1 text-xs leading-snug text-[color:var(--coupe-gris)]">
          {banned ? COUPE_BANNED_TEXT : k.hint}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={save}
        disabled={banned || pending !== null}
        className="relative after:absolute after:-inset-3 after:content-[''] data-[state=checked]:bg-[color:var(--coupe-rouge)] data-[state=unchecked]:bg-white/15 focus-visible:ring-white focus-visible:ring-offset-[color:var(--coupe-noir2)] [&>span]:bg-white"
      />
    </div>
  );
}
