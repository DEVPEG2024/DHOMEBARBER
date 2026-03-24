import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { api } from '@/api/apiClient';

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
    } catch {
      // Token invalid or expired - clear it
      localStorage.removeItem('base44_access_token');
      localStorage.removeItem('token');
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const login = useCallback(async (email, password) => {
    await api.auth.loginViaEmailPassword(email, password);
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
