import { defineConfig } from '@playwright/test'
import { SLOWER, TIME_SCALE } from './e2e/env.ts'

const PORT = 3100

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000 * SLOWER,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    // PW_SLOWMO=500: a pause before every click and keystroke, for watching a run (with --headed)
    launchOptions: { slowMo: Number(process.env.PW_SLOWMO) || undefined },
  },
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
      FERMI_TIME_SCALE: String(TIME_SCALE),
      // with FERMI_VOICE=1: render only what the game says, not every sentence she knows
      FERMI_VOICE_SWEEP: process.env.FERMI_VOICE_SWEEP ?? '0',
    },
  },
})
