import { devices, expect, test, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test'

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

/**
 * Each player's browser. With PW_VIDEO=1 each is recorded (Playwright's `video` setting only covers the contexts it
 * makes itself) to test-results/<test>/videos/; the files are written when the contexts close, after each test.
 */
const contexts: { ctx: BrowserContext; who: string }[] = []
async function newContext(browser: Browser, who: string, options: BrowserContextOptions) {
  const recordVideo =
    process.env.PW_VIDEO === '1' ? { dir: test.info().outputPath('videos'), size: options.viewport ?? undefined } : undefined
  const ctx = await browser.newContext({ ...options, ...(recordVideo && { recordVideo }) })
  contexts.push({ ctx, who })
  return ctx
}
test.afterEach(async () => {
  const closing = contexts.splice(0)
  // each video named after whose browser it is: Hosty.webm, Phoney.webm, tv.webm, Hosty-2.webm (a second tab)…
  const videos = closing.flatMap(({ ctx, who }) =>
    ctx.pages().map((page, i) => ({ video: page.video(), name: i ? `${who}-${i + 1}` : who })),
  )
  await Promise.all(closing.map(({ ctx }) => ctx.close()))
  for (const { video, name } of videos) {
    if (!video) continue
    await video.saveAs(test.info().outputPath('videos', `${name}.webm`))
    await video.delete()
  }
})

/** Every request any browser makes during the game; all must go to the game's own server. */
const requests: string[] = []
const watch = (ctx: BrowserContext) => ctx.on('request', (r) => requests.push(r.url()))

async function joinAs(browser: Browser, url: string, name: string, mobile = false) {
  const ctx = await newContext(browser, name, mobile ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 860 } })
  watch(ctx)
  const page = await ctx.newPage()
  await page.goto(url)
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page.getByRole('heading', { name: /Test subjects/ })).toBeVisible()
  return page
}

/** Hosts a new game from the home page and joins it as `name`; returns the room's link. */
async function hostGame(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Host a game' }).click()
  await expect(page).toHaveURL(/\/r\/[A-Z]{4}$/)
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page.getByText('Test subjects (1)')).toBeVisible()
  return page.url()
}

async function answer(page: Page, text: string, last = false) {
  const ta = page.getByLabel('Your calculation')
  await ta.fill(text)
  await page.locator('.lock').click()
  // The last lock-in ends the round straight away, so there is no "Edit answer" to see.
  if (!last) await expect(page.getByRole('button', { name: /Edit answer/ })).toBeVisible()
}

/**
 * How long a reveal step may take. Test speed shortens the reveal, but not FerMEANie's chat, which plays in real time:
 * with her voice (FERMI_VOICE=1) each message stays up until she has said it, so a talkative round takes longer.
 */
const REVEAL_WAIT_MS = process.env.FERMI_VOICE === '1' ? 60_000 : 20_000
/** An intro step lasts until her line is typed, and with her voice, said: slower with a busy voice renderer. */
const INTRO_WAIT_MS = process.env.FERMI_VOICE === '1' ? 60_000 : 30_000
/** The crown comes after the awards ceremony: up to three of her lines, each typed (and said) at full speed. */
const FINAL_WAIT_MS = REVEAL_WAIT_MS + 40_000

// Once per worker; a worker started after a failed test finds the questions already there.
test.beforeAll(async ({ request }) => {
  const health = await (await request.get('/api/health')).json()
  if (health.questions >= 6) return
  const res = await request.post('/api/admin/questions', {
    headers: { authorization: `Bearer ${TOKEN}` },
    data: { questions: [0, 1, 2, 3, 4, 5].map(question), batchId: 'e2e' },
  })
  const body = await res.json()
  expect(body.results.map((r: { status: string }) => r.status)).toEqual(Array(6).fill('added'))
})

test('three players (one on a phone) play a full game against FerMEANie', async ({ browser }) => {
  // Host creates a room from the home page
  const hostCtx = await newContext(browser, 'Hosty', { viewport: { width: 1280, height: 860 } })
  watch(hostCtx)
  const host = await hostCtx.newPage()
  const url = await hostGame(host, 'Hosty')

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
  await host.getByRole('group', { name: 'Intro' }).getByRole('button', { name: 'Off' }).click()
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
    await phone.getByText(`Scores after round ${round}`).waitFor({ timeout: REVEAL_WAIT_MS })
    await noHorizontalScroll(phone)
  }

  for (const p of [host, phone, desk]) await expect(p.getByText('Best carbon-based organism')).toBeVisible({ timeout: FINAL_WAIT_MS })
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

test('big screen + three phones: the TV hosts, phones play, the break can be skipped', async ({ browser }) => {
  const tvCtx = await newContext(browser, 'tv', { viewport: { width: 1600, height: 900 } })
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
  await expect(tv.getByText(/needs at least 3 test subjects/)).toBeVisible() // FerMEANie needs a crowd
  await expect(annie.getByRole('button', { name: /Start game/ })).toBeDisabled()
  const cleo = await joinAs(browser, url, 'Cleo', true)
  await expect(tv.getByText('Waiting for Annie to start')).toBeVisible()
  await expect(annie.getByText('The QR code is on the big screen')).toBeVisible()
  await expect(annie.getByRole('button', { name: /Start game/ })).toBeVisible() // the first phone hosts
  await expect(bert.getByRole('button', { name: /Start game/ })).toHaveCount(0)
  await noHorizontalScroll(annie)

  await annie.getByRole('group', { name: 'Rounds' }).getByRole('button', { name: '5', exact: true }).click()
  await annie.getByRole('group', { name: 'Seconds per question' }).getByRole('button', { name: '30s' }).click()
  await annie.getByRole('group', { name: 'Break between rounds' }).getByRole('button', { name: '60s' }).click()
  await annie.getByRole('group', { name: 'Intro' }).getByRole('button', { name: 'Off' }).click()
  await annie.getByRole('button', { name: /Start game/ }).click()

  for (let round = 1; round <= 5; round++) {
    await expect(tv.getByText(`Question ${round} of 5`)).toBeVisible()
    await expect(tv.getByLabel('Your calculation')).toHaveCount(0) // the TV never answers
    await answer(annie, 'pianos = 2k\npianos * 3')
    await answer(bert, '5 thousand')
    await answer(cleo, '3000', true)
    await expect(tv.getByText('The answer', { exact: true })).toBeVisible()
    if (round === 1) {
      await expect(annie.getByText('Look at the big screen')).toBeVisible() // controller mode by default
      await bert.getByRole('button', { name: 'Full view' }).click()
      await expect(bert.getByText('The answer', { exact: true })).toBeVisible()
      await noHorizontalScroll(annie)
    }
    if (round === 5) break
    // the break: both skip, and the next question starts long before the 60 s are up
    await expect(annie.getByRole('button', { name: /Skip break/ })).toBeVisible({ timeout: REVEAL_WAIT_MS })
    await expect(tv.getByText(/want to skip/)).toBeVisible()
    await annie.getByRole('button', { name: /Skip break/ }).click()
    await expect(annie.getByText(/Waiting for others/)).toBeVisible()
    const t0 = Date.now()
    await bert.getByRole('button', { name: /Skip break/ }).click()
    await expect(tv.getByText(`Question ${round + 1} of 5`)).toBeVisible()
    expect(Date.now() - t0).toBeLessThan(5000)
  }

  await expect(tv.getByText('Best carbon-based organism')).toBeVisible({ timeout: FINAL_WAIT_MS })
  await expect(tv.getByText(/start another game from their phone/)).toBeVisible()
  await expect(annie.getByRole('button', { name: /Play again/ })).toBeVisible()

  const origin = new URL(tv.url()).origin
  expect(requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([])
})

// FerMEANie's voice needs uv, ffmpeg and the model: FERMI_VOICE=1 pnpm test:e2e to run this one too.
test('with sound on, FerMEANie reads the question out and says her lines', async ({ browser }) => {
  test.skip(!process.env.FERMI_VOICE, 'FERMI_VOICE=1 turns her voice on')
  const ctx = await newContext(browser, 'Listener', { viewport: { width: 1280, height: 860 } })
  // count the clips that actually play (a real buffer, not the one-sample unlock blip)
  await ctx.addInitScript(() => {
    const w = window as unknown as { played: number }
    w.played = 0
    const start = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      if ((this.buffer?.length ?? 0) > 1) w.played++
      return start.apply(this, args)
    }
  })
  const host = await ctx.newPage()
  const clips: number[] = []
  host.on('response', (r) => r.url().includes('/voice/') && clips.push(r.status()))
  const url = await hostGame(host, 'Listener')
  const speaker = host.getByRole('button', { name: /Turn sound on/ })
  await speaker.click()
  await expect(host.getByRole('button', { name: /Sound is on/ })).toHaveAttribute('aria-pressed', 'true')
  await host.setViewportSize({ width: 360, height: 740 }) // the speaker fits in the header on a small phone
  await noHorizontalScroll(host)
  await host.setViewportSize({ width: 1280, height: 860 })

  await joinAs(browser, url, 'Quiet one')
  await joinAs(browser, url, 'Quiet two')
  await host.getByRole('group', { name: 'Break between rounds' }).getByRole('button', { name: 'Off' }).click()
  await host.getByRole('group', { name: 'Intro' }).getByRole('button', { name: 'Off' }).click()
  await host.getByRole('button', { name: /Start game/ }).click()
  await expect(host.getByText('Question 1 of')).toBeVisible()
  await expect
    .poll(() => host.evaluate(() => (window as unknown as { played: number }).played), { timeout: INTRO_WAIT_MS })
    .toBeGreaterThanOrEqual(2)
  expect(clips.length).toBeGreaterThan(0)
  expect(clips.filter((status) => status !== 200)).toEqual([]) // only clips the server said were ready: never a 404
})

test('the intro: FerMEANie introduces everyone and explains the rules, and a majority skips the example', async ({ browser }) => {
  const hostCtx = await newContext(browser, 'Hosty', { viewport: { width: 1280, height: 860 } })
  watch(hostCtx)
  const host = await hostCtx.newPage()
  const url = await hostGame(host, 'Hosty')
  const phone = await joinAs(browser, url, 'Phoney', true)
  const desk = await joinAs(browser, url, 'Desky')
  await expect(host.getByText('Test subjects (3)')).toBeVisible()

  // Full is the default
  await expect(host.getByRole('group', { name: 'Intro' }).getByRole('button', { name: 'Full' })).toHaveAttribute('aria-pressed', 'true')
  await host.getByRole('group', { name: 'Rounds' }).getByRole('button', { name: '5', exact: true }).click()
  await host.getByRole('button', { name: /Start game/ }).click()

  // the roll call, in join order, on every device; each phone knows its own turn
  for (const name of ['Hosty', 'Phoney', 'Desky'])
    await expect(desk.getByRole('heading', { name, exact: true })).toBeVisible({ timeout: INTRO_WAIT_MS })
  await expect(phone.getByRole('heading', { name: 'Work it out' })).toBeVisible({ timeout: INTRO_WAIT_MS })
  await noHorizontalScroll(phone)
  await expect(phone.getByRole('heading', { name: 'The swarm' })).toBeVisible({ timeout: INTRO_WAIT_MS })

  // the example question: practice, no points; two of three vote to skip the rest
  await expect(phone.getByText('Practice question · no points')).toBeVisible({ timeout: INTRO_WAIT_MS })
  await phone.getByRole('button', { name: /Skip intro/ }).click()
  await expect(phone.getByRole('button', { name: /Waiting for others · 1\/2/ })).toBeVisible()
  await desk.getByRole('button', { name: /Skip intro/ }).click()
  for (const page of [host, phone, desk]) await expect(page.getByText(/Question 1 of 5/)).toBeVisible()
})
