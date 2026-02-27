import { test as setup, expect } from '@playwright/test'
import { auth } from './helpers/selectors'

const authFile = 'e2e/.auth/user.json'

setup('login and cache auth state', async ({ page }) => {
  const username = process.env.E2E_USERNAME
  const password = process.env.E2E_PASSWORD

  if (!username || !password) {
    throw new Error(
      'Missing E2E_USERNAME or E2E_PASSWORD env vars. ' +
        'Run with: E2E_USERNAME=xxx E2E_PASSWORD=xxx npm run test:e2e',
    )
  }

  // Navigate to login page
  await page.goto('/login')
  await expect(page.locator(auth.loginButton)).toBeVisible()

  // Fill credentials
  await page.locator(auth.usernameInput).fill(username)
  await page.locator(auth.passwordInput).fill(password)

  // Submit
  await page.locator(auth.loginButton).click()

  // Wait for redirect to home (login success stores token → router pushes to /)
  await expect(page).toHaveURL('/', { timeout: 15_000 })

  // Verify token exists in localStorage
  const token = await page.evaluate(() => localStorage.getItem('token'))
  expect(token).toBeTruthy()

  // Save auth state (cookies + localStorage)
  await page.context().storageState({ path: authFile })
})
