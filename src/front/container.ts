import { rightPaneOf } from './right-pane.js'

const pane = rightPaneOf()
const announce = () => document.dispatchEvent(new CustomEvent('itrocks:right-pane-ready', {
	detail: { register: pane.register.bind(pane) }
}))

// Replay on request so configured consumers can activate in either module-loading order.
document.addEventListener('itrocks:right-pane-request', announce)
announce()
