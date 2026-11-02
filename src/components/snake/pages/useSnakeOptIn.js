/**
 * Snake du Gang : choix « Figurer au classement » (`PATCH /snake/settings`), partagé par « Vitesse
 * et options » et le classement. Mise à jour optimiste de `GET /snake/me` (l'interrupteur bouge tout
 * de suite), retour en arrière et toast si le serveur refuse ou ne répond pas, puis relecture du
 * record et du classement (`invalidateSnake`).
 *
 *   const optIn = useSnakeOptIn();
 *   optIn.mutate(true);   // optIn.isPending pendant l'envoi
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SNAKE_ME_KEY, invalidateSnake, setSnakeOptIn } from '@/lib/snake/snakeApi';
import { snakeErrorText } from '../snakeErrors';

export function useSnakeOptIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (optIn) => setSnakeOptIn(optIn),
    onMutate: async (optIn) => {
      await queryClient.cancelQueries({ queryKey: SNAKE_ME_KEY });
      const previous = queryClient.getQueryData(SNAKE_ME_KEY);
      if (previous) queryClient.setQueryData(SNAKE_ME_KEY, { ...previous, opt_in: !!optIn });
      return { previous };
    },
    onError: (err, _optIn, context) => {
      if (context?.previous) queryClient.setQueryData(SNAKE_ME_KEY, context.previous);
      toast.error(snakeErrorText(err));
    },
    onSuccess: (data) => {
      if (typeof data?.opt_in !== 'boolean') return;
      queryClient.setQueryData(SNAKE_ME_KEY, (me) => (me ? { ...me, opt_in: data.opt_in } : me));
    },
    onSettled: () => invalidateSnake(queryClient),
  });
}

/**
 * Pourquoi ce compte ne peut pas figurer au classement (texte), ou null s'il le peut.
 * `me` : réponse de `GET /snake/me` ; `role` : rôle du compte connecté.
 */
export function rankBlockedText(me, role, bannedText) {
  if (!me) return null;
  if (me.banned) return bannedText;
  if (me.rankable === false) {
    return role === 'admin'
      ? 'Le salon ne figure pas au classement.'
      : 'Ta fiche barber n’est pas visible des clients : tu ne peux pas figurer au classement.';
  }
  return null;
}
