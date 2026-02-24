# WaffleList

A single-user todo/task management app with smart views, real-time sync, and a three-pane UI.

## Tech Stack

- **Frontend**: Svelte 5 (runes syntax) + SvelteKit 2 + TypeScript
- **Backend**: SvelteKit API routes with @sveltejs/adapter-node
- **Database**: SQLite via better-sqlite3 (WAL mode, foreign keys on)
- **Real-time**: Server-Sent Events (SSE) for cross-client sync
- **IDs**: UUID v4

## Commands

```bash
npm run dev      # Dev server with HMR
npm run build    # Production build (output: /build/)
npm run preview  # Preview production build
```

No test framework is configured.

## Project Structure

```
src/
  lib/
    components/       # Svelte components (TodoList, TodoItem, AddTodo, Sidebar, DetailSidebar)
    server/
      db.ts           # Database init, schema, connection
      sync.ts         # SSE broadcast/listener system
    stores/
      todos.ts        # Svelte stores + API call functions
    types.ts          # TypeScript interfaces (User, List, Todo, Counts)
  routes/
    +layout.svelte    # Root layout (sync init, list/count loading)
    +page.svelte      # Redirects to /inbox
    inbox/            # Inbox view (tasks with no list)
    today/            # Due today view
    week/             # Due this week view
    all/              # All active tasks
    snoozed/          # Snoozed tasks view
    list/[id]/        # Custom list view
    api/
      todos/          # GET/POST, [id] PATCH/DELETE
      lists/          # GET/POST, [id] PATCH/DELETE
      sync/           # SSE endpoint
      counts/         # View count badges
data/
  wafflelist.db       # SQLite database (gitignored)
```

## Architecture

- **State**: Svelte writable stores (`todos`, `lists`, `searchQuery`, `selectedTodoId`, `counts`) with co-located API functions
- **Sync**: Mutations broadcast via `sync.ts` -> SSE -> clients dispatch `sync-reload` window event -> pages reload data
- **Views**: Smart views filter by date/list/snooze status via `view` query param on GET /api/todos
- **Sort order**: REAL numbers for fractional reordering (drag-and-drop friendly)
- **Completion**: `completed_at` timestamp (null = active); no soft deletes
- **Inbox**: Tasks with `list_id IS NULL`
- **Snooze**: `snoozed_until` date hides tasks from views until that date

## Data Model

- **Todo**: id, user_id, list_id?, title, notes?, due_date?, reminder_date?, snoozed_until?, completed_at?, sort_order (REAL), created_at (INTEGER ms)
- **List**: id, user_id, name, icon?, sort_order (REAL), created_at (INTEGER ms)
- **User**: id, username, password_hash (not implemented), encryption_public_key?, created_at

Default user `'default-user'` is seeded on startup. No auth layer exists.

## Conventions

- Svelte 5 runes (`$props`, `$derived`, `$effect`, `$state`) — not legacy `$:` syntax
- REST API with JSON bodies; SvelteKit `+server.ts` handlers
- Raw SQL with parameterized queries (no ORM)
- Dates: `created_at` is INTEGER (ms epoch); date fields (`due_date`, etc.) are TEXT ISO strings (YYYY-MM-DD)
- Database path: `process.cwd() + '/data/wafflelist.db'`
