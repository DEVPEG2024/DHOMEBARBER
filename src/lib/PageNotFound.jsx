import { useLocation, Link } from 'react-router-dom';
import { Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PageNotFound() {
  const location = useLocation();
  
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full text-center">
        <Scissors className="w-12 h-12 text-primary mx-auto mb-6 opacity-30" />
        <h1 className="text-6xl font-display font-bold text-foreground/20 mb-2">404</h1>
        <h2 className="text-lg font-semibold text-foreground mb-2">Page introuvable</h2>
        <p className="text-sm text-muted-foreground mb-8">
          La page que vous cherchez n'existe pas ou a été déplacée.
        </p>
        <Link to="/">
          <Button className="rounded-full px-6 bg-primary text-primary-foreground hover:bg-primary/90">
            Retour à l'accueil
          </Button>
        </Link>
      </div>
    </div>
  );
}