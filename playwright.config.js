// Vérifications de bout en bout (Playwright) : le build local (`vite preview`) avec une API
// simulée en mémoire (e2e/support/mockApi.js). Aucune requête n'atteint la production.
// `npm run test:e2e` : build puis vérifications ; `npm run test:e2e:fast` : sans refaire le build.
import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;
// Plusieurs séries en parallèle sur le même poste (agents) : chacune son build et son port,
// `E2E_DIST=.verify/dist-a E2E_PORT=4174 npx playwright test --output .verify/results-a`
const PORT = Number(process.env.E2E_PORT) || 4173;
const DIST = process.env.E2E_DIST || '';
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  // Marges plus larges sur les machines de GitHub, plus lentes qu'un poste de développement
  timeout: CI ? 45_000 : 30_000,
  expect: { timeout: CI ? 10_000 : 7_000 },
  reporter: CI ? [['html', { open: 'never' }], ['github']] : [['list']],
  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    // Le service worker de l'app (push, cache) intercepterait les requêtes avant le faux serveur
    serviceWorkers: 'block',
    // Filet de sécurité derrière l'interception (e2e/support/mockApi.js) : une requête vers un
    // autre domaine que le build local qui y échapperait passerait par ce proxy injoignable et
    // échouerait, au lieu d'atteindre la production
    proxy: { server: 'http://127.0.0.1:9', bypass: 'localhost,127.0.0.1' },
    // Animations réduites (chemin prévu par l'app) : les pulsations infinies des boutons d'action
    // (`pulse-cta`, anneaux orbitaux) les rendraient « instables » pour Playwright, qui attend
    // qu'un élément ne bouge plus avant de cliquer
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort${DIST ? ` --outDir ${DIST}` : ''}`,
    url: BASE_URL,
    reuseExistingServer: !CI,
    timeout: 60_000,
  },
});
