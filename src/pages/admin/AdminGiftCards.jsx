import React, { useState } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, CheckCircle2, XCircle, Clock, Search, Filter, X, Ban, CreditCard, Banknote } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const STATUS_CONFIG = {
  pending: { label: 'En attente', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/20', icon: Clock },
  validated: { label: 'Validée', color: 'text-green-400', bg: 'bg-green-500/15 border-green-500/20', icon: CheckCircle2 },
  used: { label: 'Utilisée', color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/20', icon: CheckCircle2 },
  expired: { label: 'Expirée', color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/20', icon: XCircle },
};

function ValidateModal({ card, onClose, onValidated }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [paymentMethod, setPaymentMethod] = useState('');
  const [loading, setLoading] = useState(false);

  const handleValidate = async () => {
    if (!paymentMethod) {
      toast({ title: 'Sélectionnez un mode de paiement', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await api.entities.GiftCard.update(card.id, {
        status: 'validated',
        validated_at: new Date().toISOString(),
        validated_by: user?.full_name || user?.email || 'admin',
      });
      toast({ title: 'Carte validée !', description: `${card.amount}€ - ${card.recipient_name}` });
      queryClient.invalidateQueries({ queryKey: ['adminGiftCards'] });
      onValidated?.();
      onClose();
    } catch (err) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await api.entities.GiftCard.update(card.id, { status: 'expired' });
      toast({ title: 'Carte rejetée' });
      queryClient.invalidateQueries({ queryKey: ['adminGiftCards'] });
      onClose();
    } catch (err) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleMarkUsed = async () => {
    setLoading(true);
    try {
      await api.entities.GiftCard.update(card.id, {
        status: 'used',
        used_at: new Date().toISOString(),
      });
      toast({ title: 'Carte marquée comme utilisée' });
      queryClient.invalidateQueries({ queryKey: ['adminGiftCards'] });
      onClose();
    } catch (err) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const statusConf = STATUS_CONFIG[card.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConf.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md rounded-3xl bg-card border border-border p-6 shadow-2xl"
      >
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary">
          <X className="w-4 h-4" />
        </button>

        {/* Card preview */}
        <div className="relative overflow-hidden rounded-2xl mb-5" style={{ aspectRatio: '1.6/1' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#111] to-[#0a0a0a]" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/20 to-transparent rounded-bl-full" />
          <div className="absolute inset-[1px] rounded-2xl border border-white/10" />
          <div className="relative h-full flex flex-col justify-between p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[9px] tracking-[0.3em] uppercase text-white/40">Carte Cadeau</p>
                <p className="text-[10px] text-white/30 font-mono">{card.code}</p>
              </div>
              <img src="/logo.png" alt="" className="w-10 h-10 object-contain opacity-80" />
            </div>
            <div className="text-center">
              <p className="text-3xl font-black text-white">{card.amount}€</p>
            </div>
            <div className="flex justify-between items-end">
              <div>
                <p className="text-[9px] text-white/40 uppercase">Pour</p>
                <p className="text-xs font-semibold text-white">{card.recipient_name}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-white/40 uppercase">De</p>
                <p className="text-xs text-white/70">{card.sender_name}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 mb-4">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${statusConf.bg} ${statusConf.color}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            {statusConf.label}
          </div>
          <span className="text-xs text-muted-foreground">
            {card.created_at ? new Date(card.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
          </span>
        </div>

        {/* Details */}
        <div className="space-y-2 mb-5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Client</span><span className="font-medium">{card.sender_name}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-medium">{card.sender_email}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Téléphone</span><span className="font-medium">{card.sender_phone || '-'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Bénéficiaire</span><span className="font-medium">{card.recipient_name}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Validité</span><span>{card.valid_until ? new Date(card.valid_until).toLocaleDateString('fr-FR') : '-'}</span></div>
          {card.recipient_message && (
            <div className="bg-white/5 rounded-xl p-3 mt-1">
              <p className="text-xs text-muted-foreground mb-1">Message</p>
              <p className="text-sm italic">"{card.recipient_message}"</p>
            </div>
          )}
          {card.validated_by && (
            <div className="flex justify-between"><span className="text-muted-foreground">Validée par</span><span className="text-green-400 font-medium">{card.validated_by}</span></div>
          )}
        </div>

        {/* Actions */}
        {card.status === 'pending' && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-foreground">Mode de paiement reçu</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPaymentMethod('cb')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
                  paymentMethod === 'cb' ? 'bg-primary text-primary-foreground' : 'bg-white/5 border border-white/10 text-foreground hover:bg-white/10'
                }`}
              >
                <CreditCard className="w-4 h-4" /> CB
              </button>
              <button
                onClick={() => setPaymentMethod('especes')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
                  paymentMethod === 'especes' ? 'bg-primary text-primary-foreground' : 'bg-white/5 border border-white/10 text-foreground hover:bg-white/10'
                }`}
              >
                <Banknote className="w-4 h-4" /> Espèces
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleReject}
                disabled={loading}
                className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-500/10 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                <Ban className="w-4 h-4" /> Rejeter
              </button>
              <button
                onClick={handleValidate}
                disabled={loading || !paymentMethod}
                className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-500 text-white text-sm font-semibold hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" /> Valider
              </button>
            </div>
          </div>
        )}

        {card.status === 'validated' && (
          <button
            onClick={handleMarkUsed}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" /> Marquer comme utilisée
          </button>
        )}
      </motion.div>
    </div>
  );
}

export default function AdminGiftCards() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedCard, setSelectedCard] = useState(null);

  const { data: giftCards = [], isLoading } = useQuery({
    queryKey: ['adminGiftCards'],
    queryFn: () => api.entities.GiftCard.list('-created_at', 200),
  });

  const filtered = giftCards.filter(c => {
    if (filter !== 'all' && c.status !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        (c.code || '').toLowerCase().includes(s) ||
        (c.sender_name || '').toLowerCase().includes(s) ||
        (c.recipient_name || '').toLowerCase().includes(s) ||
        (c.sender_email || '').toLowerCase().includes(s)
      );
    }
    return true;
  });

  const stats = {
    pending: giftCards.filter(c => c.status === 'pending').length,
    validated: giftCards.filter(c => c.status === 'validated').length,
    used: giftCards.filter(c => c.status === 'used').length,
    total: giftCards.reduce((sum, c) => c.status === 'validated' || c.status === 'used' ? sum + (c.amount || 0) : sum, 0),
  };

  const filters = [
    { key: 'all', label: 'Toutes' },
    { key: 'pending', label: `En attente (${stats.pending})` },
    { key: 'validated', label: `Actives (${stats.validated})` },
    { key: 'used', label: `Utilisées (${stats.used})` },
    { key: 'expired', label: 'Expirées' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary" />
            Cartes Cadeau
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Gestion et validation des cartes cadeau</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-amber-400 font-medium">En attente</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stats.pending}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-green-400 font-medium">Actives</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stats.validated}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-blue-400 font-medium">Utilisées</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stats.used}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-primary font-medium">CA Cartes</p>
          <p className="text-2xl font-bold text-primary mt-1">{stats.total}€</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par nom, email, code..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Gift className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aucune carte cadeau</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(card => {
            const conf = STATUS_CONFIG[card.status] || STATUS_CONFIG.pending;
            const ConfIcon = conf.icon;
            return (
              <motion.div
                key={card.id}
                whileTap={{ scale: 0.99 }}
                onClick={() => setSelectedCard(card)}
                className="bg-card rounded-2xl border border-border p-4 cursor-pointer hover:border-primary/20 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${conf.bg}`}>
                      <ConfIcon className={`w-5 h-5 ${conf.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">{card.recipient_name}</p>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">{card.code}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        De {card.sender_name} · {card.created_at ? new Date(card.created_at).toLocaleDateString('fr-FR') : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-lg font-bold text-foreground">{card.amount}€</p>
                    <p className={`text-[10px] font-semibold ${conf.color}`}>{conf.label}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {selectedCard && <ValidateModal card={selectedCard} onClose={() => setSelectedCard(null)} />}
      </AnimatePresence>
    </div>
  );
}
