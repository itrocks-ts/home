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

The public API of `@itrocks/home` is intentionally small. It exposes a
single `Output` action class.

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
import { Output } from '@itrocks/home/cjs/output.js'
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
