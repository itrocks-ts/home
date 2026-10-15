
export type PaneState = { present: boolean; open: boolean; suspended: boolean }

export interface PaneHandle {
	close(): void
	open(): void
	remove(): void
	subscribe(listener: (state: PaneState) => void): () => void
	suspend(): { restore(): void }
}

type Registration = {
	content: HTMLElement
	handle: PaneHandle
	listeners: Set<(state: PaneState) => void>
	open: boolean
	owner: object
	scroll: number
	tokens: Set<object>
}

const panes = new WeakMap<HTMLElement, RightPane>()

export function rightPaneOf(container: HTMLElement = document.body): RightPane
{
	let pane = panes.get(container)
	if (!pane) {
		pane = new RightPane(container)
		panes.set(container, pane)
	}
	return pane
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

	private readonly command: HTMLButtonElement
	private readonly content: HTMLElement
	private disposed = false
	private readonly dock: HTMLElement
	private readonly heading: HTMLElement
	private readonly inert = new Map<HTMLElement, boolean>()
	private readonly mobile = matchMedia('(max-width: 600px), (pointer: coarse) and (max-height: 480px)')
	private readonly pane: HTMLElement
	private registration?: Registration

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
		this.dock    = required('.right-pane-dock')
		this.heading = required('#right-pane-title')
		this.pane    = required('.right-pane')
		this.command.addEventListener('click', this.toggle)
		this.container.addEventListener('keydown', this.keydown)
		this.mobile.addEventListener('change', this.responsive)
		this.render()
		panes.set(container, this)
	}

	dispose(): void
	{
		if (this.disposed) return
		this.registration?.handle.remove()
		this.disposed = true
		this.command.removeEventListener('click', this.toggle)
		this.container.removeEventListener('keydown', this.keydown)
		this.mobile.removeEventListener('change', this.responsive)
		panes.delete(this.container)
	}

	private keydown = (event: KeyboardEvent): void => {
		if (!this.registration?.open || this.registration.tokens.size) return
		if (event.key === 'Escape') {
			event.preventDefault()
			this.registration.handle.close()
		}
		if (!this.mobile.matches || event.key !== 'Tab') return
		const controls = [...this.pane.querySelectorAll<HTMLElement>(
			'button, a[href], input, select, textarea, [tabindex]'
		)].filter(element => !element.hasAttribute('disabled') && element.tabIndex >= 0 && element.getClientRects().length)
		const first = controls[0] ?? this.pane
		const last  = controls.at(-1) ?? this.pane
		if (event.shiftKey && (document.activeElement === first || !this.pane.contains(document.activeElement))) {
			event.preventDefault()
			last.focus()
		}
		else if (!event.shiftKey && (document.activeElement === last || !this.pane.contains(document.activeElement))) {
			event.preventDefault()
			first.focus()
		}
	}

	register(owner: object, content: HTMLElement, title: string): PaneHandle
	{
		if (this.disposed) throw new Error('The right pane has been disposed')
		const previous = this.registration
		if (previous) {
			if (previous.owner !== owner || previous.open || previous.tokens.size) throw new PaneOccupiedError()
			previous.content = content
			previous.scroll  = 0
			this.content.replaceChildren(content)
			this.heading.textContent = title
			this.render()
			return previous.handle
		}
		const current = (): boolean => this.registration === registration
		const handle: PaneHandle = {
			close: () => {
				if (!current()) return
				registration.open = false
				this.render()
				this.command.focus({ preventScroll: true })
			},
			open: () => {
				if (!current()) return
				registration.open = true
				this.render()
				if (!registration.tokens.size) this.command.focus({ preventScroll: true })
			},
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
			suspend: () => {
				const token = {}
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
		const registration: Registration = { content, handle, listeners: new Set(), open: false, owner,
			scroll: 0, tokens: new Set() }
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
		if (!this.pane.hidden && !open && this.registration) this.registration.scroll = this.content.scrollTop
		this.pane.hidden    = !open
		this.command.hidden = !present
		this.container.classList.toggle('right-pane-open', open)
		this.command.setAttribute('aria-expanded', String(open))
		this.command.setAttribute('aria-label', `${open ? 'Close' : 'Open'} ${this.heading.textContent || 'pane'}`)
		this.command.querySelector('.right-pane-label')!.textContent = open ? 'Close pane' : 'Open pane'
		this.command.querySelector('[aria-hidden]')!.textContent = open ? '›' : '‹'
		const destination = open ? this.heading.parentElement! : this.dock
		if (this.command.parentElement !== destination) destination.prepend(this.command)
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

	private responsive = (): void => {
		this.render()
		if (this.state().open && this.mobile.matches && !this.pane.contains(document.activeElement))
			this.command.focus({ preventScroll: true })
	}

	private state(): PaneState
	{
		const registration = this.registration
		return { present: !!registration, open: !!registration?.open && !registration.tokens.size,
			suspended: !!registration?.tokens.size }
	}

	private toggle = (): void => {
		const handle = this.registration?.handle
		if (this.state().open) handle?.close()
		else handle?.open()
	}

}
