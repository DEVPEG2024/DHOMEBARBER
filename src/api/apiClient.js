/**
 * D'Home Barber API client.
 *
 * Exposes the interface used across the app:
 *   api.entities.<Entity>.list(sort, limit)
 *   api.entities.<Entity>.filter(query, sort, limit)
 *   api.entities.<Entity>.create(data)
 *   api.entities.<Entity>.update(id, data)
 *   api.entities.<Entity>.delete(id)
 *   api.auth.me()
 *   api.auth.loginViaEmailPassword(email, password)
 *   api.auth.register(data)
 *   api.auth.setToken(token)
 *   api.integrations.Core.UploadFile({ file })
 *   api.integrations.Core.SendEmail(data)
 */

export const resolvedAppId = 'prod';
export const API_SERVER_URL = 'https://dhomebarber-api-3aabb8313cb6.herokuapp.com';

const API_BASE = `${API_SERVER_URL}/api/apps/${resolvedAppId}`;

// ── Token management ─────────────────────────────────────────────────
function getToken() {
  return localStorage.getItem('base44_access_token') || localStorage.getItem('token') || '';
}

function saveToken(token) {
  localStorage.setItem('base44_access_token', token);
  localStorage.setItem('token', token);
}

function removeToken() {
  localStorage.removeItem('base44_access_token');
  localStorage.removeItem('token');
}

// ── HTTP helpers ─────────────────────────────────────────────────────
async function request(method, url, body) {
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };

  if (body !== undefined) {
    // FormData is sent as-is (browser sets Content-Type with boundary)
    if (body instanceof FormData) {
      opts.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }

  const res = await fetch(url, opts);
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// ── Entities module (Proxy-based, dynamic) ───────────────────────────
function createEntityHandler(entityName) {
  const base = `${API_BASE}/entities/${entityName}`;

  return {
    /**
     * list(sort?, limit?)
     * GET /entities/:name?sort=X&limit=N
     */
    async list(sort, limit) {
      const params = new URLSearchParams();
      if (sort) params.set('sort', sort);
      if (limit != null) params.set('limit', String(limit));
      const qs = params.toString();
      return request('GET', qs ? `${base}?${qs}` : base);
    },

    /**
     * filter(query, sort?, limit?)
     * GET /entities/:name?q=JSON&sort=X&limit=N
     */
    async filter(query, sort, limit) {
      const params = new URLSearchParams();
      if (query) params.set('q', JSON.stringify(query));
      if (sort) params.set('sort', sort);
      if (limit != null) params.set('limit', String(limit));
      const qs = params.toString();
      return request('GET', qs ? `${base}?${qs}` : base);
    },

    /**
     * create(data)
     * POST /entities/:name
     */
    async create(data) {
      return request('POST', base, data);
    },

    /**
     * update(id, data)
     * PUT /entities/:name/:id
     */
    async update(id, data) {
      return request('PUT', `${base}/${id}`, data);
    },

    /**
     * delete(id)
     * DELETE /entities/:name/:id
     */
    async delete(id) {
      return request('DELETE', `${base}/${id}`);
    },
  };
}

const entitiesProxy = new Proxy(
  {},
  {
    get(_target, entityName) {
      return createEntityHandler(entityName);
    },
  }
);

// ── Auth module ──────────────────────────────────────────────────────
const auth = {
  /** GET /entities/User/me */
  async me() {
    return request('GET', `${API_BASE}/entities/User/me`);
  },

  /** POST /auth/login */
  async loginViaEmailPassword(email, password) {
    const data = await request('POST', `${API_BASE}/auth/login`, { email, password });
    if (data?.access_token) {
      saveToken(data.access_token);
    }
    return data;
  },

  /** POST /auth/register */
  async register(payload) {
    return request('POST', `${API_BASE}/auth/register`, payload);
  },

  /** Store token in localStorage */
  setToken(token) {
    saveToken(token);
  },
};

// ── Integrations module ──────────────────────────────────────────────
const integrations = {
  Core: {
    /** POST /integration-endpoints/Core/UploadFile */
    async UploadFile({ file }) {
      const formData = new FormData();
      formData.append('file', file, file.name);
      return request('POST', `${API_BASE}/integration-endpoints/Core/UploadFile`, formData);
    },

    /** POST /integration-endpoints/Core/SendEmail */
    async SendEmail(data) {
      return request('POST', `${API_BASE}/integration-endpoints/Core/SendEmail`, data);
    },
  },
};

// ── Direct API helper (for custom endpoints like /cleaning, /leave, /push) ──
export { request as apiRequest, API_BASE, getToken };

/** Build full URL for custom endpoints, e.g. apiUrl('/cleaning/history') */
export function apiUrl(path) {
  return `${API_BASE}${path}`;
}

// ── Exported client ──────────────────────────────────────────────────
export const api = {
  entities: entitiesProxy,
  auth,
  integrations,
};
