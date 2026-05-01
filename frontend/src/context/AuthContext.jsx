import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [token, setToken] = useState(() => localStorage.getItem('ze_token'));

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    api.get('/api/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('ze_token');
        localStorage.removeItem('ze_user');
      });
  }, [token]);

  const login = async (credentials) => {
    const res = await api.post('/api/auth/login', credentials);
    const { token: t, user: u } = res.data;
    localStorage.setItem('ze_token', t);
    localStorage.setItem('ze_user', JSON.stringify(u));
    setToken(t);
    setUser(u);
    return u;
  };

  const register = async (data) => {
    const res = await api.post('/api/auth/register', data);
    const { token: t, user: u } = res.data;
    localStorage.setItem('ze_token', t);
    localStorage.setItem('ze_user', JSON.stringify(u));
    setToken(t);
    setUser(u);
    return u;
  };

  const logout = () => {
    localStorage.removeItem('ze_token');
    localStorage.removeItem('ze_user');
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    const res = await api.get('/api/auth/me');
    setUser(res.data.user);
    return res.data.user;
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
