# routefolk

A Progressive Web App for planning, journaling, and archiving motorcycle trips taken with friends.

## Current development state

This package includes the Phase 3.9H access-message hotfix and modularisation work. The app now checks database app membership before checking the schema version, so signed-in but non-allowed users see an explicit app-access message rather than a misleading migration warning.

## App membership

Allowed users are defined in Supabase, in `public.app_members`. Google OAuth only controls who can sign in; `public.app_members` controls who can access app data.

To list allowed users, run this in Supabase SQL Editor:

```sql
select email, role, active, created_at, updated_at
from public.app_members
order by active desc, lower(email);
```

To list signed-in users who are not active app members, run:

```sql
select
  u.email,
  u.created_at as signed_up_at,
  u.last_sign_in_at,
  m.role,
  m.active
from auth.users u
left join public.app_members m
  on lower(m.email) = lower(u.email)
where m.email is null
   or m.active = false
order by u.created_at desc;
```

Do not commit real user lists to the public repository. Keep operational documentation in `/docs/`, which is ignored by Git.

## Database migrations

Run migrations in order. This package adds:

- `011_app_access_state.sql` — adds `get_current_app_access()` and sets `schema_version = 011`.

## Project structure

```text
routefolk/
├── app.js
├── index.html
├── sw.js
├── lib/
│   ├── access.js
│   ├── auth.js
│   ├── expenses.js
│   ├── gpx.js
│   ├── journal.js
│   ├── meta.js
│   ├── profiles.js
│   ├── stages.js
│   └── trips.js
├── components/
├── constants/
├── screens/
├── state/
├── utils/
├── migrations/
└── docs/              # local/private; ignored by Git
```

## Refactor status

Extracted so far:

- shared state/constants/utils
- modal/toast/feedback/stats/trip-card components
- Trips screen
- Account screen
- Archive screen
- Trip Summary screen
- Trip Detail shell
- Trip Detail stage rendering

Next safe development steps:

1. Extract Trip Detail expense rendering.
2. Extract modal form rendering.
3. Add Playwright smoke tests before deeper controller refactors.

## Commit message

```bash
git commit -m "fix(access): show explicit non-member message"
```
