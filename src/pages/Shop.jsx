import React, { useState, useRef, useLayoutEffect, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { motion, AnimatePresence, useScroll, useTransform, useMotionValue, useReducedMotion, animate } from 'framer-motion';
import { hapticFeedback } from '@/lib/capacitor';
import { ShoppingBag, Plus, Minus, ShoppingCart, X, Trash2, Store, CheckCircle, Images, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import ProductSheet from '@/components/shop/ProductSheet';
import FavoriteButton from '@/components/shared/FavoriteButton';
import { useFavorites } from '@/lib/favorites';
import { formatPrice, productCategoryLabel, productImages, stockInfo, isShopProduct, MAX_PER_PRODUCT, PER_PRODUCT_LIMIT_MESSAGE } from '@/components/shop/productUtils';
import LoadError, { isNetworkError, queryFailed } from '@/components/shared/LoadError';
import { useAndroidBack } from '@/lib/useAndroidBack';
import { normalizeOrderStatus } from '@/lib/cancellation';
import { track } from '@/lib/analytics';

/** Vol de la vignette produit vers le panier : taille du disque (px) et durée (s). */
const FLY_SIZE = 56;
const FLY_DURATION = 0.7;

/**
 * Quantité maximale d'un produit dans le panier : son stock s'il est suivi (`stockInfo`), et
 * jamais plus de MAX_PER_PRODUCT (plafond du serveur par commande). Au-delà, le serveur refuse.
 */
const cartLimit = (product) => {
  const stock = stockInfo(product);
  return Math.min(MAX_PER_PRODUCT, stock.tracked ? Math.max(0, stock.stock) : Infinity);
};

/** La limite vient-elle du plafond par produit (et non du stock) ? */
const limitedByCap = (product) => {
  const stock = stockInfo(product);
  return !stock.tracked || stock.stock > MAX_PER_PRODUCT;
};

/** Message affiché quand on essaie d'ajouter au-delà de la limite (stock ou plafond par produit). */
const stockLimitMessage = (limit, product) => (limit <= 0
  ? 'Ce produit est en rupture de stock'
  : product && limitedByCap(product)
    ? PER_PRODUCT_LIMIT_MESSAGE
    : `Plus que ${limit} en stock : tout est déjà dans votre panier`);

/** Montant arrondi au centime (évite « 29,999… » sur les sommes de prix décimaux). */
const roundCents = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** Longueur maximale de la note jointe à la commande. */
const NOTES_MAX = 500;

/**
 * Panier conservé par compte dans le navigateur (`dhb-cart:<id>`) : il survit à un changement de
 * page ou à la fermeture de l'app. Simple confort : stockage absent ou illisible = panier vide.
 */
const cartStorageKey = (userId) => `dhb-cart:${userId || 'guest'}`;

/**
 * Clé d'essai de la commande en cours, gardée sur l'appareil comme le panier
 * (`dhb-order-ref:<id>`, valeur `{ key, sig, at }`). Si la réponse du serveur se perd (métro),
 * le renvoi du même panier, même après avoir quitté la Boutique ou relancé l'app, repart avec la
 * même clé et retombe sur la commande déjà créée (`client_ref`, index unique côté serveur).
 * Pas de durée limite (le panier non plus n'en a pas) : la clé vit jusqu'à un succès, un refus du
 * serveur ou un rapprochement avec la commande retrouvée (`reconcileOrderRef`). Stockage absent ou
 * illisible = pas de clé gardée.
 */
const orderRefStorageKey = (userId) => `dhb-order-ref:${userId || 'guest'}`;

function loadOrderRef(userId) {
  try {
    const raw = JSON.parse(localStorage.getItem(orderRefStorageKey(userId)) || 'null');
    if (!raw || typeof raw !== 'object' || typeof raw.key !== 'string' || !raw.key
      || typeof raw.sig !== 'string' || !Number.isFinite(raw.at)) return null;
    if (raw.at > Date.now() + 60_000) return null; // horloge de l'appareil recalée : clé ignorée
    return { key: raw.key, sig: raw.sig, at: raw.at };
  } catch {
    return null;
  }
}

function saveOrderRef(userId, ref) {
  try {
    if (!ref) localStorage.removeItem(orderRefStorageKey(userId));
    else localStorage.setItem(orderRefStorageKey(userId), JSON.stringify(ref));
  } catch {
    // stockage indisponible : la clé reste en mémoire pour la durée de la page
  }
}

/** Signature du panier (contenu + note) : même signature = même envoi, donc même clé d'essai. */
const cartSignature = (items, notes) => JSON.stringify(items.map(([id, qty]) => [String(id), qty]).sort()) + notes.trim();

const NETWORK_ORDER_MESSAGE = 'Pas de connexion : votre panier est gardé. Réessayez quand la connexion revient, la commande ne sera pas passée deux fois.';

/** Quantités par produit d'une commande enregistrée (`items` en tableau ou en JSON). */
function orderedQuantities(order) {
  let items = order?.items;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { items = []; }
  }
  const out = new Map();
  (Array.isArray(items) ? items : []).forEach((it) => {
    const id = it && (it.product_id ?? it.id);
    const q = parseInt(it?.quantity, 10);
    if (id === undefined || id === null || id === '' || !(q > 0)) return;
    out.set(String(id), (out.get(String(id)) || 0) + q);
  });
  return out;
}

/** Panier moins les quantités d'une commande déjà passée (ligne retirée à 0). */
function cartWithout(cart, ordered) {
  const next = {};
  Object.entries(cart || {}).forEach(([id, qty]) => {
    const left = Math.max(0, qty - (ordered.get(String(id)) || 0));
    if (left > 0) next[id] = left;
  });
  return next;
}

/** Date d'une commande à l'heure de Paris (« 18 octobre à 14:05 », jour seul pour une date sans heure). */
function parisOrderDate(value) {
  if (!value) return '';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value));
  const d = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('fr-FR', dateOnly
      ? { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' }
      : { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return '';
  }
}

function readCart(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const cart = {};
    Object.entries(raw).forEach(([id, qty]) => {
      const n = Number(qty);
      if (id && Number.isInteger(n) && n >= 1) cart[String(id)] = n;
    });
    return cart;
  } catch {
    return {};
  }
}

function writeCart(key, cart) {
  try {
    if (Object.keys(cart).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(cart));
  } catch {
    // stockage indisponible (navigation privée…) : le panier reste en mémoire
  }
}

function GlassCard({ children }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const x1 = useTransform(scrollYProgress, [0, 0.5, 1], [-20, 15, -20]);
  const x2 = useTransform(scrollYProgress, [0, 0.5, 1], [15, -12, 15]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.7, 1.15, 0.7]);
  const opacity = useTransform(scrollYProgress, [0, 0.25, 0.5, 0.75, 1], [0, 0.9, 1, 0.9, 0]);

  return (
    <div ref={ref} className="relative">
      <motion.div
        className="absolute -bottom-3 inset-x-1 h-14 rounded-2xl pointer-events-none"
        style={{
          x: x1,
          scale,
          opacity,
          background: 'radial-gradient(ellipse at 40% 50%, rgba(34,197,94,0.5) 0%, rgba(16,185,129,0.3) 35%, transparent 75%)',
          filter: 'blur(16px)',
        }}
      />
      <motion.div
        className="absolute -bottom-2 inset-x-3 h-10 rounded-2xl pointer-events-none"
        style={{
          x: x2,
          scale,
          opacity,
          background: 'radial-gradient(ellipse at 60% 50%, rgba(52,211,153,0.4) 0%, rgba(16,185,129,0.2) 40%, transparent 70%)',
          filter: 'blur(12px)',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export default function Shop() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Panier rattaché au compte : à un changement de compte, on relit la bonne clé (ajustement
  // pendant le rendu, sans écrire l'ancien panier sous la nouvelle clé).
  const cartKey = cartStorageKey(user?.id);
  const [cartState, setCartState] = useState(() => ({ key: cartKey, items: readCart(cartKey) }));
  if (cartState.key !== cartKey) {
    setCartState({ key: cartKey, items: readCart(cartKey) });
  }
  const cart = cartState.key === cartKey ? cartState.items : {};
  const setCart = useCallback((updater) => {
    setCartState(prev => ({
      key: prev.key,
      items: typeof updater === 'function' ? updater(prev.items) : updater,
    }));
  }, []);
  useEffect(() => {
    writeCart(cartState.key, cartState.items);
  }, [cartState]);
  const [searchParams, setSearchParams] = useSearchParams();
  // `/shop?filter=favorites` (page Mes favoris) : la boutique s'ouvre filtrée sur les favoris
  const [activeCategory, setActiveCategory] = useState(() => (searchParams.get('filter') === 'favorites' ? 'favorites' : 'all'));
  const favorites = useFavorites();
  const [showCart, setShowCart] = useState(false);
  const [notes, setNotes] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  // Total enregistré par le serveur (prix en base), affiché sur l'écran de succès
  const [successTotal, setSuccessTotal] = useState(null);
  // Fiche produit ouverte (bottom sheet) : id du produit, résolu dans la liste à chaque rendu
  const [openProductId, setOpenProductId] = useState(null);
  // Garde contre le double envoi (deux taps avant que `ordering` ne soit rendu)
  const submittingRef = useRef(false);
  // Clé d'essai de la commande en cours ({ key, sig } : sig = contenu du panier). Gardée tant que
  // l'envoi échoue sur le réseau (un nouvel essai retombe sur la même commande), remise à zéro après
  // un succès, un refus du serveur ou un rapprochement (commande retrouvée), et remplacée quand le
  // panier change (après rapprochement)
  const orderRefKey = useRef(null);
  // Rapprochement en cours ({ key, promise }) : un seul appel à la fois pour une même clé
  const reconcilingRef = useRef(null);
  // Rapprochement automatique déjà lancé pour ce compte (double effet du mode strict)
  const autoReconcileRef = useRef(null);
  // Panier courant, pour décider de vider la note après un rapprochement
  const cartRef = useRef(cart);
  useEffect(() => { cartRef.current = cart; }, [cart]);
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();

  // Vol de la vignette vers le panier : un clone par ajout (ids indépendants),
  // retiré à la fin de son animation. La destination `to` est résolue après le
  // rendu : le bouton panier n'est dans le DOM qu'une fois un article ajouté.
  const [flights, setFlights] = useState([]);
  const flightIdRef = useRef(0);
  const imageRefs = useRef({});        // id produit → conteneur de l'image
  const cartAnchorRef = useRef(null);  // conteneur fixe du bouton panier (jamais transformé)
  const cartIconRef = useRef(null);    // icône panier : point d'arrivée

  // Rebond du bouton panier à l'arrivée (0 → 1 → 0 à ressort), piloté sans re-render
  const cartBump = useMotionValue(0);
  const cartButtonScale = useTransform(cartBump, v => 1 + v * 0.05);
  const cartIconScale = useTransform(cartBump, v => 1 + v * 0.25);
  const cartCountScale = useTransform(cartBump, v => 1 + v * 0.2);

  const productsQuery = useQuery({
    queryKey: ['products'],
    staleTime: 5 * 60 * 1000, // catalogue : change rarement
    queryFn: () => api.entities.Product.filter({ is_active: true }, 'name', 100),
  });
  const { isSuccess: productsLoaded } = productsQuery;
  // Consommables du salon (onglet « Prestations » du stock) : jamais en vente
  const products = useMemo(() => (productsQuery.data || []).filter(isShopProduct), [productsQuery.data]);
  // Catalogue disponible (y compris en cache quand un rechargement échoue)
  const productsReady = productsQuery.data !== undefined;
  // Échec sans données, ou requête en pause hors connexion (jamais un squelette sans fin)
  const productsFailed = (productsQuery.isError && !productsReady) || queryFailed(productsQuery);

  // `/shop?product=<id>` (page Mes favoris) : la fiche du produit s'ouvre une fois le catalogue
  // chargé, puis le paramètre est retiré (retour arrière ou rechargement ne la rouvrent pas)
  const linkedProductId = searchParams.get('product');
  const handledLinkRef = useRef(null); // un seul passage par lien (double effet du mode strict)
  useEffect(() => {
    if (!linkedProductId) { handledLinkRef.current = null; return; }
    if (!productsReady || handledLinkRef.current === linkedProductId) return;
    handledLinkRef.current = linkedProductId;
    const found = products.find(p => String(p.id) === String(linkedProductId));
    if (found) setOpenProductId(found.id);
    else toast.error('Ce produit n\'est plus disponible');
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('product');
      return next;
    }, { replace: true });
  }, [linkedProductId, productsReady, products, setSearchParams]);

  // Produits retirés du catalogue (supprimés ou masqués) depuis leur ajout au panier : on les
  // enlève une fois le catalogue chargé avec succès (jamais pendant le chargement ni sur une erreur).
  useEffect(() => {
    if (!productsLoaded) return;
    const known = new Set(products.map(p => String(p.id)));
    setCart(prev => {
      const ids = Object.keys(prev);
      if (ids.every(id => known.has(String(id)))) return prev;
      const next = {};
      ids.forEach(id => { if (known.has(String(id))) next[id] = prev[id]; });
      return next;
    });
  }, [productsLoaded, products, setCart]);

  const filtered = activeCategory === 'all'
    ? products
    : activeCategory === 'favorites'
      ? products.filter(p => favorites.products.has(String(p.id)))
      : products.filter(p => p.category === activeCategory);
  const favoriteCount = products.filter(p => favorites.products.has(String(p.id))).length;
  // Plus aucun favori pendant que le filtre est actif : retour à « Tout »
  useEffect(() => {
    if (productsLoaded && activeCategory === 'favorites' && favoriteCount === 0) setActiveCategory('all');
  }, [productsLoaded, activeCategory, favoriteCount]);

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  // `limit` : plafond du stock (cartLimit). Un ajout ne dépasse jamais le plafond, mais ne retire
  // rien non plus si le stock a baissé entre-temps : c'est au client de réduire (message dans le panier).
  const updateCart = (productId, delta, limit = Infinity) => {
    setCart(prev => {
      const current = prev[productId] || 0;
      const newQty = delta > 0 ? Math.min(current + delta, Math.max(limit, current)) : current + delta;
      if (newQty <= 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: newQty };
    });
  };

  // Ajout depuis une vignette ou la fiche : même logique que updateCart, plus le clone qui s'envole
  // (avec un badge « ×N » quand plusieurs unités partent d'un coup). `source` est l'élément d'où
  // part le vol : centre de l'image du produit, sinon le bouton cliqué.
  // Plafonné au stock restant (stock suivi moins le panier) : au-delà, rien n'est ajouté et un
  // message l'explique, au lieu d'une commande que le serveur refuserait.
  const addToCart = (product, source, quantity = 1) => {
    const limit = cartLimit(product);
    const qty = Math.min(quantity, limit - (cart[product.id] || 0));
    if (qty <= 0) {
      toast.error(stockLimitMessage(limit, product));
      return;
    }
    updateCart(product.id, qty, limit);
    track('cart_add', { quantity: qty });
    if (reduceMotion) return;
    const r = source?.getBoundingClientRect?.();
    if (!r) return;
    flightIdRef.current += 1;
    setFlights(prev => [...prev, {
      id: flightIdRef.current,
      image: product.image_url || null,
      qty,
      from: { x: r.left + r.width / 2 - FLY_SIZE / 2, y: r.top + r.height / 2 - FLY_SIZE / 2 },
      to: null,
    }]);
  };
  const addFromCard = (product, e) => addToCart(product, imageRefs.current[product.id] || e.currentTarget, 1);

  const openProduct = openProductId ? products.find(p => String(p.id) === String(openProductId)) : null;
  const openSheet = (product) => { hapticFeedback(); setOpenProductId(product.id); };

  // Résout la destination des nouveaux vols une fois le bouton panier monté
  // (même commit que l'ajout). Bouton absent (tiroir ouvert…) : ajout sans animation.
  useLayoutEffect(() => {
    if (!flights.some(f => !f.to)) return;
    const anchor = cartAnchorRef.current;
    const icon = cartIconRef.current;
    if (!anchor || !icon) {
      setFlights(prev => prev.filter(f => f.to));
      return;
    }
    // x : centre de l'icône ; y : centre du conteneur fixe, insensible à
    // l'animation d'entrée (translateY) du bouton encore en cours au premier ajout
    const a = anchor.getBoundingClientRect();
    const i = icon.getBoundingClientRect();
    const to = { x: i.left + i.width / 2 - FLY_SIZE / 2, y: a.top + a.height / 2 - FLY_SIZE / 2 };
    setFlights(prev => prev.map(f => (f.to ? f : { ...f, to })));
  }, [flights]);

  const bumpCart = () => {
    animate(cartBump, 1, { duration: 0.1, ease: 'easeOut' }).then(() => {
      animate(cartBump, 0, { type: 'spring', stiffness: 520, damping: 12 });
    });
  };

  const handleFlightComplete = (id) => {
    setFlights(prev => prev.filter(f => f.id !== id));
    bumpCart();
    hapticFeedback();
  };

  // Seules les lignes dont le produit est connu comptent (total, nombre, envoi)
  const cartItems = Object.entries(cart)
    .filter(([id]) => products.some(p => String(p.id) === String(id)));
  const cartTotal = roundCents(cartItems.reduce((sum, [id, qty]) => {
    const product = products.find(p => String(p.id) === String(id));
    return sum + (Number(product?.price) || 0) * qty;
  }, 0));
  const cartCount = cartItems.reduce((sum, [, qty]) => sum + qty, 0);
  // Un article dépasse le stock (stock rechargé à la baisse depuis l'ajout) : commande bloquée
  const cartOverStock = cartItems.some(([id, qty]) => {
    const product = products.find(p => String(p.id) === String(id));
    return product && qty > cartLimit(product);
  });

  /**
   * Rapprochement d'une clé d'essai gardée (réponse perdue) avec la commande peut-être déjà créée.
   * Commande retrouvée : clé effacée ; si elle n'est pas annulée, ses quantités sont retirées du
   * panier (les articles ajoutés depuis restent) et un toast le dit. Ne rejette jamais.
   * @returns {Promise<{ status: 'found'|'cancelled'|'absent'|'unknown', network?: boolean }>}
   *  found = commande enregistrée, panier rapproché ; cancelled = commande annulée depuis, clé
   *  effacée, panier intact ; absent = aucune commande pour cette clé ; unknown = vérification
   *  impossible (réseau, délai, erreur du serveur) : ne pas tirer de nouvelle clé.
   */
  const reconcileOrderRef = useCallback(async (ref) => {
    if (!ref?.key || !user?.email) return { status: 'absent' };
    if (reconcilingRef.current?.key === ref.key) return reconcilingRef.current.promise;
    const promise = (async () => {
      let rows;
      try {
        rows = await api.entities.Order.filter({ client_ref: ref.key }, '-created_date', 5);
      } catch (err) {
        const network = isNetworkError(err) || !!err?.timeout;
        // Lecture refusée (4xx) : vérification impossible, comportement d'avant (nouvelle clé)
        if (!network && err?.status >= 400 && err?.status < 500) return { status: 'absent' };
        return { status: 'unknown', network };
      }
      // Comparaison stricte : une lecture qui ignore le filtre (compte sans accès complet aux
      // commandes) ne rapproche jamais une autre commande
      const order = (Array.isArray(rows) ? rows : []).find(o => String(o?.client_ref || '') === ref.key);
      if (!order) return { status: 'absent' };
      // Clé déjà effacée entre-temps (envoi réussi en parallèle) : panier déjà traité
      const current = orderRefKey.current || loadOrderRef(user?.id);
      if (!current || current.key !== ref.key) return { status: 'found' };
      orderRefKey.current = null;
      saveOrderRef(user?.id, null);
      queryClient.invalidateQueries({ queryKey: ['myOrders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['adminOrders'] });
      if (normalizeOrderStatus(order.status) === 'cancelled') return { status: 'cancelled' };
      const ordered = orderedQuantities(order);
      const before = cartRef.current || {};
      const after = cartWithout(before, ordered);
      const removed = Object.keys(before).some(id => (after[id] || 0) !== before[id]);
      setCart(prev => cartWithout(prev, ordered));
      if (Object.keys(after).length === 0) setNotes('');
      const when = parisOrderDate(order.created_date || order.created_at);
      toast.success(when ? `Votre commande du ${when} est bien enregistrée` : 'Votre commande est bien enregistrée', {
        duration: 8000,
        ...(removed ? { description: 'Les articles déjà commandés ont été retirés de votre panier.' } : {}),
        action: { label: 'Mes commandes', onClick: () => navigate('/orders') },
      });
      return { status: 'found' };
    })();
    reconcilingRef.current = { key: ref.key, promise };
    try {
      return await promise;
    } finally {
      if (reconcilingRef.current?.promise === promise) reconcilingRef.current = null;
    }
  }, [user?.id, user?.email, queryClient, navigate, setCart]);

  // Clé gardée d'un envoi sans réponse : rapprochement au montage (une fois par compte), au retour
  // au premier plan et au retour du réseau. Le panier ne garde ainsi jamais des articles déjà
  // commandés (ni un produit « en rupture » que le client a lui-même acheté)
  useEffect(() => {
    if (!productsLoaded || !user?.email) return undefined;
    const run = () => {
      if (submittingRef.current) return; // envoi en cours : sa réponse tranchera
      const ref = orderRefKey.current || loadOrderRef(user?.id);
      if (ref) reconcileOrderRef(ref);
    };
    if (autoReconcileRef.current !== (user?.id || user.email)) {
      autoReconcileRef.current = user?.id || user.email;
      run();
    }
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', run);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', run);
    };
  }, [productsLoaded, user?.id, user?.email, reconcileOrderRef]);

  // Panier identique à un envoi resté sans réponse : le renvoi repart avec la même clé et le serveur
  // rend la commande existante avant tout contrôle du stock (elle a pu prendre les dernières unités)
  const currentSig = cartSignature(cartItems, notes);
  const keptRef = orderRefKey.current || loadOrderRef(user?.id);
  const retryingSameOrder = !!keptRef && keptRef.sig === currentSig;
  const blockedByStock = cartOverStock && !retryingSameOrder;

  const handleOrder = async () => {
    if (submittingRef.current || ordering) return;
    if (cartItems.length === 0) {
      toast.error('Votre panier est vide');
      return;
    }
    const sig = cartSignature(cartItems, notes);
    const kept = orderRefKey.current || loadOrderRef(user?.id);
    const sameAsKept = !!kept && kept.sig === sig;
    if (cartOverStock && !sameAsKept) {
      toast.error('Ajustez les quantités : certains produits n\'ont plus assez de stock');
      return;
    }
    submittingRef.current = true;
    setOrdering(true);
    try {
      // Panier ou note changés depuis un envoi sans réponse : avant de tirer une nouvelle clé, on
      // vérifie si cet envoi a créé la commande (sinon la nouvelle reprendrait ses articles)
      if (kept && !sameAsKept) {
        const { status, network } = await reconcileOrderRef(kept);
        // Retrouvée : le panier ne garde que les nouveaux articles, le client confirme de nouveau
        if (status === 'found') return;
        if (status === 'unknown') {
          toast.error(network ? NETWORK_ORDER_MESSAGE : 'Impossible de vérifier votre commande précédente : réessayez dans un instant.', {
            duration: 8000,
            action: { label: 'Mes commandes', onClick: () => navigate('/orders') },
          });
          return;
        }
        // absent ou annulée : nouvelle clé ci-dessous
      }
      const items = cartItems.map(([id, qty]) => {
        const product = products.find(p => String(p.id) === String(id));
        return {
          product_id: id,
          name: product.name || '',
          price: Number(product.price) || 0,
          quantity: qty,
        };
      });

      // Page quittée ou app relancée depuis un essai sans réponse : on reprend la clé gardée
      if (!orderRefKey.current) orderRefKey.current = loadOrderRef(user?.id);
      if (!orderRefKey.current || orderRefKey.current.sig !== sig) {
        const key = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2);
        orderRefKey.current = { key, sig, at: Date.now() };
      }
      // Écrite AVANT l'envoi : une réponse perdue laisse la clé sur l'appareil pour le renvoi
      saveOrderRef(user?.id, orderRefKey.current);

      const res = await api.entities.Order.create({
        client_email: user?.email || '',
        client_name: user?.full_name || user?.name || '',
        client_phone: user?.phone || '',
        items,
        total_price: cartTotal,
        status: 'pending',
        notes: notes.trim().slice(0, NOTES_MAX),
        // Horodatage complet : « Mes commandes » affiche l'heure de Paris
        created_date: new Date().toISOString(),
        client_ref: orderRefKey.current.key,
      });
      orderRefKey.current = null;
      saveOrderRef(user?.id, null);
      // Serveur pas encore à jour : commande retrouvée par sa clé mais annulée depuis. Jamais
      // « Commande validée ! » ; panier gardé, le prochain tap tire une nouvelle clé
      if (res?.duplicate && normalizeOrderStatus(res.status) === 'cancelled') {
        toast.error('Cette commande avait été annulée : touchez « Commander » pour la repasser.');
        queryClient.invalidateQueries({ queryKey: ['myOrders'] });
        return;
      }
      // Même envoi déjà enregistré (réponse perdue puis nouvel essai) : pas un second succès
      if (res?.duplicate) toast.info('Cette commande était déjà enregistrée');

      const total = Number(res?.total_price);
      setSuccessTotal(Number.isFinite(total) && total > 0 ? total : null);
      if (!res?.duplicate) track('order_done', { total: Number.isFinite(total) ? total : 0 });
      setCart({});
      setNotes('');
      setOrderSuccess(true);
      // Le stock a bougé côté serveur : la grille doit le refléter
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['myOrders'] });
      queryClient.invalidateQueries({ queryKey: ['adminOrders'] });
    } catch (err) {
      // Réseau coupé : la commande est peut-être passée (réponse perdue). Jamais « Failed to fetch » ;
      // panier gardé, et la clé d'essai, gardée sur l'appareil avec le panier, couvre le nouvel essai :
      // le renvoi retombe sur la même commande (rien n'est effacé ici)
      if (isNetworkError(err) || err?.timeout) {
        toast.error(NETWORK_ORDER_MESSAGE, {
          duration: 8000,
          action: { label: 'Mes commandes', onClick: () => navigate('/orders') },
        });
        queryClient.invalidateQueries({ queryKey: ['myOrders'] });
        queryClient.invalidateQueries({ queryKey: ['products'] });
        return; // le bloc finally remet quand même submittingRef et ordering à zéro
      }
      // Refus du serveur : rien n'a été créé, le prochain envoi est une nouvelle commande
      if (err?.status >= 400 && err?.status < 500) {
        orderRefKey.current = null;
        saveOrderRef(user?.id, null);
      }
      // Message du serveur (ex. 409 « plus que N en stock ») plutôt qu'une erreur générique
      const message = err?.data?.error || err?.message;
      toast.error(message && !/^HTTP \d+$/.test(message) ? message : 'Erreur lors de la commande');
      // Stock insuffisant ou produit modifié : on recharge le catalogue, le panier signale l'écart
      if (err?.status === 409 || err?.status === 400) queryClient.invalidateQueries({ queryKey: ['products'] });
    } finally {
      submittingRef.current = false;
      setOrdering(false);
    }
  };

  const closeCart = () => {
    if (submittingRef.current) return; // envoi en cours : on attend la réponse (croix et retour Android)
    setShowCart(false);
    setOrderSuccess(false);
  };
  // Bouton retour Android : ferme le panier ou la fiche produit (comme leur croix), sans quitter la page
  useAndroidBack(showCart, closeCart);
  useAndroidBack(!!openProductId, () => setOpenProductId(null));

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
        {favoriteCount > 0 && (
          <button
            onClick={() => setActiveCategory('favorites')}
            aria-pressed={activeCategory === 'favorites'}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-all ${
              activeCategory === 'favorites' ? 'bg-rose-500 text-white' : 'bg-secondary text-muted-foreground'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${activeCategory === 'favorites' ? 'fill-white' : 'fill-rose-500 text-rose-500'}`} aria-hidden="true" />
            Favoris ({favoriteCount})
          </button>
        )}
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium transition-all ${
              activeCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {productCategoryLabel(cat)}
          </button>
        ))}
      </div>

      {/* Chargement : squelettes ; échec sans rien en cache : erreur (pas un faux « Aucun produit ») */}
      {productsQuery.isPending && !productsFailed && (
        <div className="grid grid-cols-2 gap-4" aria-busy="true">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="aspect-square bg-secondary animate-pulse" />
              <div className="p-3 space-y-2">
                <div className="h-3.5 w-3/4 rounded bg-secondary animate-pulse" />
                <div className="h-3 w-1/3 rounded bg-secondary animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}
      {productsFailed && (
        <LoadError what="les produits" error={productsQuery.error} onRetry={productsQuery.refetch} retrying={productsQuery.isFetching} />
      )}

      {/* Products Grid : image et nom ouvrent la fiche, le « + » ajoute directement */}
      <div className="grid grid-cols-2 gap-4">
        {filtered.map((product, i) => {
          const stock = stockInfo(product);
          const photoCount = productImages(product).length;
          const inCart = cart[product.id] || 0;
          // Tout le stock suivi est déjà au panier : le « + » reste touchable mais n'ajoute rien
          // et explique pourquoi (un bouton simplement grisé ne dirait rien)
          const atLimit = inCart > 0 && inCart >= cartLimit(product);
          // Plafond de 20 par commande (et non le stock) : le message doit le dire
          const capped = atLimit && limitedByCap(product);
          return (
            <GlassCard key={product.id}>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="relative bg-card border border-border rounded-xl overflow-hidden"
              >
                <FavoriteButton
                  variant="overlay"
                  active={favorites.products.has(String(product.id))}
                  onToggle={() => favorites.toggle('products', product.id, product.name)}
                  className="absolute top-1.5 right-1.5 z-10"
                />
                <button
                  type="button"
                  onClick={() => openSheet(product)}
                  aria-label={`Voir ${product.name}`}
                  className="block w-full text-left"
                >
                  <div
                    ref={el => { imageRefs.current[product.id] = el; }}
                    className="aspect-square bg-white relative"
                  >
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className={`w-full h-full object-contain ${stock.soldOut ? 'opacity-50' : ''}`} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag className="w-8 h-8 text-muted-foreground/30" />
                      </div>
                    )}
                    {product.brand && (
                      <Badge className="absolute top-2 left-2 max-w-[calc(100%-3.75rem)] bg-card/80 text-foreground text-[9px] border-none backdrop-blur-sm">
                        {/* Borné à gauche du cœur : le Badge est en inline-flex, la troncature se fait sur le span */}
                        <span className="truncate min-w-0">{product.brand}</span>
                      </Badge>
                    )}
                    {photoCount > 1 && (
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/55 text-white text-[9px] font-semibold px-1.5 py-0.5 backdrop-blur-sm">
                        <Images className="w-3 h-3" aria-hidden="true" />{photoCount}
                      </span>
                    )}
                    {stock.soldOut && (
                      <span className="absolute bottom-2 left-2 rounded-full bg-red-500/90 text-white text-[9px] font-bold uppercase tracking-wide px-2 py-0.5">
                        Rupture
                      </span>
                    )}
                  </div>
                </button>
                <div className="p-3">
                  <button type="button" onClick={() => openSheet(product)} className="block w-full text-left">
                    <h3 className="text-sm font-semibold line-clamp-1">{product.name}</h3>
                    {product.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{product.description}</p>
                    )}
                  </button>
                  <div className="flex flex-wrap items-center justify-between gap-x-1 gap-y-1.5 mt-2">
                    <span className="text-sm font-bold text-primary whitespace-nowrap">{formatPrice(product.price)}</span>
                    {cart[product.id] ? (
                      <div className="flex items-center gap-2.5 ml-auto">
                        <button onClick={() => updateCart(product.id, -1)} aria-label="Retirer une unité" className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center active:scale-95">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-sm font-bold w-4 text-center">{cart[product.id]}</span>
                        <button onClick={e => addFromCard(product, e)} aria-disabled={atLimit} aria-label={atLimit ? (capped ? `${MAX_PER_PRODUCT} maximum par produit` : 'Stock maximum atteint') : 'Ajouter une unité'} className={`w-8 h-8 rounded-full bg-primary flex items-center justify-center active:scale-95 ${atLimit ? 'opacity-40' : ''}`}>
                          <Plus className="w-3.5 h-3.5 text-primary-foreground" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={e => addFromCard(product, e)} disabled={stock.soldOut} aria-label="Ajouter au panier" className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors active:scale-95 disabled:opacity-40">
                        <Plus className="w-4 h-4 text-primary" />
                      </button>
                    )}
                  </div>
                  {atLimit && (
                    <p className="text-[10px] text-amber-400 mt-1.5 leading-tight">{capped ? `${MAX_PER_PRODUCT} maximum par produit` : 'Tout le stock est dans votre panier'}</p>
                  )}
                </div>
              </motion.div>
            </GlassCard>
          );
        })}
      </div>

      {productsReady && filtered.length === 0 && (
        <div className="text-center py-16">
          <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Aucun produit disponible</p>
        </div>
      )}

      {/* Cart Footer Button (le conteneur fixe reste non transformé : il sert de repère au vol) */}
      {cartCount > 0 && !showCart && (
        <div ref={cartAnchorRef} className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-4 right-4 max-w-lg mx-auto z-40">
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            style={{ scale: cartButtonScale }}
          >
            <Button className="w-full rounded-xl h-14 bg-primary text-primary-foreground shadow-lg shadow-primary/20"
              onClick={() => { setOrderSuccess(false); setShowCart(true); }}>
              <div className="flex items-center justify-between w-full px-2">
                {/* Icône + quantité : rebondissent à l'arrivée d'une vignette */}
                <motion.div className="flex items-center gap-2" style={{ scale: cartIconScale, transformOrigin: 'left center' }}>
                  <span ref={cartIconRef} className="inline-flex">
                    <ShoppingCart className="w-4 h-4" />
                  </span>
                  <span className="text-xs font-semibold">
                    <motion.span className="inline-block" style={{ scale: cartCountScale }}>{cartCount}</motion.span>
                    {' '}article{cartCount > 1 ? 's' : ''}
                  </span>
                </motion.div>
                <span className="text-sm font-bold">{formatPrice(cartTotal)}</span>
              </div>
            </Button>
          </motion.div>
        </div>
      )}

      {/* Vignettes en vol vers le panier : trajectoire en arc (x et y sur des courbes
          différentes), rétrécissement jusqu'à 0,3 et fondu final. Transform / opacity uniquement.
          z-[70] : au-dessus de la fiche produit qui se referme pendant le vol. */}
      {flights.filter(f => f.to).map(f => (
        <motion.div
          key={f.id}
          aria-hidden="true"
          className="fixed left-0 top-0 z-[70] pointer-events-none rounded-full bg-white border border-border shadow-lg flex items-center justify-center"
          style={{ width: FLY_SIZE, height: FLY_SIZE }}
          initial={{ x: f.from.x, y: f.from.y, scale: 1, opacity: 1 }}
          animate={{
            x: f.to.x,
            y: [f.from.y, f.from.y - 90, f.to.y],
            scale: [1, 1.1, 0.3],
            opacity: [1, 1, 0],
          }}
          transition={{
            x: { duration: FLY_DURATION, ease: [0.45, 0, 0.55, 1] },
            y: { duration: FLY_DURATION, times: [0, 0.3, 1], ease: ['easeOut', 'easeIn'] },
            scale: { duration: FLY_DURATION, times: [0, 0.3, 1], ease: ['easeOut', 'easeIn'] },
            opacity: { duration: FLY_DURATION, times: [0, 0.75, 1], ease: 'linear' },
          }}
          onAnimationComplete={() => handleFlightComplete(f.id)}
        >
          {f.image ? (
            <img src={f.image} alt="" draggable={false} className="w-full h-full object-contain p-1.5 rounded-full" />
          ) : (
            <ShoppingBag className="w-5 h-5 text-primary" />
          )}
          {f.qty > 1 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              ×{f.qty}
            </span>
          )}
        </motion.div>
      ))}

      {/* Fiche produit (croix ou Échap pour fermer, jamais le fond) */}
      <AnimatePresence>
        {openProduct && (
          <ProductSheet
            key={openProduct.id}
            product={openProduct}
            cartQty={cart[openProduct.id] || 0}
            reduceMotion={reduceMotion}
            onClose={() => setOpenProductId(null)}
            onAdd={(product, quantity, source) => addToCart(product, source, quantity)}
          />
        )}
      </AnimatePresence>

      {/* Cart Drawer */}
      <AnimatePresence>
        {showCart && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/60"
              aria-hidden="true"
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
                  {successTotal !== null && (
                    <p className="text-sm font-semibold text-center mb-1">
                      Total à régler au retrait : {formatPrice(successTotal)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground text-center mb-6">
                    Le salon prépare votre commande. Suivez son état dans Mes commandes ; le paiement se fait au retrait.
                  </p>
                  <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 rounded-lg px-4 py-2">
                    <Store className="w-4 h-4" />
                    Retrait au salon
                  </div>
                  <Button asChild variant="outline" className="mt-6 w-full max-w-xs">
                    <Link to="/orders" onClick={closeCart}>Voir mes commandes</Link>
                  </Button>
                  <Button className="mt-3 w-full max-w-xs" onClick={closeCart}>
                    Continuer mes achats
                  </Button>
                </div>
              ) : (
                /* Cart Content */
                <>
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                    <h3 className="font-display text-base font-bold">Votre commande</h3>
                    <button onClick={closeCart} disabled={ordering} aria-label="Fermer" className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center disabled:opacity-50">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Items */}
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {cartItems.map(([id, qty]) => {
                      const product = products.find(p => String(p.id) === String(id));
                      if (!product) return null;
                      const limit = cartLimit(product);
                      const atLimit = qty >= limit;
                      const over = qty > limit;
                      return (
                        <div key={id} className={`bg-card rounded-lg p-3 border ${over ? 'border-red-500/40' : 'border-border'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold truncate flex-1">{product.name}</p>
                            <p className="text-sm font-bold text-primary ml-2">
                              {formatPrice(roundCents(Number(product.price) * qty))}
                            </p>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">{formatPrice(product.price)} / unité</p>
                            <div className="flex items-center gap-3">
                              <button onClick={() => updateCart(id, -1)} aria-label={qty === 1 ? 'Retirer du panier' : 'Retirer une unité'} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center active:scale-95">
                                {qty === 1 ? <Trash2 className="w-3.5 h-3.5 text-red-400" /> : <Minus className="w-3.5 h-3.5" />}
                              </button>
                              <span className="text-sm font-bold w-5 text-center">{qty}</span>
                              <button
                                onClick={() => (atLimit ? toast.error(stockLimitMessage(limit, product)) : updateCart(id, 1, limit))}
                                aria-disabled={atLimit}
                                aria-label={atLimit ? 'Stock maximum atteint' : 'Ajouter une unité'}
                                className={`w-9 h-9 rounded-full bg-primary flex items-center justify-center active:scale-95 ${atLimit ? 'opacity-40' : ''}`}
                              >
                                <Plus className="w-3.5 h-3.5 text-primary-foreground" />
                              </button>
                            </div>
                          </div>
                          {over ? (
                            <p className="text-[11px] text-red-400 mt-2">
                              {limit <= 0
                                ? 'Rupture de stock : retirez ce produit'
                                : limitedByCap(product)
                                  ? `${MAX_PER_PRODUCT} maximum par produit : réduisez la quantité`
                                  : `Plus que ${limit} en stock : réduisez la quantité`}
                            </p>
                          ) : atLimit && (
                            <p className="text-[11px] text-amber-400 mt-2">
                              {limitedByCap(product) ? `${MAX_PER_PRODUCT} maximum par produit` : `Stock maximum atteint (${limit})`}
                            </p>
                          )}
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
                          onChange={e => setNotes(e.target.value.slice(0, NOTES_MAX))}
                          maxLength={NOTES_MAX}
                          className="bg-card border-border text-sm resize-none h-16"
                        />
                        <p className="text-[10px] text-muted-foreground text-right mt-1">{notes.length}/{NOTES_MAX}</p>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  {cartItems.length > 0 && (
                    <div className="border-t border-border px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] space-y-3 flex-shrink-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">Total</span>
                        <span className="text-lg font-bold text-primary">{formatPrice(cartTotal)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Store className="w-3.5 h-3.5" />
                        Retrait au salon — paiement sur place
                      </div>
                      {blockedByStock && (
                        <p className="text-[11px] text-red-400">
                          Certaines quantités dépassent le stock ou le maximum de {MAX_PER_PRODUCT} par produit : ajustez-les pour commander.
                        </p>
                      )}
                      <Button
                        className="w-full h-12 rounded-xl text-sm font-semibold gap-2"
                        onClick={handleOrder}
                        disabled={ordering || blockedByStock}
                      >
                        <ShoppingCart className="w-4 h-4" />
                        {ordering ? 'Validation...' : `Commander — ${formatPrice(cartTotal)}`}
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
