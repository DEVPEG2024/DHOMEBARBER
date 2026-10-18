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

// Compte d'un jeton (charge utile du JWT, sans vérification : seulement pour savoir si un autre
// onglet a changé de compte), null s'il est illisible
const tokenUserId = (token) => {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return payload && payload.userId != null ? String(payload.userId) : null;
  } catch {
    return null;
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
  // Valeurs courantes pour l'écouteur `storage` (abonné une seule fois)
  const userRef = useRef(null);
  const isAuthenticatedRef = useRef(false);
  userRef.current = user;
  isAuthenticatedRef.current = isAuthenticated;
  const reloadingRef = useRef(false);
  const meInFlightRef = useRef(false);

  const checkAuth = useCallback(async ({ retry = false, staleRetries = 0 } = {}) => {
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
      // Jeton remplacé pendant la vérification : renouvellement par un autre onglet (deux onglets
      // restaurés ensemble, jeton de plus de 12 h), connexion ou déconnexion. On revérifie une fois
      // avec le jeton rangé maintenant, au lieu de laisser l'écran de connexion à tort. Le `await`
      // garde isLoadingAuth à vrai jusqu'à la fin de la seconde vérification.
      if (err?.stale) {
        if (!hasStoredToken()) { setAuthError(null); return 'signedOut'; }
        if (staleRetries < 1) return await checkAuth({ retry, staleRetries: staleRetries + 1 });
        return 'stale';
      }
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
      if (!hasStoredToken()) {
        // Plus de jeton (déconnexion dans un autre onglet) mais l'interface se croit connectée :
        // on referme la session au lieu de laisser des pages en erreur sous l'ancien nom
        if (isAuthenticatedRef.current) {
          clearSession();
          if (window.location.pathname !== '/login') window.location.assign('/login');
        }
        return;
      }
      // Drapeau posé avant de vider l'état : RequireAuth redirige vers /login (sans expired=1)
      // avant la fin de la fusion des notifications ; la page de connexion le lit pour expliquer
      try { sessionStorage.setItem('dhb-session-expired', '1'); } catch { /* stockage indisponible */ }
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

  // Autres onglets (ordinateur ou tablette partagés) : une déconnexion ailleurs renvoie cet onglet
  // à la connexion ; une connexion à un AUTRE compte recharge la page (sinon cet onglet affichait
  // l'ancien nom et agissait sous le nouveau compte). Un simple renouvellement du jeton du même
  // compte (/me) ne recharge rien : on compare toujours l'id du compte.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.storageArea && e.storageArea !== localStorage) return;
      if (e.key !== null && e.key !== 'base44_access_token' && e.key !== 'token') return;
      if (loggingOutRef.current || reloadingRef.current) return;
      if (!hasStoredToken()) {
        // Déconnexion dans un autre onglet (ou localStorage.clear(), key === null)
        if (!isAuthenticatedRef.current) return;
        clearSession();
        if (window.location.pathname !== '/login') window.location.assign('/login');
        return;
      }
      // Jeton posé ou remplacé : renouvellement du même compte, ou autre compte. Le compte se lit
      // dans le jeton (aucun appel réseau, pas de renouvellements en écho entre onglets) ; /me
      // seulement si le jeton est illisible.
      const reload = () => {
        reloadingRef.current = true;
        queryClientInstance.clear();
        window.location.reload();
      };
      const cur = userRef.current;
      let stored = null;
      try { stored = localStorage.getItem('base44_access_token') || localStorage.getItem('token'); } catch { /* stockage indisponible */ }
      const uid = tokenUserId(stored);
      if (uid) {
        if (cur && String(cur.id) === uid) return; // même compte : rien à faire
        reload();
        return;
      }
      if (meInFlightRef.current) return;
      meInFlightRef.current = true;
      api.auth.me().then((fresh) => {
        if (!fresh || fresh.id == null || reloadingRef.current) return;
        const now = userRef.current;
        if (now && String(now.id) === String(fresh.id)) { setUser(fresh); return; }
        // Autre compte (ou connexion alors que cet onglet était déconnecté) : on repart de zéro
        reload();
      }).catch(() => {}).finally(() => { meInFlightRef.current = false; });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
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
