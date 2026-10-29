import React, { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Flag, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { queryFailed } from '@/components/shared/LoadError';
import { useAndroidBack } from '@/lib/useAndroidBack';
import CoupeLoadError from '../CoupeLoadError';
import { coupeErrorText } from '../coupeErrors';
import {
  COUPE_BLOCKS_KEY, COUPE_REPORT_REASONS, blockCoupePlayer, fetchCoupePlayer, invalidateCoupe,
  reportCoupePlayer, unblockCoupePlayer, useCoupeBlocks,
} from '@/lib/coupe/coupeApi';
import PlayerAvatar, { RoleMark } from './PlayerAvatar';
import { ROLE_BARBER, ROLE_SALON, num, rankSuffix } from './coupeFormat';

/**
 * Fiche publique d'un joueur du classement (`GET /coupe/player/:keyHash`) : ses points de la
 * saison et du classement général, et pour un autre joueur que le salon **Signaler** et
 * **Bloquer** (App Store 1.2, Google Play : les noms du classement sont écrits par les joueurs).
 * Fenêtre du bas fermée par la croix uniquement (et Échap, et le retour d'Android).
 */
const MAX_DETAILS = 500;

function StatBlock({ title, stats }) {
  const rank = num(stats?.rank) || null;
  return (
    <div className="flex-1 rounded-2xl border border-white/8 bg-[#12171a] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9db0a6]">{title}</p>
      <p className="mt-1.5 font-fut text-[34px] font-extrabold leading-none text-[#ebc15e] tabular-nums">
        {num(stats?.points)}<span className="ml-1 font-inter text-xs font-semibold text-[#c9b27a]">pts</span>
      </p>
      <p className="mt-1.5 text-xs text-[#c9d3cd]">
        {rank ? <>{rank}<sup>{rankSuffix(rank)}</sup> · </> : null}
        {num(stats?.wins)} V · {num(stats?.losses)} D
      </p>
    </div>
  );
}

const BUTTON = 'flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 font-fut text-base font-extrabold uppercase leading-none tracking-[0.06em] transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ebc15e]';

export default function PlayerSheet({ player, onClose }) {
  const open = !!player;
  const queryClient = useQueryClient();
  const keyHash = player?.key_hash ? String(player.key_hash) : '';
  const name = String(player?.name || 'Ce joueur');
  const canModerate = open && !!keyHash && player?.role !== ROLE_SALON && !player?.me;

  const [step, setStep] = useState('view'); // view | report | block
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  // Nouvelle fiche : on repart de la vue d'ensemble, sans le brouillon du signalement précédent
  useEffect(() => {
    setStep('view');
    setReason('');
    setDetails('');
    setBusy(false);
  }, [keyHash]);

  useAndroidBack(open, onClose);

  const query = useQuery({
    queryKey: ['coupe', 'player', keyHash],
    queryFn: () => fetchCoupePlayer(keyHash),
    enabled: open && !!keyHash,
    staleTime: 60 * 1000,
  });
  const blocks = useCoupeBlocks({ enabled: canModerate });
  const blocked = Array.isArray(blocks.data) && blocks.data.some((b) => String(b?.key_hash) === keyHash);

  const sendReport = async (e) => {
    e.preventDefault();
    if (!reason || busy) return;
    setBusy(true);
    try {
      await reportCoupePlayer({ keyHash, reason, details: details.trim() || undefined });
      toast.success('Signalement envoyé. Le salon va regarder, merci.');
      onClose();
    } catch (err) {
      toast.error(coupeErrorText(err, 'Signalement impossible. Réessaie dans un instant.'));
      setBusy(false);
    }
  };

  const setBlock = async (next) => {
    if (busy) return;
    setBusy(true);
    try {
      if (next) await blockCoupePlayer(keyHash);
      else await unblockCoupePlayer(keyHash);
      // Liste des blocages à jour tout de suite (le bouton change), puis la Coupe est relue
      queryClient.setQueryData(COUPE_BLOCKS_KEY, (list) => {
        const rest = (Array.isArray(list) ? list : []).filter((b) => String(b?.key_hash) !== keyHash);
        return next ? [...rest, { key_hash: keyHash, name }] : rest;
      });
      invalidateCoupe(queryClient);
      toast.success(next ? `${name} ne pourra plus te défier` : `${name} peut de nouveau te défier`);
      setStep('view');
    } catch (err) {
      toast.error(coupeErrorText(err, next ? 'Blocage impossible. Réessaie.' : 'Déblocage impossible. Réessaie.'));
    } finally {
      setBusy(false);
    }
  };

  const data = query.data && typeof query.data === 'object' ? query.data : null;
  const role = data?.role || player?.role;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <DialogPrimitive.Content
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="kb-sheet fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[560px] flex-col gap-4 overflow-y-auto rounded-t-[24px] border border-white/10 bg-[#0f1416] px-4 pt-5 font-inter text-[#eef3ef] shadow-2xl outline-none motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:slide-in-from-bottom-6 motion-safe:data-[state=open]:fade-in-0"
          style={{ colorScheme: 'dark', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
        >
          <DialogPrimitive.Close
            className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-xl border border-white/12 bg-white/4 text-[#eef3ef] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ebc15e]"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </DialogPrimitive.Close>

          {step === 'view' && (
            <>
              <div className="flex items-center gap-3.5 pr-12">
                <PlayerAvatar role={role} name={name} url={player?.avatar_url} seed={keyHash} size="sheet" />
                <div className="min-w-0">
                  <DialogPrimitive.Title className="flex items-center gap-1.5 font-fut text-[26px] font-extrabold uppercase leading-none tracking-[0.03em]">
                    <span className="truncate">{name}</span>
                    <RoleMark role={role} size={16} />
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description className="mt-1.5 text-[13px] text-[#9db0a6]">
                    {role === ROLE_SALON ? 'Le salon, tous comptes réunis' : role === ROLE_BARBER ? 'Barber du salon' : 'Joueur de la Coupe du Gang'}
                  </DialogPrimitive.Description>
                </div>
              </div>

              {queryFailed(query) ? (
                <CoupeLoadError compact what="sa fiche" error={query.error} onRetry={query.refetch} retrying={query.isFetching} />
              ) : !data ? (
                <div className="flex gap-2.5" aria-busy="true">
                  <div className="h-[104px] flex-1 animate-pulse rounded-2xl bg-white/6" />
                  <div className="h-[104px] flex-1 animate-pulse rounded-2xl bg-white/6" />
                </div>
              ) : (
                <div className="flex gap-2.5">
                  <StatBlock title="Saison" stats={data.season_stats} />
                  <StatBlock title="Général" stats={data.total_stats} />
                </div>
              )}

              {canModerate && (
                <div className="grid grid-cols-2 gap-2.5">
                  <button type="button" className={`${BUTTON} border border-white/15 text-[#eef3ef] hover:bg-white/6`} onClick={() => setStep('report')}>
                    <Flag className="h-4 w-4" aria-hidden="true" />
                    Signaler
                  </button>
                  {blocked ? (
                    <button type="button" className={`${BUTTON} border border-white/15 text-[#eef3ef] hover:bg-white/6`} disabled={busy} onClick={() => setBlock(false)}>
                      {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <Ban className="h-4 w-4" aria-hidden="true" />}
                      Débloquer
                    </button>
                  ) : (
                    <button type="button" className={`${BUTTON} border border-[#ff7a7a]/40 text-[#ff9a9a] hover:bg-[#ff7a7a]/10`} disabled={blocks.isPending && blocks.fetchStatus !== 'idle'} onClick={() => setStep('block')}>
                      <Ban className="h-4 w-4" aria-hidden="true" />
                      Bloquer
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {step === 'report' && (
            <form onSubmit={sendReport} className="flex flex-col gap-4">
              <div className="pr-12">
                <DialogPrimitive.Title className="font-fut text-[26px] font-extrabold uppercase leading-none tracking-[0.03em]">
                  Signaler {name}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1.5 text-[13px] leading-snug text-[#9db0a6]">
                  Le salon reçoit ton signalement et décide de la suite. Personne d’autre ne le voit.
                </DialogPrimitive.Description>
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9db0a6]">Motif</legend>
                {COUPE_REPORT_REASONS.map((r) => (
                  <label
                    key={r.value}
                    className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-3.5 text-sm font-semibold transition-colors ${reason === r.value ? 'border-[#ebc15e] bg-[rgba(235,193,94,.08)]' : 'border-white/12 bg-[#12171a]'}`}
                  >
                    <input
                      type="radio"
                      name="coupe-report-reason"
                      value={r.value}
                      checked={reason === r.value}
                      onChange={() => setReason(r.value)}
                      className="h-4 w-4 accent-[#ebc15e]"
                    />
                    {r.label}
                  </label>
                ))}
              </fieldset>
              <div>
                <label htmlFor="coupe-report-details" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9db0a6]">
                  Précisions (facultatif)
                </label>
                <textarea
                  id="coupe-report-details"
                  value={details}
                  onChange={(e) => setDetails(e.target.value.slice(0, MAX_DETAILS))}
                  maxLength={MAX_DETAILS}
                  rows={3}
                  className="mt-2 w-full resize-none rounded-xl border border-white/12 bg-[#12171a] px-3 py-2.5 text-base text-[#eef3ef] placeholder:text-[#7d8d86] focus:border-[#ebc15e] focus:outline-none"
                  placeholder="Ce qui s’est passé"
                />
                <p className="mt-1 text-right text-[11px] text-[#7d8d86]">{details.length} / {MAX_DETAILS}</p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button type="button" className={`${BUTTON} border border-white/15 text-[#eef3ef] hover:bg-white/6`} onClick={() => setStep('view')} disabled={busy}>
                  Retour
                </button>
                <button type="submit" className={`${BUTTON} bg-[#ebc15e] text-[#1a1205]`} disabled={!reason || busy}>
                  {busy && <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
                  Envoyer
                </button>
              </div>
            </form>
          )}

          {step === 'block' && (
            <div className="flex flex-col gap-4">
              <div className="pr-12">
                <DialogPrimitive.Title className="font-fut text-[26px] font-extrabold uppercase leading-none tracking-[0.03em]">
                  Bloquer {name} ?
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1.5 text-[13px] leading-snug text-[#9db0a6]">
                  Vous ne pourrez plus vous défier ni rejoindre vos matchs. Tu pourras annuler le blocage depuis l’accueil de la Coupe.
                </DialogPrimitive.Description>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button type="button" className={`${BUTTON} border border-white/15 text-[#eef3ef] hover:bg-white/6`} onClick={() => setStep('view')} disabled={busy}>
                  Annuler
                </button>
                <button type="button" className={`${BUTTON} bg-[#e5484d] text-white`} onClick={() => setBlock(true)} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
                  Bloquer
                </button>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
