import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PS_PLAYWRIGHT_MODULE
	|| '/home/baptiste/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const source = readFileSync(new URL('../right-pane.js', import.meta.url), 'utf8')
const bridge = readFileSync(new URL('../container.js', import.meta.url), 'utf8')
const shell = readFileSync(new URL('../cjs/container.html', import.meta.url), 'utf8')
	.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*>/g, '')
const css = readFileSync(new URL('../right-pane.css', import.meta.url), 'utf8')

test('PANE-01–04/06: actual browser lifecycle, occupancy, focus and responsive shell', async () => {
	const browser = await chromium.launch({ chromiumSandbox: true, headless: true })
	try {
		const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
		await page.setContent(shell)
		await page.addStyleTag({ content: 'body { display:grid; height:100vh; margin:0 }' + css })
		const records = await page.evaluate(async ({ source, bridge }) => {
			const { PaneOccupiedError, rightPaneOf } = await import(`data:text/javascript,${encodeURIComponent(source)}`)
			const records = []
			const check = (name, condition) => {
				if (!condition) throw new Error(name)
				records.push(name)
			}
			const service = rightPaneOf()
			const command = document.querySelector('.right-pane-toggle')
			check('empty command hidden', command.hidden)
			const registrations = []
			document.addEventListener('itrocks:right-pane-ready', event => registrations.push(event.detail.register))
			await import(`data:text/javascript,${encodeURIComponent(bridge.replace("'./right-pane.js'",
				JSON.stringify(`data:text/javascript,${encodeURIComponent(source)}`)))}`)
			document.dispatchEvent(new Event('itrocks:right-pane-request'))
			check('container announces and replays narrow registration', registrations.length === 2
				&& registrations.every(register => typeof register === 'function'))
			const owner = {}, content = document.createElement('div')
			content.innerHTML = '<input value="remember"><button>Choice</button><div style="height:1800px"></div>'
			const handle = registrations[1](owner, content, 'Arbitrary content')
			const states = [], unsubscribe = handle.subscribe(state => states.push(state))
			check('new content folded', !command.hidden && states.at(-1).open === false)
			check('one shared service', service === rightPaneOf())
			let refused = false
			try { service.register({}, document.createElement('div'), 'Foreign') }
			catch (error) { refused = error instanceof PaneOccupiedError }
			check('competing owner refused', refused)
			handle.open()
			check('command moved', command.parentElement === document.querySelector('.right-pane > header'))
			check('fold command remains visible', command.getBoundingClientRect().width >= 24
				&& command.getBoundingClientRect().height >= 28)
			check('desktop main interactive', !document.querySelector('main').inert)
			refused = false
			try { service.register(owner, content, 'Active replacement') } catch { refused = true }
			check('active replacement refused', refused)
			const viewport = document.querySelector('#right-pane-content')
			viewport.scrollTop = 145
			const outer = handle.suspend(), inner = handle.suspend()
			check('suspend folded', states.at(-1).suspended && !states.at(-1).open)
			outer.restore()
			check('nested token retains suspension', states.at(-1).suspended)
			inner.restore()
			check('last token restores open and scroll', states.at(-1).open && viewport.scrollTop === 145)
			check('restoration never focuses input', document.activeElement !== content.firstElementChild)
			handle.close()
			check('explicit close focuses visible command', document.activeElement === command && !command.hidden)
			check('same owner inactive update retains handle', service.register(owner, content, 'Updated') === handle)
			check('updated title', document.querySelector('#right-pane-title').textContent === 'Updated')
			handle.open()
			const stale = handle.suspend()
			handle.remove()
			handle.remove()
			stale.restore()
			check('removal invalidates tokens and subscription', !states.at(-1).present && command.hidden)
			const next = service.register({}, content, 'New owner')
			stale.restore()
			check('stale token cannot reopen new owner', command.getAttribute('aria-expanded') === 'false')
			unsubscribe()
			next.open()
			window.paneFixture = { handle: next, service }
			return records
		}, { source, bridge })
		assert.ok(records.length >= 16)
		const resizer = page.locator('.right-pane-resize')
		assert.equal(await resizer.evaluate(element => getComputedStyle(element).cursor), 'ew-resize')
		const initialWidth = await page.locator('.right-pane').evaluate(element => element.getBoundingClientRect().width)
		const bounds = await resizer.boundingBox()
		await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100)
		await page.mouse.down()
		await page.mouse.move(bounds.x - 120, bounds.y + 100, { steps: 5 })
		await page.mouse.up()
		const widened = await page.locator('.right-pane').evaluate(element => element.getBoundingClientRect().width)
		assert.ok(widened > initialWidth + 100)
		assert.equal(await page.locator('body').evaluate(element =>
			element.classList.contains('right-pane-resizing')), false)
		const newBounds = await resizer.boundingBox()
		await page.mouse.move(newBounds.x + newBounds.width / 2, newBounds.y + 100)
		await page.mouse.down()
		await page.mouse.move(newBounds.x + 100, newBounds.y + 100, { steps: 5 })
		await page.mouse.up()
		const narrowed = await page.locator('.right-pane').evaluate(element => element.getBoundingClientRect().width)
		assert.ok(narrowed < widened - 80)
		await resizer.focus()
		await page.keyboard.press('ArrowLeft')
		const keyboardWidth = await page.locator('.right-pane').evaluate(element => element.getBoundingClientRect().width)
		assert.ok(keyboardWidth > narrowed)
		await page.evaluate(() => { window.paneFixture.handle.close(); window.paneFixture.handle.open() })
		assert.equal(await page.locator('.right-pane').evaluate(element => element.getBoundingClientRect().width),
			keyboardWidth)
		await page.evaluate(() => {
			window.mobileToken = window.paneFixture.handle.suspend({ mobileOnly: true })
			if (document.querySelector('.right-pane').hidden) throw new Error('Desktop must remain open')
		})
		await page.setViewportSize({ width: 390, height: 844 })
		await page.waitForFunction(() => document.querySelector('.right-pane').hidden)
		assert.equal(await resizer.isVisible(), false)
		assert.equal(await page.locator('main').evaluate(node => node.inert), false)
		await page.evaluate(() => window.mobileToken.restore())
		await page.waitForFunction(() => document.querySelector('main').inert)
		assert.equal(await page.locator('.right-pane').getAttribute('aria-modal'), 'true')
		await page.locator('.right-pane-toggle').focus()
		await page.keyboard.press('Shift+Tab')
		assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Choice')
		await page.keyboard.press('Tab')
		assert.equal(await page.evaluate(() => document.activeElement.className), 'right-pane-toggle')
		await page.keyboard.press('Escape')
		assert.equal(await page.locator('main').evaluate(node => node.inert), false)
		await page.evaluate(() => {
			const token = window.paneFixture.handle.suspend()
			window.paneFixture.service.dispose()
			token.restore()
		})
		assert.equal(await page.locator('.right-pane-toggle').isVisible(), false)
		console.log(JSON.stringify({ verdict: 'PASS', records, browser: browser.version() }))
	}
	finally { await browser.close() }
})
