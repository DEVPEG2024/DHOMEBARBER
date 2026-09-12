import React, { useState } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

const categoryLabels = {
  hair_care: 'Cheveux', beard_care: 'Barbe', styling: 'Coiffant',
  accessories: 'Accessoires', skincare: 'Soin visage', other: 'Autre',
};

/** Galerie : la première photo est la couverture (`image_url`), la liste complète part dans `images`. */
const MAX_IMAGES = 8;

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
  const queryClient = useQueryClient();

  const { data: products = [] } = useQuery({
    queryKey: ['products', 'all'], // liste complète (inactifs inclus) : clé distincte de la boutique
    queryFn: () => api.entities.Product.list('name', 200),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      // La première photo de la galerie devient la couverture ; la liste complète part dans `images`
      const images = mergeImages(null, data.images);
      const payload = { ...data, image_url: images[0] || '', images };
      if (payload.id) {
        const { id, ...rest } = payload;
        return api.entities.Product.update(id, rest);
      }
      return api.entities.Product.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowDialog(false);
      toast.success('Produit sauvegardé');
    },
    onError: (err) => toast.error(err?.message || 'Erreur lors de la sauvegarde'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Product.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Produit supprimé');
    },
    onError: (err) => toast.error(err?.message || 'Erreur lors de la suppression'),
  });

  const applyPriceMutation = useMutation({
    mutationFn: async () => {
      const percent = parseFloat(pricePercent);
      if (!percent || percent <= 0) throw new Error('Pourcentage invalide');
      const multiplier = priceDirection === 'increase' ? 1 + percent / 100 : 1 - percent / 100;
      for (const product of products) {
        const newPrice = Math.round(product.price * multiplier * 100) / 100;
        await api.entities.Product.update(product.id, { price: newPrice });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowPriceDialog(false);
      setPricePercent('');
      toast.success('Prix mis à jour');
    },
    onError: (err) => toast.error(err.message),
  });

  const [upload, setUpload] = useState(null); // { done, total } pendant un envoi séquentiel
  const uploading = !!upload;

  const openNew = () => {
    setEditProduct({ name: '', description: '', price: 0, stock: 0, category: 'other', brand: '', image_url: '', images: [], is_active: true });
    setShowDialog(true);
  };
  const openEdit = (product) => {
    setEditProduct({ ...product, images: mergeImages(product.image_url, product.images) });
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
        toast.error(err?.message || `Échec de l'envoi de ${file.name}`);
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
      <div className="flex items-center justify-between mb-6 gap-3">
        <div className="shrink-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Boutique</p>
          <h1 className="font-display text-2xl font-bold">Produits</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPriceDialog(true)} className="rounded-lg">
            <Percent className="w-4 h-4 mr-1.5" /> Modifier les prix
          </Button>
          <Button onClick={openNew} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg">
            <Plus className="w-4 h-4 mr-1.5" /> Ajouter
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {products.map(product => (
          <div key={product.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" />
              ) : (
                <Package className="w-5 h-5 text-muted-foreground/40" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold truncate">{product.name}</h3>
                {product.brand && <Badge variant="outline" className="text-[9px] border-border">{product.brand}</Badge>}
                {Array.isArray(product.images) && product.images.length > 1 && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0" title={`${product.images.length} photos`}>
                    <Images className="w-3 h-3" /> {product.images.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span className="font-bold text-primary text-sm">{product.price}€</span>
                <span>Stock: {product.stock || 0}</span>
                <span>{categoryLabels[product.category] || product.category}</span>
              </div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(product)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                onClick={() => deleteMutation.mutate(product.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {products.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Aucun produit. Cliquez sur "Ajouter" pour commencer.
        </div>
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
                  <Input type="number" value={editProduct.price} onChange={e => setEditProduct({ ...editProduct, price: parseFloat(e.target.value) || 0 })}
                    className="bg-secondary border-border mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Stock</Label>
                  <Input type="number" value={editProduct.stock || 0} onChange={e => setEditProduct({ ...editProduct, stock: parseInt(e.target.value) || 0 })}
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
            {pricePercent && parseFloat(pricePercent) > 0 && (
              <p className="text-xs text-muted-foreground">
                {priceDirection === 'increase' ? '↑' : '↓'} {pricePercent}% sur {products.length} produits
              </p>
            )}
            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!pricePercent || parseFloat(pricePercent) <= 0 || applyPriceMutation.isPending}
              onClick={() => applyPriceMutation.mutate()}
            >
              {applyPriceMutation.isPending ? 'Application...' : 'Appliquer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}