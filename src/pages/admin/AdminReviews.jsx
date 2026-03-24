import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, MessageSquare, Star, ExternalLink, MapPin, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import StarRating from '@/components/shared/StarRating';

const GOOGLE_PLACE_ID = 'ChIJm6cgTFprjEcRZsuEqhCEPXY';
const GOOGLE_REVIEW_URL = `https://search.google.com/local/writereview?placeid=${GOOGLE_PLACE_ID}`;
const GOOGLE_MAPS_URL = `https://www.google.com/maps/place/?q=place_id:${GOOGLE_PLACE_ID}`;

export default function AdminReviews() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('app');

  const { data: reviews = [] } = useQuery({
    queryKey: ['allReviews'],
    queryFn: () => base44.entities.Review.list('-created_date', 200),
  });

  const toggleVisibility = useMutation({
    mutationFn: (review) => base44.entities.Review.update(review.id, { is_visible: !review.is_visible }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allReviews'] });
      toast.success('Visibilité mise à jour');
    },
  });

  const deleteReview = useMutation({
    mutationFn: (id) => base44.entities.Review.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allReviews'] });
      toast.success('Avis supprimé');
    },
  });

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : '0';

  return (
    <div>
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Modération</p>
        <h1 className="font-display text-2xl font-bold">Avis Clients</h1>
        <p className="text-xs text-muted-foreground mt-1">
          {reviews.length} avis · Note moyenne: {avgRating}/5
        </p>
      </div>

      {/* Google Actions */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-semibold">Google Business</p>
            <p className="text-[10px] text-muted-foreground">Gérez vos avis Google</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={GOOGLE_MAPS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all"
          >
            <Star className="w-3.5 h-3.5" />
            Voir les avis Google
          </a>
          <a
            href={GOOGLE_REVIEW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Lien avis client
          </a>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Partagez le lien "Lien avis client" avec vos clients pour qu'ils laissent un avis Google.
        </p>
        <button
          onClick={() => {
            navigator.clipboard.writeText(GOOGLE_REVIEW_URL);
            toast.success('Lien copié !');
          }}
          className="mt-2 text-[10px] text-primary underline hover:text-primary/80"
        >
          Copier le lien d'avis Google
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('app')}
          className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
            tab === 'app' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
          }`}
        >
          Avis App ({reviews.length})
        </button>
        <button
          onClick={() => setTab('google')}
          className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
            tab === 'google' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
          }`}
        >
          Avis Google
        </button>
      </div>

      {tab === 'app' && (
        <>
          <div className="space-y-3">
            {reviews.map(review => (
              <div key={review.id} className={`bg-card border border-border rounded-xl p-4 ${!review.is_visible ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold">{review.client_name || 'Anonyme'}</p>
                    <StarRating rating={review.rating} />
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(review.created_date).toLocaleDateString('fr-FR')}
                      {review.employee_name && ` · ${review.employee_name}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => toggleVisibility.mutate(review)}>
                      {review.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500"
                      onClick={() => { if (confirm('Supprimer cet avis ?')) deleteReview.mutate(review.id); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {review.comment && (
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2">{review.comment}</p>
                )}
              </div>
            ))}
          </div>

          {reviews.length === 0 && (
            <div className="text-center py-16">
              <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Aucun avis pour le moment</p>
            </div>
          )}
        </>
      )}

      {tab === 'google' && (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
            <MapPin className="w-6 h-6 text-blue-400" />
          </div>
          <h3 className="text-sm font-semibold mb-2">Avis Google Maps</h3>
          <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">
            Consultez et répondez à vos avis directement sur Google Maps.
          </p>
          <div className="space-y-2">
            <a
              href={GOOGLE_MAPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-all"
            >
              <ExternalLink className="w-4 h-4" />
              Ouvrir Google Maps
            </a>
            <p className="text-[10px] text-muted-foreground">
              Place ID : {GOOGLE_PLACE_ID}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
