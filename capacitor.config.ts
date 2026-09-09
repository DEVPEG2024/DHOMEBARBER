import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.dhomebarber.app',
  appName: "D'Home Barber",
  webDir: 'dist',
  server: {
    // En dev, pointer vers le serveur Vite local
    // url: 'http://192.168.1.X:5173',
    // cleartext: true,
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1a1a2e',
      showSpinner: false,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a1a2e',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      // `native` : la WKWebView elle-même est réduite de la hauteur du clavier. Avec `body`,
      // Apple a constaté (review du 9 sept. 2026, iPad Air 11" en mode compatibilité iPhone)
      // que le clavier recouvrait les champs de connexion : la hauteur rapportée au JS ne
      // correspondait pas à la fenêtre réduite. Complété par src/lib/capacitor.js (défilement
      // du champ actif, repli visualViewport).
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
