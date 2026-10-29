/*
 * Couleurs de La Coupe du Gang, thème stade (planche validée le 29 oct. 2026,
 * docs/fonctions/coupe-du-gang-stade.md) : rouge, noir et blanc, une touche d'or.
 *  - rouge : boutons (Jouer, Défier, Revanche), ton camp, ton pion, ton score ;
 *  - blanc : l'adversaire et les textes ;
 *  - noir : les fonds ;
 *  - or : trophée, Points de Coupe, le mot « Coupe », la 1re place, la victoire.
 * Contrastes vérifiés : blanc sur rouge 4,8:1, rouge vif sur noir 5,6:1, or sur noir 11:1,
 * gris sur noir 8,4:1. Les écrans du jeu restent sombres quel que soit le thème de l'app.
 */
export const COUPE_COLORS = {
  rouge: '#e01f26', // fonds de boutons, pion du joueur (texte blanc dessus)
  rougeVif: '#ff3d44', // rouge écrit sur fond noir
  rougeSombre: '#8e0f14', // dégradé du pion, ombre portée sous l'or
  noir: '#0b0b0c', // fond des écrans
  noir2: '#141416', // cartes
  noir3: '#1e1f22', // cartes en relief, champs
  blanc: '#ffffff',
  blancCasse: '#f2f2f2', // pion de l'adversaire
  grisClair: '#d4d5d8', // textes secondaires sur image
  gris: '#a9abaf', // textes secondaires
  grisSombre: '#55575c', // éléments éteints
  or: '#ebc15e',
  orBord: 'rgba(235, 193, 94, .45)',
  // Étoile du salon : même bleu que dans le fil (règle de l'app, jamais rouge ni or)
  etoile: '#3b82f6',
};
