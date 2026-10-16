import React, { useState, useRef } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Plus, Download, Share2, Clock, CheckCircle2, XCircle, X, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { isNative } from '@/lib/capacitor';
import { formatPrice } from '@/components/services/serviceUtils';
import LoadError, { isNetworkError } from '@/components/shared/LoadError';
import WalletButtons from '@/components/giftcards/WalletButtons';

const LOGO_URL = '/logo.png';

/** Montant d'une carte : en euros entiers, borné. */
const AMOUNT_MIN = 10;
const AMOUNT_MAX = 500;
/** Longueur maximale du message personnalisé et du nom du bénéficiaire. */
const MESSAGE_MAX = 300;
const RECIPIENT_MAX = 120;
/** Rafraîchissement tant qu'une carte attend son paiement au salon (validation par l'admin). */
const PENDING_REFRESH_MS = 30000;

const parisYmdFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Date du jour (ou d'un instant) à Paris, au format AAAA-MM-JJ. */
function parisYmd(date = new Date()) {
  const parts = Object.fromEntries(parisYmdFormatter.formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Fin de validité au format AAAA-MM-JJ (jour de Paris), ou null si absente ou illisible. */
function validUntilYmd(value) {
  if (!value) return null;
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return Number.isNaN(new Date(`${s}T12:00:00Z`).getTime()) ? null : s;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : parisYmd(d);
}

/** Fin de validité lisible (« 14/10/2027 », ou « 14 octobre 2027 » en version longue), '' sinon. */
function formatValidUntil(value, long = false) {
  const ymd = validUntilYmd(value);
  if (!ymd) return '';
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('fr-FR', {
    timeZone: 'Europe/Paris',
    ...(long ? { day: 'numeric', month: 'long', year: 'numeric' } : {}),
  });
}

/**
 * Statut affiché : une carte validée dont la date de fin (jour de Paris) est passée est expirée,
 * même si le serveur ne l'a pas encore marquée. Valable jusqu'au soir de cette date incluse.
 */
function cardStatus(card, today = parisYmd()) {
  if (card?.status === 'validated') {
    const end = validUntilYmd(card.valid_until);
    if (end && end < today) return 'expired';
  }
  return card?.status;
}

/** Solde restant (anciennes lignes sans `remaining_balance` : montant initial). */
const cardBalance = (card) => (card.remaining_balance != null ? Number(card.remaining_balance) || 0 : Number(card.amount) || 0);

/** Message d'erreur lisible : réseau, sinon message du serveur, sinon texte générique. */
function friendlyError(err, fallback) {
  if (isNetworkError(err)) return 'Pas de connexion internet : vérifiez votre réseau puis réessayez.';
  const raw = err?.data?.error || err?.data?.message || err?.message;
  const msg = typeof raw === 'string' ? raw.trim() : '';
  if (!msg || /^HTTP \d+$/.test(msg) || /failed to fetch|load failed/i.test(msg)) return fallback;
  return msg;
}

const STATUS_CONFIG = {
  pending: { label: 'En attente', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/20', icon: Clock },
  validated: { label: 'Validée', color: 'text-green-400', bg: 'bg-green-500/15 border-green-500/20', icon: CheckCircle2 },
  used: { label: 'Utilisée', color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/20', icon: CheckCircle2 },
  expired: { label: 'Expirée', color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/20', icon: XCircle },
};

const QR_BASE_URL = 'https://dhomebarber.fr/admin/gift-cards';

// Premium gift card visual component (FRONT)
function GiftCardVisual({ card, cardRef, compact = false }) {
  const status = cardStatus(card);
  const isValid = status === 'validated';
  const validDate = formatValidUntil(card.valid_until, true);

  return (
    <div
      ref={cardRef}
      className={`relative overflow-hidden rounded-3xl ${compact ? 'w-full' : 'w-full max-w-sm mx-auto'}`}
      style={{ aspectRatio: '1.6/1' }}
    >
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#111] to-[#0a0a0a]" />

      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-primary/20 to-transparent rounded-bl-full" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-primary/10 to-transparent rounded-tr-full" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-primary/5 rounded-full blur-3xl" />

      {/* Gold/premium border effect */}
      <div className="absolute inset-[1px] rounded-3xl border border-white/10" />

      {/* Watermark for pending/expired cards */}
      {(status === 'pending' || status === 'expired') && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <p className="text-5xl font-black text-red-500/30 -rotate-12 tracking-widest select-none">
            {status === 'pending' ? 'EN ATTENTE' : 'EXPIRÉE'}
          </p>
        </div>
      )}
      {/* ÉPUISÉE watermark for used cards */}
      {status === 'used' && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <p className="text-5xl font-black text-blue-500/25 -rotate-12 tracking-widest select-none">ÉPUISÉE</p>
        </div>
      )}

      {/* Content */}
      <div className="relative h-full flex flex-col justify-between p-5">
        {/* Top row */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] tracking-[0.3em] uppercase text-white/40 font-medium">Carte Cadeau</p>
            <p className="text-[10px] text-white/30 font-mono mt-0.5">{card.code}</p>
          </div>
          <img src={LOGO_URL} alt="D'Home Barber" className="w-12 h-12 object-contain opacity-90" />
        </div>

        {/* Center - Amount */}
        <div className="text-center -mt-2">
          <p className="text-4xl font-black text-white tracking-tight">{formatPrice(card.amount)}</p>
          <p className="text-xs text-primary font-semibold mt-1">D'Home Barber</p>
        </div>

        {/* Bottom row */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] text-white/40 uppercase tracking-wider">Pour</p>
            <p className="text-sm font-semibold text-white">{card.recipient_name || 'À définir'}</p>
          </div>
          <div className="text-right">
            {isValid ? (
              validDate && (
                <>
                  <p className="text-[10px] text-white/40 uppercase tracking-wider">Valable jusqu'au</p>
                  <p className="text-xs text-white/70">{validDate}</p>
                </>
              )
            ) : status === 'expired' ? (
              <p className="text-xs font-bold text-red-400">Expirée</p>
            ) : status === 'used' ? (
              <p className="text-xs font-bold text-blue-400">Utilisée</p>
            ) : (
              <p className="text-xs font-bold text-red-400">Non validée</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Gift card BACK visual (QR code)
function GiftCardBack({ card, backRef }) {
  const qrUrl = `${QR_BASE_URL}?scan=${card.code}`;
  const status = cardStatus(card);
  const balance = cardBalance(card);

  return (
    <div
      ref={backRef}
      className="relative overflow-hidden rounded-3xl w-full max-w-sm mx-auto"
      style={{ aspectRatio: '1.6/1' }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#111] to-[#0a0a0a]" />
      <div className="absolute inset-[1px] rounded-3xl border border-white/10" />
      <div className="relative h-full flex flex-col items-center justify-center p-5">
        <div className="bg-white rounded-2xl p-3 mb-3">
          <QRCodeSVG value={qrUrl} size={120} level="M" includeMargin />
        </div>
        <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">À présenter au salon</p>
        <p className="text-xs text-white/60 font-mono">{card.code}</p>
        {(status === 'validated' || status === 'used') && (
          <p className={`text-sm font-bold mt-2 ${balance > 0 ? 'text-primary' : 'text-muted-foreground'}`}>Solde : {formatPrice(balance)}</p>
        )}
        {card.recipient_message && (
          <p className="text-[10px] text-white/30 mt-2 text-center italic line-clamp-2 max-w-[200px]">"{card.recipient_message}"</p>
        )}
      </div>
    </div>
  );
}

// Create gift card form
function CreateGiftCardModal({ onClose, onCreated }) {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  // Garde contre le double envoi (deux taps avant que `loading` ne soit rendu)
  const submittingRef = useRef(false);

  const presetAmounts = [25, 50, 75, 100, 150, 200];
  const amountNumber = Number(amount);
  const amountValid = amount !== '' && Number.isInteger(amountNumber) && amountNumber >= AMOUNT_MIN && amountNumber <= AMOUNT_MAX;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current || loading) return;
    if (!amountValid) {
      toast.error(`Choisissez un montant entre ${AMOUNT_MIN} € et ${AMOUNT_MAX} €, sans centimes`);
      return;
    }
    if (!recipientName.trim()) {
      toast.error('Nom du bénéficiaire requis');
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      await api.entities.GiftCard.create({
        amount: amountNumber,
        sender_name: user?.full_name || '',
        sender_email: user?.email || '',
        sender_phone: user?.phone || '',
        recipient_name: recipientName.trim().slice(0, RECIPIENT_MAX),
        recipient_message: message.trim().slice(0, MESSAGE_MAX),
      });

      toast.success('Carte cadeau créée !', { description: 'Rendez-vous au salon pour régler et activer votre carte.' });
      onCreated();
      onClose();
    } catch (err) {
      toast.error('Carte cadeau non créée', {
        description: friendlyError(err, 'Le serveur n’a pas répondu. Réessayez dans un instant.'),
      });
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    // z-[60] comme les autres fiches : au-dessus de la barre du bas (z-50). La fenêtre ne dépasse pas la zone
    // visible (sous l'encoche) et défile jusqu'au dernier bouton, au-dessus de la barre d'accueil iOS.
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-card border border-border p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] max-h-full overflow-y-auto overscroll-contain"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/15 flex items-center justify-center border border-primary/20">
              <Gift className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Offrir une carte</h2>
              <p className="text-xs text-muted-foreground">Achat à régler au salon</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Amount */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Montant</label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {presetAmounts.map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(String(v))}
                  className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                    String(v) === amount
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                      : 'bg-white/5 text-foreground hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {formatPrice(v)}
                </button>
              ))}
            </div>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={`Ou montant libre (${AMOUNT_MIN} à ${AMOUNT_MAX} €)`}
              min={AMOUNT_MIN}
              max={AMOUNT_MAX}
              step="1"
              inputMode="numeric"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Recipient */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Nom du bénéficiaire</label>
            <input
              type="text"
              value={recipientName}
              onChange={e => setRecipientName(e.target.value.slice(0, RECIPIENT_MAX))}
              placeholder="Prénom Nom"
              maxLength={RECIPIENT_MAX}
              required
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Message */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Message personnalisé <span className="text-muted-foreground">(optionnel)</span></label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
              placeholder="Un petit mot pour accompagner votre cadeau..."
              rows={3}
              maxLength={MESSAGE_MAX}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
            <p className="text-[10px] text-muted-foreground text-right mt-1">{message.length}/{MESSAGE_MAX}</p>
          </div>

          {/* Preview */}
          {amountValid && recipientName.trim() && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Aperçu</p>
              <GiftCardVisual
                card={{
                  code: 'DHB-XXXX-XXXX',
                  amount: amountNumber,
                  recipient_name: recipientName,
                  valid_until: (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString(); })(),
                }}
                compact
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {loading ? 'Création...' : 'Créer la carte cadeau'}
          </button>

          <p className="text-[11px] text-center text-muted-foreground">
            La carte sera activée après paiement au salon
          </p>
        </form>
      </motion.div>
    </div>
  );
}

// Gift card detail modal
function GiftCardDetailModal({ card, onClose }) {
  const cardRef = useRef(null);
  const backRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const status = cardStatus(card);
  const statusConf = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConf.icon;
  const balance = cardBalance(card);
  const validDate = formatValidUntil(card.valid_until);
  // Partage et téléchargement réservés aux cartes actives : une carte en attente n'est pas payée
  const canShare = status === 'validated';
  const fileName = `carte-cadeau-dhomebarber-${card.code}.pdf`;

  const handleDownloadPDF = async () => {
    if (!canShare || downloading || !cardRef.current || !backRef.current) return;
    setDownloading(true);
    try {
      // Front
      const frontCanvas = await html2canvas(cardRef.current, { scale: 3, backgroundColor: null, useCORS: true });
      const frontImg = frontCanvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [90, 55] });
      pdf.addImage(frontImg, 'PNG', 0, 0, 90, 55);

      // Back (QR code)
      const backCanvas = await html2canvas(backRef.current, { scale: 3, backgroundColor: null, useCORS: true });
      const backImg = backCanvas.toDataURL('image/png');
      pdf.addPage([90, 55], 'landscape');
      pdf.addImage(backImg, 'PNG', 0, 0, 90, 55);

      if (!isNative) {
        pdf.save(fileName);
        return;
      }
      // Apps natives : `pdf.save()` ne fait rien dans la WebView. On passe par la feuille de partage
      // du téléphone quand elle accepte un fichier, sinon on le dit (jamais sans retour).
      const file = new File([pdf.output('blob')], fileName, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Carte Cadeau D'Home Barber" });
        } catch (err) {
          if (err?.name !== 'AbortError') {
            console.error('Share PDF error:', err);
            toast.error('Partage impossible', { description: 'Faites une capture d’écran de la carte.' });
          }
        }
      } else {
        toast.info('Téléchargement indisponible dans l’app', { description: 'Faites une capture d’écran de la carte.' });
      }
    } catch (err) {
      console.error('PDF error:', err);
      toast.error('Impossible de générer le PDF', {
        description: isNative ? 'Faites une capture d’écran de la carte.' : 'Réessayez dans un instant.',
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    if (!canShare) return;
    const text = [
      `${card.sender_name || 'Quelqu’un'} vous offre une carte cadeau de ${formatPrice(card.amount)} chez D'Home Barber ! Code : ${card.code}.`,
      validDate ? `Valable jusqu'au ${validDate}.` : '',
      'À présenter au salon.',
    ].filter(Boolean).join(' ') + (card.recipient_message ? `\n\nMessage : ${card.recipient_message}` : '');
    const shareData = { title: "Carte Cadeau D'Home Barber", text };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.error(err);
        // Partage refusé par le système : repli sur le presse-papier
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Texte copié dans le presse-papier !');
    } catch {
      toast.error('Impossible de partager la carte', { description: 'Faites une capture d’écran de la carte.' });
    }
  };

  return (
    // Même cadre que « Offrir » : au-dessus de la barre du bas, Télécharger / Partager atteignables
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-card border border-border p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] max-h-full overflow-y-auto overscroll-contain"
      >
        <button onClick={onClose} aria-label="Fermer" className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary z-10">
          <X className="w-4 h-4" />
        </button>

        {/* Card FRONT */}
        <GiftCardVisual card={card} cardRef={cardRef} />

        {/* Card BACK (QR code) */}
        <div className="mt-3">
          <GiftCardBack card={card} backRef={backRef} />
        </div>

        {/* Status badge */}
        <div className="flex justify-center mt-4 gap-2">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${statusConf.bg} ${statusConf.color}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            {statusConf.label}
          </div>
          {status === 'validated' && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-primary/15 border-primary/20 text-xs font-bold text-primary">
              Solde : {formatPrice(balance)}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-5 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pour</span>
            <span className="font-medium text-foreground">{card.recipient_name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Montant initial</span>
            <span className="font-bold text-primary">{formatPrice(card.amount)}</span>
          </div>
          {(status === 'validated' || status === 'used' || status === 'expired') && validDate && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Validité</span>
              <span className={status === 'expired' ? 'text-red-400' : 'text-foreground'}>
                {status === 'expired' ? `Expirée (valable jusqu'au ${validDate})` : validDate}
              </span>
            </div>
          )}
          {card.recipient_message && (
            <div className="bg-white/5 rounded-xl p-3 mt-2">
              <p className="text-xs text-muted-foreground mb-1">Message</p>
              <p className="text-sm text-foreground italic break-words">"{card.recipient_message}"</p>
            </div>
          )}
        </div>

        {/* Actions : seulement pour une carte active */}
        {canShare ? (
          <>
            <div className="grid grid-cols-2 gap-2 mt-5">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleDownloadPDF}
                disabled={downloading}
                className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/10 text-sm font-semibold text-foreground hover:bg-white/15 transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {downloading ? 'PDF...' : 'Télécharger'}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleShare}
                className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <Share2 className="w-4 h-4" />
                Partager
              </motion.button>
            </div>
            {/* Wallet : même règle que Partager / Télécharger, plus un solde à présenter au comptoir.
                Rien n'apparaît tant que le serveur n'annonce pas features.appleWallet / googleWallet. */}
            {balance > 0 && <WalletButtons card={card} className="mt-2" />}
          </>
        ) : (
          <p className={`mt-5 text-center text-xs rounded-xl px-4 py-3 border ${statusConf.bg} ${statusConf.color}`}>
            {status === 'pending'
              ? 'À régler au salon pour l’activer : vous pourrez ensuite la télécharger et la partager.'
              : status === 'expired'
                ? 'Cette carte a expiré.'
                : status === 'used'
                  ? 'Cette carte a été entièrement utilisée.'
                  : 'Cette carte n’est pas active.'}
          </p>
        )}
      </motion.div>
    </div>
  );
}

/** Solde d'une carte active, avec le montant initial quand une partie a déjà servi. */
function BalanceAmount({ card, className }) {
  const balance = cardBalance(card);
  const amount = Number(card.amount) || 0;
  return (
    <div className="text-right shrink-0">
      <p className={className}>{formatPrice(balance)}</p>
      {balance !== amount && (
        <p className="text-[10px] text-muted-foreground">restants sur {formatPrice(amount)}</p>
      )}
    </div>
  );
}

export default function GiftCards() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  // Id de la carte ouverte, résolue dans la liste à chaque rendu : la fiche suit les mises à jour
  // (carte validée par le salon pendant qu'elle est ouverte)
  const [selectedId, setSelectedId] = useState(null);

  const cardsQuery = useQuery({
    queryKey: ['giftCards', user?.email],
    queryFn: () => api.entities.GiftCard.filter({ sender_email: user?.email }, '-created_at', 50),
    enabled: !!user?.email,
    // Une carte attend son paiement au salon : on suit sa validation sans recharger la page
    refetchInterval: (query) => (Array.isArray(query.state.data) && query.state.data.some(c => c.status === 'pending')
      ? PENDING_REFRESH_MS
      : false),
  });
  const { data: myCards = [], isLoading } = cardsQuery;

  const handleCreated = () => {
    queryClient.invalidateQueries({ queryKey: ['giftCards'] });
  };

  const today = parisYmd();
  const activeCards = myCards.filter(c => cardStatus(c, today) === 'validated');
  const pendingCards = myCards.filter(c => c.status === 'pending');
  const otherCards = myCards.filter(c => {
    const st = cardStatus(c, today);
    return st !== 'validated' && st !== 'pending';
  });
  const selectedCard = selectedId ? myCards.find(c => String(c.id) === String(selectedId)) : null;

  return (
    <div className="max-w-lg mx-auto px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Cartes Cadeau</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Offrez une expérience premium</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/25"
        >
          <Plus className="w-4 h-4" />
          Offrir
        </motion.button>
      </div>

      {isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map(i => <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />)}
        </div>
      ) : cardsQuery.isError && !cardsQuery.data ? (
        <LoadError what="vos cartes cadeau" error={cardsQuery.error} onRetry={cardsQuery.refetch} retrying={cardsQuery.isFetching} />
      ) : myCards.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Gift className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-1">Pas encore de carte</h3>
          <p className="text-sm text-muted-foreground mb-5">Offrez une carte cadeau à un proche !</p>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/25"
          >
            <Sparkles className="w-4 h-4" />
            Créer une carte cadeau
          </motion.button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pending */}
          {pendingCards.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">En attente de validation ({pendingCards.length})</p>
              <div className="space-y-3">
                {pendingCards.map(card => (
                  <motion.div
                    key={card.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedId(card.id)}
                    className="glass rounded-2xl p-4 cursor-pointer border border-amber-500/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                          <Clock className="w-5 h-5 text-amber-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{card.recipient_name}</p>
                          <p className="text-xs text-muted-foreground">{card.code}</p>
                        </div>
                      </div>
                      <p className="text-lg font-bold text-foreground shrink-0">{formatPrice(card.amount)}</p>
                    </div>
                    <p className="text-[11px] text-amber-400/70 mt-2">À régler au salon pour l’activer</p>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Active */}
          {activeCards.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-3">Actives ({activeCards.length})</p>
              <div className="space-y-3">
                {activeCards.map(card => {
                  const validDate = formatValidUntil(card.valid_until);
                  return (
                    <motion.div
                      key={card.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedId(card.id)}
                      className="glass rounded-2xl p-4 cursor-pointer border border-green-500/10"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-5 h-5 text-green-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{card.recipient_name}</p>
                            <p className="text-xs text-muted-foreground">{card.code}</p>
                          </div>
                        </div>
                        <BalanceAmount card={card} className="text-lg font-bold text-primary" />
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <p className="text-[11px] text-muted-foreground flex-1">
                          {validDate ? `Valable jusqu'au ${validDate}` : ''}
                        </p>
                        <div className="flex gap-1.5">
                          <Download className="w-3.5 h-3.5 text-muted-foreground" />
                          <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Used / Expired */}
          {otherCards.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Historique ({otherCards.length})</p>
              <div className="space-y-2">
                {otherCards.map(card => {
                  const conf = STATUS_CONFIG[cardStatus(card, today)] || STATUS_CONFIG.pending;
                  return (
                    <motion.div
                      key={card.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedId(card.id)}
                      className="glass rounded-2xl p-3 cursor-pointer opacity-60"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Gift className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{card.recipient_name}</p>
                            <p className="text-xs text-muted-foreground">{card.code}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-foreground">{formatPrice(card.amount)}</p>
                          <p className={`text-[10px] font-semibold ${conf.color}`}>{conf.label}</p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showCreate && <CreateGiftCardModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
      </AnimatePresence>
      <AnimatePresence>
        {selectedCard && <GiftCardDetailModal card={selectedCard} onClose={() => setSelectedId(null)} />}
      </AnimatePresence>
    </div>
  );
}
