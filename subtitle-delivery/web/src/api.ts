let currentUser = '译员A';

export function setCurrentUser(u: string) {
  currentUser = u;
}

export function getCurrentUser() {
  return currentUser;
}

export interface ApiError {
  status: number;
  body: any;
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      // 中文用户名不能直接放进 HTTP 头（latin-1 限制），URI 编码后传输
      'x-user': encodeURIComponent(currentUser),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw { status: res.status, body } as ApiError;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

export function newIdemKey(): string {
  return crypto.randomUUID();
}
