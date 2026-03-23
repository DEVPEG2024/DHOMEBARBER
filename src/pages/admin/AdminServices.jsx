import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Clock, Upload, AlertTriangle, FileText, Download } from 'lucide-react';
import { exportToCSV } from '@/utils/exportCSV';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function AdminServices() {
  const [editService, setEditService] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const fileRef = useRef();
  const queryClient = useQueryClient();

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => base44.entities.Service.list('sort_order', 200),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['serviceCategories'],
    queryFn: async () => {
      try {
        return await base44.entities.ServiceCategory.list('sort_order', 50);
      } catch {
        return [];
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (data.id) {
        const { id, ...rest } = data;
        return base44.entities.Service.update(id, rest);
      }
      return base44.entities.Service.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setShowDialog(false);
      setEditService(null);
      toast.success('Prestation sauvegardée');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Service.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      toast.success('Prestation supprimée');
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      for (const s of services) {
        await base44.entities.Service.delete(s.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setShowDeleteAll(false);
      toast.success(`${services.length} prestations supprimées`);
    },
  });

  const handleCSVFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const lines = text.split('\n').filter(l => l.trim());
      // Try to parse headers from first line
      const headers = lines[0].split(/[,;]/).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(/[,;]/).map(v => v.trim().replace(/['"]/g, ''));
        if (vals.length < 2) continue;
        const row = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
        // Map common column names
        const name = row['nom'] || row['name'] || row['prestation'] || row['service'] || vals[0];
        const price = parseFloat(row['prix'] || row['price'] || row['tarif'] || vals[1]) || 0;
        const duration = parseInt(row['duree'] || row['durée'] || row['duration'] || row['temps'] || vals[2]) || 30;
        const description = row['description'] || row['desc'] || '';
        if (name) rows.push({ name, price, duration, description, is_active: true });
      }
      setImportPreview(rows);
      setShowImportDialog(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    setImporting(true);
    try {
      for (const row of importPreview) {
        await base44.entities.Service.create(row);
      }
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setShowImportDialog(false);
      setImportPreview([]);
      toast.success(`${importPreview.length} prestations importées`);
    } catch (e) {
      toast.error('Erreur lors de l\'import');
    }
    setImporting(false);
  };

  const openNew = () => {
    setEditService({ name: '', description: '', duration: 30, price: 0, is_active: true, category_id: '' });
    setShowDialog(true);
  };

  const openEdit = (service) => {
    setEditService({ ...service });
    setShowDialog(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <div className="shrink-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Gestion</p>
          <h1 className="font-display text-2xl font-bold">Prestations</h1>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="outline" size="sm" className="border-border gap-1.5"
            onClick={() => exportToCSV(services.map(s => ({ nom: s.name, description: s.description || '', duree_min: s.duration, prix_eur: s.price, actif: s.is_active ? 'oui' : 'non' })), 'prestations')}>
            <Download className="w-3.5 h-3.5" /> Exporter
          </Button>
          <Button variant="outline" size="sm" className="border-border gap-1.5" onClick={() => fileRef.current?.click()}>
            <Upload className="w-3.5 h-3.5" /> Import CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCSVFile} />
          {services.length > 0 && (
            <Button variant="outline" size="sm" className="border-destructive/50 text-destructive hover:bg-destructive/10 gap-1.5"
              onClick={() => setShowDeleteAll(true)}>
              <Trash2 className="w-3.5 h-3.5" /> Tout supprimer
            </Button>
          )}
          <Button onClick={openNew} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg">
            <Plus className="w-4 h-4 mr-1.5" /> Ajouter
          </Button>
        </div>
      </div>

      {/* CSV Info */}
      <div className="bg-card border border-border rounded-xl p-3 mb-4 flex items-start gap-3">
        <FileText className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          Format CSV accepté : <span className="font-mono text-foreground">nom, prix, durée (min), description</span> — ou avec en-têtes : <span className="font-mono text-foreground">nom;prix;duree;description</span>
        </p>
      </div>

      <div className="space-y-2">
        {services.map(service => (
          <div key={service.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{service.name}</h3>
                {!service.is_active && (
                  <span className="text-[9px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">Inactif</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {service.duration} min
                </span>
                <span className="text-sm font-bold text-primary">{service.price}€</span>
              </div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(service)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                onClick={() => deleteMutation.mutate(service.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{editService?.id ? 'Modifier' : 'Nouvelle'} Prestation</DialogTitle>
          </DialogHeader>
          {editService && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Nom</Label>
                <Input value={editService.name} onChange={e => setEditService({ ...editService, name: e.target.value })}
                  className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea value={editService.description || ''} onChange={e => setEditService({ ...editService, description: e.target.value })}
                  className="bg-secondary border-border mt-1" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Durée (min)</Label>
                  <Input type="number" value={editService.duration} onChange={e => setEditService({ ...editService, duration: parseInt(e.target.value) || 0 })}
                    className="bg-secondary border-border mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Prix (€)</Label>
                  <Input type="number" value={editService.price} onChange={e => setEditService({ ...editService, price: parseFloat(e.target.value) || 0 })}
                    className="bg-secondary border-border mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Catégorie</Label>
                <Select value={editService.category_id || ''} onValueChange={v => setEditService({ ...editService, category_id: v })}>
                  <SelectTrigger className="bg-secondary border-border mt-1">
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Actif</Label>
                <Switch checked={editService.is_active} onCheckedChange={v => setEditService({ ...editService, is_active: v })} />
              </div>
              <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => saveMutation.mutate(editService)}>
                Sauvegarder
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete All Confirmation */}
      <Dialog open={showDeleteAll} onOpenChange={setShowDeleteAll}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Supprimer tout ?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Vous allez supprimer les <strong className="text-foreground">{services.length} prestations</strong>. Cette action est irréversible.
          </p>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" className="flex-1 border-border" onClick={() => setShowDeleteAll(false)}>Annuler</Button>
            <Button className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteAllMutation.mutate()} disabled={deleteAllMutation.isPending}>
              {deleteAllMutation.isPending ? 'Suppression...' : 'Tout supprimer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Preview Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Aperçu de l'import</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mb-3">{importPreview.length} prestation(s) détectée(s)</p>
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {importPreview.map((row, i) => (
              <div key={i} className="flex items-center justify-between bg-secondary rounded-lg px-3 py-2 text-xs">
                <span className="font-medium">{row.name}</span>
                <div className="flex gap-3 text-muted-foreground">
                  <span>{row.duration} min</span>
                  <span className="font-bold text-primary">{row.price}€</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" className="flex-1 border-border" onClick={() => setShowImportDialog(false)}>Annuler</Button>
            <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleImportConfirm} disabled={importing}>
              {importing ? 'Import...' : `Importer ${importPreview.length} prestation(s)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}