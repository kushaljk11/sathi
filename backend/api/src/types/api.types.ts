/** Every API response uses one of these two envelopes. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: { code: string; message: string; fields?: Record<string, string[] | undefined> };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}
