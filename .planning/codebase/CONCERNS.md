# Codebase Concerns

**Analysis Date:** 2026-07-17

## Tech Debt

### Broad `except Exception` Swallowing Throughout Backend
- **Issue:** The codebase pervasively catches `Exception` (and sometimes `BaseException`) at a high level, frequently logging and continuing or silently swallowing errors. This hides real failures and makes debugging difficult.
- **Files:** Nearly every API and service module. Hotspots include:
  - `backend/app/api/items.py` (1103 lines) — 17+ bare `except Exception` blocks, many just logging `str(e)` and continuing
  - `backend/app/api/outfits.py` (1074 lines) — 6+ bare `except Exception` blocks
  - `backend/app/services/notification_providers.py` — Every provider's `send()` and `test_connection()` wraps all logic in `except Exception: logger.exception(...); return {"success": False, "error": str(e)}`
  - `backend/app/workers/notifications.py` — 13+ bare `except Exception` blocks
  - `backend/app/services/suggestion_cache.py` — All 4 functions wrap entire body in `except Exception: pass` (silent failures)
- **Impact:** Production errors are silently masked. Failed notifications, cache misses, and AI service errors all degrade to silent no-ops. Ops teams cannot detect systemic failures.
- **Fix approach:** Replace bare `except Exception` with specific exception types. Add structured error metrics/counters. Let unexpected exceptions propagate to the global handler in `backend/app/main.py`.

### Overuse of `# noqa: E712` for Boolean Comparisons
- **Issue:** Throughout the code, SQLAlchemy boolean columns are compared with `== True` / `== False` instead of using `is_(True)` / `is_(False)`. The `# noqa: E712` comments suppress the linting rule instead of fixing the root cause.
- **Files:** `backend/app/workers/notifications.py`, `backend/app/services/item_service.py`, `backend/app/services/notification_service.py`, `backend/app/services/outfit_service.py`, `backend/app/api/outfits.py` — ~20 occurrences total
- **Impact:** These comparisons work with PostgreSQL but may fail silently with other databases (SQLite, MySQL). Makes the codebase less portable.
- **Fix approach:** Replace all `== True` / `== False` with `.is_(True)` / `.is_(False)` and remove `# noqa: E712` comments.

### Mix of `os.getenv()` and Pydantic Settings for Configuration
- **Issue:** Some configuration values are read directly from `os.getenv()` instead of using the centralized `Settings` class in `backend/app/config.py`.
- **Files:**
  - `backend/app/services/notification_providers.py` (lines 174-180) — SMTP config read via `os.getenv()` directly in the provider constructor
  - `backend/app/workers/notifications.py` (lines 58, 103, 222, 378) — `APP_URL` read via `os.getenv()`
  - `backend/app/api/families.py` (line 320) — `APP_URL` read via `os.getenv()`
- **Impact:** Configuration is scattered rather than centralized. These values are not validated, not typed, and are invisible in the config schema.
- **Fix approach:** Move all remaining `os.getenv()` calls into `app/config.py` Settings class. Add `app_url` to the settings.

### Overly Large Modules (Unnecessary Complexity)
- **Issue:** Several backend modules exceed healthy size limits, indicating poor separation of concerns.
- **Files:**
  - `backend/app/api/items.py` — 1103 lines (endpoint logic mixed with business logic)
  - `backend/app/api/outfits.py` — 1074 lines (massive file, mixes validation, business logic, DB access)
  - `backend/app/services/learning_service.py` — 1168 lines (sprawling class with too many responsibilities)
  - `backend/app/services/recommendation_service.py` — 899 lines (single massive method `generate_recommendation` at ~250 lines)
  - `backend/app/services/ai_service.py` — 728 lines (multiple concerns: HTTP client, parsing, health checks, model rotation)
  - `backend/app/services/notification_service.py` — 703 lines
- **Impact:** Hard to reason about, test, and modify safely. High cognitive load. Single change can have cascading side effects.
- **Fix approach:** Split large modules. Extract pure functions, separate HTTP clients from business logic, split learning service into domain-focused modules.

### Nested JSON Parse Attempts in Recommendation/Pairing Services
- **Issue:** `_parse_ai_response` in `backend/app/services/recommendation_service.py` (lines 458-525) and similar patterns elsewhere implement a fragile cascade of JSON extraction attempts (strip comments, extract from markdown, find braces, etc.). This is a brittle workaround for LLM output inconsistency.
- **Impact:** If the AI model changes output format, these cascading parsers may silently return incorrect data or raise confusing `ValueError` at call sites.
- **Fix approach:** Enforce structured output from AI models using constrained decoding (e.g., JSON mode, grammar-guided generation, or tool-calling API) instead of post-hoc extraction.

### Migrations Pattern `from app.models import *`
- **Issue:** `backend/app/migrations/env.py` (line 11) uses `from app.models import *` with `# noqa: F401, F403` to auto-register models. This creates an implicit dependency on model import order and can mask missing imports.
- **Impact:** If a new model module is added but not imported in `app/models/__init__.py`, the migration autogeneration will silently miss it. Star imports are unpredictable.
- **Fix approach:** Explicitly import each model class that should be registered with Alembic metadata.

## Security Considerations

### `k8s/secrets.yaml` is Git-Tracked and Contains Placeholder Secrets
- **Issue:** The file `k8s/secrets.yaml` containing template placeholder secrets (`"CHANGE_ME..."`) is tracked in git (first release commit `b0d408c`). The `.gitignore` only excludes `k8s/secrets.yaml.local` and `k8s/*.secret.yaml`, not the main `k8s/secrets.yaml`.
- **Risk:** Operators may edit `k8s/secrets.yaml` directly with real secrets and accidentally commit them. The `CHANGE_ME` values in git history could also hint at secret structure to attackers.
- **Files:** `k8s/secrets.yaml`, `.gitignore` (line 52-53)
- **Current mitigation:** The file contains only placeholder values, and the header comments warn against committing secrets.
- **Recommendations:** Add `k8s/secrets.yaml` to `.gitignore`. Rename the template to `k8s/secrets.yaml.template` (already exists as a separate file). Provide clearer documentation on secret management.

### Dev Credentials Provider Allows Arbitrary Authentication
- **Issue:** `frontend/lib/auth.ts` (lines 59-84) has a `DevCredentialsProvider` that accepts any email/name combination when `DEV_MODE=true` or `NODE_ENV=development`. This is intended for development but could be accidentally enabled in a staging or production environment.
- **Risk:** If `DEV_MODE` or `NODE_ENV` is misconfigured, an attacker can authenticate as any user without valid credentials.
- **Files:** `frontend/lib/auth.ts`
- **Current mitigation:** Tied to `DEV_MODE` and `NODE_ENV` environment variables.
- **Recommendations:** Add a build-time check or runtime panic if `DevCredentialsProvider` is loaded with `NODE_ENV=production`. Consider gating behind an explicit `AUTH_DEV_MODE` env var that defaults to `false`.

### Default SECRET_KEY in docker-compose.yml
- **Issue:** `docker-compose.yml` (line 48) sets `SECRET_KEY: ${SECRET_KEY:-change-me-in-production}`. This means if an operator never sets `SECRET_KEY`, the key defaults to `"change-me-in-production"`.
- **Risk:** Trivially guessable secret key allows JWT token forgery and HMAC signature bypass for signed image URLs.
- **Files:** `backend/app/config.py` (line 9), `docker-compose.yml` (line 48)
- **Current mitigation:** Startup validation in `config.py` logs an error but does not crash the app.
- **Recommendations:** Change the default to a random-generated value or crash the app at startup if the default key is unchanged in production.

### Rate Limiting Uses Fail-Open Pattern
- **Issue:** `backend/app/utils/rate_limit.py` (lines 40-41) silently fails open: if Redis is unavailable, the rate limit check logs a warning but allows the request through.
- **Risk:** An attacker could bypass rate limiting by flooding the Redis instance or exploiting a Redis outage.
- **Files:** `backend/app/utils/rate_limit.py`
- **Current mitigation:** Warning is logged.
- **Recommendations:** Consider a fail-closed option for critical endpoints (e.g., login, auth sync) while maintaining fail-open for less critical ones. Use circuit breaker pattern.

### Image Service Uses Synchronous PIL Operations in Async Context
- **Issue:** `backend/app/services/image_service.py` performs blocking PIL operations (`Image.open`, `image.save`, `image.thumbnail`, `ImageOps.exif_transpose`) inside async endpoint handlers without offloading to a thread pool.
- **Risk:** Under concurrent upload load, these synchronous operations block the async event loop, degrading throughput for all users.
- **Files:** `backend/app/services/image_service.py` (entire file), `backend/app/api/items.py` (calls to `process_and_store`, `remove_background`, etc.)
- **Current mitigation:** None.
- **Recommendations:** Offload image processing to a thread pool using `asyncio.to_thread()` or `run_in_executor()`, or move processing to the ARQ worker.

### Background Removal Downloads Model on First Use
- **Issue:** `backend/app/services/background_removal.py` uses `rembg` which downloads the `u2net` model (hundreds of MB) on first call to `new_session()`. This happens synchronously in the request-response cycle.
- **Risk:** First background removal request can take 30-90 seconds, causing HTTP gateway timeouts. The download could also fail or use excessive disk.
- **Files:** `backend/app/services/background_removal.py`
- **Current mitigation:** Sessions are cached after first call.
- **Recommendations:** Pre-download the model during Docker build or container startup. Offload removal to worker.

## Performance Bottlenecks

### Recommendation Service Loads All Candidate Items into Memory
- **Issue:** `backend/app/services/recommendation_service.py` method `get_candidate_items` (lines 84-117) loads ALL of a user's ready, non-archived items into memory, then filters in Python. For users with 1000+ items, this fetches everything before scoring.
- **Impact:** Memory usage scales linearly with wardrobe size. Pagination is not applied.
- **Files:** `backend/app/services/recommendation_service.py`
- **Improvement path:** Push filters (needs_wash, type, excluded, archived) into the SQL query. Use paginated scoring.

### Learning Service Uses JSON Columns for Complex Data
- **Issue:** The `UserLearningProfile` and `ItemPairScore` models use JSON/JSONB columns for structured data (`learned_color_scores`, `occasion_performance`, `weather_performance`). Updates to these use `flag_modified()` to notify SQLAlchemy of changes.
- **Impact:** JSON updates require full column overwrite. Cannot be indexed or queried efficiently at scale. Data integrity is not enforced at the database level.
- **Files:** `backend/app/models/learning.py`, `backend/app/services/learning_service.py`
- **Improvement path:** Consider normalized tables for learned preferences once the user base grows beyond a few hundred users.

### No Pagination on In-Memory Candidate Filtering for Pairings
- **Issue:** `backend/app/services/pairing_service.py` (lines 40-50) fetches ALL available items to find pairings, loading everything into memory.
- **Impact:** Same as recommendation service — users with large wardrobes waste memory.
- **Files:** `backend/app/services/pairing_service.py`
- **Improvement path:** Push filters to SQL.

### Notification Workers Process Serially Per Schedule
- **Issue:** `backend/app/workers/notifications.py` checks each schedule and sends notifications sequentially. For users with multiple notification channels, each channel is sent one-at-a-time.
- **Impact:** The notification run duration is `O(users * channels * API latency)`, which with 30s HTTP timeouts can take unreasonably long.
- **Files:** `backend/app/workers/notifications.py`
- **Improvement path:** Use `asyncio.gather()` to send notifications to multiple channels/user concurrently.

## Fragile Areas

### Workers Create Their Own Database Engine
- **Issue:** `backend/app/workers/db.py` creates a separate database engine per worker context (stored in arq ctx dict). This engine is not shared with the main app's global engine in `backend/app/database.py`.
- **Why fragile:** The pool sizes are configured independently. If the main app and worker both run with `pool_size=5, max_overflow=10`, the database could receive connections from up to 2x the expected pool. Pool exhaustion or connection churn becomes harder to diagnose.
- **Files:** `backend/app/database.py`, `backend/app/workers/db.py`
- **Safe modification:** Ensure `max_overflow` accounts for the combined total of app + worker connections. Consider sharing engine configuration.

### Session Management Mixed Between Commit-on-Exit and Manual Commit
- **Issue:** The `get_db()` dependency in `backend/app/database.py` auto-commits on success and auto-rollbacks on exception. However, services and API handlers frequently call `db.commit()` and `db.flush()` explicitly inside the session, creating dual-commit patterns.
- **Why fragile:** If a handler commits, then an exception occurs later, the rollback in `get_db()` may produce unexpected partial-commit states. The `expire_on_commit=False` setting masks stale object issues.
- **Files:** `backend/app/database.py` (lines 37-47), throughout all services
- **Safe modification:** Use explicit session management (either fully auto or fully manual, not both). Remove manual `db.commit()` calls in handlers that use `get_db()`.

### `migrations/env.py` Uses `asyncio.run()` in sync Context
- **Issue:** `backend/app/migrations/env.py` line 66 calls `asyncio.run(run_async_migrations())` inside a synchronous function called by Alembic.
- **Why fragile:** `asyncio.run()` cannot be called from within an already-running event loop. If Alembic is invoked from a script that has an active event loop (e.g., a test fixture), this will crash with `RuntimeError: asyncio.run() cannot be called from a running event loop`.
- **Files:** `backend/app/migrations/env.py`
- **Safe modification:** Add a guard that checks for an existing event loop and uses `loop.run_until_complete()` as fallback.

### Notification Provider Failures Silently Degrade
- **Issue:** All notification providers (`NtfyProvider`, `MattermostProvider`, `EmailProvider`, `ExpoPushProvider`) in `backend/app/services/notification_providers.py` catch ALL exceptions and return `{"success": False, "error": str(e)}`. The callers in `notification_service.py` and `workers/notifications.py` log warnings but continue.
- **Why fragile:** Persistent provider failures (e.g., expired SMTP credentials, revoked ntfy topic) are never escalated. Users silently stop receiving notifications, with no mechanism to alert the operator.
- **Files:** `backend/app/services/notification_providers.py`, `backend/app/services/notification_service.py`, `backend/app/workers/notifications.py`
- **Safe modification:** Implement notification health checks with alerting. Track consecutive failures per provider/channel and disable channels after threshold.

### Frontend `next.config.js` Ignores Build Errors
- **Issue:** `frontend/next.config.js` (lines 12-17) sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true`.
- **Why fragile:** Type errors and lint issues are silently ignored during production builds. Broken types or unused imports can accumulate without detection. The comment says "already done in CI" but this makes local `next build` unreliable for catching issues.
- **Files:** `frontend/next.config.js`
- **Safe modification:** Remove these flags and fix the underlying type/lint errors. If they must remain, add a CI check that explicitly runs `tsc --noEmit` and `eslint`.

## Test Coverage Gaps

### Missing Tests for Critical Error Paths
- **What's not tested:** Most `except Exception` blocks in services have no corresponding tests for failure modes (Redis down, AI service timeout, database transient errors).
- **Files:** `backend/app/services/recommendation_service.py`, `backend/app/services/ai_service.py`, `backend/app/services/notification_service.py`
- **Risk:** Error-handling code is never exercised in tests. Failures at runtime will manifest as silent data corruption or confusing error pages.
- **Priority:** High

### No Integration Tests for Worker Jobs
- **What's not tested:** The ARQ worker functions (`backend/app/workers/notifications.py`, `backend/app/workers/tagging.py`) have minimal test coverage. They rely on the full stack (Redis, DB, AI service) and are only tested in unit mocks.
- **Risk:** Worker failures (e.g., serialization issues, redis key conflicts, DB state corruption) are not caught until production.
- **Files:** `backend/app/workers/*.py`
- **Priority:** Medium

### Frontend Hook Tests Don't Cover Loading/Error States
- **What's not tested:** `frontend/tests/hooks.test.ts` — most hook tests only test the happy path (successful data fetch). Loading spinner visibility, error state rendering, and retry logic are not covered.
- **Risk:** UI breaks in loading/error states (spinner never stops, error toast not shown, stale data displayed).
- **Files:** `frontend/tests/hooks.test.ts`
- **Priority:** Medium

### Image Processing Edge Cases
- **What's not tested:** Corrupted image uploads, HEIC/HEIF conversion failures, extremely large images (>100MB), simultaneous duplicate uploads, disk full scenarios.
- **Files:** `backend/app/services/image_service.py`
- **Risk:** Production image processing errors may be silently caught by the broad `except Exception` blocks and return confusing error messages to users.
- **Priority:** Low

## Dependencies at Risk

### `aiosmtplib` — Optional Dependency, No Install Guarantee
- **Risk:** In `backend/app/services/notification_providers.py` (line 214), `aiosmtplib` is imported inside a function with a fallback that returns `{"success": False, "error": "aiosmtplib not installed"}`. This means email sending silently fails if the dependency is missing.
- **Impact:** Users who configure SMTP notifications will silently never receive emails if the package is not in the installed environment.
- **Migration plan:** Move `aiosmtplib` to core requirements or add a startup check that warns operators when SMTP is configured but the package is missing.

### `rembg` — Large Download at Runtime
- **Risk:** `rembg` downloads the u2net model (176MB) on first use at runtime, not build time. This can fail in air-gapped environments or trigger startup timeouts.
- **Impact:** Background removal feature works only after a slow first-load download. May fail entirely in restricted network environments.
- **Migration plan:** Pre-download during Dockerfile build. Consider an alternative lighter-weight model or a cloud-based API.

## Missing Critical Features

### No Database Migration Rollback Plan
- **Problem:** There is no documented rollback strategy for Alembic migrations. The project uses async migrations via `asyncio.run()`, but there is no script or CI step to test rollbacks.
- **Blocks:** Safe production deployments. A failed migration could require manual database recovery.
- **Files:** `backend/migrations/`

### No Structured Logging/Metrics
- **Problem:** All logging uses standard `logging` with `logger.info/warning/exception`. No structured logging (JSON), no distributed tracing, no metrics export (Prometheus/OpenTelemetry).
- **Blocks:** Operational observability. Cannot correlate errors across services or track performance trends.
- **Files:** Entire backend is affected.

### No API Rate Limiting on Auth Endpoints
- **Problem:** While rate limiting infrastructure exists in `backend/app/utils/rate_limit.py`, it is not applied to auth endpoints (`/api/v1/auth/sync`, login endpoints).
- **Risk:** An attacker can brute force the user sync endpoint with many emails, potentially enumerating valid users or causing database load.
- **Files:** `backend/app/api/auth.py`

---

*Concerns audit: 2026-07-17*
