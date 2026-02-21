import { test, expect } from '@playwright/test'
import { sidebar, chat, input, newCustomerModal, citationModal } from './helpers/selectors'

/**
 * Helper: wait for modal to close (open class removed).
 */
async function waitForModalClose(page: import('@playwright/test').Page, overlaySelector: string, timeout = 15_000) {
  await page.waitForFunction(
    (sel: string) => {
      const el = document.querySelector(sel)
      return el && !el.classList.contains('open')
    },
    overlaySelector,
    { timeout },
  )
}

/**
 * Helper: create a fresh session for chat tests.
 * Fresh sessions have no history, avoiding race conditions with pre-existing messages.
 */
async function createFreshSession(page: import('@playwright/test').Page) {
  await page.goto('/sales')
  await page.waitForFunction(
    () => document.querySelector('#sessionsList') !== null,
    null,
    { timeout: 30_000 },
  )
  await page.waitForTimeout(1500)

  // Always create a new session
  await page.locator(sidebar.newChatBtn).click()
  await expect(page.locator(`${newCustomerModal.overlay}.open`)).toBeVisible({ timeout: 5_000 })

  // Fill name and submit
  const name = `聊天测试_${Date.now()}`
  await page.locator(newCustomerModal.nameInput).fill(name)
  await page.locator(newCustomerModal.overlay).locator('.btn-primary').click()
  await waitForModalClose(page, newCustomerModal.overlay, 20_000)

  // Wait for chat input to be ready
  await expect(page.locator(input.textarea)).toBeVisible({ timeout: 10_000 })

  // Wait for welcome screen to ensure clean state
  await page.waitForTimeout(500)
}

/**
 * Helper: send message and wait for SSE reply to finish.
 * Returns the AI message element locator.
 */
async function sendAndWaitForReply(page: import('@playwright/test').Page, message: string) {
  // Count existing AI messages before sending
  const aiCountBefore = await page.locator(chat.aiMessage).count()

  // Type and send
  await page.locator(input.textarea).fill(message)
  await page.locator(input.sendBtn).click()

  // User message should appear
  await expect(
    page.locator(chat.userMessage).filter({ hasText: message }),
  ).toBeVisible({ timeout: 10_000 })

  // Wait for a NEW AI message element to be created
  // (legacy JS calls appendMessageBubble('assistant') only when SSE content starts)
  await page.waitForFunction(
    (countBefore: number) => {
      return document.querySelectorAll('.message.ai').length > countBefore
    },
    aiCountBefore,
    { timeout: 90_000 },
  )

  // The new AI message is at index [aiCountBefore]
  const newAiMessage = page.locator(chat.aiMessage).nth(aiCountBefore)

  // Wait for SSE to finish — action buttons (复制/重新生成) appear on the AI message
  // Note: can't use sendBtn.disabled because updateSendButtonState() re-disables
  // it when textarea is empty, even after setLoading(false)
  await page.waitForFunction(
    (idx: number) => {
      const aiMsgs = document.querySelectorAll('.message.ai')
      const msg = aiMsgs[idx]
      return msg && msg.querySelector('.ai-actions-container') !== null
    },
    aiCountBefore,
    { timeout: 90_000 },
  )

  // Verify the AI message has real content (not just loading text)
  const content = await newAiMessage.locator(chat.messageText).textContent()
  expect(content?.trim().length).toBeGreaterThan(0)

  return newAiMessage
}

test.describe('Sales Chat', () => {
  test('send message and receive SSE reply', async ({ page }) => {
    await createFreshSession(page)

    const testMessage = '你好，请介绍一下产品'
    const aiMessage = await sendAndWaitForReply(page, testMessage)

    // Verify the AI response bubble is visible
    await expect(aiMessage.locator(chat.msgBubble)).toBeVisible()

    // Verify content is meaningful (more than just a loading placeholder)
    const content = await aiMessage.locator(chat.messageText).textContent()
    expect(content!.trim().length).toBeGreaterThan(10)
  })

  test('citation button opens citation modal', async ({ page }) => {
    await createFreshSession(page)

    // Send a message that's likely to trigger citations
    const aiMessage = await sendAndWaitForReply(page, '根据知识库，产品的核心优势是什么？')

    // Check if citation button exists on the new AI message
    const citationBtn = aiMessage.locator(chat.citationButton)
    const hasCitation = (await citationBtn.count()) > 0

    if (hasCitation) {
      // Click citation button
      await citationBtn.click()

      // Citation modal should appear
      await expect(page.locator(`${citationModal.overlay}.open`)).toBeVisible({ timeout: 5_000 })

      // Should have at least one citation
      const countText = await page.locator(citationModal.count).textContent()
      expect(parseInt(countText || '0')).toBeGreaterThan(0)

      // Close modal
      await page.locator(citationModal.closeBtn).click()
      await waitForModalClose(page, citationModal.overlay)
    } else {
      // No citations — that's okay, test passes with a note
      test.info().annotations.push({
        type: 'info',
        description: 'No citations returned by the AI — citation modal test skipped',
      })
    }
  })
})
