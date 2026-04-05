import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

const PUBLIC_PATHS = new Set(['/', '/login', '/register', '/forgot-password', '/verify-totp']);

function isPublicPath(pathname) {
  return PUBLIC_PATHS.has(pathname);
}

// Response interceptor: handle 401 (token expired)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const requestUrl = originalRequest.url || '';
    const isAuthEndpoint = requestUrl.includes('/auth/login')
      || requestUrl.includes('/auth/refresh')
      || requestUrl.includes('/auth/logout');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      // Try refresh
      originalRequest._retry = true;
      try {
        await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        return api(originalRequest);
      } catch (refreshError) {
        const currentPath = window.location.pathname;
        const isSessionBootstrap = requestUrl.includes('/auth/me');

        if (isSessionBootstrap || isPublicPath(currentPath)) {
          return Promise.reject(error);
        }

        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
