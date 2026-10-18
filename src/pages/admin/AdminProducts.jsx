import React, { useState, useRef } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Package, Upload, X, Percent, ArrowLeft, ArrowRight, Images } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import LoadError, { isNetworkError, queryFailed } from '@/components/shared/LoadError';
import { isShopProduct, formatPrice } from '@/components/shop/productUtils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const categoryLabels = {
  hair_care: 'Cheveux', beard_care: 'Barbe', styling: 'Coiffant',
  accessories: 'Accessoires', skincare: 'Soin visage', other: 'Autre',
};

/** Galerie : la première photo est la couverture (`image_url`), la liste complète part dans `images`. */
const MAX_IMAGES = 8;

/** Hausse maximale de « Modifier tous les prix » (garde-fou contre une faute de frappe). */
const MAX_INCREASE_PERCENT = 1000;

/** Message d'erreur lisible (jamais « Load failed » ni « HTTP 400 »). */
const errorText = (err, fallback) => (isNetworkError(err)
  ? 'Pas de connexion internet : réessayez.'
  : (err?.data?.error || (err?.message && !/^HTTP \d+$/.test(err.message) ? err.message : '') || fallback));

/** Couverture + galerie en une seule liste dédoublonnée (compat : anciens produits sans `images`). */
function mergeImages(coverUrl, images) {
  const seen = new Set();
  const out = [];
  [coverUrl, ...(Array.isArray(images) ? images : [])].forEach((url) => {
    const u = typeof url === 'string' ? url.trim() : '';
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  });
  return out.slice(0, MAX_IMAGES);
}

export default function AdminProducts() {
  const [editProduct, setEditProduct] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showPriceDialog, setShowPriceDialog] = useState(false);
  const [pricePercent, setPricePercent] = useState('');
  const [priceDirection, setPriceDirection] = useState('increase');
  // Suppression confirmée dans une fenêtre (la corbeille est collée au crayon)
  const [productToDelete, setProductToDelete] = useState(null);
  const [deactivating, setDeactivating] = useState(false);
  // « Modifier tous les prix » : prix cibles figés une fois pour toutes (clé sens|pourcentage) ;
  // un produit mis à jour sort du plan, un nouvel essai ne refait que les restants
  const pricePlanRef = useRef(null);
  const queryClient = useQueryClient();

  const productsQuery = useQuery({
    queryKey: ['products', 'all'], // liste complète (inactifs inclus) : clé distincte de la boutique
    queryFn: () => api.entities.Product.list('name', 200),
    // Le stock affiché à l'ouverture doit être le plus frais possible
    refetchOnMount: 'always',
  });
  const products = productsQuery.data ?? [];
  // Les consommables du salon (Stock → Prestations) partagent la table mais ne sont jamais vendus :
  // ni listés ici, ni touchés par « Modifier tous les prix ». La clé ['products','all'] reste la liste
  // complète, partagée avec AdminStock.
  const shopProducts = products.filter(isShopProduct);
  const supplyCount = products.length - shopProducts.length;
  // Échec sans données, ou requête en pause hors connexion (jamais un squelette sans fin)
  const productsFailed = queryFailed(productsQuery);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      // La première photo de la galerie devient la couverture ; la liste complète part dans `images`
      const images = mergeImages(null, data.images);
      if (data.id) {
        // Seuls les champs du formulaire : renvoyer toute la ligne lue à l'ouverture réécrivait le
        // stock d'alors (ventes faites entre-temps annulées). Le stock ne part que s'il a été touché.
        const update = {
          name: data.name,
          description: data.description ?? '',
          price: data.price,
          category: data.category,
          brand: data.brand ?? '',
          is_active: !!data.is_active,
          image_url: images[0] || '',
          images,
        };
        // Le stock lu à l'ouverture part avec (`expected_stock`, comme Admin → Stock) : si une commande
        // l'a décompté entre-temps, le serveur répond 409 au lieu d'écraser sa valeur (null = non suivi)
        if ((data.stock ?? null) !== data._initialStock) {
          update.stock = data.stock ?? null;
          update.expected_stock = data._initialStock ?? null;
        }
        return api.entities.Product.update(data.id, update);
      }
      const { _initialStock, ...rest } = data;
      return api.entities.Product.create({ ...rest, image_url: images[0] || '', images });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowDialog(false);
      toast.success('Produit sauvegardé');
    },
    onError: (err, data) => {
      if (err?.status === 409 && data?.id) {
        // Stock changé entre-temps : la fiche reste ouverte avec la saisie ; sa base devient le stock
        // actuel du serveur (relu), pour qu'un nouvel essai réfléchi passe au lieu d'un 409 en boucle
        queryClient.invalidateQueries({ queryKey: ['products'] });
        toast.error(errorText(err, 'Le stock a changé entre-temps : vérifiez avant d\'enregistrer'), { duration: 10000 });
        api.entities.Product.filter({ id: data.id }, 'name', 1).then((rows) => {
          const fresh = rows?.[0];
          if (fresh) setEditProduct((p) => (p && String(p.id) === String(data.id) ? { ...p, _initialStock: fresh.stock ?? null } : p));
        }).catch(() => {});
        return;
      }
      toast.error(errorText(err, 'Erreur lors de la sauvegarde'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Product.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setProductToDelete(null);
      toast.success('Produit supprimé');
    },
    onError: (err) => toast.error(errorText(err, 'Erreur lors de la suppression')),
  });

  /** « Désactiver plutôt » : retiré de la vente sans rien perdre (photos, description). */
  const deactivateProduct = async (product) => {
    if (!product || deactivating) return;
    setDeactivating(true);
    try {
      await api.entities.Product.update(product.id, { is_active: false });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(`${product.name} retiré de la vente`);
      setProductToDelete(null);
    } catch (err) {
      toast.error(errorText(err, 'Désactivation impossible'));
    } finally {
      setDeactivating(false);
    }
  };

  const percentValue = parseFloat(String(pricePercent).replace(',', '.'));
  const priceError = !Number.isFinite(percentValue) || percentValue <= 0
    ? 'Pourcentage invalide'
    : priceDirection === 'decrease' && percentValue >= 100
      ? 'Une baisse doit être inférieure à 100 %'
      : priceDirection === 'increase' && percentValue > MAX_INCREASE_PERCENT
        ? `Une hausse ne peut pas dépasser ${MAX_INCREASE_PERCENT} %`
        : null;

  const applyPriceMutation = useMutation({
    mutationFn: async () => {
      if (priceError) throw new Error(priceError);
      const key = `${priceDirection}|${percentValue}`;
      if (!pricePlanRef.current || pricePlanRef.current.key !== key) {
        const multiplier = priceDirection === 'increase' ? 1 + percentValue / 100 : 1 - percentValue / 100;
        const prices = new Map(shopProducts.map(p => [String(p.id), Math.max(0, Math.round((Number(p.price) || 0) * multiplier * 100) / 100)]));
        pricePlanRef.current = { key, prices, total: prices.size };
      }
      const plan = pricePlanRef.current;
      for (const [id, newPrice] of [...plan.prices]) {
        await api.entities.Product.update(id, { price: newPrice });
        plan.prices.delete(id);
      }
    },
    onSuccess: () => {
      pricePlanRef.current = null;
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowPriceDialog(false);
      setPricePercent('');
      toast.success('Prix mis à jour');
    },
    onError: (err) => {
      // Les prix déjà changés restent : la liste les montre, un nouvel essai finit les autres
      queryClient.invalidateQueries({ queryKey: ['products'] });
      const plan = pricePlanRef.current;
      if (plan && plan.prices.size < plan.total) {
        toast.error(`${plan.total - plan.prices.size} produits sur ${plan.total} mis à jour, réessayez pour terminer (${errorText(err, 'erreur')})`);
      } else {
        toast.error(errorText(err, 'Prix non mis à jour'));
      }
    },
  });

  const [upload, setUpload] = useState(null); // { done, total } pendant un envoi séquentiel
  const uploading = !!upload;

  const openNew = () => {
    setEditProduct({ name: '', description: '', price: 0, stock: 0, category: 'other', brand: '', image_url: '', images: [], is_active: true });
    setShowDialog(true);
  };
  const openEdit = (product) => {
    // Stock d'origine mémorisé : il n'est renvoyé que s'il a été modifié dans la fiche
    setEditProduct({ ...product, images: mergeImages(product.image_url, product.images), _initialStock: product.stock ?? null });
    setShowDialog(true);
  };

  /** Multi-upload séquentiel via UploadFile (compression côté client incluse), max 8 photos. */
  const handleImagesUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const room = MAX_IMAGES - (editProduct?.images?.length || 0);
    if (room <= 0) { toast.error(`${MAX_IMAGES} photos maximum`); return; }
    const batch = files.slice(0, room);
    if (files.length > room) toast.warning(`Seules ${room} photo${room > 1 ? 's' : ''} ajoutée${room > 1 ? 's' : ''} : ${MAX_IMAGES} maximum`);
    setUpload({ done: 0, total: batch.length });
    for (const file of batch) {
      try {
        const { file_url } = await api.integrations.Core.UploadFile({ file });
        if (!file_url) throw new Error("Le serveur n'a pas renvoyé d'URL pour la photo");
        setEditProduct(prev => {
          const images = Array.isArray(prev.images) ? prev.images : [];
          if (images.length >= MAX_IMAGES || images.includes(file_url)) return prev;
          return { ...prev, images: [...images, file_url] };
        });
      } catch (err) {
        // Message d'UploadFile gardé (HEIC…), erreur réseau traduite (jamais « Load failed »)
        toast.error(errorText(err, `Échec de l'envoi de ${file.name}`));
      }
      setUpload(p => (p ? { ...p, done: p.done + 1 } : p));
    }
    setUpload(null);
  };
  const moveImage = (index, delta) => {
    setEditProduct(prev => {
      const images = [...(prev.images || [])];
      const target = index + delta;
      if (target < 0 || target >= images.length) return prev;
      [images[index], images[target]] = [images[target], images[index]];
      return { ...prev, images };
    });
  };
  const removeImage = (index) => setEditProduct(prev => ({ ...prev, images: (prev.images || []).filter((_, i) => i !== index) }));

  return (
    <div>
      {/* flex-wrap : sur téléphone les boutons passent sous le titre au lieu de déborder de l'écran */}
      <div className="flex flex-wrap items-center justify-between mb-6 gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Boutique</p>
          <h1 className="font-display text-2xl font-bold">Produits</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowPriceDialog(true)} disabled={productsFailed || productsQuery.isPending} className="rounded-lg">
            <Percent className="w-4 h-4 mr-1.5" /> Modifier les prix
          </Button>
          <Button onClick={openNew} disabled={productsFailed} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg">
            <Plus className="w-4 h-4 mr-1.5" /> Ajouter
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {shopProducts.map(product => (
          <div key={product.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" />
              ) : (
                <Package className="w-5 h-5 text-muted-foreground/40" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {/* Nom sur sa propre ligne, badges dessous : à 320 px la marque écrasait le nom */}
              <h3 className="text-sm font-semibold truncate min-w-0">{product.name}</h3>
              {(product.brand || !product.is_active || (Array.isArray(product.images) && product.images.length > 1)) && (
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5 min-w-0">
                  {product.brand && <Badge variant="outline" className="text-[9px] border-border max-w-full truncate">{product.brand}</Badge>}
                  {!product.is_active && <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">Masqué</Badge>}
                  {Array.isArray(product.images) && product.images.length > 1 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0" title={`${product.images.length} photos`}>
                      <Images className="w-3 h-3" /> {product.images.length}
                    </span>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                <span className="font-bold text-primary text-sm">{formatPrice(product.price)}</span>
                <span>{product.stock == null || product.stock === '' ? 'Stock non suivi' : `Stock : ${product.stock}`}</span>
                <span>{categoryLabels[product.category] || product.category}</span>
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(product)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                aria-label="Supprimer le produit"
                onClick={() => setProductToDelete(product)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {productsFailed ? (
        <LoadError what="les produits" error={productsQuery.error} onRetry={productsQuery.refetch} retrying={productsQuery.isFetching} />
      ) : productsQuery.isPending ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-xl bg-card border border-border animate-pulse" />)}
        </div>
      ) : shopProducts.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Aucun produit. Cliquez sur "Ajouter" pour commencer.
        </div>
      )}

      {!productsFailed && supplyCount > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          {supplyCount} consommable{supplyCount > 1 ? 's' : ''} du salon se gère{supplyCount > 1 ? 'nt' : ''} dans{' '}
          <Link to="/admin/stock" className="text-primary underline underline-offset-2">Stock → Prestations</Link>.
        </p>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-card border-border max-w-md max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editProduct?.id ? 'Modifier' : 'Nouveau'} Produit</DialogTitle>
          </DialogHeader>
          {editProduct && (
            <div className="space-y-4">
              {/* Photos : galerie, la première = couverture */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">
                    Photos <span className="text-muted-foreground">({editProduct.images?.length || 0}/{MAX_IMAGES}, la première sert de couverture)</span>
                  </Label>
                  <label className={`cursor-pointer ${uploading || (editProduct.images?.length || 0) >= MAX_IMAGES ? 'pointer-events-none opacity-50' : ''}`}>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleImagesUpload}
                      disabled={uploading || (editProduct.images?.length || 0) >= MAX_IMAGES} />
                    <span className="flex items-center gap-1.5 text-xs text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-all">
                      <Upload className="w-3 h-3" />
                      {upload ? `Envoi ${Math.min(upload.done + 1, upload.total)}/${upload.total}…` : 'Ajouter'}
                    </span>
                  </label>
                </div>
                {(editProduct.images?.length || 0) === 0 ? (
                  <div className="mt-2 rounded-xl border border-dashed border-border bg-secondary/40 p-5 text-center text-xs text-muted-foreground">
                    <Package className="w-6 h-6 mx-auto mb-1 opacity-40" />
                    Aucune photo pour l'instant.
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {editProduct.images.map((url, i) => (
                      <div key={`${url}-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-white">
                        <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-contain" />
                        {i === 0 && (
                          <span className="absolute top-1 left-1 rounded bg-primary/90 px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">Couverture</span>
                        )}
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 p-1">
                          <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0} aria-label="Reculer"
                            className="w-6 h-6 rounded flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30">
                            <ArrowLeft className="w-3 h-3" />
                          </button>
                          <button type="button" onClick={() => removeImage(i)} aria-label="Retirer"
                            className="w-6 h-6 rounded flex items-center justify-center text-red-300 hover:bg-red-500/30">
                            <X className="w-3 h-3" />
                          </button>
                          <button type="button" onClick={() => moveImage(i, 1)} disabled={i === editProduct.images.length - 1} aria-label="Avancer"
                            className="w-6 h-6 rounded flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30">
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs">Nom</Label>
                <Input value={editProduct.name} onChange={e => setEditProduct({ ...editProduct, name: e.target.value })}
                  className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea value={editProduct.description || ''} onChange={e => setEditProduct({ ...editProduct, description: e.target.value })}
                  className="bg-secondary border-border mt-1" rows={6}
                  placeholder="Description complète, affichée sur la fiche produit (sauts de ligne conservés)" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Prix (€)</Label>
                  <Input type="number" min="0" step="0.01" value={editProduct.price} onChange={e => setEditProduct({ ...editProduct, price: parseFloat(e.target.value) || 0 })}
                    className="bg-secondary border-border mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Stock</Label>
                  {/* Champ vide = stock non suivi (null) : un produit non suivi ne passe plus à 0 en silence */}
                  <Input type="number" min="0" step="1" placeholder="non suivi" value={editProduct.stock ?? ''}
                    onChange={e => {
                      const n = parseInt(e.target.value, 10);
                      setEditProduct({ ...editProduct, stock: e.target.value === '' || !Number.isFinite(n) ? null : n });
                    }}
                    className="bg-secondary border-border mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Catégorie</Label>
                  <Select value={editProduct.category || 'other'} onValueChange={v => setEditProduct({ ...editProduct, category: v })}>
                    <SelectTrigger className="bg-secondary border-border mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(categoryLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Marque</Label>
                  <Input value={editProduct.brand || ''} onChange={e => setEditProduct({ ...editProduct, brand: e.target.value })}
                    className="bg-secondary border-border mt-1" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Actif</Label>
                <Switch checked={editProduct.is_active} onCheckedChange={v => setEditProduct({ ...editProduct, is_active: v })} />
              </div>
              <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={saveMutation.isPending || uploading}
                onClick={() => {
                  if (!editProduct.name?.trim()) { toast.error('Le nom du produit est obligatoire'); return; }
                  if (!(Number(editProduct.price) >= 0)) { toast.error('Le prix ne peut pas être négatif'); return; }
                  saveMutation.mutate(editProduct);
                }}>
                {saveMutation.isPending ? 'Sauvegarde…' : uploading ? 'Envoi des photos…' : 'Sauvegarder'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showPriceDialog} onOpenChange={setShowPriceDialog}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Modifier tous les prix</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Type de modification</Label>
              <Select value={priceDirection} onValueChange={setPriceDirection}>
                <SelectTrigger className="bg-secondary border-border mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="increase">Augmenter</SelectItem>
                  <SelectItem value="decrease">Diminuer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Pourcentage (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                placeholder="Ex: 10"
                value={pricePercent}
                onChange={e => setPricePercent(e.target.value)}
                className="bg-secondary border-border mt-1"
              />
            </div>
            {pricePercent && !priceError && (
              <p className="text-xs text-muted-foreground">
                {priceDirection === 'increase' ? '↑' : '↓'} {pricePercent}% sur {shopProducts.length} produit{shopProducts.length > 1 ? 's' : ''}
              </p>
            )}
            {pricePercent && priceError && <p className="text-xs text-red-400">{priceError}</p>}
            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!!priceError || applyPriceMutation.isPending}
              onClick={() => applyPriceMutation.mutate()}
            >
              {applyPriceMutation.isPending ? 'Application...' : 'Appliquer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Suppression : définitive, confirmée (bouton Annuler visible, pas de fermeture au tap à côté) */}
      <AlertDialog open={!!productToDelete} onOpenChange={(o) => { if (!o && !deleteMutation.isPending && !deactivating) setProductToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {productToDelete?.name} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le produit disparaît de la Boutique, des favoris et des paniers, avec ses photos et sa description. Cette action est irréversible. Pour le retirer de la vente sans le perdre, désactive-le plutôt (interrupteur Actif dans la fiche).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={deleteMutation.isPending || deactivating}>Annuler</AlertDialogCancel>
            {productToDelete?.is_active && (
              <Button variant="outline" disabled={deleteMutation.isPending || deactivating} onClick={() => deactivateProduct(productToDelete)}>
                {deactivating ? 'Désactivation…' : 'Désactiver plutôt'}
              </Button>
            )}
            <AlertDialogAction
              disabled={deleteMutation.isPending || deactivating}
              onClick={(e) => { e.preventDefault(); if (productToDelete) deleteMutation.mutate(productToDelete.id); }}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Suppression…' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}