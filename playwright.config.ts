import { defineConfig } from '@playwright/test'

const PORT = 3100

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: `rm -f test-results/e2e.db* && pnpm --filter @fermi/client build && node apps/server/src/index.ts`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      FERMI_DB: 'test-results/e2e.db',
      FERMI_ADMIN_TOKEN: 'e2e-token',
      FERMI_TIME_SCALE: '0.25',
    },
  },
})
