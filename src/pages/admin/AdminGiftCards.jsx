import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, CheckCircle2, XCircle, Clock, Search, X, Ban, CreditCard, Banknote, ScanLine, Camera, Trash2, AlertTriangle, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import jsQR from 'jsqr';
import GiftCardSummary from '@/components/giftcards-admin/GiftCardSummary';
import GiftCardDebitPanel from '@/components/giftcards-admin/GiftCardDebitPanel';
import GiftCardHistory from '@/components/giftcards-admin/GiftCardHistory';
import {
  giftCardState, giftCardBalance, formatEuro, formatDay, invalidateGiftCardQueries, fetchGiftCardByCode, friendlyGiftCardError,
  patchGiftCardCache,
} from '@/lib/giftCardDebit';
import LoadError from '@/components/shared/LoadError';

const STATUS_CONFIG = {
  pending: { label: 'En attente', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/20', icon: Clock },
  validated: { label: 'Validée', color: 'text-green-400', bg: 'bg-green-500/15 border-green-500/20', icon: CheckCircle2 },
  used: { label: 'Utilisée', color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/20', icon: CheckCircle2 },
  expired: { label: 'Expirée', color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/20', icon: XCircle },
};

/** Bandeau d'état en tête de fiche quand la carte ne peut pas être débitée. */
function StateBanner({ tone, children }) {
  const tones = {
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    red: 'bg-red-500/10 border-red-500/30 text-red-300',
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
  };
  return (
    <div role="status" data-testid="gc-banner" className={`flex items-start gap-2 rounded-2xl border px-3 py-2.5 mb-4 text-xs font-medium ${tones[tone] || tones.amber}`}>
      <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
      <span>{children}</span>
    </div>
  );
}

function ValidateModal({ card, onClose, onCardChange }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [paymentMethod, setPaymentMethod] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showDetails, setShowDetails] = useState(card.status === 'pending');
  // Écran de succès du débit : gardé même si la carte vient de passer à « utilisée »
  const [debitResultShown, setDebitResultShown] = useState(false);
  const state = giftCardState(card);
  const showDebit = state === 'debitable' || debitResultShown;

  const handleValidate = async () => {
    if (!paymentMethod) {
      toast.error('Sélectionnez un mode de paiement');
      return;
    }
    setLoading(true);
    try {
      const updates = {
        status: 'validated',
        validated_at: new Date().toISOString(),
        validated_by: user?.full_name || user?.email || 'admin',
        remaining_balance: card.amount,
      };
      await api.entities.GiftCard.update(card.id, updates);
      toast.success('Carte validée !', { description: `${formatEuro(card.amount)} - ${card.recipient_name}` });
      invalidateGiftCardQueries(queryClient, card.id);
      // La fiche reste ouverte : la carte, désormais payée, peut être débitée tout de suite
      onCardChange?.({ ...card, ...updates });
    } catch (err) {
      toast.error('Erreur', { description: friendlyGiftCardError(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await api.entities.GiftCard.update(card.id, { status: 'expired' });
      toast.success('Carte rejetée');
      invalidateGiftCardQueries(queryClient, card.id);
      onClose();
    } catch (err) {
      toast.error('Erreur', { description: friendlyGiftCardError(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    try {
      await api.entities.GiftCard.update(card.id, { status: 'expired', remaining_balance: 0 });
      toast.success('Carte annulée', { description: `${card.code} - ${card.recipient_name}` });
      invalidateGiftCardQueries(queryClient, card.id);
      onClose();
    } catch (err) {
      toast.error('Erreur', { description: friendlyGiftCardError(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await api.entities.GiftCard.delete(card.id);
      toast.success('Carte supprimée');
      invalidateGiftCardQueries(queryClient, card.id);
      onClose();
    } catch (err) {
      toast.error('Erreur', { description: friendlyGiftCardError(err) });
    } finally {
      setLoading(false);
    }
  };

  const statusConf = STATUS_CONFIG[card.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConf.icon;

  return (
    // z-[60] comme les autres fiches, entre l'encoche et la barre d'accueil iOS : la fenêtre défile jusqu'à « Supprimer »
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Carte cadeau ${card.code}`}
        className="relative w-full max-w-md max-h-full overflow-y-auto overscroll-contain rounded-3xl bg-card border border-border p-5 sm:p-6 shadow-2xl"
      >
        <button onClick={onClose} aria-label="Fermer" className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center bg-black/40 hover:bg-secondary z-10">
          <X className="w-4 h-4" />
        </button>

        <GiftCardSummary card={card} />

        {/* Ce qui empêche un débit */}
        {!showDebit && state === 'pending' && (
          <StateBanner tone="amber">À valider (paiement de la carte) avant de pouvoir la débiter.</StateBanner>
        )}
        {!showDebit && state === 'used' && (
          <StateBanner tone="blue">
            Carte entièrement utilisée{card.used_at ? ` le ${formatDay(card.used_at)}` : ''} : solde {formatEuro(giftCardBalance(card))}, aucun débit possible.
          </StateBanner>
        )}
        {!showDebit && state === 'expired' && (
          <StateBanner tone="red">Carte annulée ou expirée : aucun débit possible.</StateBanner>
        )}
        {!showDebit && state === 'outdated' && (
          <StateBanner tone="red">
            Date de validité dépassée ({formatDay(card.valid_until)}) : aucun débit possible.
          </StateBanner>
        )}

        {/* Débit */}
        {showDebit && (
          <GiftCardDebitPanel
            card={card}
            onCardChange={onCardChange}
            onResultChange={setDebitResultShown}
            onDone={onClose}
          />
        )}

        {/* Historique des mouvements (si le serveur le fournit) */}
        {card.status !== 'pending' && <GiftCardHistory cardId={card.id} />}

        {/* Status + détails */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowDetails(v => !v)}
            className="w-full flex items-center justify-between gap-2 py-2 text-left"
            aria-expanded={showDetails}
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${statusConf.bg} ${statusConf.color}`}>
                <StatusIcon className="w-3.5 h-3.5" />
                {statusConf.label}
              </span>
              <span className="text-xs text-muted-foreground truncate">Détails de la carte</span>
            </span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
          </button>
          {showDetails && (
            <div className="space-y-2 mt-2 text-sm">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Achetée le</span><span className="font-medium text-right">{card.created_at ? formatDay(card.created_at) : '-'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Client</span><span className="font-medium text-right truncate">{card.sender_name}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Email</span><span className="font-medium text-right truncate">{card.sender_email}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Téléphone</span><span className="font-medium text-right">{card.sender_phone || '-'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Bénéficiaire</span><span className="font-medium text-right truncate">{card.recipient_name}</span></div>
              {card.recipient_message && (
                <div className="bg-white/5 rounded-xl p-3 mt-1">
                  <p className="text-xs text-muted-foreground mb-1">Message</p>
                  <p className="text-sm italic break-words">"{card.recipient_message}"</p>
                </div>
              )}
              {card.validated_by && (
                <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Validée par</span><span className="text-green-400 font-medium text-right truncate">{card.validated_by}</span></div>
              )}
            </div>
          )}
        </div>

        {/* Validation d'une carte en attente */}
        {card.status === 'pending' && (
          <div className="space-y-3 mt-4">
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

        {/* Annuler la carte (validée, solde restant) */}
        {card.status === 'validated' && !debitResultShown && (
          <div className="pt-3">
            {!confirmCancel ? (
              <button
                onClick={() => setConfirmCancel(true)}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
              >
                <Ban className="w-3.5 h-3.5" /> Annuler cette carte
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmCancel(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-medium text-muted-foreground bg-white/5 hover:bg-white/10 transition-colors"
                >
                  Non
                </button>
                <button
                  onClick={handleCancel}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-colors disabled:opacity-50"
                >
                  <Ban className="w-3.5 h-3.5" /> Confirmer l'annulation
                </button>
              </div>
            )}
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
      toast.error('Code invalide', { description: 'Le code doit commencer par DHB-' });
    }
  };

  const handleClose = () => { stopCamera(); onClose(); };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-sm max-h-full overflow-y-auto overscroll-contain rounded-3xl bg-card border border-border p-5 shadow-2xl"
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
  const queryClient = useQueryClient();

  const { data: giftCards = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['adminGiftCards'],
    queryFn: () => api.entities.GiftCard.list('-created_at', 200),
  });
  const giftCardsRef = useRef(giftCards);
  giftCardsRef.current = giftCards;

  // Fiche ouverte : la version de la liste (à jour après un débit ou un rechargement), sinon
  // l'instantané (carte trouvée par son code, hors des 200 dernières)
  const liveCard = selectedCard
    ? giftCards.find(c => String(c.id) === String(selectedCard.id)) || selectedCard
    : null;

  const handleCardChange = useCallback((fresh) => {
    if (!fresh?.id) return;
    patchGiftCardCache(queryClient, fresh);
    setSelectedCard(prev => (prev && String(prev.id) === String(fresh.id) ? { ...prev, ...fresh } : prev));
  }, [queryClient]);

  // Code scanné ou saisi : d'abord dans la liste chargée, sinon recherche directe par code
  const openByCode = useCallback(async (raw) => {
    const code = String(raw || '').trim().toUpperCase();
    if (!code) return;
    const known = giftCardsRef.current.find(c => String(c.code || '').toUpperCase() === code);
    if (known) {
      setSelectedCard(known);
      return;
    }
    setPendingScanCode(code);
    try {
      const found = await fetchGiftCardByCode(code);
      if (found) {
        setSelectedCard(found);
        queryClient.invalidateQueries({ queryKey: ['adminGiftCards'] });
      } else {
        toast.error('Carte introuvable', { description: `Aucune carte avec le code ${code}` });
      }
    } catch (err) {
      toast.error('Carte introuvable', { description: friendlyGiftCardError(err, `Aucune carte avec le code ${code}`) });
    } finally {
      setPendingScanCode(null);
    }
  }, [queryClient]);

  // QR code lu par l'appareil photo du téléphone : ?scan=DHB-XXXX-XXXX
  const scanParam = searchParams.get('scan');
  useEffect(() => {
    if (!scanParam || isLoading) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('scan');
      return next;
    }, { replace: true });
    openByCode(scanParam);
  }, [scanParam, isLoading, openByCode, setSearchParams]);

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
      {isError && !giftCards.length ? (
        <LoadError what="les cartes cadeau" error={error} onRetry={refetch} retrying={isFetching} />
      ) : isLoading ? (
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-3xl border border-border p-8 text-center shadow-2xl">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground">Recherche de la carte...</p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">{pendingScanCode}</p>
          </div>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {liveCard && (
          <ValidateModal
            key={liveCard.id}
            card={liveCard}
            onClose={() => setSelectedCard(null)}
            onCardChange={handleCardChange}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showScanner && (
          <QRScannerModal
            onClose={() => setShowScanner(false)}
            onScanned={(code) => {
              setShowScanner(false);
              openByCode(code);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
