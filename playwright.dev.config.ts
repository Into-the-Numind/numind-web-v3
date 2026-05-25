import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://49.233.219.254:9200',
    screenshot: 'only-on-failure'
  }
})
