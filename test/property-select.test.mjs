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
const appCss = readFileSync(new URL('../../ux-core/css/app.css', import.meta.url), 'utf8')
const menuCss = readFileSync(new URL('../../menu/css/menu.css', import.meta.url), 'utf8')

test('PANE-07: collapsed mobile menu stays hidden and expands on request', async () => {
	const browser = await chromium.launch({ chromiumSandbox: true, headless: true })
	try {
		const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
		await page.setContent(shell)
		await page.addStyleTag({ content: appCss + css + menuCss })
		await page.evaluate(async source => {
			const { rightPaneOf } = await import(`data:text/javascript,${encodeURIComponent(source)}`)
			rightPaneOf().register({}, document.createElement('div'), 'Details')
		}, source)
		const menu = page.locator('body > .app.menu')
		const paneCommand = page.locator('.right-pane-dock')
		assert.equal(await menu.isVisible(), false)
		assert.equal(await paneCommand.isVisible(), true)
		assert.equal(await page.locator('body').evaluate(element =>
			getComputedStyle(element).gridTemplateColumns.split(' ')[0]), '0px')
		await page.locator('body').evaluate(element => element.classList.add('expand'))
		assert.equal(await menu.isVisible(), true)
		assert.equal(await paneCommand.isVisible(), false)
		assert.ok(await menu.evaluate(element => element.getBoundingClientRect().width) > 300)
		await page.locator('body').evaluate(element => element.classList.remove('expand'))
		assert.equal(await menu.isVisible(), false)
		assert.equal(await paneCommand.isVisible(), true)
		await page.setViewportSize({ width: 1280, height: 720 })
		await page.locator('body').evaluate(element => element.classList.add('expand'))
		assert.equal(await paneCommand.isVisible(), true)
	}
	finally { await browser.close() }
})

test('PANE-01–04/06: actual browser lifecycle, occupancy, focus and responsive shell', async () => {
	const browser = await chromium.launch({ chromiumSandbox: true, headless: true })
	try {
		const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1280, height: 720 } })
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
			check('dock is one button with direct text', command === document.querySelector('.right-pane-dock')
				&& command.tagName === 'BUTTON' && command.children.length === 0 && command.textContent === 'Open pane')
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
			check('folded command docks at right edge', getComputedStyle(command).position === 'fixed'
				&& command.getBoundingClientRect().right === innerWidth)
			check('one shared service', service === rightPaneOf())
			let refused = false
			try { service.register({}, document.createElement('div'), 'Foreign') }
			catch (error) { refused = error instanceof PaneOccupiedError }
			check('competing owner refused', refused)
			handle.open()
			check('command moved', command.parentElement === document.querySelector('.right-pane > header'))
			check('open command anchors its icon', getComputedStyle(command).position === 'relative'
				&& getComputedStyle(command, '::before').backgroundImage.includes('back.svg'))
			check('open label is direct text', command.children.length === 0 && command.textContent === 'Close pane')
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
			check('closed command returned to shell', command.parentElement === document.body
				&& command.nextElementSibling === document.querySelector('.right-pane')
				&& command.textContent === 'Open pane')
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
		assert.equal(await page.evaluate(() => document.activeElement.classList.contains('right-pane-toggle')), true)
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

test('folded replacement, subscriptions and stale handles preserve the pane lifecycle', async () => {
	const browser = await chromium.launch({ chromiumSandbox: true, headless: true })
	try {
		const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1280, height: 720 } })
		await page.setContent(shell)
		await page.addStyleTag({ content: 'body { display:grid; height:100vh; margin:0 }' + css })
		const result = await page.evaluate(async source => {
			const { PaneOccupiedError, RightPane, rightPaneOf } = await import(
				`data:text/javascript,${encodeURIComponent(source)}`
			)
			const service = rightPaneOf(), owner = {}, content = document.createElement('div')
			const handle = service.register(owner, content, 'First')
			const states = [], unsubscribe = handle.subscribe(state => states.push(state))
			const replacement = document.createElement('input')
			replacement.value = 'preserved'
			const sameHandle = service.register(owner, replacement, '') === handle
			const updatedContent = document.querySelector('#right-pane-content').firstElementChild === replacement
			const emptyTitle = document.querySelector('.right-pane-tab').getAttribute('aria-label') === 'Pane'
			const token = handle.suspend({ mobileOnly: true })
			let occupied = false
			try { service.register(owner, content, 'Suspended replacement') }
			catch (error) { occupied = error instanceof PaneOccupiedError }
			token.restore()
			unsubscribe()
			const unsubscribedCount = states.length
			handle.open()
			const unsubscribed = states.length === unsubscribedCount
			handle.subscribe(state => states.push(state))
			replacement.focus()
			const main = document.querySelector('main')
			main.setAttribute('tabindex', '3')
			handle.remove()
			const removalFocus = document.activeElement === main && main.getAttribute('tabindex') === '3'
			let staleState
			handle.subscribe(state => { staleState = state })
			const next = service.register({}, content, 'Next')
			next.open()
			handle.close()
			handle.open()
			handle.remove()
			handle.suspend().restore()
			token.restore()
			const staleHarmless = !document.querySelector('.right-pane').hidden
			service.dispose()
			service.dispose()
			let disposed = false
			try { service.register({}, content, 'Disposed') } catch { disposed = true }
			const fresh = rightPaneOf()
			let duplicate = false
			try { new RightPane(document.body) } catch { duplicate = true }
			const freshHandle = fresh.register({}, content, 'Fresh')
			const freshStates = []
			freshHandle.subscribe(state => freshStates.push(state))
			document.querySelector('.right-pane-toggle').click()
			const freshOpen = !document.querySelector('.right-pane').hidden && freshStates.length === 2
			fresh.dispose()
			return { disposed, duplicate, emptyTitle, freshOpen, occupied, removalFocus, sameHandle,
				staleHarmless, staleState, states, unsubscribed, updatedContent }
		}, source)
		for (const [name, value] of Object.entries(result)) {
			if (name !== 'staleState' && name !== 'states') assert.equal(value, true, name)
		}
		const absent = { present: false, open: false, suspended: false }
		assert.deepEqual(result.staleState, absent)
		assert.deepEqual(result.states, [
			{ present: true, open: false, suspended: false },
			{ present: true, open: false, suspended: false },
			{ present: true, open: false, suspended: false },
			{ present: true, open: false, suspended: false },
			{ present: true, open: true, suspended: false },
			absent
		])
	}
	finally { await browser.close() }
})

test('resize bounds, cancellation and disposal release pointer capture', async () => {
	const browser = await chromium.launch({ chromiumSandbox: true, headless: true })
	try {
		const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1280, height: 720 } })
		await page.setContent(shell)
		await page.addStyleTag({ content: 'body { display:grid; height:100vh; margin:0 }' + css })
		await page.evaluate(async source => {
			const { rightPaneOf } = await import(`data:text/javascript,${encodeURIComponent(source)}`)
			const service = rightPaneOf(), handle = service.register({}, document.createElement('div'), 'Resize')
			handle.open()
			window.resizeFixture = { handle, service }
			document.querySelector('.right-pane-resize').addEventListener('pointerdown', event => {
				window.resizeFixture.pointer = event.pointerId
			})
		}, source)
		const resizer = page.locator('.right-pane-resize')
		await resizer.focus()
		for (const [key, value] of [['Home', 180], ['ArrowRight', 180], ['End', 1100], ['ArrowLeft', 1100]]) {
			await page.keyboard.press(key)
			assert.equal(await resizer.getAttribute('aria-valuenow'), String(value), key)
		}
		await page.keyboard.press('Home')
		for (const action of ['pointercancel', 'lostpointercapture', 'close', 'mobile', 'dispose']) {
			const bounds = await resizer.boundingBox()
			await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100)
			await page.mouse.down()
			await page.mouse.move(bounds.x + bounds.width / 2 + 2, bounds.y + 100)
			assert.equal(await page.locator('body').evaluate(element =>
				element.classList.contains('right-pane-resizing')), true, action)
			if (action === 'mobile') await page.setViewportSize({ width: 390, height: 844 })
			else await page.evaluate(action => {
				const { handle, pointer, service } = window.resizeFixture
				const resizer = document.querySelector('.right-pane-resize')
				if (action === 'close') handle.close()
				else if (action === 'dispose') service.dispose()
				else if (action === 'lostpointercapture') resizer.releasePointerCapture(pointer)
				else resizer.dispatchEvent(new PointerEvent(action, { pointerId: pointer }))
			}, action)
			if (action === 'lostpointercapture') await page.mouse.move(bounds.x + bounds.width / 2 + 1, bounds.y + 100)
			await page.waitForFunction(() => !document.body.classList.contains('right-pane-resizing'), null,
				{ timeout: 2000 }).catch(error => { throw new Error(`Resize still active after ${action}`, { cause: error }) })
			assert.equal(await resizer.evaluate(element =>
				element.hasPointerCapture(window.resizeFixture.pointer)), false, action)
			await page.mouse.up()
			if (action === 'mobile') {
				await page.setViewportSize({ width: 1280, height: 720 })
				await page.waitForFunction(() => !document.querySelector('main').inert)
			}
			if (action === 'close') await page.evaluate(() => window.resizeFixture.handle.open())
		}
	}
	finally { await browser.close() }
})

test('suspensions retain requested state and restore mobile focus and pre-existing inert regions', async () => {
	const browser = await chromium.launch({ chromiumSandbox: true, headless: true })
	try {
		const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } })
		await page.setContent(shell)
		await page.addStyleTag({ content: 'body { display:grid; height:100vh; margin:0 }' + css })
		await page.evaluate(async source => {
			const { rightPaneOf } = await import(`data:text/javascript,${encodeURIComponent(source)}`)
			const service = rightPaneOf(), content = document.createElement('div')
			content.innerHTML = '<input value="preserved"><div style="height:1800px"></div>'
			const handle = service.register({}, content, 'Details'), states = []
			handle.subscribe(state => states.push(state))
			document.querySelector('body > header').inert = true
			handle.open()
			document.querySelector('#right-pane-content').scrollTop = 145
			const first = handle.suspend(), second = handle.suspend({ mobileOnly: true })
			handle.close()
			first.restore()
			first.restore()
			second.restore()
			if (states.at(-1).open) throw new Error('Close during suspension must remain closed')
			const token = handle.suspend()
			handle.open()
			if (states.at(-1).open) throw new Error('Open during suspension must remain suspended')
			token.restore()
			if (document.querySelector('#right-pane-content').scrollTop !== 145) throw new Error('Lost scroll')
			window.lifecycle = { handle, service, states, token: handle.suspend({ mobileOnly: true }) }
		}, source)
		assert.equal(await page.locator('main').evaluate(element => element.inert), false)
		assert.equal(await page.locator('body > header').evaluate(element => element.inert), true)
		await page.setViewportSize({ width: 1280, height: 720 })
		await page.waitForFunction(() => !document.querySelector('.right-pane').hidden)
		assert.equal(await page.locator('.right-pane').getAttribute('aria-modal'), null)
		await page.locator('main').evaluate(element => { element.tabIndex = -1; element.focus() })
		await page.evaluate(() => window.lifecycle.token.restore())
		await page.setViewportSize({ width: 390, height: 844 })
		await page.waitForFunction(() => document.querySelector('main').inert)
		assert.equal(await page.locator('.right-pane-toggle').evaluate(element => document.activeElement === element), true)
		await page.evaluate(() => window.lifecycle.service.dispose())
		assert.equal(await page.locator('main').evaluate(element => element.inert), false)
		assert.equal(await page.locator('body > header').evaluate(element => element.inert), true)
	}
	finally { await browser.close() }
})

test('touch landscape uses the mobile dialog above the width breakpoint', async () => {
	const browser = await chromium.launch({ chromiumSandbox: true, headless: true })
	try {
		const page = await browser.newPage({ hasTouch: true, viewport: { width: 844, height: 390 } })
		await page.setContent(shell)
		await page.addStyleTag({ content: css })
		await page.evaluate(async source => {
			const { rightPaneOf } = await import(`data:text/javascript,${encodeURIComponent(source)}`)
			const handle = rightPaneOf().register({}, document.createElement('input'), 'Landscape')
			handle.open()
			window.landscapeToken = handle.suspend({ mobileOnly: true })
		}, source)
		assert.equal(await page.locator('.right-pane').evaluate(element => element.hidden), true)
		await page.evaluate(() => window.landscapeToken.restore())
		assert.equal(await page.locator('.right-pane').getAttribute('role'), 'dialog')
		assert.equal(await page.locator('.right-pane').getAttribute('aria-modal'), 'true')
		assert.equal(await page.locator('main').evaluate(element => element.inert), true)
		assert.equal(await page.locator('.right-pane-resize').isVisible(), false)
		await page.keyboard.press('Escape')
		assert.equal(await page.locator('main').evaluate(element => element.inert), false)
	}
	finally { await browser.close() }
})

for (const width of [390, 1280]) {
	test(`pane opens and folds progressively like the left menu at ${width}px`, async () => {
		const browser = await chromium.launch({ chromiumSandbox: true, headless: true })
		try {
			const page = await browser.newPage({ reducedMotion: 'no-preference', viewport: { width, height: 844 } })
			await page.setContent(shell)
			await page.addStyleTag({ content: appCss + css + menuCss })
			const result = await page.evaluate(async source => {
				const { rightPaneOf } = await import(`data:text/javascript,${encodeURIComponent(source)}`)
				const content = document.createElement('div')
				content.innerHTML = '<input value="preserved"><div style="height:1800px"></div>'
				const handle = rightPaneOf().register({}, content, 'Details')
				const pane = document.querySelector('.right-pane')
				const main = document.querySelector('main')
				const viewport = document.querySelector('#right-pane-content')
				const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
				const sample = () => ({
					main: main.getBoundingClientRect().width,
					pane: pane.getBoundingClientRect().width,
					visible: getComputedStyle(pane).visibility === 'visible'
				})
				const measure = async action => {
					sample()
					action()
					const animations = document.getAnimations()
					const motion = animations.find(animation => animation.transitionProperty !== 'visibility')
					if (!motion) throw new Error('Missing width transition')
					const timing = motion.effect.getTiming()
					const samples = [0, 50, 100].map(time => {
						for (const animation of animations) { animation.pause(); animation.currentTime = time }
						return sample()
					})
					for (const animation of animations) animation.finish()
					await frame()
					return { samples, duration: timing.duration, easing: timing.easing }
				}
				await frame()
				const opening = await measure(() => handle.open())
				viewport.scrollTop = 145
				const closing = await measure(() => handle.close())
				const closedInert = pane.inert
				const closingFocus = document.activeElement === document.querySelector('.right-pane-toggle')
				const reopening = await measure(() => handle.open())
				const scroll = viewport.scrollTop
				const menu = getComputedStyle(document.querySelector('.app.menu'))
				return { opening, closing, reopening, closedInert, closingFocus, scroll,
					menuDuration: parseFloat(menu.transitionDuration) * 1000, menuEasing: menu.transitionTimingFunction }
			}, source)
			for (const motion of [result.opening, result.closing, result.reopening]) {
				assert.equal(motion.duration, result.menuDuration)
				assert.equal(motion.easing, result.menuEasing)
				const [start, middle, end] = motion.samples.map(sample => sample.pane)
				assert.ok(middle > Math.min(start, end) && middle < Math.max(start, end))
			}
			assert.ok(result.opening.samples[0].pane < result.opening.samples[2].pane)
			assert.ok(result.closing.samples[0].pane > result.closing.samples[2].pane)
			assert.equal(result.closing.samples[1].visible, true)
			assert.equal(result.closing.samples[2].visible, false)
			assert.equal(result.closedInert, true)
			assert.equal(result.closingFocus, true)
			assert.equal(result.scroll, 145)
			if (width > 600) {
				const [start, middle, end] = result.opening.samples.map(sample => sample.main)
				assert.ok(start > middle && middle > end)
			}
		}
		finally { await browser.close() }
	})
}
