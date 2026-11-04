import React from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { useAndroidBack } from '@/lib/useAndroidBack';
import { COUPE_COLORS } from '../palette';
import { COUPE_VARS } from '../hub/theme';
import { BTN_OUTLINE, BTN_RED } from './ui';

/**
 * Confirmation de « Me désinscrire » (inscription et présence) : jamais de désinscription d'un tap
 * égaré sous « Je suis là ». Fermée par « Garder ma place » (et Échap, et le retour d'Android),
 * jamais par un tap à côté. Thème stade, ouverte dans un portail : elle pose elle-même la palette.
 */
export default function UnregisterConfirm({ open, name, waiting = false, onCancel, onConfirm }) {
  useAndroidBack(open, onCancel);
  const what = waiting ? 'Tu quittes la liste d’attente.' : 'Ta place se libère pour un autre joueur.';
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/75" />
        <AlertDialogPrimitive.Content
          className="fixed inset-x-4 top-1/2 z-50 mx-auto flex max-w-[400px] -translate-y-1/2 flex-col gap-3 rounded-[20px] border border-white/10 p-5 font-inter text-white shadow-2xl outline-none motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:zoom-in-95"
          style={{ ...COUPE_VARS, background: COUPE_COLORS.noir2 }}
        >
          <AlertDialogPrimitive.Title className="font-fut text-[26px] font-extrabold uppercase leading-none tracking-[0.03em]">
            Te désinscrire ?
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="text-[13px] leading-snug text-[color:var(--coupe-gris-clair)]">
            Tu ne joueras pas « {name} ». {what}
          </AlertDialogPrimitive.Description>
          <div className="mt-1 flex flex-col gap-2.5">
            <AlertDialogPrimitive.Cancel className={BTN_RED}>Garder ma place</AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action className={BTN_OUTLINE} onClick={onConfirm}>Me désinscrire</AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
