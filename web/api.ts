/**
 * CALL CENTER - API İstemci Modülü
 * Fetch sarmalayıcı, 401 (oturum süresi dolması) ve 409 (çakışma) yönetimi.
 */

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = path.startsWith('/') ? path : `/api/${path}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData) && !(options.body instanceof Blob)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'same-origin'
  });

  if (response.status === 401) {
    // Oturum süresi doldu veya geçersiz
    const currentHash = window.location.hash;
    if (currentHash && !currentHash.startsWith('#/giris')) {
      sessionStorage.setItem('return_hash', currentHash);
    }
    window.location.hash = '#/giris';
    throw new ApiError(401, 'Oturum süreniz doldu, lütfen tekrar giriş yapın.');
  }

  let data: any = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg = (data && data.error) || response.statusText || 'Bir hata oluştu';
    throw new ApiError(response.status, errorMsg, data);
  }

  return data as T;
}

export const api = {
  get: <T = any>(path: string) => apiRequest<T>(path, { method: 'GET' }),
  post: <T = any>(path: string, body?: any) =>
    apiRequest<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined
    }),
  put: <T = any>(path: string, body?: any) =>
    apiRequest<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined
    }),
  delete: <T = any>(path: string) => apiRequest<T>(path, { method: 'DELETE' })
};
