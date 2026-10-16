[![npm version](https://img.shields.io/npm/v/@itrocks/home?logo=npm)](https://www.npmjs.org/package/@itrocks/home)
[![npm downloads](https://img.shields.io/npm/dm/@itrocks/home)](https://www.npmjs.org/package/@itrocks/home)
[![GitHub](https://img.shields.io/github/last-commit/itrocks-ts/home?color=2dba4e&label=commit&logo=github)](https://github.com/itrocks-ts/home)
[![issues](https://img.shields.io/github/issues/itrocks-ts/home)](https://github.com/itrocks-ts/home/issues)
[![discord](https://img.shields.io/discord/1314141024020467782?color=7289da&label=discord&logo=discord&logoColor=white)](https://25.re/ditr)

# home

Default responsive it.rocks app container with navigation, user session, breadcrumb and notifications.

*This documentation was written by an artificial intelligence and may contain errors or approximations.
It has not yet been fully reviewed by a human. If anything seems unclear or incomplete,
please feel free to contact the author of this package.*

## Installation

```bash
npm i @itrocks/home
```

## Usage

`@itrocks/home` provides a default "home" action for your it.rocks
application: a responsive layout that renders the main application
container, navigation, user session area, breadcrumb and notifications.

In most projects you do not instantiate `Output` yourself. Instead, it is
automatically discovered and wired by the
[@itrocks/framework](https://github.com/itrocks-ts/framework) / routing
stack. The only thing you usually have to do is include the module in your
application build and, optionally, provide an `output.html` template.

### Minimal example with the framework

```ts
// index.ts
import { bootstrap } from '@itrocks/framework'

// Importing '@itrocks/home' is enough for the `Output` action to be
// registered on the root route `/`.
import '@itrocks/home'

bootstrap()
```

When a user hits the `/` route, the `Output` action from
`@itrocks/home` is executed and returns an HTML page based on the
`output.html` template bundled with the module.

If you need to customise the layout, you can copy the default
`output.html` from the GitHub repository and adapt it in your own
project (keeping the same structure so that the action can still render
navigation, breadcrumb and notifications correctly).

## API

The backend API exposes `Output`. The browser API provides a [generic right pane](#generic-right-pane).

### `class Output extends Action`

`Output` is an [@itrocks/action](https://github.com/itrocks-ts/action)
action decorated as the root route of your application.

From the generated JavaScript you can see that it is decorated with:

- `@Need(NOTHING)` – declares that the action does not require any
  particular domain object or dependency.
- `@Route('/')` – binds the action to the root path `/`.

#### Methods

##### `html(request: Request): Promise<HtmlResponse>`

Builds the HTML response for the home page.

```ts
import { Output } from '@itrocks/home'
import type { Request } from '@itrocks/action-request'

const output = new Output()

async function home (request: Request) {
	const response = await output.html(request)
	// response is an HtmlResponse from @itrocks/core-responses
	return response
}
```

Internally, `html` delegates to `htmlTemplateResponse` from the
`Action` base class with the bundled `output.html` template, which
handles:

- injecting the main container markup,
- inserting the navigation and breadcrumb built from your
  [@itrocks/route](https://github.com/itrocks-ts/route) configuration,
- rendering user session information and notifications.

There is no JSON variant for this action: it is meant to serve the main
HTML shell of your application.

## Typical use cases

- Provide a ready‑to‑use default home page for a fresh it.rocks
  application.
- Quickly bootstrap a back‑office or admin interface with a consistent
  layout (navigation, breadcrumb, notifications) without writing the
  container HTML yourself.
- Share the same home layout across multiple projects by reusing the
  `@itrocks/home` module and, if needed, slightly overriding the
  template.

## Generic right pane

The default container loads `container.js` and `right-pane.css`. Its movable fold command and selected feature tab
appear when content is registered. New content starts folded. Desktop opening reduces the main region's width;
mobile opening occupies the screen, contains keyboard focus and temporarily makes the remaining shell inert.
Mobile uses the shared 600 px breakpoint, plus coarse pointers in landscape at heights up to 480 px.
On desktop, drag the pane's left edge to resize it. The separator also supports the left and right arrow keys;
the selected width remains in place when the pane is folded and reopened.

```ts
import { rightPaneOf } from '@itrocks/home/right-pane.js'

const content = document.createElement('section')
content.textContent = 'Your content'
const pane = rightPaneOf()
const handle = pane.register({}, content, 'Details')
const unsubscribe = handle.subscribe(state => console.log(state))
handle.open()
const temporaryFold = handle.suspend()
temporaryFold.restore()
handle.close()
unsubscribe()
handle.remove()
```

`rightPaneOf(container = document.body): RightPane` returns the service for a configured home container. A custom
container must preserve `.right-pane`, `.right-pane-dock`, `.right-pane-resize`, `.right-pane-toggle`,
`.right-pane-tab`, `#right-pane-title` and `#right-pane-content`, including the command's label/icon children.
Importing the API has no activation side effects.
`new RightPane(container)` explicitly constructs a service and rejects duplicate construction for the same container.
`dispose()` removes content and listeners, invalidates outstanding handles/tokens and permits a fresh service.

`register(owner: object, content: HTMLElement, title: string): PaneHandle` moves the element into the pane. A competing
owner throws `PaneOccupiedError`. The same owner may update title/content through repeated registration while folded
and unsuspended, retaining its handle. Open or suspended registrations reject replacement. Call `remove()` when the
owning view is disposed or navigated away from; it is idempotent and allows the next owner to register.

`PaneHandle` exposes `open()`, `close()`, `remove()`, `suspend()` and `subscribe(listener)`. Subscriptions immediately
receive `{ present, open, suspended }`, then receive changes synchronously, including the final absent state on removal.
The returned unsubscribe function removes the listener. A removed handle cannot affect another owner.
`open` describes visible presentation; a suspended handle is folded even if it was previously open.

`suspend({ mobileOnly: true })` reserves a token that folds only in the pane's mobile layout. The same token follows
viewport/orientation changes; desktop stays interactive and open. Omission preserves unconditional suspension.
Nested `suspend()` calls return independent, idempotent `{ restore() }` tokens. The final valid restoration recovers the
preceding open and scroll state without focusing content. Explicit `open()` or `close()` during suspension updates the
requested final state. Removal/disposal makes old tokens harmless. Folding preserves the content element and its input,
scroll and application state. Explicit close and Escape focus the visible movable command.

The pane uses the application's light palette, with a feature bar aligned to the application breadcrumb,
a title bar aligned to list actions and a grey separator.
The pane fades in over 120 ms unless reduced motion is requested.
The browser API imports no framework, selector or model
adapter. The backend root export remains `Output`.

The configured `container.js` announces `itrocks:right-pane-ready` on `document`, with a structurally typed
`detail.register(owner, content, title)` callback bound to its pane. Consumers may dispatch `itrocks:right-pane-request`
to replay the announcement, so either script loading order works. This bridge imports no consumer or framework module.
The breadcrumb reserves enough height for the movable command, keeping controls in the first main header accessible.
