import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

//Create a client with authentication required
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: import.meta.env.PROD ? 'https://dhomebarber-api-3aabb8313cb6.herokuapp.com' : '',
  requiresAuth: false,
  appBaseUrl
});
