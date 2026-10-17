import React from 'react';
import { giftCardBalance, formatEuro, formatDay, isValidityPassed } from '@/lib/giftCardDebit';

/**
 * En-tête compacte d'une carte cadeau dans la fiche admin : code, bénéficiaire, solde restant sur
 * le montant initial, validité. Barre de solde en `transform: scaleX` (pas de largeur animée).
 */
export default function GiftCardSummary({ card }) {
  const balance = giftCardBalance(card);
  const amount = Number(card.amount) || 0;
  const ratio = amount > 0 ? Math.max(0, Math.min(1, balance / amount)) : 0;
  const passed = isValidityPassed(card);

  return (
    <div className="relative overflow-hidden rounded-2xl mb-4 border border-white/10 bg-gradient-to-br from-[#1a1a1a] via-[#111] to-[#0a0a0a] p-4">
      <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-primary/20 to-transparent rounded-bl-full pointer-events-none" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] tracking-[0.3em] uppercase text-white/40">Carte cadeau</p>
          <p className="text-sm font-mono font-semibold text-white break-all" data-testid="gc-code">{card.code}</p>
          <p className="text-xs text-white/60 mt-1 truncate">
            Pour <span className="font-semibold text-white">{card.recipient_name || '—'}</span>
          </p>
        </div>
        <img src="/logo.png" alt="" className="w-9 h-9 object-contain opacity-80 shrink-0" />
      </div>
      <div className="relative mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/40">Solde restant</p>
          <p className="text-2xl font-black text-white leading-tight" data-testid="gc-balance">
            {formatEuro(balance)} <span className="text-sm font-semibold text-white/40">/ {formatEuro(amount)}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-white/40">Validité</p>
          <p className={`text-xs font-semibold ${passed ? 'text-red-400' : 'text-white/80'}`}>
            {card.valid_until ? `${passed ? 'Expirée le' : "Jusqu'au"} ${formatDay(card.valid_until)}` : 'Sans limite'}
          </p>
        </div>
      </div>
      <div className="relative mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="absolute inset-0 origin-left rounded-full bg-primary transition-transform duration-500"
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
    </div>
  );
}
