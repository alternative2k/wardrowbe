# Architecture

**Analysis Date:** 2026-07-17

## Pattern Overview

**Overall:** Layered monolith with async worker architecture. The system follows a strict 4-layer separation (API → Service → Model/Database → External) within a single Python backend, with a separate Next.js frontend consuming the REST API. Background async processing via ARQ workers handles AI tagging, notifications, and scheduled tasks.

**Key Characteristics:**
- **Layered Monolith (Backend)**: FastAPI application with clear `api` (routes/controllers), `services` (business logic), `models` (SQLAlchemy ORM), `schemas` (Pydantic validation) separation
- **Thin API Layer**: Route handlers (`backend/app/api/*.py`) are minimal — they validate input, delegate to services, return responses
- **Fat Service Layer**: All business logic lives in `backend/app/services/*.py` — domain operations, AI orchestration, recommendation, notification dispatch
- **Background Workers**: Separate ARQ worker process (`backend/app/workers/`) handles AI tagging, notification sending, scheduled tasks, and periodic maintenance
- **BRIDGE Pattern (AI Capabilities)**: The `ai_service.py` wraps OpenAI-compatible APIs and has a capability-bridge model where external agents can handle vision/text tasks when internal AI is disabled
- **Feature-based Route Grouping (Frontend)**: Next.js 14 App Router with routes grouped by feature (`/dashboard/wardrobe`, `/dashboard/outfits`, `/dashboard/settings`, etc.)
- **Saga-like Data Fetching**: Frontend uses TanStack React Query with custom hooks (`lib/hooks/use-*.ts`) for all server state — automatic caching, refetching, and optimistic updates

## Backend Layers

**API Layer (Controllers):**
- Purpose: HTTP request handling, input validation, response formatting, auth enforcement
- Location: `backend/app/api/`
- Contains: 14 route modules (`items.py`, `outfits.py`, `auth.py`, `users.py`, `images.py`, `pairings.py`, `families.py`, `weather.py`, `analytics.py`, `learning.py`, `notifications.py`, `preferences.py`, `health.py`, `router.py`)
- Depends on: `services/*`, `schemas/*`, `utils/auth.py`, `database.py`
- Used by: Frontend HTTP clients, external agents

**Service Layer:**
- Purpose: All business logic — item management, AI orchestration, outfit recommendations, notification dispatch, learning/feedback processing, weather, image processing
- Location: `backend/app/services/`
- Contains: 17 services (`ai_service.py`, `item_service.py`, `outfit_service.py`, `recommendation_service.py`, `learning_service.py`, `notification_service.py`, `weather_service.py`, `image_service.py`, `user_service.py`, `family_service.py`, `studio_service.py`, `pairing_service.py`, `preference_service.py`, `item_scorer.py`, `suggestion_cache.py`, `notification_providers.py`, `background_removal.py`)
- Depends on: `models/*`, `schemas/*`, `utils/*`, external APIs (OpenAI, Open-Meteo, ntfy)
- Used by: `api/*`, `workers/*`

**Model Layer (ORM):**
- Purpose: SQLAlchemy declarative models mapping to PostgreSQL tables; defines schema, relationships, constraints
- Location: `backend/app/models/`
- Contains: 9 models (`user.py`, `item.py`, `outfit.py`, `learning.py`, `family.py`, `notification.py`, `preference.py`, `schedule.py`, `item.py` with multiple table classes)
- Depends on: `database.py` (Base class)
- Used by: `services/*`, `workers/*`, `utils/*`

**Schema Layer (Validation):**
- Purpose: Pydantic models for request validation, response serialization, and API contract definition
- Location: `backend/app/schemas/`
- Contains: 7 schema modules (`auth.py`, `item.py`, `user.py`, `family.py`, `notification.py`, `preference.py`, `outfit.py`)
- Depends on: `utils/signed_urls.py` (for computing signed image URLs in responses)
- Used by: `api/*` (request/response typing), `services/*` (input contracts)

**Worker Layer (Background Jobs):**
- Purpose: Async background processing for AI tagging, notifications, scheduled tasks, learning profile updates, stale recovery
- Location: `backend/app/workers/`
- Contains: `worker.py`, `tagging.py`, `notifications.py`, `db.py`, `settings.py`
- Runtime: Separate process launched by ARQ (`arq app.workers.worker.WorkerSettings`)
- Depends on: `services/*`, `models/*`, `utils/*`
- Communication: Redis (ARQ job queue)

**Utility Layer:**
- Purpose: Cross-cutting concerns — auth (JWT), rate limiting, image signing, OIDC validation, timezone helpers, redis distributed locking, clothing domain logic
- Location: `backend/app/utils/`
- Contains: `auth.py`, `clothing.py`, `oidc.py`, `prompts.py`, `rate_limit.py`, `redis_lock.py`, `signed_urls.py`, `timezone.py`

## Frontend Layers

**Pages & Routes (App Router):**
- Purpose: Route definitions and page-level components (server and client components)
- Location: `frontend/app/`
- Structure: Next.js 14 App Router with route groups: `(auth)/`, `/dashboard/` (with feature sub-routes), `/onboarding/`, `/invite/`, `/login/`
- Key routes: `/dashboard/wardrobe`, `/dashboard/outfits`, `/dashboard/outfits/new`, `/dashboard/outfits/[id]`, `/dashboard/settings`, `/dashboard/analytics`, `/dashboard/family`, `/dashboard/feed`, `/dashboard/suggest`, `/dashboard/pairings`, `/dashboard/history`, `/dashboard/learning`, `/dashboard/notifications`

**API Client Layer:**
- Purpose: HTTP client abstraction with auth token management, error handling, typed endpoints
- Location: `frontend/lib/api.ts`
- Patterns: Custom `fetch` wrapper with `ApiError`/`NetworkError` classes, bearer token injection, credentials forwarding
- Endpoint: All requests proxied through Next.js rewrites (`/api/v1/*` → backend)

**Hooks Layer (React Query):**
- Purpose: Data fetching, caching, and mutation hooks for every domain entity
- Location: `frontend/lib/hooks/`
- Contains: 13 hooks (`use-items.ts`, `use-outfits.ts`, `use-pairings.ts`, `use-weather.ts`, `use-auth.ts`, `use-user.ts`, `use-preferences.ts`, `use-family.ts`, `use-notifications.ts`, `use-analytics.ts`, `use-studio.ts`, `use-learning.ts`, `use-features.ts`)
- Pattern: Each hook wraps `useQuery`/`useMutation` from TanStack React Query, manages access tokens from NextAuth session

**Component Layer (UI):**
- Purpose: Reusable UI components
- Location: `frontend/components/`
- Sub-layers:
  - `ui/` — Primitive/shadcn-style components (button, card, dialog, input, select, tabs, etc.) built on Radix UI primitives
  - `shared/` — Domain-specific shared components (item-picker, occasion-chips, lineage-card, clone-to-lookbook-dialog)
  - `outfits/` — Outfit-specific components (outfit-card)
  - `studio/` — Studio/editor components (canvas-panel, details-panel)
  - Root level — Page-level sections (header, sidebar, mobile-nav, mobile-sidebar, item-detail-dialog, image-lightbox, etc.)

**Types Layer:**
- Purpose: TypeScript interfaces matching backend Pydantic schemas
- Location: `frontend/lib/types.ts`
- Pattern: Mirrors backend schema structure — `Item`, `Outfit`, `User`, `Family`, `Notification`, etc.

**Auth Layer:**
- Purpose: OIDC + dev credentials authentication via NextAuth.js
- Location: `frontend/lib/auth.ts`, `frontend/components/auth-provider.tsx`, `frontend/lib/hooks/use-auth.ts`
- Flow: NextAuth handles OAuth flow, JWT session, credentials provider for dev mode

## Data Flow

**Item Upload & Tagging Flow:**

1. User uploads image via `POST /api/v1/items` (with multipart upload) → `items.py` route handler
2. Route handler calls `ItemService.create()` → saves file via `ImageService`, creates DB record with `status=processing`
3. Route handler enqueues ARQ job: `await Job.enclose(tag_item_image, item_id=item.id)`
4. ARQ worker picks up job → `workers/tagging.py:tag_item_image()` calls `AIService.analyze_clothing()`
5. On success: `AIService` calls OpenAI-compatible vision API → parses structured tags → updates item record with `status=ready`
6. On failure (or if AI disabled): returns error or marks as ready with minimal tags
7. Frontend polls items endpoint (5s interval while items are processing) to detect state change

**Outfit Recommendation Flow:**

1. Triggered by schedule (cron in worker) or on-demand by user (`POST /api/v1/outfits/suggest`)
2. `RecommendationService.generate_outfit()`:
   a. Fetches user's available items, preferences, weather data
   b. Filters/scores items by season, weather, wash status
   c. Calls AI service (text model) to compose outfit from scored items
   d. Parses AI response → creates Outfit record with items
   e. If scheduled: enqueues notification via `send_notification` ARQ job
3. User receives notification (ntfy/email/expo push) → opens outfit in frontend
4. User accepts/rejects → `OutfitService.record_feedback()` → triggers `LearningService.update_profiles()`
5. Learning service updates `UserLearningProfile`, `ItemPairScore`, `StyleInsight` tables

**Authentication Flow:**

1. **OIDC mode:** User clicks "Sign in" → NextAuth redirects to OIDC provider → callback handled by `[...nextauth]/route.ts` → JWT session created
2. **Dev mode:** User enters email/name → NextAuth CredentialsProvider creates session
3. Frontend sets access token from NextAuth session → `lib/api.ts:setAccessToken(token)`
4. Backend validates JWT via `utils/auth.py:decode_token()` → extracts `external_id` → looks up `User` record
5. Backend returns signed image URLs using secret key for image access

**Notification Flow:**

1. `workers/notifications.py:check_scheduled_notifications()` runs on cron → finds due schedules
2. For each due schedule: generates outfit recommendation → creates notification record
3. Enqueues notification delivery via `send_notification()` ARQ job
4. `NotificationDispatcher` in `notification_service.py` sends via configured providers (ntfy, email, expo push)
5. On failure: retries with backoff up to max retries, then marks as failed

## State Management

**Backend State:**
- **Database (PostgreSQL)**: Primary state — users, items, outfits, preferences, learning data, notifications
- **Redis**: ARQ job queue (transient), suggestion cache (`suggestion_cache.py`), distributed locks (`redis_lock.py`)
- **Filesystem**: Item images stored at `storage_path` (configurable, default `/data/wardrobe`) with thumbnails and medium-sized variants

**Frontend State:**
- **Server State**: TanStack React Query cache — items, outfits, weather, notifications, preferences — auto-refetched, staleTime 60s
- **Auth State**: NextAuth session (JWT in cookie)
- **UI State**: React `useState`/`useReducer` for local component state; `LightboxContext` for image lightbox
- **Draft State**: `lib/studio/draft-storage.ts` localStorage-backed draft persistence for outfit studio
- **Theme**: `next-themes` with system/light/dark

## Key Abstractions

**AIService (`backend/app/services/ai_service.py`):**
- Purpose: Wraps OpenAI-compatible HTTP API for vision (image analysis) and text (recommendations/pairings)
- Key features: Model rotation (comma-separated model names), health check, structured JSON parsing via regex fallback, capability gating (vision_enabled/text_enabled)
- Integration: Supports any OpenAI-compatible provider (OpenAI, Ollama, vLLM, etc.)

**RecommendationService (`backend/app/services/recommendation_service.py`):**
- Purpose: Orchestrates outfit generation — item scoring, weather-aware filtering, AI composition, caching
- Pattern: Multi-stage pipeline — score items → filter → AI prompt → parse → persist
- Caching: `suggestion_cache.py` with Redis-backed LRU for frequent suggestions

**LearningService (`backend/app/services/learning_service.py`):**
- Purpose: Netflix/Spotify-style feedback learning — processes user accept/reject/rating/wear signals
- Stores: Color scores, style scores, pair scores, occasion patterns, weather preferences
- Computes: Style insights, trend detection, item pair compatibility scores

**StudioService (`backend/app/services/studio_service.py`):**
- Purpose: Manual outfit creation/dragging with "lookbook" clone and lineage features
- Patterns: Soft idempotency for clone operations, item ownership validation, canonical item ordering

**ItemScorer (`backend/app/services/item_scorer.py`):**
- Purpose: Scores items for recommendation fitness based on recency, season, weather, wash status, favorites
- Pattern: Weighted scoring function — each factor contributes a score multiplier

## Entry Points

**Backend FastAPI:**
- Location: `backend/app/main.py`
- Invocation: `uvicorn app.main:app` (via `docker-entrypoint.sh`)
- Responsibilities: App factory (FastAPI lifespan), CORS middleware, GZip middleware, global exception handlers, API router inclusion at `/api/v1`

**Backend ARQ Worker:**
- Location: `backend/app/workers/worker.py`
- Invocation: `arq app.workers.worker.WorkerSettings` (via `docker-entrypoint.sh`)
- Responsibilities: Job queue processing — AI tagging, notifications, scheduled tasks, stale recovery
- Cron tasks: `check_scheduled_notifications` (every 15 min), `check_wash_reminders` (daily), `update_learning_profiles` (daily), `retry_failed_notifications` (hourly)

**Frontend Next.js:**
- Location: `frontend/`
- Invocation: `next dev` / `next start`
- Responsibilities: Server-side rendering, API proxy rewrites (`/api/v1/*` → backend), static asset serving

**Database Migrations (Alembic):**
- Location: `backend/migrations/`
- Invocation: `alembic upgrade head` (via `docker-entrypoint.sh`)
- Responsibilities: Schema versioning, 20 migration files covering initial schema to studio tables

## Error Handling

**Strategy:** Two-tier — HTTP exception for client-facing errors (4xx), global exception handlers for validation (422 with structured field-level errors), worker-level retry with max retries for transient failures

**Patterns:**
- `api/*.py`: HTTPException with status code and detail message; validated by Pydantic schemas
- `services/*.py`: Custom exceptions (e.g., `ItemOwnershipError`, `OutfitWornImmutableError`, `AIDisabledError`, `UserEmailConflictError`)
- `workers/*.py`: Try/finally with DB session cleanup; `recover_stale_processing_items` handles timeouts
- `frontend/lib/api.ts`: `ApiError` and `NetworkError` classes; React Query's `onError` displays toasts

## Cross-Cutting Concerns

**Logging:** Standard library `logging` throughout backend; `logger = logging.getLogger(__name__)` pattern in every module

**Validation:** Pydantic v2 for request/response schemas; SQLAlchemy type annotations for DB-level constraints

**Authentication:** JWT-based with FastAPI `HTTPBearer` dependency; `get_current_user` and `get_current_user_optional` in `utils/auth.py`

**Authorization:** Role-based within families (`admin`, `member`); item ownership scoped to user_id

**Rate Limiting:** IP-based rate limiter in `utils/rate_limit.py` for auth endpoints

**Image Security:** Signed URLs (`utils/signed_urls.py`) time-limited with HMAC signature using secret key

---

*Architecture analysis: 2026-07-17*
