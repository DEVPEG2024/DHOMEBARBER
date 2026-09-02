import { QueryClient } from '@tanstack/react-query';

// Les données restent « fraîches » 60 s par défaut : un retour sur une page
// dans la minute réutilise le cache au lieu de retélécharger (les listes
// contiennent des images en base64, plusieurs Mo). Les catalogues qui changent
// rarement (prestations, équipe, produits, paramètres) passent à 5 min dans
// leurs pages respectives.
export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			staleTime: 60 * 1000,
		},
	},
});
