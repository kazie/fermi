// Screenshots Histoire variants at phone and desktop widths and flags horizontal overflow.
//   pnpm story:build && pnpm --filter @fermi/client story:preview   (serves :6007)
//   node scripts/story-shots.ts <outDir> [storyFilter] [variantFilter]
import { chromium } from '@playwright/test'

const [out = 'story-shots', storyFilter = '', variantFilter = ''] = process.argv.slice(2)
const base = 'http://localhost:6007'
const meta = (await (await fetch(`${base}/histoire.json`)).json()) as {
  stories: { id: string; variants: { id: string; title: string }[] }[]
}

const browser = await chromium.launch()
for (const story of meta.stories.filter((s) => s.id.includes(storyFilter.toLowerCase()))) {
  for (const v of story.variants.filter((x) => x.title.toLowerCase().includes(variantFilter.toLowerCase()))) {
    for (const [label, width] of [
      ['phone', 360],
      ['desktop', 1280],
    ] as const) {
      const p = await browser.newPage({ viewport: { width, height: 900 } })
      await p.goto(`${base}/__sandbox.html?storyId=${story.id}&variantId=${v.id}`)
      await p.waitForTimeout(1500)
      const sw = await p.evaluate(() => document.documentElement.scrollWidth)
      if (sw > width) console.log(`⚠ horizontal overflow: ${story.id} / ${v.title} @${label}: ${sw}px`)
      await p.screenshot({ path: `${out}/${v.id}--${label}.png`, fullPage: true })
      await p.close()
    }
  }
}
await browser.close()
console.log('done')
