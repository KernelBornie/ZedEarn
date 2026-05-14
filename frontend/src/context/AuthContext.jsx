import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('ze_token'));
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('ze_user');
    return stored ? JSON.parse(stored) : undefined;
  }); // undefined = loading

  const persistUser = useCallback((data) => {
    setUser(data);
    if (data) {
      localStorage.setItem('ze_user', JSON.stringify(data));
    } else {
      localStorage.removeItem('ze_user');
    }
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem('ze_token');
    localStorage.removeItem('ze_user');
    setToken(null);
    setUser(null);
  }, []);

  const isTokenExpired = (jwtToken) => {
    try {
      const payload = JSON.parse(atob(jwtToken.split('.')[1]));
      return payload.exp ? payload.exp * 1000 < Date.now() : false;
    } catch (err) {
      return true;
    }
  };

  useEffect(() => {
    const handleLogoutEvent = () => {
      clearAuth();
    };
    window.addEventListener('auth:logout', handleLogoutEvent);
    return () => window.removeEventListener('auth:logout', handleLogoutEvent);
  }, [clearAuth]);

  const refreshUser = useCallback(async () => {
    const res = await api.get('/api/auth/me');
    persistUser(res.data.user);
    return res.data.user;
  }, [persistUser]);

  useEffect(() => {
    const handleWalletRefresh = () => {
      if (token) {
        refreshUser().catch(() => null);
      }
    };
    window.addEventListener('wallet:refresh', handleWalletRefresh);
    return () => window.removeEventListener('wallet:refresh', handleWalletRefresh);
  }, [token, refreshUser]);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    if (isTokenExpired(token)) {
      clearAuth();
      return;
    }
    api.get('/api/auth/me')
      .then((res) => {
        persistUser(res.data.user);
      })
      .catch(() => {
        clearAuth();
      });
  }, [token, clearAuth, persistUser]);

  const login = async (credentials) => {
    const res = await api.post('/api/auth/login', credentials);
    const { token: t, user: u } = res.data;
    localStorage.setItem('ze_token', t);
    setToken(t);
    persistUser(u);
    return u;
  };

  const register = async (data) => {
    const res = await api.post('/api/auth/register', data);
    const { token: t, user: u } = res.data;
    localStorage.setItem('ze_token', t);
    setToken(t);
    persistUser(u);
    return u;
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch (err) {
      // ignore logout errors
    } finally {
      clearAuth();
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
