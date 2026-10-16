/**
 * D'Home Barber API client.
 *
 * Exposes the interface used across the app:
 *   api.entities.<Entity>.list(sort, limit, skip)
 *   api.entities.<Entity>.filter(query, sort, limit, skip)
 *   api.entities.<Entity>.create(data)
 *   api.entities.<Entity>.update(id, data)
 *   api.entities.<Entity>.delete(id)
 *   api.auth.me()
 *   api.auth.loginViaEmailPassword(email, password)
 *   api.auth.register(data)
 *   api.auth.logout()
 *   api.auth.setToken(token)
 *   api.integrations.Core.UploadFile({ file })
 *   api.integrations.Core.SendEmail(data)
 */

import { compressImage } from '@/lib/imageCompress';

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
    // Jeton expiré ou révoqué en cours d'utilisation : AuthContext écoute cet événement
    // pour refermer la session et renvoyer vers la connexion, au lieu de laisser
    // l'interface afficher des listes vides en se croyant connectée.
    // (les routes d'authentification sont exclues : un mot de passe erroné répond 401 aussi).
    // Seulement si le jeton refusé est encore celui de la session : une requête partie avant une
    // déconnexion ou une connexion à un autre compte ne doit pas fermer la nouvelle session.
    if (res.status === 401 && typeof window !== 'undefined' && !url.includes('/auth/') && getToken() === token) {
      window.dispatchEvent(new CustomEvent('dhb:unauthorized'));
    }
    throw err;
  }

  return data;
}

// ── Entities module (Proxy-based, dynamic) ───────────────────────────
function createEntityHandler(entityName) {
  const base = `${API_BASE}/entities/${entityName}`;

  return {
    /**
     * list(sort?, limit?, skip?)
     * GET /entities/:name?sort=X&limit=N&skip=M
     * `skip` (OFFSET côté serveur) sert à la pagination : on ne rapatrie
     * plus des listes entières (le fil et les écrans admin chargeaient
     * des centaines de lignes avec leurs images).
     */
    async list(sort, limit, skip) {
      const params = new URLSearchParams();
      if (sort) params.set('sort', sort);
      if (limit != null) params.set('limit', String(limit));
      if (skip) params.set('skip', String(skip));
      const qs = params.toString();
      return request('GET', qs ? `${base}?${qs}` : base);
    },

    /**
     * filter(query, sort?, limit?, skip?)
     * GET /entities/:name?q=JSON&sort=X&limit=N&skip=M
     */
    async filter(query, sort, limit, skip) {
      const params = new URLSearchParams();
      if (query) params.set('q', JSON.stringify(query));
      if (sort) params.set('sort', sort);
      if (limit != null) params.set('limit', String(limit));
      if (skip) params.set('skip', String(skip));
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
  /**
   * GET /entities/User/me. Pour un client, le serveur renvoie aussi `access_token` quand le
   * jeton a plus de 12 h : la session est ainsi prolongée d'un an à chaque ouverture de l'app
   * (un client n'est jamais déconnecté). Le jeton est rangé ici et retiré de l'utilisateur.
   *
   * Course au renouvellement : si le jeton rangé a changé pendant la requête (déconnexion,
   * connexion à un autre compte), la réponse concerne l'ancienne session. On ne range alors
   * pas son `access_token` (il réécrirait l'ancien jeton par-dessus la nouvelle session) et on
   * rejette avec `err.stale = true` : l'appelant ne doit pas non plus reprendre l'ancien compte.
   */
  async me() {
    const sentToken = getToken();
    const staleError = () => {
      const err = new Error('Session changée pendant la vérification');
      err.stale = true;
      return err;
    };
    let data;
    try {
      data = await request('GET', `${API_BASE}/entities/User/me`);
    } catch (err) {
      // Un 401 de l'ancien jeton ne dit rien de la nouvelle session
      if (getToken() !== sentToken) throw staleError();
      throw err;
    }
    if (getToken() !== sentToken) throw staleError();
    if (data && typeof data === 'object' && data.access_token) {
      saveToken(data.access_token);
      const { access_token: _renewed, ...user } = data;
      return user;
    }
    return data;
  },

  /** POST /auth/login */
  async loginViaEmailPassword(email, password) {
    const data = await request('POST', `${API_BASE}/auth/login`, { email, password });
    if (data?.access_token) {
      saveToken(data.access_token);
    }
    return data;
  },

  /**
   * POST /auth/logout avec le jeton en cours : le serveur coupe le jeton d'un barber ou d'un
   * admin (un client n'est jamais déconnecté, rien n'est fait pour lui). Le jeton local n'est
   * pas effacé ici : c'est le rôle d'AuthContext.logout. Un 401 n'émet pas `dhb:unauthorized`
   * (route `/auth/`).
   */
  async logout() {
    if (!getToken()) return null;
    return request('POST', `${API_BASE}/auth/logout`);
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
    /**
     * POST /integration-endpoints/Core/UploadFile (multipart).
     * Les images sont compressées côté client avant l'envoi (voir lib/imageCompress.js).
     * Le serveur renvoie une URL vers /api/media/<id> : les listes ne transportent plus d'images.
     */
    async UploadFile({ file }) {
      // Le HEIC des iPhone n'est décodable par aucun navigateur hors Safari : la compression
      // le laisse passer tel quel et le serveur le refuse avec « Fichier non reconnu comme
      // image ». On le dit ici, avec le réglage à changer, plutôt que de laisser deviner.
      const name = String(file?.name || '').toLowerCase();
      const type = String(file?.type || '').toLowerCase();
      if (/\.(heic|heif)$/.test(name) || type.includes('heic') || type.includes('heif')) {
        throw new Error(
          "Cette photo est au format HEIC, que l'app ne sait pas lire. Sur iPhone : Réglages → "
          + 'Appareil photo → Formats → « Le plus compatible », puis reprenez la photo.'
        );
      }
      const upload = await compressImage(file);
      const formData = new FormData();
      formData.append('file', upload, upload.name || file.name);
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
