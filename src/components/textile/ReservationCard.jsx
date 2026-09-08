import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Ban, Store, X, Check } from 'lucide-react';
import { categoryEmoji, formatDropDate, formatPrice } from '@/lib/textileApi';
import { RESERVATION_STYLE, conceptCover, formatRemaining } from './textileUtils';

/**
 * Une réservation du client : pièce, taille × quantité, prix, statut, délai de retrait, et
 * pour un statut `reserved` un bouton « Annuler » qui demande confirmation en deux taps.
 */
export default function ReservationCard({ reservation, concept, nowMs, onCancel, cancelling = false }) {
  const [confirm, setConfirm] = useState(false);
  const style = RESERVATION_STYLE[reservation.status] || RESERVATION_STYLE.reserved;
  const cover = concept ? conceptCover(concept) : null;
  const qty = Number(reservation.quantity) || 1;
  const total = (Number(reservation.unit_price) || 0) * qty;
  const expiresMs = reservation.expires_at ? new Date(reservation.expires_at).getTime() : NaN;
  const remainingMs = Number.isFinite(expiresMs) ? expiresMs - nowMs : null;
  const isReserved = reservation.status === 'reserved';
  const inactive = reservation.status === 'cancelled' || reservation.status === 'expired';

  return (
    <div className={`rounded-2xl border p-3 bg-card ${inactive ? 'opacity-60' : 'border-border'} ${isReserved ? 'border-amber-500/20' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-xl overflow-hidden bg-secondary shrink-0 flex items-center justify-center">
          {cover ? (
            <img src={cover} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl" aria-hidden="true">{categoryEmoji(concept?.category)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{reservation.concept_name || concept?.name || 'Pièce'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {reservation.size ? `Taille ${reservation.size}` : 'Taille unique'} × {qty}
          </p>
          <p className="font-fut text-lg font-bold text-foreground leading-none mt-1">{formatPrice(total)}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${style.bg} ${style.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          {style.label}
        </span>
      </div>

      {isReserved && reservation.expires_at && (
        <p className="mt-3 text-[11px] inline-flex items-center gap-1.5 text-amber-400/90">
          <Clock className="w-3.5 h-3.5" />
          À retirer avant le {formatDropDate(reservation.expires_at)}
          {remainingMs != null && <span className="text-muted-foreground">· {remainingMs > 0 ? `dans ${formatRemaining(remainingMs)}` : formatRemaining(remainingMs)}</span>}
        </p>
      )}
      {reservation.status === 'paid' && (
        <p className="mt-3 text-[11px] inline-flex items-center gap-1.5 text-blue-400/90">
          <Store className="w-3.5 h-3.5" />
          Payée · à retirer au salon
        </p>
      )}
      {reservation.status === 'picked_up' && (
        <p className="mt-3 text-[11px] inline-flex items-center gap-1.5 text-green-400/90">
          <Check className="w-3.5 h-3.5" />
          Récupérée, bon port !
        </p>
      )}

      {isReserved && (
        <div className="mt-3">
          {!confirm ? (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              disabled={cancelling}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
            >
              <Ban className="w-3.5 h-3.5" /> Annuler
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirm(false)}
                disabled={cancelling}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium text-muted-foreground bg-secondary hover:bg-white/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Non, je la garde
              </button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={async () => { await onCancel?.(reservation.id); setConfirm(false); }}
                disabled={cancelling}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                <Ban className="w-3.5 h-3.5" /> {cancelling ? 'Annulation…' : 'Confirmer'}
              </motion.button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
