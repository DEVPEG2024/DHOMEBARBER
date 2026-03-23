import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = { monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi', thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche' };

export default function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const queryClient = useQueryClient();

  const { data: allSettings = [] } = useQuery({
    queryKey: ['salonSettings'],
    queryFn: () => base44.entities.SalonSettings.list('-created_date', 1),
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
      toast.success('Paramètres sauvegardés');
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
        <Button onClick={() => saveMutation.mutate(settings)} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Save className="w-4 h-4 mr-1.5" /> Sauvegarder
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
      </div>
    </div>
  );
}