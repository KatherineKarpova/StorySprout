import { chromium } from '@playwright/test'
const base = process.argv[2]
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(base + '/demo', { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="book"]')
// Read: spread → choice → spread → choice → spread → end
for (let i = 0; i < 3; i++) {
  await page.getByTestId('page-next').click(); await page.waitForTimeout(400)
  if (await page.locator('[data-testid="choice"]').count()) {
    await page.locator('[data-testid="choice"] button').first().click(); await page.waitForTimeout(400)
  }
}
while (!(await page.getByTestId('start-quiz').count())) { await page.getByTestId('page-next').click(); await page.waitForTimeout(300) }
await page.getByTestId('start-quiz').click()
for (let q = 0; q < 5; q++) {
  await page.waitForSelector('[data-testid="quiz"]')
  await page.locator('[data-testid="quiz"] button').filter({ hasText: /^[A-C]/ }).first().click()
  await page.getByTestId('quiz-next').click(); await page.waitForTimeout(300)
}
const done = await page.getByTestId('quiz-done').isVisible().catch(() => false)
console.log(base, '| quiz finished:', done, '| page errors:', errors.length ? errors : 'none')
await browser.close()
