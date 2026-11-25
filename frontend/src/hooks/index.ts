import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api, errMsg } from '../lib/api';
import { useToast } from '../components/ui';

/** GET helper returning `data` from the { success, data } envelope. */
export function useApi<T>(key: QueryKey, url: string | null, opts: { refetchInterval?: number } = {}) {
  return useQuery({ queryKey: key, enabled: !!url, queryFn: async () => (await api.get(url!)).data.data as T, ...opts });
}

/** Mutation helper with toast feedback and cache invalidation. */
export function useAction<V = void, R = unknown>(fn: (v: V) => Promise<R>, opts: { success?: string | ((r: R) => string); invalidate?: QueryKey[]; onSuccess?: (r: R) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      opts.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      if (opts.success) toast(typeof opts.success === 'function' ? opts.success(r) : opts.success);
      opts.onSuccess?.(r);
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });
}

export const post = <T = unknown>(url: string, body?: unknown) => api.post(url, body).then((r) => r.data.data as T);
export const put  = <T = unknown>(url: string, body?: unknown) => api.put(url, body).then((r) => r.data.data as T);
export const patch = <T = unknown>(url: string, body?: unknown) => api.patch(url, body).then((r) => r.data.data as T);
export const del  = <T = unknown>(url: string) => api.delete(url).then((r) => r.data.data as T);
export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number; pages: number }
