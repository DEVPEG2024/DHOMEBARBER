import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { api } from '@/api/apiClient';
import { queryClientInstance } from '@/lib/query-client';
import { syncPushSubscription, detachPushFromAccount, setNotificationsOwner, syncServiceWorkerNotifications } from '@/lib/pushNotifications';

// Délai maximal accordé à la désinscription push avant de déconnecter quand même
const LOGOUT_PUSH_TIMEOUT = 2000;

const hasStoredToken = () => {
  try {
    return !!(localStorage.getItem('base44_access_token') || localStorage.getItem('token'));
  } catch {
    return false;
  }
};

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  // Vrai juste après une inscription : l'écran « Bienvenue ! » de Login (installer l'app,
  // activer les notifications) s'affiche avant la redirection (GuestOnly, App.jsx).
  const [welcomePending, setWelcomePending] = useState(false);
  // Session impossible à vérifier au lancement alors qu'un jeton existe : `{ type: 'network' }`
  // (pas de réponse : hors ligne) ou `{ type: 'server' }` (serveur en panne, 5xx). Login affiche
  // alors « Pas de connexion internet » avec Réessayer au lieu du formulaire.
  const [authError, setAuthError] = useState(null);
  const [isRetryingAuth, setIsRetryingAuth] = useState(false);
  // Déconnexion en cours : le 401 éventuel de la désinscription push (jeton déjà expiré,
  // compte supprimé) ne doit pas déclencher « session expirée »
  const loggingOutRef = useRef(false);

  const checkAuth = useCallback(async ({ retry = false } = {}) => {
    if (retry) setIsRetryingAuth(true);
    try {
      // If there's a token in localStorage, the SDK already set Authorization header
      if (!hasStoredToken()) {
        setAuthError(null);
        return 'signedOut';
      }

      const currentUser = await api.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
      // Rattache l'appareil au compte (jeton push obtenu hors session, autorisation déjà donnée)
      syncPushSubscription();
      return 'ok';
    } catch (err) {
      // Jeton changé pendant la vérification (déconnexion, connexion à un autre compte) : la
      // réponse concerne l'ancienne session, la nouvelle a déjà posé son propre état
      if (err?.stale) return 'stale';
      // Ne jamais effacer le jeton sur une panne réseau : ouvrir l'app dans le métro ou
      // en avion déconnectait définitivement, il fallait retaper son mot de passe.
      // Seule une réponse d'authentification du serveur (401 / 403) invalide la session.
      if (err && (err.status === 401 || err.status === 403)) {
        clearSession();
        setAuthError(null);
        return 'signedOut';
      } else {
        // Hors ligne : on garde le jeton, l'écran « Pas de connexion internet » propose de
        // réessayer et on retente seul au retour du réseau (événement « online » ci-dessous).
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: err?.status ? 'server' : 'network' });
        return 'failed';
      }
    } finally {
      setIsLoadingAuth(false);
      if (retry) setIsRetryingAuth(false);
    }
  // clearSession est stable (useCallback sans dépendance) : pas besoin de la lister
  }, []);

  // Check token on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // « Réessayer » de l'écran hors ligne : 'ok' | 'failed' (toujours injoignable) | 'signedOut'
  const retryAuth = useCallback(() => checkAuth({ retry: true }), [checkAuth]);
  // « Se connecter avec un autre compte » : on oublie l'échec (le jeton reste jusqu'à la
  // connexion suivante) et on cesse de retenter, sinon le retour du réseau rouvrait l'ancien
  // compte pendant que le client se connecte avec un autre
  const dismissAuthError = useCallback(() => setAuthError(null), []);

  // App restée ouverte en arrière-plan plusieurs jours (cas courant sur téléphone) : au retour
  // au premier plan, /me prolonge la session (nouveau jeton d'un an pour un client). Silencieux :
  // une panne réseau ne change rien, un vrai 401 passe par `dhb:unauthorized` comme ailleurs.
  // Réponse arrivée après une déconnexion ou un changement de compte : `api.auth.me` la rejette
  // (`stale`) sans ranger son jeton, l'ancien utilisateur ne revient donc pas.
  const lastSessionCheckRef = useRef(Date.now());
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const RENEW_EVERY_MS = 6 * 3600 * 1000;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastSessionCheckRef.current < RENEW_EVERY_MS) return;
      lastSessionCheckRef.current = Date.now();
      api.auth.me().then((fresh) => { if (fresh && fresh.id != null) setUser(fresh); }).catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isAuthenticated]);

  // Retour du réseau : nouvelle vérification de la session, sans geste du client
  useEffect(() => {
    if (!authError) return undefined;
    const onOnline = () => { checkAuth({ retry: true }); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [authError, checkAuth]);

  // Centre de notifications rangé par compte : les notifications reçues sur l'appareil
  // (y compris au lancement, avant la fin de cette vérification) vont au dernier compte connecté
  useEffect(() => {
    if (user?.id != null) setNotificationsOwner(user.id);
  }, [user?.id]);

  // Efface la session : jeton, utilisateur et cache (les réponses dépendent du rôle).
  // Web : les notifications reçues app fermée (file du service worker) sont d'abord rattachées
  // au compte qui s'en va, sinon le compte suivant sur ce navigateur les récupérait. Le
  // propriétaire est lu tout de suite (avant tout await) : la fusion va bien à ce compte même
  // s'il est remis à null juste après. Renvoie la promesse de cette fusion (0 sur le natif).
  const clearSession = useCallback(() => {
    localStorage.removeItem('base44_access_token');
    localStorage.removeItem('token');
    queryClientInstance.clear();
    const swSync = syncServiceWorkerNotifications().catch(() => 0);
    setNotificationsOwner(null);
    setUser(null);
    setIsAuthenticated(false);
    setWelcomePending(false);
    return swSync;
  }, []);

  // Le jeton vit 24 h et la session n'était vérifiée qu'au démarrage : passé ce délai, toutes
  // les requêtes échouaient en 401 alors que l'interface croyait l'utilisateur connecté
  // (listes vides, actions sans effet, aucune invitation à se reconnecter). apiClient émet
  // maintenant `dhb:unauthorized` sur le premier 401 et on referme proprement la session.
  useEffect(() => {
    const onUnauthorized = () => {
      if (loggingOutRef.current) return;
      if (!localStorage.getItem('base44_access_token') && !localStorage.getItem('token')) return;
      // On attend la fusion des notifications (2 s au plus) avant de rediriger : le
      // déchargement de la page interromprait la transaction IndexedDB en cours
      const done = clearSession();
      Promise.race([done, new Promise((resolve) => setTimeout(resolve, 2000))]).then(() => {
        if (window.location.pathname !== '/login') {
          const back = window.location.pathname + window.location.search;
          window.location.assign(`/login?redirect=${encodeURIComponent(back)}&expired=1`);
        }
      });
    };
    window.addEventListener('dhb:unauthorized', onUnauthorized);
    return () => window.removeEventListener('dhb:unauthorized', onUnauthorized);
  }, [clearSession]);

  const login = useCallback(async (email, password) => {
    await api.auth.loginViaEmailPassword(email, password);
    // Les réponses de l'API dépendent du rôle (champs masqués en anonyme) :
    // on vide le cache React Query pour ne pas réutiliser des données anonymes.
    queryClientInstance.clear();
    // Fetch full user with permissions from /me endpoint
    const fullUser = await api.auth.me();
    setUser(fullUser);
    setIsAuthenticated(true);
    setAuthError(null);
    syncPushSubscription();
    return fullUser;
  }, []);

  const register = useCallback(async ({ email, password, full_name, phone }) => {
    const result = await api.auth.register({ email, password, full_name, phone });
    const { access_token, user: newUser } = result;
    if (access_token) {
      api.auth.setToken(access_token);
    }
    queryClientInstance.clear();
    setUser(newUser);
    setIsAuthenticated(true);
    setAuthError(null);
    setWelcomePending(true);
    syncPushSubscription();
    return newUser;
  }, []);

  // « Commencer » / « Passer cette étape » de l'écran de bienvenue : GuestOnly redirige
  const dismissWelcome = useCallback(() => setWelcomePending(false), []);

  const refreshUser = useCallback(async () => {
    try {
      const fullUser = await api.auth.me();
      setUser(fullUser);
    } catch {}
  }, []);

  /**
   * Déconnexion. L'appareil est d'abord détaché du compte côté serveur (sinon les rappels du
   * compte qui s'en va continuaient d'arriver), au plus 2 s et sans bloquer sur une erreur.
   * `logout({ detachPush: false })` saute cette étape (compte supprimé : le serveur a déjà tout
   * effacé). Utilisable directement en `onClick` (l'événement reçu est ignoré).
   */
  const logout = useCallback(async (options) => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    if (options?.detachPush !== false) {
      // Dans la limite de 2 s : détachement des notifications, PUIS coupure du jeton côté serveur
      // (barber, admin ; sans effet pour un client) — dans cet ordre, le détachement a encore
      // besoin d'un jeton valable. Jamais bloquant, jamais d'erreur affichée. Pas d'appel pour un
      // compte supprimé (`detachPush: false`).
      await Promise.race([
        (async () => {
          await detachPushFromAccount().catch(() => {});
          await api.auth.logout().catch(() => {});
        })(),
        new Promise((resolve) => setTimeout(resolve, LOGOUT_PUSH_TIMEOUT)),
      ]);
    }
    localStorage.removeItem('base44_access_token');
    localStorage.removeItem('token');
    // Web : notifications reçues app fermée rattachées au compte qui s'en va (propriétaire
    // encore en place), sinon le compte suivant sur ce navigateur les voyait. 2 s au plus.
    await Promise.race([
      syncServiceWorkerNotifications().catch(() => 0),
      new Promise((resolve) => setTimeout(resolve, LOGOUT_PUSH_TIMEOUT)),
    ]);
    setNotificationsOwner(null);
    setUser(null);
    setIsAuthenticated(false);
    // Redirect to home
    window.location.href = '/';
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      authError,
      isRetryingAuth,
      retryAuth,
      dismissAuthError,
      welcomePending,
      login,
      register,
      dismissWelcome,
      logout,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
