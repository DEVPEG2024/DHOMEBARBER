import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, CheckCircle2, XCircle, Clock, Search, X, Ban, CreditCard, Banknote, Minus, ScanLine, Camera, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import jsQR from 'jsqr';

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
  const [deductAmount, setDeductAmount] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const currentBalance = card.remaining_balance != null ? card.remaining_balance : card.amount;

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
        remaining_balance: card.amount,
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

  const handleDeduct = async () => {
    const val = Number(deductAmount);
    if (!val || val <= 0) {
      toast({ title: 'Montant invalide', variant: 'destructive' });
      return;
    }
    if (val > currentBalance) {
      toast({ title: `Solde insuffisant (${currentBalance}€)`, variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const newBalance = Math.round((currentBalance - val) * 100) / 100;
      const updates = { remaining_balance: newBalance };
      if (newBalance <= 0) {
        updates.status = 'used';
        updates.used_at = new Date().toISOString();
      }
      await api.entities.GiftCard.update(card.id, updates);
      toast({
        title: newBalance <= 0 ? 'Carte épuisée' : `${val}€ débité`,
        description: newBalance > 0 ? `Nouveau solde: ${newBalance}€` : 'La carte est maintenant utilisée',
      });
      queryClient.invalidateQueries({ queryKey: ['adminGiftCards'] });
      onClose();
    } catch (err) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await api.entities.GiftCard.delete(card.id);
      toast({ title: 'Carte supprimée' });
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
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl bg-card border border-border p-6 shadow-2xl"
      >
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary z-10">
          <X className="w-4 h-4" />
        </button>

        {/* Card preview */}
        <div className="relative overflow-hidden rounded-2xl mb-4" style={{ aspectRatio: '1.6/1' }}>
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
              {!confirmReject ? (
                <button
                  onClick={() => setConfirmReject(true)}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-500/10 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  <Ban className="w-4 h-4" /> Rejeter
                </button>
              ) : (
                <button
                  onClick={handleReject}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 animate-pulse"
                >
                  <AlertTriangle className="w-4 h-4" /> Confirmer
                </button>
              )}
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
          <div className="space-y-3">
            <div className="bg-primary/10 rounded-2xl p-4 text-center border border-primary/20">
              <p className="text-xs text-muted-foreground mb-1">Solde disponible</p>
              <p className="text-3xl font-black text-primary">{currentBalance}€</p>
              <p className="text-[10px] text-muted-foreground mt-1">sur {card.amount}€</p>
            </div>
            <p className="text-xs font-semibold text-foreground">Débiter un montant</p>
            <div className="flex gap-2">
              <input
                type="number"
                value={deductAmount}
                onChange={e => setDeductAmount(e.target.value)}
                placeholder="Montant à débiter..."
                min="0.01"
                max={currentBalance}
                step="0.01"
                className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                onClick={() => setDeductAmount(String(currentBalance))}
                className="shrink-0 px-3 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-muted-foreground hover:bg-white/10"
              >
                Tout
              </button>
            </div>
            <button
              onClick={handleDeduct}
              disabled={loading || !deductAmount}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Minus className="w-4 h-4" />
              {loading ? 'Débit...' : deductAmount && Number(deductAmount) >= currentBalance ? 'Épuiser la carte' : 'Débiter'}
            </button>
          </div>
        )}

        {/* Delete */}
        <div className="mt-4 pt-4 border-t border-border">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Supprimer cette carte
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-medium text-muted-foreground bg-white/5 hover:bg-white/10 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Confirmer
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// Extract DHB code from QR value (URL or raw)
function extractCodeFromQR(value) {
  if (!value) return null;
  const upper = value.toUpperCase();
  // Match scan= param (case insensitive)
  const match = upper.match(/SCAN=([A-Z0-9-]+)/);
  if (match) return match[1];
  // Match DHB-XXXX-XXXX anywhere in the string
  const dhbMatch = upper.match(/(DHB-[A-Z0-9]{4}-[A-Z0-9]{4})/);
  if (dhbMatch) return dhbMatch[1];
  return null;
}

// QR Scanner using device camera + jsQR (cross-browser: iOS, Android, desktop)
function QRScannerModal({ onClose, onScanned }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const onScannedRef = useRef(onScanned);
  onScannedRef.current = onScanned;
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const { toast } = useToast();

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let rafId;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(true);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setCameraReady(true);

        // Scan loop using jsQR (works on ALL browsers including iOS Safari)
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', { willReadFrequently: true });

        const scan = () => {
          if (cancelled || !video || video.readyState < 2 || !ctx) {
            rafId = requestAnimationFrame(scan);
            return;
          }

          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const qr = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });

          if (qr && qr.data) {
            const code = extractCodeFromQR(qr.data);
            if (code) {
              stopCamera();
              onScannedRef.current(code);
              return;
            }
          }

          rafId = requestAnimationFrame(scan);
        };

        rafId = requestAnimationFrame(scan);
      } catch (err) {
        console.error('Camera error:', err);
        if (!cancelled) setCameraError(true);
      }
    };

    start();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      stopCamera();
    };
  }, [stopCamera]);

  const handleManualSubmit = () => {
    const code = manualCode.trim().toUpperCase();
    if (code.startsWith('DHB-')) {
      stopCamera();
      onScanned(code);
    } else {
      toast({ title: 'Code invalide', description: 'Le code doit commencer par DHB-', variant: 'destructive' });
    }
  };

  const handleClose = () => { stopCamera(); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-3xl bg-card border border-border p-5 shadow-2xl"
      >
        <button onClick={handleClose} className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary z-10">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <Camera className="w-5 h-5 text-primary" />
          <h3 className="text-base font-bold text-foreground">Scanner une carte</h3>
        </div>

        {/* Hidden canvas for jsQR processing */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Camera preview */}
        {!cameraError && (
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] mb-4">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            )}
            {cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-44 h-44 relative">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-3 border-l-3 border-primary rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-3 border-r-3 border-primary rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-3 border-l-3 border-primary rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-3 border-r-3 border-primary rounded-br-lg" />
                  <motion.div
                    className="absolute left-2 right-2 h-0.5 bg-primary"
                    animate={{ top: ['10%', '90%', '10%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center mb-3">
          {cameraError
            ? 'Caméra non disponible. Entrez le code manuellement.'
            : 'Pointez la caméra vers le QR code de la carte'}
        </p>

        {/* Manual input (always visible) */}
        <div className="flex gap-2">
          <input
            type="text"
            value={manualCode}
            onChange={e => setManualCode(e.target.value.toUpperCase())}
            placeholder="DHB-XXXX-XXXX"
            className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
            onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
          />
          <button
            onClick={handleManualSubmit}
            disabled={!manualCode.trim()}
            className="shrink-0 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            OK
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function AdminGiftCards() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedCard, setSelectedCard] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [pendingScanCode, setPendingScanCode] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: giftCards = [], isLoading } = useQuery({
    queryKey: ['adminGiftCards'],
    queryFn: () => api.entities.GiftCard.list('-created_at', 200),
  });

  // Resolve a scanned code: find in loaded cards or refetch
  const resolveScanCode = useCallback(async (code) => {
    // Try in current data first
    let card = giftCards.find(c => c.code === code);
    if (card) {
      setSelectedCard(card);
      setPendingScanCode(null);
      return;
    }
    // Data might be stale — refetch and retry
    setPendingScanCode(code);
    await queryClient.invalidateQueries({ queryKey: ['adminGiftCards'] });
  }, [giftCards, queryClient]);

  // When data refreshes and we have a pending code, resolve it
  useEffect(() => {
    if (!pendingScanCode || isLoading) return;
    const card = giftCards.find(c => c.code === pendingScanCode);
    if (card) {
      setSelectedCard(card);
      setPendingScanCode(null);
    } else if (giftCards.length > 0) {
      toast({ title: 'Carte introuvable', description: `Aucune carte avec le code ${pendingScanCode}`, variant: 'destructive' });
      setPendingScanCode(null);
    }
  }, [giftCards, isLoading, pendingScanCode, toast]);

  // Handle QR scan from URL: ?scan=DHB-XXXX-XXXX
  useEffect(() => {
    const scanCode = searchParams.get('scan');
    if (scanCode && giftCards.length > 0) {
      const card = giftCards.find(c => c.code === scanCode);
      if (card) {
        setSelectedCard(card);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, giftCards, setSearchParams]);

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
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowScanner(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/25"
        >
          <ScanLine className="w-4 h-4" />
          Scanner
        </motion.button>
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
                    {card.status === 'validated' && card.remaining_balance != null && card.remaining_balance < card.amount && (
                      <p className="text-[10px] font-bold text-primary">Solde: {card.remaining_balance}€</p>
                    )}
                    {(card.status !== 'validated' || card.remaining_balance == null || card.remaining_balance >= card.amount) && (
                      <p className={`text-[10px] font-semibold ${conf.color}`}>{conf.label}</p>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Scan loading overlay */}
      {pendingScanCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-3xl border border-border p-8 text-center shadow-2xl">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground">Recherche de la carte...</p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">{pendingScanCode}</p>
          </div>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {selectedCard && <ValidateModal card={selectedCard} onClose={() => setSelectedCard(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showScanner && (
          <QRScannerModal
            onClose={() => setShowScanner(false)}
            onScanned={(code) => {
              setShowScanner(false);
              resolveScanCode(code);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
