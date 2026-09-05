import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { api } from '@/api/apiClient';
import { queryClientInstance } from '@/lib/query-client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Check token on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // If there's a token in localStorage, the SDK already set Authorization header
      const token = localStorage.getItem('base44_access_token') || localStorage.getItem('token');
      if (!token) {
        setIsLoadingAuth(false);
        return;
      }

      const currentUser = await api.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
    } catch (err) {
      // Ne jamais effacer le jeton sur une panne réseau : ouvrir l'app dans le métro ou
      // en avion déconnectait définitivement, il fallait retaper son mot de passe.
      // Seule une réponse d'authentification du serveur (401 / 403) invalide la session.
      if (err && (err.status === 401 || err.status === 403)) {
        clearSession();
      } else {
        // Hors ligne : on garde le jeton et on retentera au prochain lancement.
        // L'utilisateur reste « non connecté » le temps de la session, sans rien perdre.
        setUser(null);
        setIsAuthenticated(false);
      }
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // Efface la session : jeton, utilisateur et cache (les réponses dépendent du rôle)
  const clearSession = useCallback(() => {
    localStorage.removeItem('base44_access_token');
    localStorage.removeItem('token');
    queryClientInstance.clear();
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  // Le jeton vit 24 h et la session n'était vérifiée qu'au démarrage : passé ce délai, toutes
  // les requêtes échouaient en 401 alors que l'interface croyait l'utilisateur connecté
  // (listes vides, actions sans effet, aucune invitation à se reconnecter). apiClient émet
  // maintenant `dhb:unauthorized` sur le premier 401 et on referme proprement la session.
  useEffect(() => {
    const onUnauthorized = () => {
      if (!localStorage.getItem('base44_access_token') && !localStorage.getItem('token')) return;
      clearSession();
      if (window.location.pathname !== '/login') {
        window.location.assign(`/login?redirect=${encodeURIComponent(window.location.pathname)}&expired=1`);
      }
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
    return newUser;
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const fullUser = await api.auth.me();
      setUser(fullUser);
    } catch {}
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('base44_access_token');
    localStorage.removeItem('token');
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
      login,
      register,
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
