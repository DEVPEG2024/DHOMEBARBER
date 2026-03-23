import React, { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Clock, User, Phone, Mail, Scissors, CreditCard, FileText, Calendar, Banknote, CheckCircle, Heart, ShoppingBag, ChevronDown, Check } from 'lucide-react';
import { getServiceColor } from '@/utils/serviceColors';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

const statusLabel = {
  pending: { label: 'En attente', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-400/50' },
  confirmed: { label: 'Confirmé', color: 'bg-green-500/20 text-green-300 border-green-400/50' },
  completed: { label: 'Terminé', color: 'bg-primary/20 text-primary border-primary/50' },
  cancelled: { label: 'Annulé', color: 'bg-red-500/10 text-red-400 border-red-400/30' },
  no_show: { label: 'No-show', color: 'bg-red-500/15 text-red-400 border-red-500/50' },
};

export default function AppointmentDetailModal({ appointment, onClose, onUpdate }) {
  const [saving, setSaving] = useState(false);
  const [tipMethod, setTipMethod] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productSold, setProductSold] = useState('');
  const [, forceUpdate] = useState(0);

  const tipRef = useRef(null);
  const initRef = useRef(null);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, 'name', 100),
  });

  // Init once per appointment
  if (appointment && appointment.id !== initRef.current) {
    initRef.current = appointment.id;
    setTipMethod(appointment.tip_method || '');
    setPaymentMethod(appointment.payment_method || '');
    setProductPrice(appointment.product_price ? String(appointment.product_price) : '');
    setProductSold(appointment.product_sold || '');
    setSelectedProductId('');
    setSaving(false);
  }

  if (!appointment) return null;

  const status = statusLabel[appointment.status] || statusLabel.confirmed;
  const tipValue = tipRef.current ? (parseFloat(tipRef.current.value) || 0) : (appointment.tip || 0);
  const prodValue = parseFloat(productPrice) || 0;
  const serviceTotal = appointment.total_price || 0;
  const grandTotal = serviceTotal + tipValue + prodValue;
  const canValidate = paymentMethod && (tipValue === 0 || tipMethod);

  const handleValidate = async () => {
    const finalTip = tipRef.current ? (parseFloat(tipRef.current.value) || 0) : 0;
    const finalGrandTotal = serviceTotal + finalTip + prodValue;
    setSaving(true);
    try {
      await base44.entities.Appointment.update(appointment.id, {
        payment_method: paymentMethod,
        payment_status: 'paid',
        status: 'completed',
        tip: finalTip,
        tip_method: tipMethod,
        product_sold: productSold,
        product_price: prodValue,
        grand_total: finalGrandTotal,
      });
      toast.success('Prestation validée !');
      onUpdate?.();
    } catch (e) {
      toast.error('Erreur lors de la validation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!appointment} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Détails du rendez-vous
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status + date */}
          <div className="flex items-center justify-between">
            <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${status.color}`}>
              {status.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {appointment.date} · {appointment.start_time} – {appointment.end_time}
            </span>
          </div>

          {/* Client info */}
          <div className="bg-secondary rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-semibold">{appointment.client_name}</span>
            </div>
            {appointment.client_email && (
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">{appointment.client_email}</span>
              </div>
            )}
            {appointment.client_phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">{appointment.client_phone}</span>
              </div>
            )}
          </div>

          {/* Barber */}
          {appointment.employee_name && (
            <div className="flex items-center gap-2">
              <Scissors className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm">{appointment.employee_name}</span>
            </div>
          )}

          {/* Services */}
          {appointment.services?.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Prestations</p>
              <div className="space-y-1.5">
                {appointment.services.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg px-3 py-2"
                    style={{ background: getServiceColor(s.service_id || idx) + '22', borderLeft: `3px solid ${getServiceColor(s.service_id || idx)}` }}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: getServiceColor(s.service_id || idx) }} />
                      <span className="text-sm font-medium">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.duration} min</span>
                      <span className="font-bold text-primary">{s.price}€</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tip */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Heart className="w-3 h-3 text-pink-400" />
              Pourboire
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  ref={tipRef}
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  defaultValue={appointment.tip || ''}
                  onInput={() => forceUpdate(n => n + 1)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
              </div>
              <button
                onClick={() => setTipMethod('cb')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  tipMethod === 'cb'
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10'
                }`}
              >
                <CreditCard className="w-3 h-3" />
                CB
              </button>
              <button
                onClick={() => setTipMethod('especes')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  tipMethod === 'especes'
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10'
                }`}
              >
                <Banknote className="w-3 h-3" />
                Espèces
              </button>
            </div>
          </div>

          {/* Product */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <ShoppingBag className="w-3 h-3 text-blue-400" />
              Produit vendu
            </label>
            <div className="relative">
              <select
                value={selectedProductId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedProductId(id);
                  if (id) {
                    const product = products.find(p => p.id === id);
                    if (product) {
                      setProductSold(product.name);
                      setProductPrice(String(product.price));
                    }
                  } else {
                    setProductSold('');
                    setProductPrice('');
                  }
                }}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 pr-8 text-sm text-foreground appearance-none focus:outline-none focus:border-primary/40"
              >
                <option value="" className="bg-card">{productSold || 'Sélectionner un produit...'}</option>
                {products.map(p => (
                  <option key={p.id} value={p.id} className="bg-card">
                    {p.name} — {p.price}€
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
            {prodValue > 0 && (
              <div className="flex items-center justify-between text-xs text-blue-400 px-1">
                <span>{productSold}</span>
                <span>{prodValue}€</span>
              </div>
            )}
          </div>

          {/* Total + payment */}
          <div className="bg-primary/10 rounded-xl px-4 py-3 space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Prestations</span>
                <span>{serviceTotal}€</span>
              </div>
              {tipValue > 0 && (
                <div className="flex items-center justify-between text-xs text-pink-400">
                  <span>Pourboire {tipMethod === 'cb' ? '(CB)' : tipMethod === 'especes' ? '(Espèces)' : ''}</span>
                  <span>+{tipValue}€</span>
                </div>
              )}
              {prodValue > 0 && (
                <div className="flex items-center justify-between text-xs text-blue-400">
                  <span>Produit{productSold ? ` (${productSold})` : ''}</span>
                  <span>+{prodValue}€</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <span className="text-sm font-semibold text-foreground">Commande totale</span>
                <span className="text-lg font-bold text-primary">{grandTotal}€</span>
              </div>
              <p className="text-[10px] text-muted-foreground text-right">{appointment.total_duration} min</p>
            </div>

            {/* Payment method selector */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Mode de paiement</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPaymentMethod('cb')}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    paymentMethod === 'cb'
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                      : 'bg-white/5 border border-white/10 text-foreground hover:bg-white/10'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  CB
                  {paymentMethod === 'cb' && <CheckCircle className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setPaymentMethod('especes')}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    paymentMethod === 'especes'
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                      : 'bg-white/5 border border-white/10 text-foreground hover:bg-white/10'
                  }`}
                >
                  <Banknote className="w-4 h-4" />
                  Espèces
                  {paymentMethod === 'especes' && <CheckCircle className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Validate button */}
          {canValidate && (
            <button
              onClick={handleValidate}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-500 text-white font-semibold text-sm shadow-lg shadow-green-500/25 hover:bg-green-600 transition-all disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              {saving ? 'Validation...' : 'Valider la prestation'}
            </button>
          )}

          {/* Notes */}
          {appointment.notes && (
            <div className="flex items-start gap-2">
              <FileText className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">{appointment.notes}</p>
            </div>
          )}
          {appointment.internal_notes && (
            <div className="flex items-start gap-2 bg-secondary rounded-lg px-3 py-2">
              <FileText className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-xs text-yellow-300/80">{appointment.internal_notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
