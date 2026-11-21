import axios from 'axios';

// Access token lives in memory only; refresh token is an HttpOnly cookie.
let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;

export const api = axios.create({ baseURL: '/api/v1', withCredentials: true });

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

let refreshing: Promise<string | null> | null = null;
export const refreshSession = () =>
  (refreshing ??= api
    .post('/auth/refresh')
    .then((r) => { setAccessToken(r.data.data.accessToken); return r.data.data.accessToken as string; })
    .catch(() => { setAccessToken(null); return null; })
    .finally(() => { refreshing = null; }));

api.interceptors.response.use(undefined, async (err) => {
  const cfg = err.config;
  if (err.response?.status === 401 && !cfg._retry && !cfg.url.includes('/auth/')) {
    cfg._retry = true;
    if (await refreshSession()) return api(cfg);
  }
  return Promise.reject(err);
});

export const errMsg = (e: unknown) =>
  (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Something went wrong';
