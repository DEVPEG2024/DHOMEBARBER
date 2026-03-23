import React from 'react';
import { Star } from 'lucide-react';

export default function StarRating({ rating, size = 'sm', onRate, interactive }) {
  const sizeClass = size === 'sm' ? 'w-3.5 h-3.5' : size === 'md' ? 'w-5 h-5' : 'w-6 h-6';
  
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${sizeClass} transition-colors ${
            star <= rating 
              ? 'text-primary fill-primary' 
              : 'text-muted-foreground/30'
          } ${interactive ? 'cursor-pointer hover:text-primary' : ''}`}
          onClick={() => interactive && onRate?.(star)}
        />
      ))}
    </div>
  );
}