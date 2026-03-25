import React, { useState, useRef } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Plus, Download, Share2, Clock, CheckCircle2, XCircle, ChevronLeft, X, Sparkles } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const LOGO_URL = '/logo.png';

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'DHB-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += '-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
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
  const isValid = card.status === 'validated';
  const validDate = card.valid_until ? new Date(card.valid_until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

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

      {/* INVALIDE watermark for pending cards */}
      {!isValid && card.status !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <p className="text-5xl font-black text-red-500/30 -rotate-12 tracking-widest select-none">INVALIDE</p>
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
          <p className="text-4xl font-black text-white tracking-tight">{card.amount}€</p>
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
              <>
                <p className="text-[10px] text-white/40 uppercase tracking-wider">Valable jusqu'au</p>
                <p className="text-xs text-white/70">{validDate}</p>
              </>
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
  const balance = card.remaining_balance != null ? card.remaining_balance : card.amount;

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
        <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">Scanner pour utiliser</p>
        <p className="text-xs text-white/60 font-mono">{card.code}</p>
        {card.status === 'validated' && (
          <p className="text-sm font-bold text-primary mt-2">Solde: {balance}€</p>
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
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const presetAmounts = [25, 50, 75, 100, 150, 200];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      toast({ title: 'Montant invalide', variant: 'destructive' });
      return;
    }
    if (!recipientName.trim()) {
      toast({ title: 'Nom du bénéficiaire requis', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const validUntil = new Date();
      validUntil.setFullYear(validUntil.getFullYear() + 1);

      await api.entities.GiftCard.create({
        code: generateCode(),
        amount: Number(amount),
        sender_name: user?.full_name || '',
        sender_email: user?.email || '',
        sender_phone: user?.phone || '',
        recipient_name: recipientName.trim(),
        recipient_message: message.trim(),
        status: 'pending',
        valid_until: validUntil.toISOString().split('T')[0],
      });

      toast({ title: 'Carte cadeau créée !', description: 'Rendez-vous au salon pour régler et activer votre carte.' });
      onCreated();
      onClose();
    } catch (err) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-card border border-border p-6 max-h-[90vh] overflow-y-auto"
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
                  {v}€
                </button>
              ))}
            </div>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Ou montant libre..."
              min="1"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Recipient */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Nom du bénéficiaire</label>
            <input
              type="text"
              value={recipientName}
              onChange={e => setRecipientName(e.target.value)}
              placeholder="Prénom Nom"
              required
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Message */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Message personnalisé <span className="text-muted-foreground">(optionnel)</span></label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Un petit mot pour accompagner votre cadeau..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          {/* Preview */}
          {amount && recipientName && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Aperçu</p>
              <GiftCardVisual
                card={{
                  code: 'DHB-XXXX-XXXX',
                  amount: Number(amount),
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
  const statusConf = STATUS_CONFIG[card.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConf.icon;
  const balance = card.remaining_balance != null ? card.remaining_balance : card.amount;

  const handleDownloadPDF = async () => {
    if (!cardRef.current || !backRef.current) return;
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

      pdf.save(`carte-cadeau-dhomebarber-${card.code}.pdf`);
    } catch (err) {
      console.error('PDF error:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: "Carte Cadeau D'Home Barber",
      text: `${card.sender_name} vous offre une carte cadeau de ${card.amount}€ chez D'Home Barber ! Code: ${card.code}. Valable jusqu'au ${new Date(card.valid_until).toLocaleDateString('fr-FR')}.${card.recipient_message ? '\n\nMessage: ' + card.recipient_message : ''}`,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
      }
    } else {
      await navigator.clipboard.writeText(shareData.text);
      alert('Texte copié dans le presse-papier !');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-card border border-border p-6 max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary z-10">
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
          {card.status === 'validated' && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-primary/15 border-primary/20 text-xs font-bold text-primary">
              Solde: {balance}€
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
            <span className="font-bold text-primary">{card.amount}€</span>
          </div>
          {card.status === 'validated' && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Validité</span>
              <span className="text-foreground">{new Date(card.valid_until).toLocaleDateString('fr-FR')}</span>
            </div>
          )}
          {card.recipient_message && (
            <div className="bg-white/5 rounded-xl p-3 mt-2">
              <p className="text-xs text-muted-foreground mb-1">Message</p>
              <p className="text-sm text-foreground italic">"{card.recipient_message}"</p>
            </div>
          )}
        </div>

        {/* Actions */}
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
      </motion.div>
    </div>
  );
}

export default function GiftCards() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);

  const { data: myCards = [], isLoading } = useQuery({
    queryKey: ['giftCards', user?.email],
    queryFn: () => api.entities.GiftCard.filter({ sender_email: user?.email }, '-created_at', 50),
    enabled: !!user?.email,
  });

  const handleCreated = () => {
    queryClient.invalidateQueries({ queryKey: ['giftCards'] });
  };

  const activeCards = myCards.filter(c => c.status === 'validated');
  const pendingCards = myCards.filter(c => c.status === 'pending');
  const otherCards = myCards.filter(c => c.status !== 'validated' && c.status !== 'pending');

  return (
    <div className="max-w-lg mx-auto px-1 py-4">
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
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
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
                    onClick={() => setSelectedCard(card)}
                    className="glass rounded-2xl p-4 cursor-pointer border border-amber-500/10"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                          <Clock className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{card.recipient_name}</p>
                          <p className="text-xs text-muted-foreground">{card.code}</p>
                        </div>
                      </div>
                      <p className="text-lg font-bold text-foreground">{card.amount}€</p>
                    </div>
                    <p className="text-[11px] text-amber-400/70 mt-2">En attente de paiement au salon</p>
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
                {activeCards.map(card => (
                  <motion.div
                    key={card.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedCard(card)}
                    className="glass rounded-2xl p-4 cursor-pointer border border-green-500/10"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5 text-green-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{card.recipient_name}</p>
                          <p className="text-xs text-muted-foreground">{card.code}</p>
                        </div>
                      </div>
                      <p className="text-lg font-bold text-primary">{card.amount}€</p>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <p className="text-[11px] text-muted-foreground flex-1">Valable jusqu'au {new Date(card.valid_until).toLocaleDateString('fr-FR')}</p>
                      <div className="flex gap-1.5">
                        <Download className="w-3.5 h-3.5 text-muted-foreground" />
                        <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Used / Expired */}
          {otherCards.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Historique ({otherCards.length})</p>
              <div className="space-y-2">
                {otherCards.map(card => {
                  const conf = STATUS_CONFIG[card.status] || STATUS_CONFIG.pending;
                  return (
                    <motion.div
                      key={card.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedCard(card)}
                      className="glass rounded-2xl p-3 cursor-pointer opacity-60"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Gift className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium text-foreground">{card.recipient_name}</p>
                            <p className="text-xs text-muted-foreground">{card.code}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-foreground">{card.amount}€</p>
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
        {selectedCard && <GiftCardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />}
      </AnimatePresence>
    </div>
  );
}
