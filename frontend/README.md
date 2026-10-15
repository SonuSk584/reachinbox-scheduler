# ReachInbox frontend

React 19 + TypeScript + Vite + Tailwind CSS 4. Data fetching with TanStack Query, routing with React Router, rich text with TipTap.

```bash
cp .env.example .env
npm install
npm run dev        # http://localhost:5173
```

The dev server proxies `/api` to `http://localhost:4000`, so the browser only ever talks to one origin (no CORS setup, and session cookies will work when Google login lands).

## Structure

```
src/
  main.tsx                 providers: React Query, Router, Auth
  App.tsx                  routes + toast host
  index.css                Tailwind + design tokens (colors, fonts) + rich-text styles
  config/env.ts            typed access to VITE_* variables
  types/api.ts             response/request types shared by api + UI
  api/                     one thin module per backend resource (fetch wrapper, ApiError)
  hooks/                   React Query hooks, query keys, small utilities
  lib/                     pure helpers: dates, email extraction, class names, error messages
  components/
    ui/                    reusable primitives: Button, IconButton, Input, Avatar, Skeleton,
                           StatusBadge, EmptyState, ErrorState, Spinner
    layout/                AppLayout, Sidebar, UserMenu
  features/
    auth/                  AuthProvider, ProtectedRoute, LoginPage
    inbox/                 InboxPage (Scheduled + Sent), EmailRow, SearchBar, Pagination, skeleton
    email-detail/          EmailDetailPage
    compose/               ComposePage, RecipientsField (chips + CSV), RichTextEditor,
                           EditorToolbar, SendLaterControl, useComposeForm
  routes/AppRoutes.tsx     route table (Compose is lazy-loaded)
  test/                    test setup and helpers
```

Rule of thumb: `components/` is generic and knows nothing about emails; `features/` owns screens and their logic; `api/` is the only place that calls `fetch`.

## Behaviour notes

- **Auth:** `ProtectedRoute` asks `GET /api/auth/me`. A 401 anywhere clears the user and redirects to `/login`.
- **Live data:** lists and sidebar counts refetch every 10 seconds and via the refresh button.
- **Search:** debounced, stored in the URL (`?q=`), sent to the backend as `q`.
- **Compose:** To accepts typed, pasted, or uploaded (.csv/.txt) addresses, de-duplicated, with a live count. "Send" schedules immediately; the clock opens Send Later and the button becomes "Send Later".
- **Safety:** email bodies are sanitized with DOMPurify before rendering.
- **Not wired yet (visible but disabled):** attachments, filters, star/archive/delete, Connect Slack.
