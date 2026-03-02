import { test } from '@playwright/test'
import { createDiagnostics } from './helpers/diagnose'

test('diagnose: ghost bookmark auto-restore on template workflow', async ({ page }) => {
  const diag = createDiagnostics(page)

  // Step 1: Check what bookmarks exist for each template
  console.log('\n=== STEP 1: Check existing bookmarks for all templates ===')

  // Get all templates first
  await page.goto('/')
  await page.waitForTimeout(2000)

  const token = await page.evaluate(() => localStorage.getItem('token'))
  console.log(`Token exists: ${!!token}`)

  // Fetch templates list
  const templatesRes = await page.evaluate(async () => {
    const res = await fetch('/api/v1/sop/templates', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
    return res.json()
  })
  const templates = (templatesRes as any)?.data?.templates || []
  console.log(`\nFound ${templates.length} templates:`)
  for (const t of templates) {
    console.log(`  Template ${t.ID}: ${t.name}`)
  }

  // For each template, check bookmarks
  for (const t of templates) {
    const bookmarksRes = await page.evaluate(async (templateId: number) => {
      const res = await fetch(`/api/v1/sop/templates/${templateId}/bookmarks`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
      return res.json()
    }, t.ID)

    const bookmarks = (bookmarksRes as any)?.data?.bookmarks || (bookmarksRes as any)?.data || []
    const count = Array.isArray(bookmarks) ? bookmarks.length : 0
    console.log(`\n  Template ${t.ID} (${t.name}): ${count} bookmarks`)
    if (count > 0) {
      for (const b of (Array.isArray(bookmarks) ? bookmarks : [])) {
        console.log(`    Bookmark ID=${b.id || b.ID}, NodeID=${b.node_id || b.NodeID}, NodeSort=${b.node_sort || b.NodeSort}, Name="${b.bookmark_name || b.BookmarkName || '(unnamed)'}"`)
        console.log(`    Input: ${JSON.stringify(b.input || b.Input || '').slice(0, 100)}`)
        console.log(`    Output: ${JSON.stringify(b.output || b.Output || '').slice(0, 100)}`)
      }
    }
  }

  // Step 2: Create a run for template 2 with auto_apply_bookmarks
  console.log('\n=== STEP 2: Create Run with auto_apply_bookmarks for template 2 ===')
  const createRunRes = await page.evaluate(async () => {
    const res = await fetch('/api/v1/sop/runs', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template_id: 2,
        text: '',
        auto_apply_bookmarks: true,
      }),
    })
    return res.json()
  })
  console.log('CreateRun response:', JSON.stringify(createRunRes, null, 2))

  const runId = (createRunRes as any)?.data?.id
  const autoAppliedCount = (createRunRes as any)?.data?.auto_applied_count

  console.log(`\n  Run ID: ${runId}`)
  console.log(`  Auto applied count: ${autoAppliedCount}`)
  console.log(`  Status: ${(createRunRes as any)?.data?.status}`)

  // Step 3: Check run status to see completed nodes
  if (runId) {
    console.log('\n=== STEP 3: Check Run status for completed nodes ===')
    const statusRes = await page.evaluate(async (id: number) => {
      const res = await fetch(`/api/v1/sop/runs/${id}/status`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
      return res.json()
    }, runId)

    const statusData = (statusRes as any)?.data
    console.log('Run status:', JSON.stringify(statusData, null, 2).slice(0, 2000))

    // Delete the draft run to clean up
    console.log('\n=== CLEANUP: Delete draft run ===')
    await page.evaluate(async (id: number) => {
      await fetch(`/api/v1/sop/runs/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
    }, runId)
    console.log('Draft run deleted')
  }

  // Step 4: Also check template 3 (template 1 in user's terms) for comparison
  console.log('\n=== STEP 4: Create Run for template 3 (comparison) ===')
  const createRunRes2 = await page.evaluate(async () => {
    const res = await fetch('/api/v1/sop/runs', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template_id: 3,
        text: '',
        auto_apply_bookmarks: true,
      }),
    })
    return res.json()
  })
  console.log('CreateRun template 3 response:', JSON.stringify(createRunRes2, null, 2))

  const runId2 = (createRunRes2 as any)?.data?.id
  if (runId2) {
    await page.evaluate(async (id: number) => {
      await fetch(`/api/v1/sop/runs/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
    }, runId2)
    console.log('Draft run 2 deleted')
  }

  diag.dump()
})
