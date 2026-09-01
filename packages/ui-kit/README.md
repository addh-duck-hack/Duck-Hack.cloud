# @duck-hack/ui-kit

React components shared between `frontend-admin` and `frontend-user`. Today
those two apps share zero code (not even a `Loader`) — this package exists so
a component built for one store's admin/storefront UI can be reused by every
other store's app instead of being copy-pasted per client. See
`docs/adr-monorepo-shared-packages.md` for the wider decision this is part of.

## Usage

Import from the package name, same as any other dependency:

```jsx
import { ExampleBadge } from "@duck-hack/ui-kit";
```

## What's here now

Only `ExampleBadge`, a trivial component that proves the npm workspace link
resolves (and that Vite can transform a `.jsx` file pulled in through a
workspace symlink) end-to-end from both `frontend-admin` and `frontend-user`.
Neither app imports it yet — wiring in a first real shared component (e.g. a
unified `Loader`) is phase-2 follow-up work, not part of this foundation.

## Scope boundary

Components here should stay presentation-only and free of app-specific
routing/auth assumptions (no `HashRouter` vs `BrowserRouter` coupling, no
direct `localStorage` role checks) so the same component works unmodified in
both `frontend-admin` (`HashRouter`, staff roles) and `frontend-user`
(`BrowserRouter`, customers).
