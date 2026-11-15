import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000 // 30s timeout to prevent hanging connections
});

// Attach JWT token to requests
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('textile_auth_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Automatic retry on transient network errors for idempotent GET requests
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as InternalAxiosRequestConfig & { _retryCount?: number };

    // Handle 401 Session Expiration
    if (error.response?.status === 401) {
      localStorage.removeItem('textile_auth_token');
      localStorage.removeItem('textile_auth_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    // Only retry GET requests on network errors or 502/503/504
    const isIdempotent = config && config.method?.toLowerCase() === 'get';
    const isNetworkOr5xx = !error.response || (error.response.status >= 502 && error.response.status <= 504);

    if (config && isIdempotent && isNetworkOr5xx) {
      config._retryCount = config._retryCount || 0;
      if (config._retryCount < 2) {
        config._retryCount += 1;
        const delayMs = config._retryCount * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return api(config);
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Generates a unique idempotency key for financial or mutating requests
 */
export function generateIdempotencyKey(): string {
  return 'idem_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

export default api;
