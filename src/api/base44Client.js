import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// Fallback appId to prevent null in API URLs
const resolvedAppId = appId || import.meta.env.VITE_BASE44_APP_ID || 'prod';

//Create a client with authentication required
export const base44 = createClient({
  appId: resolvedAppId,
  token,
  functionsVersion,
  serverUrl: import.meta.env.PROD ? 'https://dhomebarber-api-3aabb8313cb6.herokuapp.com' : '',
  requiresAuth: false,
  appBaseUrl
});
