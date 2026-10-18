
export type PaneState = { present: boolean; open: boolean; suspended: boolean }

export interface PaneHandle {
	close(): void
	open(): void
	remove(): void
	subscribe(listener: (state: PaneState) => void): () => void
	suspend(options?: { mobileOnly?: boolean }): { restore(): void }
}

type Registration = {
	handle: PaneHandle
	listeners: Set<(state: PaneState) => void>
	open: boolean
	owner: object
	scroll: number
	tokens: Set<{ mobileOnly?: boolean }>
}

const panes = new WeakMap<HTMLElement, RightPane>()

export function rightPaneOf(container: HTMLElement = document.body): RightPane
{
	return panes.get(container) ?? new RightPane(container)
}

export class PaneOccupiedError extends Error
{

	constructor()
	{
		super('The right pane already has an active owner')
		this.name = 'PaneOccupiedError'
	}

}

export class RightPane
{

	private readonly abort = new AbortController()
	private readonly command: HTMLButtonElement
	private readonly content: HTMLElement
	private readonly heading: HTMLElement
	private readonly inert = new Map<HTMLElement, boolean>()
	private readonly mobile = matchMedia('(max-width: 600px), (pointer: coarse) and (max-height: 480px)')
	private readonly pane: HTMLElement
	private registration?: Registration
	private resizePointer?: number
	private readonly resizer: HTMLElement
	private readonly tab: HTMLButtonElement
	private readonly tabs: HTMLElement

	constructor(private readonly container: HTMLElement)
	{
		if (panes.has(container)) throw new Error('The home container already has a right pane service')
		const required = <T extends HTMLElement>(selector: string): T => {
			const element = container.querySelector<T>(selector)
			if (!element) throw new Error(`Missing home container element: ${selector}`)
			return element
		}
		this.command = required('.right-pane-toggle')
		this.content = required('#right-pane-content')
		this.heading = required('#right-pane-title')
		this.pane    = required('.right-pane')
		this.resizer = required('.right-pane-resize')
		this.tab     = required('.right-pane-tab')
		this.tabs    = required('.right-pane-tabs')
		const options = { signal: this.abort.signal }
		this.command.addEventListener('click', this.toggle, options)
		this.resizer.addEventListener('pointerdown', this.resizeStart, options)
		this.resizer.addEventListener('pointermove', this.resizeMove, options)
		for (const event of ['lostpointercapture', 'pointercancel', 'pointerup'] as const)
			this.resizer.addEventListener(event, this.resizeEnd, options)
		this.resizer.addEventListener('keydown', this.resizeKeydown, options)
		this.tab.addEventListener('click', this.select, options)
		this.container.addEventListener('keydown', this.keydown, options)
		this.container.addEventListener('transitionend', this.transitionEnd, options)
		this.mobile.addEventListener('change', this.responsive, options)
		this.render()
		panes.set(container, this)
	}

	dispose(): void
	{
		if (this.abort.signal.aborted) return
		this.registration?.handle.remove()
		this.abort.abort()
		this.finishResize()
		panes.delete(this.container)
	}

	private finishResize(): void
	{
		if (this.resizePointer === undefined) return
		const pointer = this.resizePointer
		this.resizePointer = undefined
		this.container.classList.remove('right-pane-resizing')
		if (this.resizer.hasPointerCapture(pointer)) this.resizer.releasePointerCapture(pointer)
	}

	private keydown = (event: KeyboardEvent): void => {
		if (!this.state().open) return
		if (event.key === 'Escape') {
			event.preventDefault()
			this.registration?.handle.close()
		}
		if (!this.mobile.matches || event.key !== 'Tab') return
		const controls = [...this.pane.querySelectorAll<HTMLElement>(
			'button, a[href], input, select, textarea, [tabindex]'
		)].filter(element => !element.hasAttribute('disabled') && element.tabIndex >= 0 && element.getClientRects().length)
		const first = controls[0] ?? this.pane
		const last  = controls.at(-1) ?? this.pane
		if (document.activeElement === (event.shiftKey ? first : last) || !this.pane.contains(document.activeElement)) {
			const target = event.shiftKey ? last : first
			event.preventDefault()
			target.focus()
		}
	}

	register(owner: object, content: HTMLElement, title: string): PaneHandle
	{
		if (this.abort.signal.aborted) throw new Error('The right pane has been disposed')
		const previous = this.registration
		if (previous && (previous.owner !== owner || previous.open || previous.tokens.size)) throw new PaneOccupiedError()
		const current = (): boolean => this.registration === registration
		const setOpen = (open: boolean): void => {
			if (!current()) return
			registration.open = open
			this.render()
			if (!open || !registration.tokens.size) this.command.focus({ preventScroll: true })
		}
		const handle: PaneHandle = previous?.handle ?? {
			close: () => setOpen(false),
			open: () => setOpen(true),
			remove: () => {
				if (!current()) return
				const focused = this.pane.contains(document.activeElement) || document.activeElement === this.command
				this.registration = undefined
				registration.tokens.clear()
				this.content.replaceChildren()
				this.heading.textContent = ''
				this.render()
				for (const listener of registration.listeners) listener({ present: false, open: false, suspended: false })
				registration.listeners.clear()
				if (focused) {
					const main = this.container.querySelector<HTMLElement>('main')
					if (main) {
						const tabindex = main.getAttribute('tabindex')
						main.tabIndex = -1
						main.focus({ preventScroll: true })
						if (tabindex === null) main.removeAttribute('tabindex')
						else main.setAttribute('tabindex', tabindex)
					}
				}
			},
			subscribe: listener => {
				if (current()) registration.listeners.add(listener)
				listener(current() ? this.state() : { present: false, open: false, suspended: false })
				return () => { registration.listeners.delete(listener) }
			},
			suspend: (options = {}) => {
				const token = { mobileOnly: options.mobileOnly }
				if (current()) {
					registration.tokens.add(token)
					this.render()
				}
				return { restore: () => {
					if (!current() || !registration.tokens.delete(token)) return
					this.render()
				} }
			}
		}
		const registration: Registration = previous ?? { handle, listeners: new Set(), open: false, owner,
			scroll: 0, tokens: new Set() }
		registration.scroll = 0
		this.registration = registration
		this.content.replaceChildren(content)
		this.heading.textContent = title
		this.render()
		return handle
	}

	private render(): void
	{
		const wasOpen = !this.pane.hidden
		const { open, present } = this.state()
		if (!open || this.mobile.matches) this.finishResize()
		if (wasOpen && !open && this.registration) this.registration.scroll = this.content.scrollTop
		this.pane.hidden    = !open
		this.pane.inert     = !open
		this.command.hidden = !present
		this.tab.hidden     = !present
		this.tab.textContent = this.heading.textContent
		this.tab.setAttribute('aria-label', this.heading.textContent || 'Pane')
		this.container.classList.toggle('right-pane-open', open)
		if (open && !this.mobile.matches) this.updateResizeValue()
		this.command.setAttribute('aria-expanded', String(open))
		this.command.setAttribute('aria-label', `${open ? 'Close' : 'Open'} ${this.heading.textContent || 'pane'}`)
		this.command.textContent = open ? 'Close pane' : 'Open pane'
		const destination = open ? this.tabs : this.container
		if (this.command.parentElement !== destination) {
			if (open) this.tabs.prepend(this.command)
			else this.pane.before(this.command)
		}
		if (open && !wasOpen && this.registration) this.content.scrollTop = this.registration.scroll
		for (const [element, inert] of this.inert) element.inert = inert
		this.inert.clear()
		if (open && this.mobile.matches) {
			this.pane.setAttribute('role', 'dialog')
			this.pane.setAttribute('aria-modal', 'true')
			for (const element of this.container.children) {
				if (!(element instanceof HTMLElement) || element === this.pane || element.contains(this.pane)) continue
				this.inert.set(element, element.inert)
				element.inert = true
			}
		}
		else {
			this.pane.removeAttribute('role')
			this.pane.removeAttribute('aria-modal')
		}
		for (const listener of this.registration?.listeners ?? []) listener(this.state())
	}

	private resizeEnd = (event: PointerEvent): void => {
		if (event.pointerId === this.resizePointer) this.finishResize()
	}

	private resizeKeydown = (event: KeyboardEvent): void => {
		if (this.mobile.matches || !this.state().open) return
		const width = this.pane.getBoundingClientRect().width
		const next = event.key === 'ArrowLeft' ? width + 10 : event.key === 'ArrowRight' ? width - 10
			: event.key === 'Home' ? 180 : event.key === 'End' ? this.container.clientWidth - 180 : undefined
		if (next === undefined) return
		event.preventDefault()
		this.setWidth(next)
	}

	private resizeMove = (event: PointerEvent): void => {
		if (event.pointerId !== this.resizePointer) return
		this.setWidth(this.container.getBoundingClientRect().right - event.clientX)
	}

	private resizeStart = (event: PointerEvent): void => {
		if (this.mobile.matches || !this.state().open || event.button !== 0 || this.resizePointer !== undefined) return
		event.preventDefault()
		this.resizePointer = event.pointerId
		this.resizer.setPointerCapture(event.pointerId)
		this.container.classList.add('right-pane-resizing')
	}

	private responsive = (): void => {
		this.render()
		if (this.state().open && this.mobile.matches && !this.pane.contains(document.activeElement))
			this.command.focus({ preventScroll: true })
	}

	private select = (): void => {
		if (!this.state().open) this.registration?.handle.open()
	}

	private setWidth(width: number): void
	{
		const max = Math.max(180, this.container.clientWidth - 180)
		const limited = Math.round(Math.min(max, Math.max(180, width)))
		this.container.style.setProperty('--right-pane-custom-width', `${limited}px`)
		this.updateResizeValue()
	}

	private state(): PaneState
	{
		const registration = this.registration
		const suspended = [...registration?.tokens ?? []].some(token => !token.mobileOnly || this.mobile.matches)
		return { present: !!registration, open: !!registration?.open && !suspended, suspended }
	}

	private toggle = (): void => {
		const handle = this.registration?.handle
		if (this.state().open) handle?.close()
		else handle?.open()
	}

	private transitionEnd = (event: TransitionEvent): void => {
		if (event.target === this.container && event.propertyName === 'grid-template-columns'
			&& this.state().open && !this.mobile.matches) this.updateResizeValue()
	}

	private updateResizeValue(): void
	{
		this.resizer.setAttribute('aria-valuemin', '180')
		this.resizer.setAttribute('aria-valuemax', String(Math.max(180, this.container.clientWidth - 180)))
		this.resizer.setAttribute('aria-valuenow', String(Math.round(this.pane.getBoundingClientRect().width)))
	}

}
