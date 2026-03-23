import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Plus, Minus, ShoppingCart, X, Trash2, Store, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const categoryLabels = {
  hair_care: 'Cheveux',
  beard_care: 'Barbe',
  styling: 'Coiffant',
  accessories: 'Accessoires',
  skincare: 'Soin visage',
  other: 'Autre',
};

export default function Shop() {
  const [cart, setCart] = useState({});
  const [activeCategory, setActiveCategory] = useState('all');
  const [showCart, setShowCart] = useState(false);
  const [notes, setNotes] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, 'name', 100),
  });

  const filtered = activeCategory === 'all'
    ? products
    : products.filter(p => p.category === activeCategory);

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  const updateCart = (productId, delta) => {
    setCart(prev => {
      const newQty = (prev[productId] || 0) + delta;
      if (newQty <= 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: newQty };
    });
  };

  const cartItems = Object.entries(cart);
  const cartTotal = cartItems.reduce((sum, [id, qty]) => {
    const product = products.find(p => String(p.id) === String(id));
    return sum + (product?.price || 0) * qty;
  }, 0);
  const cartCount = cartItems.reduce((sum, [, qty]) => sum + qty, 0);

  const handleOrder = async () => {
    if (cartItems.length === 0) {
      toast.error('Votre panier est vide');
      return;
    }
    setOrdering(true);
    try {
      const items = cartItems.map(([id, qty]) => {
        const product = products.find(p => String(p.id) === String(id));
        return {
          product_id: id,
          name: product?.name || '',
          price: product?.price || 0,
          quantity: qty,
        };
      });

      await base44.entities.Order.create({
        client_email: user?.email || '',
        client_name: user?.full_name || user?.name || '',
        client_phone: user?.phone || '',
        items,
        total_price: cartTotal,
        status: 'pending',
        notes: notes.trim(),
        created_date: new Date().toISOString().split('T')[0],
      });

      setCart({});
      setNotes('');
      setOrderSuccess(true);
    } catch (err) {
      console.error('Erreur commande:', err);
      toast.error('Erreur lors de la commande');
    } finally {
      setOrdering(false);
    }
  };

  const closeCart = () => {
    setShowCart(false);
    setOrderSuccess(false);
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-32">
      <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Boutique</p>
      <h1 className="font-display text-2xl font-bold mb-6">Nos Produits</h1>

      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-hide mb-4">
        <button
          onClick={() => setActiveCategory('all')}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium transition-all ${
            activeCategory === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
          }`}
        >
          Tout
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium transition-all ${
              activeCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {categoryLabels[cat] || cat}
          </button>
        ))}
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-2 gap-3">
        {filtered.map((product, i) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-card border border-border rounded-xl overflow-hidden"
          >
            <div className="aspect-square bg-white relative">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ShoppingBag className="w-8 h-8 text-muted-foreground/30" />
                </div>
              )}
              {product.brand && (
                <Badge className="absolute top-2 left-2 bg-card/80 text-foreground text-[9px] border-none backdrop-blur-sm">
                  {product.brand}
                </Badge>
              )}
            </div>
            <div className="p-3">
              <h3 className="text-sm font-semibold line-clamp-1">{product.name}</h3>
              {product.description && (
                <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{product.description}</p>
              )}
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm font-bold text-primary">{product.price}€</span>
                {cart[product.id] ? (
                  <div className="flex items-center gap-2.5">
                    <button onClick={() => updateCart(product.id, -1)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center active:scale-95">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-sm font-bold w-4 text-center">{cart[product.id]}</span>
                    <button onClick={() => updateCart(product.id, 1)} className="w-8 h-8 rounded-full bg-primary flex items-center justify-center active:scale-95">
                      <Plus className="w-3.5 h-3.5 text-primary-foreground" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => updateCart(product.id, 1)} className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors active:scale-95">
                    <Plus className="w-4 h-4 text-primary" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Aucun produit disponible</p>
        </div>
      )}

      {/* Cart Footer Button */}
      {cartCount > 0 && !showCart && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-20 left-4 right-4 max-w-lg mx-auto z-40"
        >
          <Button className="w-full rounded-xl h-14 bg-primary text-primary-foreground shadow-lg shadow-primary/20"
            onClick={() => setShowCart(true)}>
            <div className="flex items-center justify-between w-full px-2">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" />
                <span className="text-xs font-semibold">{cartCount} article{cartCount > 1 ? 's' : ''}</span>
              </div>
              <span className="text-sm font-bold">{cartTotal.toFixed(2)}€</span>
            </div>
          </Button>
        </motion.div>
      )}

      {/* Cart Drawer */}
      <AnimatePresence>
        {showCart && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/60"
              onClick={closeCart}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-[60] max-h-[80vh] rounded-t-2xl border-t border-border bg-background flex flex-col"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-muted" />
              </div>

              {orderSuccess ? (
                /* Success State */
                <div className="flex flex-col items-center justify-center px-6 py-12">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <CheckCircle className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="font-display text-lg font-bold mb-2">Commande validée !</h3>
                  <p className="text-sm text-muted-foreground text-center mb-1">
                    Votre commande a bien été enregistrée.
                  </p>
                  <p className="text-xs text-muted-foreground text-center mb-6">
                    Vous serez notifié quand elle sera prête à retirer au salon.
                  </p>
                  <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 rounded-lg px-4 py-2">
                    <Store className="w-4 h-4" />
                    Retrait au salon
                  </div>
                  <Button className="mt-6 w-full max-w-xs" onClick={closeCart}>
                    Continuer mes achats
                  </Button>
                </div>
              ) : (
                /* Cart Content */
                <>
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                    <h3 className="font-display text-base font-bold">Votre commande</h3>
                    <button onClick={closeCart} className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Items */}
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {cartItems.map(([id, qty]) => {
                      const product = products.find(p => String(p.id) === String(id));
                      if (!product) return null;
                      return (
                        <div key={id} className="bg-card rounded-lg p-3 border border-border">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold truncate flex-1">{product.name}</p>
                            <p className="text-sm font-bold text-primary ml-2">
                              {(product.price * qty).toFixed(2)}€
                            </p>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">{product.price.toFixed(2)}€ / unité</p>
                            <div className="flex items-center gap-3">
                              <button onClick={() => updateCart(id, -1)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center active:scale-95">
                                {qty === 1 ? <Trash2 className="w-3.5 h-3.5 text-red-400" /> : <Minus className="w-3.5 h-3.5" />}
                              </button>
                              <span className="text-sm font-bold w-5 text-center">{qty}</span>
                              <button onClick={() => updateCart(id, 1)} className="w-9 h-9 rounded-full bg-primary flex items-center justify-center active:scale-95">
                                <Plus className="w-3.5 h-3.5 text-primary-foreground" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {cartItems.length === 0 && (
                      <div className="text-center py-8 text-sm text-muted-foreground">
                        Votre panier est vide
                      </div>
                    )}

                    {/* Notes */}
                    {cartItems.length > 0 && (
                      <div className="pt-1">
                        <label className="text-xs text-muted-foreground mb-1 block">Note (optionnel)</label>
                        <Textarea
                          placeholder="Instructions spéciales..."
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                          className="bg-card border-border text-sm resize-none h-16"
                        />
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  {cartItems.length > 0 && (
                    <div className="border-t border-border px-5 pt-4 pb-6 space-y-3 flex-shrink-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">Total</span>
                        <span className="text-lg font-bold text-primary">{cartTotal.toFixed(2)}€</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Store className="w-3.5 h-3.5" />
                        Retrait au salon — paiement sur place
                      </div>
                      <Button
                        className="w-full h-12 rounded-xl text-sm font-semibold gap-2"
                        onClick={handleOrder}
                        disabled={ordering}
                      >
                        <ShoppingCart className="w-4 h-4" />
                        {ordering ? 'Validation...' : `Commander — ${cartTotal.toFixed(2)}€`}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
