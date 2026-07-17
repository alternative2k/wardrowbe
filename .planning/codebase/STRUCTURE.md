# Codebase Structure

**Analysis Date:** 2026-07-17

## Directory Layout

```
wardrowbe/
├── backend/                   # Python FastAPI backend + async workers
│   ├── app/                   # Application package
│   │   ├── api/               # Route handlers (controllers)
│   │   ├── models/            # SQLAlchemy ORM models
│   │   ├── schemas/           # Pydantic request/response schemas
│   │   ├── services/          # Business logic layer
│   │   ├── utils/             # Cross-cutting utilities
│   │   ├── workers/           # ARQ background job workers
│   │   ├── prompts/           # AI prompt templates (text files)
│   │   ├── config.py          # Settings (pydantic-settings)
│   │   ├── database.py        # Async DB engine + session factory
│   │   ├── main.py            # FastAPI app entry point
│   │   └── __init__.py
│   ├── migrations/            # Alembic migration scripts
│   ├── tests/                 # Pytest test suite
│   ├── scripts/               # Utility scripts
│   ├── pyproject.toml         # Python project config + Ruff settings
│   ├── requirements.txt       # Production dependencies
│   ├── requirements-test.txt  # Test dependencies
│   ├── requirements-extras.txt
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   ├── alembic.ini
│   ├── pytest.ini
│   └── uv.lock
├── frontend/                  # Next.js 14 frontend
│   ├── app/                   # Next.js App Router pages + API routes
│   │   ├── (auth)/            # Route group (currently empty/renamed)
│   │   ├── api/               # Next.js API routes (NextAuth proxy)
│   │   ├── auth/              # Auth pages (logout)
│   │   ├── dashboard/         # Main app pages (wardrobe, outfits, etc.)
│   │   ├── invite/            # Family invite acceptance page
│   │   ├── login/             # Login page
│   │   ├── onboarding/        # Multi-step onboarding wizard
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Landing page (public)
│   │   ├── providers.tsx      # React Query + Auth + Theme providers
│   │   ├── globals.css        # Tailwind base styles
│   │   ├── error.tsx          # Global error boundary
│   │   └── not-found.tsx      # 404 page
│   ├── components/            # React components
│   │   ├── ui/                # shadcn-style primitives (Radix UI)
│   │   ├── shared/            # Domain-specific shared components
│   │   ├── outfits/           # Outfit display components
│   │   ├── studio/            # Studio editor components
│   │   └── *.tsx              # Page-level sections (sidebar, header, etc.)
│   ├── lib/                   # Application logic
│   │   ├── hooks/             # TanStack React Query hooks (13 hooks)
│   │   ├── studio/            # Studio editor utilities (6 modules)
│   │   ├── api.ts             # HTTP client with auth
│   │   ├── auth.ts            # NextAuth configuration
│   │   ├── types.ts           # TypeScript interfaces (matches backend schemas)
│   │   ├── utils.ts           # Shared utilities (cn, chunkArray, etc.)
│   │   ├── lightbox-context.tsx
│   │   ├── temperature.ts     # Temperature display helpers
│   │   └── location.ts
│   ├── public/                # Static assets (icons, favicon, logo)
│   ├── tests/                 # Vitest test suite
│   ├── types/                 # TypeScript declaration files
│   ├── next.config.js         # Next.js config (rewrites, standalone output)
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── postcss.config.js
│   ├── vitest.config.ts
│   ├── package.json
│   └── components.json        # shadcn UI components config
├── k8s/                       # Kubernetes manifests
│   ├── backend.yaml
│   ├── frontend.yaml
│   ├── worker.yaml
│   ├── postgres.yaml
│   ├── redis.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── secrets.yaml / secrets.yaml.template
│   ├── namespace.yaml
│   ├── network-policy.yaml
│   └── kustomization.yaml
├── nginx/                     # Nginx reverse proxy config
│   ├── nginx.conf
│   └── templates/
├── screenshots/               # App screenshots (for README/docs)
├── .github/                   # GitHub Actions CI/CD
├── .planning/                 # Planning & codebase analysis documents
├── docker-compose.yml         # Production compose
├── docker-compose.dev.yml     # Dev compose
├── docker-compose.prod.yml    # Full production compose
├── docker-compose.oidc-test.yml  # OIDC testing compose
├── Caddyfile.dev              # Caddy reverse proxy for HTTPS dev
├── .env.example               # Environment variable template
├── .pre-commit-config.yaml    # Pre-commit hooks
├── .release-please-manifest.json
├── release-please-config.json
├── CHANGELOG.md
├── CONTRIBUTING.md
├── README.md
├── SECURITY.md
└── LICENSE
```

## Directory Purposes

### Backend Directories

**`backend/app/api/`:**
- Purpose: HTTP route handlers — the "controller" layer. Each file maps to a domain resource.
- Contains: 14 route modules, each instantiating an `APIRouter` with prefix/tags, then included in `router.py`
- Key files: `router.py` (aggregates all sub-routers at `/api/v1`), `health.py` (health checks + capabilities reporting), `items.py` (largest, 1287 lines — CRUD + bulk upload + AI tagging triggers)
- Convention: One file per domain resource, routes use FastAPI dependency injection for DB sessions and auth

**`backend/app/services/`:**
- Purpose: All domain business logic — services are instantiated with a DB session and expose async methods
- Contains: 17 service classes
- Key files: `ai_service.py` (OpenAI-compatible API client, image analysis, text generation), `recommendation_service.py` (outfit generation pipeline), `learning_service.py` (feedback processing), `notification_service.py` (dispatcher), `item_service.py` (CRUD + filtering)

**`backend/app/models/`:**
- Purpose: SQLAlchemy 2.0 declarative models mapped to PostgreSQL tables
- Contains: 9 model modules (some with multiple table classes — `item.py` has `ClothingItem`, `ItemHistory`, `WashHistory`, `ItemImage`)
- Key files: `item.py` (clothing items with tags, images, wash tracking), `learning.py` (learning profiles, pair scores, outfit performance, style insights), `outfit.py` (outfits with items, feedback, source tracking)

**`backend/app/schemas/`:**
- Purpose: Pydantic v2 models for API request/response serialization
- Key files: `item.py` (290 lines — ItemCreate, ItemUpdate, ItemFilter, ItemListResponse, BulkUploadResponse, etc.), `notification.py` (provider configs — NtfyConfig, EmailConfig, ExpoPushConfig)

**`backend/app/workers/`:**
- Purpose: ARQ background worker definitions — separate process from FastAPI
- Key files: `worker.py` (startup/shutdown, cron definitions, stale item recovery), `tagging.py` (AI image tagging job), `notifications.py` (notification dispatch, schedule checking, learning profile updates)
- Note: Workers use their own DB session management (`workers/db.py`), not the FastAPI dependency

**`backend/app/utils/`:**
- Purpose: Infrastructure and cross-cutting utilities
- Key files: `auth.py` (JWT decode, `get_current_user` dependency), `clothing.py` (body slot mapping, deduplication), `oidc.py` (OIDC token validation), `signed_urls.py` (HMAC-signed image URLs), `rate_limit.py`, `redis_lock.py`

**`backend/app/prompts/`:**
- Purpose: Plain text prompt templates for AI model calls
- Files: `clothing_analysis.txt`, `clothing_description.txt`, `item_pairing.txt`, `recommendation.txt`

**`backend/migrations/`:**
- Purpose: Alembic database migration scripts
- Versions: 20 migration files covering initial schema through studio schema, wash tracking, learning system, AI tagging fields, etc.

**`backend/tests/`:**
- Purpose: Pytest test suite (~27 test files)
- Config: `pytest.ini` with `asyncio_mode=auto`

### Frontend Directories

**`frontend/app/`:**
- Purpose: Next.js 14 App Router — all routes, pages, and layouts
- Structure:
  - `page.tsx` — Landing page (public, `/`)
  - `layout.tsx` — Root layout (Inter font, Providers wrapper)
  - `providers.tsx` — Composition root: SessionProvider → AuthProvider → QueryClientProvider → ThemeProvider
  - `login/page.tsx` — Login with OIDC + Dev credentials
  - `onboarding/page.tsx` — 5-step wizard (welcome → family → location → preferences → first upload)
  - `invite/page.tsx` — Family invite token acceptance
  - `dashboard/` — Authenticated app shell
    - `layout.tsx` — Dashboard layout (sidebar, mobile-nav, header, lightbox)
    - `page.tsx` — Dashboard home (weather, pending outfits, stats, quick actions)
    - `wardrobe/page.tsx` — Clothing item grid with filtering/sorting
    - `outfits/page.tsx` — Outfit history + suggestions
    - `outfits/new/page.tsx` — Outfit creation flow
    - `outfits/[id]/page.tsx` — Single outfit detail
    - `analytics/page.tsx` — Usage analytics
    - `settings/page.tsx` — User preferences
    - `family/page.tsx` — Family management
    - `family/feed/page.tsx` — Family activity feed
    - `suggest/page.tsx` — AI suggestions
    - `pairings/page.tsx` — Item pairings
    - `history/page.tsx` — Wear history
    - `learning/page.tsx` — AI learning insights
    - `notifications/page.tsx` — Notification settings
  - `api/auth/[...nextauth]/route.ts` — NextAuth API handler

**`frontend/components/ui/`:**
- Purpose: Primitive UI components (shadcn-style, built on Radix UI primitives)
- Files: 18 components — `button.tsx`, `card.tsx`, `dialog.tsx`, `input.tsx`, `select.tsx`, `tabs.tsx`, `switch.tsx`, `slider.tsx`, `tooltip.tsx`, `badge.tsx`, `avatar.tsx`, `checkbox.tsx`, `collapsible.tsx`, `label.tsx`, `progress.tsx`, `scroll-area.tsx`, `skeleton.tsx`, `textarea.tsx`, `alert.tsx`, `alert-dialog.tsx`
- Pattern: `cva()` for variants, `cn()` for class merging, forwardRef, accessible via Radix

**`frontend/lib/hooks/`:**
- Purpose: Custom React hooks wrapping TanStack React Query for each domain entity
- Pattern: Each hook file exports `use{Entity}()` and `use{Entity}Mutation()` pairs
- Key hooks: `use-items.ts` (833 lines — CRUD + bulk upload + bulk analyze + filters + wash tracking), `use-outfits.ts`, `use-pairings.ts`

**`frontend/lib/studio/`:**
- Purpose: Studio editor state management and utilities
- Files: `editor-state.ts` (state machine reducer), `draft-storage.ts` (localStorage), `edit-load.ts` (patch generation), `ai-assist-merge.ts`, `canonical-order.ts`, `errors.ts`

## Key File Locations

**Entry Points:**
- `backend/app/main.py`: FastAPI application factory — lifespan, middleware, router mounting
- `backend/app/workers/worker.py`: ARQ worker — startup/shutdown, cron jobs, job functions
- `frontend/app/page.tsx`: Public landing page
- `frontend/app/dashboard/layout.tsx`: Authenticated app shell with sidebar/nav
- `frontend/app/layout.tsx`: Root layout with font and providers

**Configuration:**
- `backend/app/config.py`: All backend settings via pydantic-settings (env file + env vars)
- `backend/pyproject.toml`: Ruff linting/formatting, pytest, coverage config
- `frontend/next.config.js`: Next.js build config, API rewrites to backend
- `frontend/tailwind.config.js`: Tailwind CSS theme
- `frontend/components.json`: shadcn UI component registry
- `frontend/tsconfig.json`: TypeScript path aliases (`@/` → `./`)

**Core Logic:**
- `backend/app/services/ai_service.py`: AI vision/text orchestration
- `backend/app/services/recommendation_service.py`: Outfit generation pipeline (899 lines)
- `backend/app/services/learning_service.py`: Feedback learning system (1168 lines)
- `backend/app/services/item_service.py`: Item business logic (416 lines)
- `frontend/lib/api.ts`: HTTP client with auth and error handling
- `frontend/lib/types.ts`: TypeScript interfaces mirroring backend schemas

**Testing:**
- `backend/tests/`: ~27 pytest files covering services, APIs, workers
- `frontend/tests/`: Vitest tests for API client, hooks, utils, studio

## Naming Conventions

**Files:**
- **Backend Python**: `snake_case.py` — one file per logical unit (e.g., `item_service.py`, `recommendation_service.py`, `use-analytics.ts`)
- **Frontend React**: `kebab-case.tsx` for components (e.g., `add-item-dialog.tsx`, `outfit-preview-dialog.tsx`), `kebab-case.ts` for utilities (e.g., `use-items.ts`, `draft-storage.ts`)
- **Frontend pages**: `page.tsx` (convention from Next.js App Router)
- **Migration files**: `descriptive_snake_case.py` prefixed with `add_` or numeric hash

**Directories:**
- Backend: `snake_case/` (api, models, schemas, services, utils, workers, prompts)
- Frontend: lowercase singular (ui, shared, outfits, studio, hooks), App Router uses route groups `(group)/` and parameter folders `[param]/`

**Functions/Variables:**
- **Backend**: `snake_case` for functions, variables, modules; `PascalCase` for classes (e.g., `ItemService`, `ClothingItem`, `OutfitStatus`)
- **Frontend**: `camelCase` for functions and variables, `PascalCase` for components and TypeScript interfaces

**API Routes:**
- Backend: plural nouns (`/items`, `/outfits`, `/users`, `/families`, `/pairings`, `/notifications`, `/images`, `/auth`, `/preferences`, `/weather`, `/analytics`, `/learning`)
- Prefix: All routes under `/api/v1/`
- Health: `/health`, `/health/ready`, `/health/ai`, `/health/features`

## Where to Add New Code

**New Feature (Backend):**
1. Schema: `backend/app/schemas/{feature}.py` — Pydantic request/response models
2. Model: `backend/app/models/{feature}.py` — SQLAlchemy ORM model(s)
3. Service: `backend/app/services/{feature}_service.py` — Business logic class
4. API routes: `backend/app/api/{feature}.py` — FastAPI router with CRUD endpoints
5. Register in `backend/app/api/router.py` — `api_router.include_router(router)`
6. Migration: `backend/migrations/versions/` — Alembic migration for any schema changes
7. Export in `backend/app/schemas/__init__.py` and `backend/app/models/__init__.py`

**New Feature (Frontend):**
1. Types: `frontend/lib/types.ts` — TypeScript interfaces for API responses
2. API hook: `frontend/lib/hooks/use-{feature}.ts` — React Query hooks
3. Components: `frontend/components/{feature}/` — Feature-specific components
4. Page: `frontend/app/dashboard/{feature}/page.tsx` — Route page
5. If new route group needed: create directory under `frontend/app/dashboard/{feature}/`

**New UI Component:**
- Implementation: `frontend/components/ui/{component}.tsx` — shadcn-style primitive
- Pattern: Copy existing `frontend/components/ui/button.tsx` pattern (forwardRef, cva, cn, Radix primitive)

**New Utility:**
- Backend: `backend/app/utils/{utility}.py` — Pure function module
- Frontend: `frontend/lib/{utility}.ts` or inline in existing utility file

**New Background Job:**
- Job function: `backend/app/workers/{job}.py` — Async function with `ctx` param
- Register in `backend/app/workers/worker.py` — Add cron or expose via function reference

## Special Directories

**`backend/migrations/`:**
- Purpose: Alembic version-controlled database migrations
- Generated: Yes (via `alembic revision --autogenerate`)
- Committed: Yes — all migrations tracked in git

**`frontend/public/`:**
- Purpose: Static assets served directly by Next.js
- Generated: No (icons are hand-placed)
- Committed: Yes

**`.planning/`:**
- Purpose: Codebase analysis documents and implementation plans
- Generated: Yes (by `/gsd-map-codebase` and `/gsd-plan-phase`)
- Committed: Yes — shared context for future GSD sessions

**`k8s/`:**
- Purpose: Kubernetes deployment manifests with Kustomize
- Generated: No
- Committed: Yes

**`screenshots/`:**
- Purpose: App screenshots for documentation
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-07-17*
