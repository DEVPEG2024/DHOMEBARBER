import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { isNetworkError } from '@/components/shared/LoadError';
import {
  fetchGiftCardDeletionPreview, deleteGiftCardForever, invalidateGiftCardQueries, friendlyGiftCardError,
  formatEuro, formatDay, giftCardBalance,
} from '@/lib/giftCardDebit';

const PAYMENT_LABELS = { cb: 'CB', especes: 'espèces', mixte: 'CB + espèces' };

/** Ce que la suppression change pour un RDV payé (en partie) par la carte. */
function appointmentEffect(apt) {
  const removed = formatEuro(apt.removed);
  if (['cancelled', 'no_show'].includes(apt.status)) return `${removed} de part carte retirés (RDV annulé)`;
  if (apt.reopen) return `${removed} payés par la carte : le RDV redevient à encaisser`;
  if (PAYMENT_LABELS[apt.payment_method]) return `${removed} de part carte retirés : le RDV reste encaissé en ${PAYMENT_LABELS[apt.payment_method]}`;
  return `${removed} payés par la carte : ils restent à encaisser au comptoir`;
}

/**
 * Suppression définitive d'une carte cadeau (admin) : carte, mouvements et historique effacés.
 * Premier tap : aperçu lu sur le serveur (vente retirée du CA, RDV payés par la carte) ; second
 * tap : suppression, avec le nombre de mouvements vus (le serveur refuse si la carte a bougé).
 */
export default function GiftCardDeletePanel({ card, onDeleted }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState('idle'); // idle | loading | confirm | deleting
  const [preview, setPreview] = useState(null);

  const loadPreview = async () => {
    setStep('loading');
    try {
      const p = await fetchGiftCardDeletionPreview(card.id);
      // Serveur pas encore à jour : ancienne suppression (carte jamais payée seulement)
      setPreview(p === null ? { legacy: true, transactions: 0, events: 0, sale: null, appointments: [] } : p);
      setStep('confirm');
    } catch (err) {
      if (err?.status === 404 && err?.data?.code === 'gift_card_not_found') {
        toast.success('Carte déjà supprimée');
        invalidateGiftCardQueries(queryClient, card.id);
        onDeleted?.();
        return;
      }
      toast.error('Impossible de préparer la suppression', { description: friendlyGiftCardError(err) });
      setStep('idle');
    }
  };

  const handleDelete = async () => {
    if (!preview || step === 'deleting') return;
    setStep('deleting');
    try {
      let data;
      if (preview.legacy) {
        await api.entities.GiftCard.delete(card.id);
        invalidateGiftCardQueries(queryClient, card.id);
      } else {
        data = await deleteGiftCardForever(card.id, preview.transactions, queryClient);
      }
      const reopened = (data?.appointments || []).filter((a) => a.reopen).length;
      toast.success(`Carte ${card.code} supprimée`, {
        description: [
          data?.transactions ? `${data.transactions} mouvement${data.transactions > 1 ? 's' : ''} effacé${data.transactions > 1 ? 's' : ''}` : '',
          data?.sale ? `vente de ${formatEuro(data.sale.amount)} retirée du CA` : '',
          reopened ? `${reopened} RDV à encaisser de nouveau` : '',
        ].filter(Boolean).join(' · ') || undefined,
      });
      onDeleted?.();
    } catch (err) {
      const code = err?.data?.code;
      if (err?.status === 409 && code === 'changed') {
        toast.error('La carte a bougé entre-temps', { description: 'Un débit vient d\'être enregistré : vérifiez le nouveau récapitulatif.' });
        invalidateGiftCardQueries(queryClient, card.id);
        await loadPreview();
        return;
      }
      if (err?.status === 404 && code === 'gift_card_not_found') {
        toast.success('Carte déjà supprimée');
        invalidateGiftCardQueries(queryClient, card.id);
        onDeleted?.();
        return;
      }
      if (isNetworkError(err) || (!err?.status && err?.name === 'TypeError')) {
        // Pas de réponse : la suppression est peut-être passée. Un nouvel essai est sans risque
        // (carte introuvable = déjà supprimée), la liste est relue.
        toast.error('Pas de réponse du serveur', { description: 'La carte est peut-être déjà supprimée : la liste est rechargée, réessayez si elle y est encore.' });
        invalidateGiftCardQueries(queryClient, card.id);
      } else {
        toast.error('Suppression impossible', { description: friendlyGiftCardError(err) });
      }
      setStep('confirm');
    }
  };

  if (step === 'idle' || step === 'loading') {
    return (
      <div className="mt-4 pt-4 border-t border-border">
        <button
          type="button"
          onClick={loadPreview}
          disabled={step === 'loading'}
          data-testid="gc-delete"
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-60"
        >
          <Trash2 className="w-3.5 h-3.5" /> {step === 'loading' ? 'Préparation…' : 'Supprimer définitivement'}
        </button>
      </div>
    );
  }

  const p = preview || {};
  const lostBalance = card.status === 'validated' ? giftCardBalance(card) : 0;
  const nTx = Number(p.transactions) || 0;
  const saleDetails = p.sale
    ? [PAYMENT_LABELS[p.sale.payment_method] || '', p.sale.validated_at ? `payée le ${formatDay(p.sale.validated_at)}` : ''].filter(Boolean).join(', ')
    : '';

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 space-y-2" data-testid="gc-delete-confirm" role="alert">
        <p className="flex items-start gap-2 text-xs font-semibold text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <span>Supprimer définitivement la carte {card.code} ?</span>
        </p>
        <ul className="space-y-1.5 text-[11px] text-red-100/90 list-disc pl-5">
          <li>
            {nTx > 0
              ? `La carte et ses ${nTx} mouvement${nTx > 1 ? 's' : ''} (débits, annulations) seront effacés, avec tout son historique.`
              : 'La carte sera effacée, avec tout son historique.'}
            {' '}Impossible de revenir en arrière.
          </li>
          {p.sale && (
            <li>
              La vente de {formatEuro(p.sale.amount)}
              {saleDetails ? ` (${saleDetails})` : ''} sera retirée du chiffre d'affaires.
            </li>
          )}
          {lostBalance > 0 && <li>Le solde restant de {formatEuro(lostBalance)} ne pourra plus être utilisé.</li>}
          {card.sender_email && <li>Le client ne verra plus cette carte dans l'app.</li>}
        </ul>
        {p.appointments?.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-red-200">Rendez-vous payés avec cette carte :</p>
            <ul className="space-y-1">
              {p.appointments.map((a) => (
                <li key={a.id} className="rounded-lg bg-black/20 px-2.5 py-1.5 text-[11px] text-red-100/90 break-words">
                  <span className="font-semibold">{a.client_name || 'Client'}</span>
                  {a.date ? ` · ${formatDay(a.date)}` : ''}{a.start_time ? ` ${a.start_time}` : ''}{a.employee_name ? ` · ${a.employee_name}` : ''}
                  <span className="block text-red-200/80">{appointmentEffect(a)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => { setStep('idle'); setPreview(null); }}
            disabled={step === 'deleting'}
            className="flex-1 py-2.5 rounded-xl text-xs font-medium text-muted-foreground bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={step === 'deleting'}
            data-testid="gc-delete-confirm-button"
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> {step === 'deleting' ? 'Suppression…' : 'Oui, supprimer'}
          </button>
        </div>
      </div>
    </div>
  );
}
