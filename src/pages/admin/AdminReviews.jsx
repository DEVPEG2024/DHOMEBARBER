import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import StarRating from '@/components/shared/StarRating';

export default function AdminReviews() {
  const queryClient = useQueryClient();

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
              <Button variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => toggleVisibility.mutate(review)}>
                {review.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
              </Button>
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
    </div>
  );
}