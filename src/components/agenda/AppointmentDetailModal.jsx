import React, { useReducer } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Clock, User, Phone, Mail, Scissors, CreditCard, FileText, Calendar, Banknote, CheckCircle, Heart, ShoppingBag, ChevronDown, Check, BadgeCheck, X, AlertTriangle, Trash2 } from 'lucide-react';
import { getServiceColor } from '@/utils/serviceColors';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

const statusLabel = {
  pending: { label: 'En attente', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-400/50' },
  confirmed: { label: 'Confirmé', color: 'bg-green-500/20 text-green-300 border-green-400/50' },
  completed: { label: 'Terminé', color: 'bg-primary/20 text-primary border-primary/50' },
  cancelled: { label: 'Annulé', color: 'bg-red-500/10 text-red-400 border-red-400/30' },
  no_show: { label: 'No-show', color: 'bg-red-500/15 text-red-400 border-red-500/50' },
};

const initialState = (apt) => ({
  saving: false,
  tip: apt.tip ? String(apt.tip) : '',
  tipMethod: apt.tip_method || '',
  paymentMethod: apt.payment_method || '',
  selectedProductId: '',
  productPrice: apt.product_price ? String(apt.product_price) : '',
  productSold: apt.product_sold || '',
  clientName: apt.client_name || '',
  clientEmail: apt.client_email || '',
  clientPhone: apt.client_phone || '',
});

function reducer(state, action) {
  switch (action.type) {
    case 'SET': return { ...state, [action.field]: action.value };
    case 'SET_PRODUCT': return { ...state, selectedProductId: action.id, productSold: action.name, productPrice: action.price };
    case 'CLEAR_PRODUCT': return { ...state, selectedProductId: '', productSold: '', productPrice: '' };
    case 'SAVING': return { ...state, saving: action.value };
    default: return state;
  }
}

function ModalInner({ appointment, onUpdate, onDelete }) {
  const [state, dispatch] = useReducer(reducer, appointment, initialState);
  const [clientSearch, setClientSearch] = React.useState('');
  const [assignedClient, setAssignedClient] = React.useState(null);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.entities.Product.filter({ is_active: true }, 'name', 100),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['allUsersForSearch'],
    queryFn: () => api.entities.User.list('full_name', 1000),
    enabled: !appointment.client_email && appointment.status !== 'completed',
  });

  const filteredUsers = clientSearch.length >= 2
    ? allUsers.filter(u => u.full_name?.toLowerCase().includes(clientSearch.toLowerCase()) || u.email?.toLowerCase().includes(clientSearch.toLowerCase()))
    : [];

  const status = statusLabel[appointment.status] || statusLabel.confirmed;
  const isCompleted = appointment.status === 'completed';
  const tipValue = isCompleted ? (appointment.tip || 0) : (parseFloat(state.tip) || 0);
  const prodValue = isCompleted ? (appointment.product_price || 0) : (parseFloat(state.productPrice) || 0);
  const serviceTotal = appointment.total_price || 0;
  const grandTotal = isCompleted ? (appointment.grand_total || serviceTotal + tipValue + prodValue) : (serviceTotal + tipValue + prodValue);
  const canValidate = !isCompleted && state.paymentMethod && (tipValue === 0 || state.tipMethod);

  const handleValidate = async () => {
    dispatch({ type: 'SAVING', value: true });
    try {
      await api.entities.Appointment.update(appointment.id, {
        payment_method: state.paymentMethod,
        payment_status: 'paid',
        status: 'completed',
        tip: tipValue,
        tip_method: state.tipMethod,
        product_sold: state.productSold,
        product_price: prodValue,
        grand_total: grandTotal,
      });
      toast.success('Prestation validée !');
      onUpdate?.();
    } catch (e) {
      toast.error('Erreur lors de la validation');
    } finally {
      dispatch({ type: 'SAVING', value: false });
    }
  };

  return (
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
      {!isCompleted && !appointment.client_email && !assignedClient ? (
        <div className="bg-secondary rounded-xl p-3 space-y-2 relative">
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Rechercher un client..."
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40"
            />
          </div>
          {filteredUsers.length > 0 && (
            <div className="max-h-36 overflow-y-auto rounded-lg border border-border bg-card">
              {filteredUsers.slice(0, 8).map(u => (
                <button
                  key={u.id}
                  onClick={async () => {
                    dispatch({ type: 'SAVING', value: true });
                    try {
                      await api.entities.Appointment.update(appointment.id, {
                        client_name: u.full_name || u.email,
                        client_email: u.email,
                        client_phone: u.phone || '',
                      });
                      setAssignedClient({ name: u.full_name || u.email, email: u.email, phone: u.phone || '' });
                      toast.success(`Client ${u.full_name || u.email} assigné`);
                      setClientSearch('');
                    } catch {
                      toast.error('Erreur');
                    } finally {
                      dispatch({ type: 'SAVING', value: false });
                    }
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-primary/10 transition-colors border-b border-border/50 last:border-0"
                >
                  <span className="font-semibold text-foreground">{u.full_name || u.email}</span>
                  {u.phone && <span className="text-muted-foreground ml-2">{u.phone}</span>}
                </button>
              ))}
            </div>
          )}
          {clientSearch.length >= 2 && filteredUsers.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center py-1">Aucun client trouvé</p>
          )}
        </div>
      ) : (
        <div className="bg-secondary rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold">{assignedClient?.name || appointment.client_name}</span>
          </div>
          {(assignedClient?.email || appointment.client_email) && (
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">{assignedClient?.email || appointment.client_email}</span>
            </div>
          )}
          {(assignedClient?.phone || appointment.client_phone) && (
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">{assignedClient?.phone || appointment.client_phone}</span>
            </div>
          )}
        </div>
      )}

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

      {isCompleted ? (
        <>
          {/* Completed banner */}
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
            <BadgeCheck className="w-5 h-5 text-green-400" />
            <span className="text-sm font-semibold text-green-400">Prestation effectuée</span>
          </div>

          {/* Read-only summary */}
          <div className="bg-primary/10 rounded-xl px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Prestations</span>
              <span>{serviceTotal}€</span>
            </div>
            {tipValue > 0 && (
              <div className="flex items-center justify-between text-xs text-pink-400">
                <span>Pourboire {appointment.tip_method === 'cb' ? '(CB)' : appointment.tip_method === 'especes' ? '(Espèces)' : ''}</span>
                <span>+{tipValue}€</span>
              </div>
            )}
            {prodValue > 0 && (
              <div className="flex items-center justify-between text-xs text-blue-400">
                <span>Produit{appointment.product_sold ? ` (${appointment.product_sold})` : ''}</span>
                <span>+{prodValue}€</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <span className="text-sm font-semibold text-foreground">Commande totale</span>
              <span className="text-lg font-bold text-primary">{grandTotal}€</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{appointment.total_duration} min</span>
              <span className="flex items-center gap-1">
                {appointment.payment_method === 'cb' ? <CreditCard className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
                {appointment.payment_method === 'cb' ? 'CB' : 'Espèces'}
              </span>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Tip */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Heart className="w-3 h-3 text-pink-400" />
              Pourboire
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={state.tip}
                  onChange={(e) => dispatch({ type: 'SET', field: 'tip', value: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
              </div>
              <button
                onClick={() => dispatch({ type: 'SET', field: 'tipMethod', value: 'cb' })}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  state.tipMethod === 'cb'
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10'
                }`}
              >
                <CreditCard className="w-3 h-3" />
                CB
              </button>
              <button
                onClick={() => dispatch({ type: 'SET', field: 'tipMethod', value: 'especes' })}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  state.tipMethod === 'especes'
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
                value={state.selectedProductId}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) {
                    const product = products.find(p => String(p.id) === String(id));
                    if (product) {
                      dispatch({ type: 'SET_PRODUCT', id, name: product.name, price: String(product.price) });
                    }
                  } else {
                    dispatch({ type: 'CLEAR_PRODUCT' });
                  }
                }}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 pr-8 text-sm text-foreground appearance-none focus:outline-none focus:border-primary/40"
              >
                <option value="" className="bg-card">{state.productSold || 'Sélectionner un produit...'}</option>
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
                <span>{state.productSold}</span>
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
                  <span>Pourboire {state.tipMethod === 'cb' ? '(CB)' : state.tipMethod === 'especes' ? '(Espèces)' : ''}</span>
                  <span>+{tipValue}€</span>
                </div>
              )}
              {prodValue > 0 && (
                <div className="flex items-center justify-between text-xs text-blue-400">
                  <span>Produit{state.productSold ? ` (${state.productSold})` : ''}</span>
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
                  onClick={() => dispatch({ type: 'SET', field: 'paymentMethod', value: 'cb' })}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    state.paymentMethod === 'cb'
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                      : 'bg-white/5 border border-white/10 text-foreground hover:bg-white/10'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  CB
                  {state.paymentMethod === 'cb' && <CheckCircle className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => dispatch({ type: 'SET', field: 'paymentMethod', value: 'especes' })}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    state.paymentMethod === 'especes'
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                      : 'bg-white/5 border border-white/10 text-foreground hover:bg-white/10'
                  }`}
                >
                  <Banknote className="w-4 h-4" />
                  Espèces
                  {state.paymentMethod === 'especes' && <CheckCircle className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Validate button */}
          {canValidate && (
            <button
              onClick={handleValidate}
              disabled={state.saving}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-500 text-white font-semibold text-sm shadow-lg shadow-green-500/25 hover:bg-green-600 transition-all disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              {state.saving ? 'Validation...' : 'Valider la prestation'}
            </button>
          )}

          {/* Cancel / No-show buttons */}
          {appointment.status !== 'cancelled' && appointment.status !== 'no_show' && (
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  dispatch({ type: 'SAVING', value: true });
                  try {
                    await api.entities.Appointment.update(appointment.id, { status: 'cancelled' });
                    toast.success('Rendez-vous annulé');
                    onUpdate?.();
                  } catch (e) {
                    toast.error('Erreur');
                  } finally {
                    dispatch({ type: 'SAVING', value: false });
                  }
                }}
                disabled={state.saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-60"
              >
                <X className="w-3.5 h-3.5" />
                Annuler
              </button>
              <button
                onClick={async () => {
                  dispatch({ type: 'SAVING', value: true });
                  try {
                    await api.entities.Appointment.update(appointment.id, { status: 'no_show' });
                    toast.success('Marqué absent');
                    onUpdate?.();
                  } catch (e) {
                    toast.error('Erreur');
                  } finally {
                    dispatch({ type: 'SAVING', value: false });
                  }
                }}
                disabled={state.saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20 transition-all disabled:opacity-60"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Absent
              </button>
            </div>
          )}
        </>
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

      {/* Delete */}
      <button
        onClick={async () => {
          if (!window.confirm('Supprimer définitivement ce rendez-vous ?')) return;
          dispatch({ type: 'SAVING', value: true });
          try {
            await api.entities.Appointment.delete(appointment.id);
            toast.success('Rendez-vous supprimé');
            onDelete?.();
          } catch {
            toast.error('Erreur lors de la suppression');
          } finally {
            dispatch({ type: 'SAVING', value: false });
          }
        }}
        disabled={state.saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-60 mt-2"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Supprimer le rendez-vous
      </button>
    </div>
  );
}

export default function AppointmentDetailModal({ appointment, onClose, onUpdate, onDelete }) {
  return (
    <Dialog open={!!appointment} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        {appointment && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                Détails du rendez-vous
              </DialogTitle>
            </DialogHeader>
            <ModalInner key={appointment.id} appointment={appointment} onUpdate={onUpdate} onDelete={onDelete} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
