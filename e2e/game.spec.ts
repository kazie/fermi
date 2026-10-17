import { devices, expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

const TOKEN = 'e2e-token'

function question(i: number) {
  const topics = [
    'pianos in a city',
    'grains in a bag of rice',
    'leaves on an oak tree',
    'tiles on a roof',
    'bricks in a chimney',
    'hairs on a cat',
  ]
  return {
    id: `e2e-q${i}`,
    question: `E2E test question about ${topics[i]} number ${i}?`,
    unit: 'things',
    category: 'everyday-life',
    difficulty: 1,
    kind: 'direct',
    answer: 1000 * (i + 1) ** 3,
    explanation: 'An end-to-end test question with a made-up but consistently cited number.',
    validAsOf: '2026',
    timeSensitive: false,
    sources: [
      {
        id: 's1',
        url: `https://example.org/e2e/${i}`,
        title: `E2E source ${i}`,
        publisher: 'Example',
        quote: `There are ${1000 * (i + 1) ** 3} of them in topic ${topics[i]}.`,
        accessed: '2026-10-01',
        archiveUrl: `https://web.archive.org/web/20261001000000/https://example.org/e2e/${i}`,
        archivedAt: '2026-10-01T00:00:00Z',
      },
    ],
    verification: { verifiedAt: '2026-10-01T00:00:00Z', verdict: 'approved', notes: 'e2e fixture' },
  }
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(0)
}

/** Every request any browser makes during the game; all must go to the game's own server. */
const requests: string[] = []
const watch = (ctx: BrowserContext) => ctx.on('request', (r) => requests.push(r.url()))

async function joinAs(browser: Browser, url: string, name: string, mobile = false) {
  const ctx = await browser.newContext(mobile ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 860 } })
  watch(ctx)
  const page = await ctx.newPage()
  await page.goto(url)
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page.getByText('Test subjects')).toBeVisible()
  return page
}

async function answer(page: Page, text: string, last = false) {
  const ta = page.getByLabel('Your calculation')
  await ta.fill(text)
  await page.locator('.lock').click()
  // The last lock-in ends the round straight away, so there is no "Edit answer" to see.
  if (!last) await expect(page.getByRole('button', { name: /Edit answer/ })).toBeVisible()
}

test.beforeAll(async ({ request }) => {
  const res = await request.post('/api/admin/questions', {
    headers: { authorization: `Bearer ${TOKEN}` },
    data: { questions: [0, 1, 2, 3, 4, 5].map(question), batchId: 'e2e' },
  })
  const body = await res.json()
  expect(body.results.map((r: { status: string }) => r.status)).toEqual(Array(6).fill('added'))
})

test('three players (one on a phone) play a full game against FerMEANie', async ({ browser }) => {
  // Host creates a room from the home page
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  watch(hostCtx)
  const host = await hostCtx.newPage()
  await host.goto('/')
  await host.getByRole('button', { name: 'Host a game' }).click()
  await expect(host).toHaveURL(/\/r\/[A-Z]{4}$/)
  const url = host.url()
  await host.getByLabel('Your name').fill('Hosty')
  await host.getByRole('button', { name: 'Join' }).click()
  await expect(host.getByText('Test subjects (1)')).toBeVisible()

  const phone = await joinAs(browser, url, 'Phoney', true)
  const desk = await joinAs(browser, url, 'Desky')
  await expect(host.getByText('Test subjects (3)')).toBeVisible()
  await noHorizontalScroll(phone)

  // Settings are host-only
  await expect(phone.getByRole('button', { name: /Start game/ })).toHaveCount(0)
  await host.getByRole('group', { name: 'Rounds' }).getByRole('button', { name: '5', exact: true }).click()
  await host.getByRole('group', { name: 'Seconds per question' }).getByRole('button', { name: '30s' }).click()
  await host.getByRole('group', { name: 'Break between rounds' }).getByRole('button', { name: 'Off' }).click()
  await expect(phone.getByText('About')).toContainText('min')
  await host.getByRole('button', { name: /Start game/ }).click()

  for (let round = 1; round <= 5; round++) {
    for (const p of [host, phone, desk]) await expect(p.getByText(`Question ${round} of 5`)).toBeVisible()
    await noHorizontalScroll(phone)
    await answer(host, 'pianos = 2k\npianos * 3')
    await answer(phone, '5 thousand')
    await answer(desk, round === 1 ? '1e99' : '7_500', true)
    // reveal
    await expect(phone.getByText('The answer', { exact: true })).toBeVisible()
    if (round === 1) {
      await expect(desk.locator('.ac.dunce')).toBeVisible()
      await expect(desk.getByText('because someone was wildly off')).toBeVisible()
      await expect(host.locator('.ac').filter({ hasText: 'Hosty' }).getByText('pianos * 3')).toBeVisible() // working is shown
    }
    // the scoreboard is on screen briefly at test speed; waitFor polls in-page so it can't miss it
    await phone.getByText(`Scores after round ${round}`).waitFor({ timeout: 20_000 })
    await noHorizontalScroll(phone)
  }

  for (const p of [host, phone, desk]) await expect(p.getByText('Best carbon-based organism')).toBeVisible({ timeout: 20_000 })
  await expect(host.getByRole('button', { name: /Play again/ })).toBeVisible()
  await expect(phone.getByRole('button', { name: /Play again/ })).toHaveCount(0)
  await noHorizontalScroll(phone)

  // Recap with sources
  const recapHref = await host.getByRole('link', { name: /Recap/ }).getAttribute('href')
  const recap = await hostCtx.newPage()
  await recap.goto(recapHref!)
  await expect(recap.getByText('Every answer, every source')).toBeVisible()
  await expect(recap.locator('.round')).toHaveCount(5)

  // Back to the lobby
  await host.getByRole('button', { name: /Play again/ }).click()
  await expect(phone.getByText('Test subjects (3)')).toBeVisible()

  // Self-served: nothing was fetched from anywhere but the game's own server, and the CSP says so.
  const origin = new URL(host.url()).origin
  expect(requests.length).toBeGreaterThan(10)
  expect(requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([])
  const res = await host.request.get('/')
  expect(res.headers()['content-security-policy']).toContain("default-src 'self'")
})

test('big screen + two phones: the TV hosts, phones play, the break can be skipped', async ({ browser }) => {
  const tvCtx = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  watch(tvCtx)
  const tv = await tvCtx.newPage()
  await tv.goto('/')
  await tv.getByRole('button', { name: /Host on a big screen/ }).click()
  await expect(tv).toHaveURL(/\/screen\/[A-Z]{4}$/)
  await expect(tv.getByText('Nobody yet')).toBeVisible()
  const code = tv.url().split('/').pop()!
  const url = new URL(`/r/${code}`, tv.url()).toString()

  const annie = await joinAs(browser, url, 'Annie', true)
  const bert = await joinAs(browser, url, 'Bert', true)
  await expect(tv.getByText('Waiting for Annie to start')).toBeVisible()
  await expect(annie.getByText('The QR code is on the big screen')).toBeVisible()
  await expect(annie.getByRole('button', { name: /Start game/ })).toBeVisible() // the first phone hosts
  await expect(bert.getByRole('button', { name: /Start game/ })).toHaveCount(0)
  await noHorizontalScroll(annie)

  await annie.getByRole('group', { name: 'Rounds' }).getByRole('button', { name: '5', exact: true }).click()
  await annie.getByRole('group', { name: 'Seconds per question' }).getByRole('button', { name: '30s' }).click()
  await annie.getByRole('group', { name: 'Break between rounds' }).getByRole('button', { name: '60s' }).click()
  await annie.getByRole('button', { name: /Start game/ }).click()

  for (let round = 1; round <= 5; round++) {
    await expect(tv.getByText(`Question ${round} of 5`)).toBeVisible()
    await expect(tv.getByLabel('Your calculation')).toHaveCount(0) // the TV never answers
    await answer(annie, 'pianos = 2k\npianos * 3')
    await answer(bert, '5 thousand', true)
    await expect(tv.getByText('The answer', { exact: true })).toBeVisible()
    if (round === 1) {
      await expect(annie.getByText('Look at the big screen')).toBeVisible() // controller mode by default
      await bert.getByRole('button', { name: 'Full view' }).click()
      await expect(bert.getByText('The answer', { exact: true })).toBeVisible()
      await noHorizontalScroll(annie)
    }
    if (round === 5) break
    // the break: both skip, and the next question starts long before the 60 s are up
    await expect(annie.getByRole('button', { name: /Skip break/ })).toBeVisible({ timeout: 20_000 })
    await expect(tv.getByText(/want to skip/)).toBeVisible()
    await annie.getByRole('button', { name: /Skip break/ }).click()
    await expect(annie.getByText(/Waiting for others/)).toBeVisible()
    const t0 = Date.now()
    await bert.getByRole('button', { name: /Skip break/ }).click()
    await expect(tv.getByText(`Question ${round + 1} of 5`)).toBeVisible()
    expect(Date.now() - t0).toBeLessThan(5000)
  }

  await expect(tv.getByText('Best carbon-based organism')).toBeVisible({ timeout: 20_000 })
  await expect(tv.getByText(/start another game from their phone/)).toBeVisible()
  await expect(annie.getByRole('button', { name: /Play again/ })).toBeVisible()

  const origin = new URL(tv.url()).origin
  expect(requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([])
})
