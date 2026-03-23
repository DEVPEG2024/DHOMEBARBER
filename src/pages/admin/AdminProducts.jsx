import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Package } from 'lucide-react';
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

export default function AdminProducts() {
  const [editProduct, setEditProduct] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const queryClient = useQueryClient();

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('name', 200),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (data.id) {
        const { id, ...rest } = data;
        return base44.entities.Product.update(id, rest);
      }
      return base44.entities.Product.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowDialog(false);
      toast.success('Produit sauvegardé');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Produit supprimé');
    },
  });

  const openNew = () => {
    setEditProduct({ name: '', description: '', price: 0, stock: 0, category: 'other', brand: '', is_active: true });
    setShowDialog(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Boutique</p>
          <h1 className="font-display text-2xl font-bold">Produits</h1>
        </div>
        <Button onClick={openNew} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg">
          <Plus className="w-4 h-4 mr-1.5" /> Ajouter
        </Button>
      </div>

      <div className="space-y-2">
        {products.map(product => (
          <div key={product.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <Package className="w-5 h-5 text-muted-foreground/40" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold truncate">{product.name}</h3>
                {product.brand && <Badge variant="outline" className="text-[9px] border-border">{product.brand}</Badge>}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span className="font-bold text-primary text-sm">{product.price}€</span>
                <span>Stock: {product.stock || 0}</span>
                <span>{categoryLabels[product.category] || product.category}</span>
              </div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditProduct({ ...product }); setShowDialog(true); }}>
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
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{editProduct?.id ? 'Modifier' : 'Nouveau'} Produit</DialogTitle>
          </DialogHeader>
          {editProduct && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Nom</Label>
                <Input value={editProduct.name} onChange={e => setEditProduct({ ...editProduct, name: e.target.value })}
                  className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea value={editProduct.description || ''} onChange={e => setEditProduct({ ...editProduct, description: e.target.value })}
                  className="bg-secondary border-border mt-1" rows={2} />
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
                onClick={() => saveMutation.mutate(editProduct)}>
                Sauvegarder
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}