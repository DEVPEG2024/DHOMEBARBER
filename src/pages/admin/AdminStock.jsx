import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, AlertTriangle, Save, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function AdminStock() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all, critical, ok
  const [edits, setEdits] = useState({}); // { productId: { stock, ref, critical_stock } }
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('name', 200),
  });

  const activeProducts = products.filter(p => p.is_active);

  const getVal = (product, field) => {
    if (edits[product.id]?.[field] !== undefined) return edits[product.id][field];
    return product[field];
  };

  const setVal = (product, field, value) => {
    setEdits(prev => ({
      ...prev,
      [product.id]: { ...prev[product.id], [field]: value },
    }));
  };

  const isCritical = (product) => {
    const stock = getVal(product, 'stock') ?? 0;
    const threshold = getVal(product, 'critical_stock') ?? 3;
    return stock <= threshold;
  };

  const filtered = activeProducts
    .filter(p => {
      if (search) {
        const s = search.toLowerCase();
        return p.name?.toLowerCase().includes(s) || (getVal(p, 'ref') || '').toLowerCase().includes(s) || p.brand?.toLowerCase().includes(s);
      }
      return true;
    })
    .filter(p => {
      if (filter === 'critical') return isCritical(p);
      if (filter === 'ok') return !isCritical(p);
      return true;
    });

  const criticalCount = activeProducts.filter(p => isCritical(p)).length;
  const hasEdits = Object.keys(edits).length > 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const entries = Object.entries(edits);
      for (const [id, data] of entries) {
        const update = {};
        if (data.stock !== undefined) update.stock = parseInt(data.stock) || 0;
        if (data.ref !== undefined) update.ref = data.ref;
        if (data.critical_stock !== undefined) update.critical_stock = parseInt(data.critical_stock) || 0;
        if (Object.keys(update).length > 0) {
          await base44.entities.Product.update(id, update);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEdits({});
      toast.success(`${entries.length} produit(s) mis à jour`);

      // Check for critical stock and notify admin
      const updatedProducts = activeProducts.map(p => {
        const e = edits[p.id];
        return e ? { ...p, ...e } : p;
      });
      const criticals = updatedProducts.filter(p => {
        const stock = p.stock ?? 0;
        const threshold = p.critical_stock ?? 3;
        return stock <= threshold;
      });

      if (criticals.length > 0) {
        const names = criticals.slice(0, 5).map(p => p.name).join(', ');
        const serverUrl = import.meta.env.PROD ? 'https://dhomebarber-api-3aabb8313cb6.herokuapp.com' : '';
        const appId = base44.appId || 'prod';
        const token = localStorage.getItem('base44_access_token') || localStorage.getItem('token');
        try {
          await fetch(`${serverUrl}/api/apps/${appId}/push/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              title: 'Stock critique',
              body: `${criticals.length} produit(s) en stock critique : ${names}${criticals.length > 5 ? '...' : ''}`,
              target_email: null,
            }),
          });
        } catch {}
      }
    } catch (err) {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="shrink-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Inventaire</p>
          <h1 className="font-display text-2xl font-bold">Stock Produits</h1>
        </div>
        {hasEdits && (
          <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg">
            <Save className="w-4 h-4 mr-1.5" />
            {saving ? 'Sauvegarde...' : `Sauvegarder (${Object.keys(edits).length})`}
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-2xl bg-white/4 border border-white/8 backdrop-blur-xl p-4 text-center">
          <p className="text-2xl font-bold text-primary font-display">{activeProducts.length}</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">Produits</p>
        </div>
        <div className="rounded-2xl bg-white/4 border border-white/8 backdrop-blur-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground font-display">
            {activeProducts.reduce((sum, p) => sum + (p.stock || 0), 0)}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">Total stock</p>
        </div>
        <div className={`rounded-2xl border backdrop-blur-xl p-4 text-center ${criticalCount > 0 ? 'bg-red-500/8 border-red-500/20' : 'bg-white/4 border-white/8'}`}>
          <p className={`text-2xl font-bold font-display ${criticalCount > 0 ? 'text-red-400' : 'text-green-400'}`}>{criticalCount}</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">Critiques</p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher par nom, réf, marque..." value={search}
            onChange={e => setSearch(e.target.value)} className="bg-card border-border pl-9" />
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/8">
          {[
            { id: 'all', label: 'Tous' },
            { id: 'critical', label: 'Critiques' },
            { id: 'ok', label: 'OK' },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filter === f.id ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product list */}
      <div className="space-y-2">
        {filtered.map((product, i) => {
          const critical = isCritical(product);
          return (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className={`bg-card border rounded-xl p-4 ${critical ? 'border-red-500/30 bg-red-500/5' : 'border-border'}`}
            >
              <div className="flex items-center gap-3">
                {/* Photo */}
                <div className="w-12 h-12 rounded-lg bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" />
                  ) : (
                    <Package className="w-5 h-5 text-muted-foreground/40" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold truncate">{product.name}</h3>
                    {product.brand && <Badge variant="outline" className="text-[9px] border-border">{product.brand}</Badge>}
                    {critical && (
                      <Badge className="text-[9px] bg-red-500/10 text-red-400 border-red-500/20 gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" /> Critique
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{product.price}€</p>
                </div>

                {/* Editable fields */}
                <div className="flex items-center gap-2">
                  <div className="w-24">
                    <Label className="text-[9px] text-muted-foreground uppercase">Réf.</Label>
                    <Input
                      value={getVal(product, 'ref') || ''}
                      onChange={e => setVal(product, 'ref', e.target.value)}
                      placeholder="REF-001"
                      className="bg-secondary border-border h-8 text-xs mt-0.5"
                    />
                  </div>
                  <div className="w-16">
                    <Label className="text-[9px] text-muted-foreground uppercase">Stock</Label>
                    <Input
                      type="number"
                      value={getVal(product, 'stock') ?? 0}
                      onChange={e => setVal(product, 'stock', e.target.value)}
                      className={`border-border h-8 text-xs mt-0.5 font-bold text-center ${critical ? 'bg-red-500/10 text-red-400' : 'bg-secondary'}`}
                    />
                  </div>
                  <div className="w-16">
                    <Label className="text-[9px] text-muted-foreground uppercase">Seuil</Label>
                    <Input
                      type="number"
                      value={getVal(product, 'critical_stock') ?? 3}
                      onChange={e => setVal(product, 'critical_stock', e.target.value)}
                      className="bg-secondary border-border h-8 text-xs mt-0.5 text-center"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {search || filter !== 'all' ? 'Aucun produit trouvé.' : 'Aucun produit actif.'}
        </div>
      )}
    </div>
  );
}
