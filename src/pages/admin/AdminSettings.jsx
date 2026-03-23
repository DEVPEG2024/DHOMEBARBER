import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2, Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = { monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi', thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche' };

const SKILL_EMOJIS = ['✂️', '💇', '💈', '🎨', '👑', '💪', '🔥', '⭐', '💎', '🧔', '🪮', '💆', '🌍', '🌊', '🧴', '✨'];
const SKILL_COLORS = ['#3fcf8e', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#ec4899', '#14b8a6', '#f97316'];

export default function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [newSkill, setNewSkill] = useState({ name: '', emoji: '✂️', color: '#3fcf8e' });
  const queryClient = useQueryClient();

  const { data: allSettings = [] } = useQuery({
    queryKey: ['salonSettings'],
    queryFn: () => base44.entities.SalonSettings.list('-created_date', 1),
  });

  const { data: skillCategories = [] } = useQuery({
    queryKey: ['skillCategories'],
    queryFn: () => base44.entities.SkillCategory.list('sort_order', 100),
  });

  const addSkillMutation = useMutation({
    mutationFn: (data) => base44.entities.SkillCategory.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skillCategories'] });
      setNewSkill({ name: '', emoji: '✂️', color: '#3fcf8e' });
      toast.success('Compétence ajoutée');
    },
  });

  const deleteSkillMutation = useMutation({
    mutationFn: (id) => base44.entities.SkillCategory.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skillCategories'] });
      toast.success('Compétence supprimée');
    },
  });

  useEffect(() => {
    if (allSettings.length > 0 && !settings) {
      setSettings(allSettings[0]);
    }
  }, [allSettings]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (data.id) {
        const { id, ...rest } = data;
        return base44.entities.SalonSettings.update(id, rest);
      }
      return base44.entities.SalonSettings.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salonSettings'] });
      toast.success('Paramètres sauvegardés ✓');
    },
    onError: () => {
      toast.error('Erreur lors de la sauvegarde');
    },
  });

  const updateHours = (day, field, value) => {
    setSettings(prev => ({
      ...prev,
      opening_hours: {
        ...prev.opening_hours,
        [day]: { ...prev.opening_hours?.[day], [field]: value }
      }
    }));
  };

  if (!settings) {
    return (
      <div className="text-center py-16">
        <Button onClick={() => setSettings({ salon_name: 'BLADE & CO.', tagline: 'Premium Barbershop Experience' })}
          className="bg-primary text-primary-foreground">
          Initialiser les paramètres
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Configuration</p>
          <h1 className="font-display text-2xl font-bold">Paramètres</h1>
        </div>
        <Button onClick={() => saveMutation.mutate(settings)} disabled={saveMutation.isPending} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
          {saveMutation.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
        </Button>
      </div>

      <div className="space-y-6">
        {/* General */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Informations générales</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nom du salon</Label>
                <Input value={settings.salon_name || ''} onChange={e => setSettings({ ...settings, salon_name: e.target.value })}
                  className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-xs">Slogan</Label>
                <Input value={settings.tagline || ''} onChange={e => setSettings({ ...settings, tagline: e.target.value })}
                  className="bg-secondary border-border mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={settings.description || ''} onChange={e => setSettings({ ...settings, description: e.target.value })}
                className="bg-secondary border-border mt-1" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Adresse</Label>
                <Input value={settings.address || ''} onChange={e => setSettings({ ...settings, address: e.target.value })}
                  className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-xs">Ville</Label>
                <Input value={settings.city || ''} onChange={e => setSettings({ ...settings, city: e.target.value })}
                  className="bg-secondary border-border mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Téléphone</Label>
                <Input value={settings.phone || ''} onChange={e => setSettings({ ...settings, phone: e.target.value })}
                  className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={settings.email || ''} onChange={e => setSettings({ ...settings, email: e.target.value })}
                  className="bg-secondary border-border mt-1" />
              </div>
            </div>
          </div>
        </div>

        {/* Hours */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Horaires d'ouverture</h3>
          <div className="space-y-2">
            {DAYS.map(day => (
              <div key={day} className="flex items-center gap-2 text-xs">
                <span className="w-20 text-muted-foreground">{DAY_LABELS[day]}</span>
                <Switch
                  checked={!settings.opening_hours?.[day]?.closed}
                  onCheckedChange={v => updateHours(day, 'closed', !v)}
                />
                {!settings.opening_hours?.[day]?.closed && (
                  <>
                    <Input type="time" value={settings.opening_hours?.[day]?.open || '09:00'}
                      onChange={e => updateHours(day, 'open', e.target.value)}
                      className="w-28 h-7 text-xs bg-secondary border-border" />
                    <span>-</span>
                    <Input type="time" value={settings.opening_hours?.[day]?.close || '19:00'}
                      onChange={e => updateHours(day, 'close', e.target.value)}
                      className="w-28 h-7 text-xs bg-secondary border-border" />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Booking Rules */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Règles de réservation</h3>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Délai d'annulation gratuite (heures)</Label>
              <Input type="number" value={settings.cancellation_hours || 24}
                onChange={e => setSettings({ ...settings, cancellation_hours: parseInt(e.target.value) || 24 })}
                className="bg-secondary border-border mt-1 w-32" />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Acompte obligatoire</Label>
              <Switch checked={settings.require_deposit} onCheckedChange={v => setSettings({ ...settings, require_deposit: v })} />
            </div>
            {settings.require_deposit && (
              <div>
                <Label className="text-xs">Pourcentage d'acompte</Label>
                <Input type="number" value={settings.deposit_percentage || 30}
                  onChange={e => setSettings({ ...settings, deposit_percentage: parseInt(e.target.value) || 30 })}
                  className="bg-secondary border-border mt-1 w-32" />
              </div>
            )}
          </div>
        </div>

        {/* Social */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Réseaux sociaux</h3>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Instagram</Label>
              <Input value={settings.social_instagram || ''} onChange={e => setSettings({ ...settings, social_instagram: e.target.value })}
                className="bg-secondary border-border mt-1" placeholder="@votrecompte" />
            </div>
            <div>
              <Label className="text-xs">Facebook</Label>
              <Input value={settings.social_facebook || ''} onChange={e => setSettings({ ...settings, social_facebook: e.target.value })}
                className="bg-secondary border-border mt-1" />
            </div>
            <div>
              <Label className="text-xs">TikTok</Label>
              <Input value={settings.social_tiktok || ''} onChange={e => setSettings({ ...settings, social_tiktok: e.target.value })}
                className="bg-secondary border-border mt-1" />
            </div>
          </div>
        </div>

        {/* Skill Categories */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-1">Compétences Barbers</h3>
          <p className="text-xs text-muted-foreground mb-4">Les barbers pourront évaluer leur niveau sur chaque compétence</p>

          {/* Existing skills */}
          <div className="space-y-2 mb-4">
            {skillCategories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary/50 border border-border group">
                <span className="text-lg">{cat.emoji}</span>
                <span className="text-sm font-medium flex-1">{cat.name}</span>
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                <button
                  onClick={() => deleteSkillMutation.mutate(cat.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {skillCategories.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">Aucune compétence configurée</p>
            )}
          </div>

          {/* Add new skill */}
          <div className="border border-dashed border-border rounded-xl p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Ajouter une compétence</p>
            <div className="flex gap-2">
              <Input
                value={newSkill.name}
                onChange={e => setNewSkill({ ...newSkill, name: e.target.value })}
                placeholder="Ex: Cheveux afro"
                className="bg-secondary border-border text-sm flex-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Emoji</Label>
              <div className="flex flex-wrap gap-1.5">
                {SKILL_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => setNewSkill({ ...newSkill, emoji })}
                    className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all ${
                      newSkill.emoji === emoji ? 'bg-primary/20 ring-2 ring-primary scale-110' : 'bg-secondary hover:bg-secondary/80'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Couleur</Label>
              <div className="flex flex-wrap gap-1.5">
                {SKILL_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setNewSkill({ ...newSkill, color })}
                    className={`w-8 h-8 rounded-lg transition-all ${
                      newSkill.color === color ? 'ring-2 ring-white scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <Button
              onClick={() => {
                if (!newSkill.name.trim()) return toast.error('Nom requis');
                addSkillMutation.mutate({ ...newSkill, sort_order: skillCategories.length });
              }}
              disabled={addSkillMutation.isPending}
              size="sm"
              className="bg-primary text-primary-foreground text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Ajouter
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}