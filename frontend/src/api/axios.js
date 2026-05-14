import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5001/api',
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ze_token');
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ze_token');
      localStorage.removeItem('ze_user');
      window.dispatchEvent(new Event('auth:logout'));
      const path = window.location.pathname;
      const authRoutes = ['/login', '/register', '/forgot-password', '/verify-otp', '/reset-password'];
      if (!authRoutes.includes(path)) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
