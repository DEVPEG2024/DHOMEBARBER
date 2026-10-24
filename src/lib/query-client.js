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
		// Envois (création, annulation, déplacement, commande…) : toujours partis tout de suite. En
		// mode « online » (défaut), React Query les met en pause quand le navigateur se croit hors
		// connexion : le bouton tournait sans fin, sans message, et la fenêtre ne se fermait plus
		// (relevé le 24 oct. 2026 sur la réservation, Mes rendez-vous et Mes commandes). La coupure
		// arrive ainsi dans onError, qui dit « Pas de connexion ».
		mutations: {
			networkMode: 'always',
		},
	},
});
