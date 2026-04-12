import axios from 'axios';
import { showRateLimitToast } from '../components/RateLimitToast';

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

// Response interceptor: handle 401 (token expired) and 429 (rate limited)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const requestUrl = originalRequest.url || '';
    const isAuthEndpoint = requestUrl.includes('/auth/login')
      || requestUrl.includes('/auth/refresh')
      || requestUrl.includes('/auth/logout');

    // Handle 429/503 rate limit — retry once after delay, then notify user
    if ((error.response?.status === 429 || error.response?.status === 503) && !originalRequest._rateLimitRetry) {
      originalRequest._rateLimitRetry = true;
      const retryAfter = parseInt(error.response.headers['retry-after'] || '3', 10);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      return api(originalRequest);
    }

    // If still rate limited after retry, show clear notification to user
    if (error.response?.status === 429 && originalRequest._rateLimitRetry) {
      const detail = error.response?.data?.detail || 'You have been rate limited. Please try again later.';
      showRateLimitToast(detail);
    }

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      // Try refresh
      originalRequest._retry = true;
      try {
        await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        return api(originalRequest);
      } catch (refreshError) {
        // If refresh itself was rate-limited, don't logout
        if (refreshError.response?.status === 429) {
          return Promise.reject(error);
        }
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
