# External Integrations

**Analysis Date:** 2026-07-17

## APIs & External Services

**AI / LLM (OpenAI-compatible API):**
- Multiple supported providers (user selects one via `.env`):
  - **Ollama** (Free/local) - Local AI inference. Models: `llava:7b` (vision/tagging), `gemma3` (text/recommendations). Endpoint: `http://host.docker.internal:11434/v1`. No API key needed.
  - **OpenAI** (Paid) - Cloud AI. Models: `gpt-4o` (vision + text). API key: `sk-...`. Endpoint: `https://api.openai.com/v1`.
  - **Azure OpenAI** - Enterprise. Endpoint: `https://{resource}.openai.azure.com/openai/deployments/{deployment}/`
  - **LocalAI** - Self-hosted OpenAI-compatible. Endpoint: `http://localai:8080/v1`
  - **Generic OpenAI-compatible** - Any API matching the `/v1/chat/completions` schema
- SDK/Client: `httpx` (raw HTTP, no OpenAI SDK)
- Auth: `AI_API_KEY` env var (Bearer token in `Authorization` header)
- Config: `AI_BASE_URL`, `AI_VISION_MODEL`, `AI_TEXT_MODEL`, `AI_TIMEOUT`, `AI_MAX_RETRIES`, `AI_MAX_TOKENS`
- Capability switches: `AI_INTERNAL_ENABLED`, `AI_VISION_ENABLED`, `AI_TEXT_ENABLED` (master + per-capability)
- Health check: `GET /v1/models` (OpenAI format) or `/api/tags` (Ollama fallback)
- Implementation: `backend/app/services/ai_service.py` (728 lines) - `AIService` class with endpoint rotation, retry logic, and model fallback

**Weather - Open-Meteo:**
- Service: [Open-Meteo](https://open-meteo.com) - Free weather API (no API key required)
- Endpoint: `https://api.open-meteo.com/v1/forecast` (configurable via `openmeteo_url`)
- SDK/Client: `httpx`
- Auth: None (free, no key needed)
- Features: Current weather (temperature, humidity, precipitation, wind, UV, WMO code), 7-16 day forecast
- Implements: WMO weather code interpretation, Redis-cached responses (1h TTL), geocoding for location name resolution
- Implementation: `backend/app/services/weather_service.py` (463 lines)
- API routes: `GET /api/v1/weather/current`, `GET /api/v1/weather/forecast` at `backend/app/api/weather.py`

**Geocoding - OpenStreetMap Nominatim:**
- Service: [Nominatim](https://nominatim.openstreetmap.org) - Free geocoding (requires User-Agent)
- Endpoint: `https://nominatim.openstreetmap.org/search`
- SDK/Client: `httpx`
- Auth: None (rate-limited, requires `User-Agent` header set via `geocoding_user_agent` env var)
- Usage: Converts user-saved location name (e.g., "London, UK") to lat/lon for weather lookups
- Caching: Redis with 30-day TTL for successful lookups, 1-hour TTL for not-found results
- Implementation: Within `backend/app/services/weather_service.py` (geocode methods)

**IP Geolocation (optional - opt-in):**
- Service: [ipapi.co](https://ipapi.co) (or configurable `NEXT_PUBLIC_NETWORK_LOCATION_URL`)
- Purpose: Fallback location when browser geolocation is denied/unavailable
- Opt-in: Disabled by default (`NEXT_PUBLIC_ENABLE_IP_LOCATION_FALLBACK` must be `"true"`)
- Implementation: `frontend/lib/location.ts` - Parses response to extract lat/lon/city/country/timezone

**Push Notifications - ntfy.sh:**
- Service: [ntfy.sh](https://ntfy.sh) - Free push notification service (or self-hosted)
- SDK/Client: `httpx` (HTTP POST with custom headers)
- Auth: Bearer token (`NTFY_TOKEN`), or token-less for public topics
- Config: `NTFY_SERVER` (default `https://ntfy.sh`), `NTFY_TOPIC`, `NTFY_TOKEN`
- Features: Title, priority (1-5), tags, click URL, attachment URLs, action buttons
- Implementation: `backend/app/services/notification_providers.py` - `NtfyProvider` class

**Chat Notifications - Mattermost:**
- Service: Self-hosted [Mattermost](https://mattermost.com) - Team communication platform
- SDK/Client: `httpx` (HTTP POST to webhook URL)
- Auth: Webhook URL (pre-authenticated endpoint)
- Config: `MATTERMOST_WEBHOOK_URL`
- Features: Custom username, icon emoji, rich attachments with fields/colors/images
- Implementation: `backend/app/services/notification_providers.py` - `MattermostProvider` class

**Push Notifications - Expo Push:**
- Service: [Expo Push API](https://docs.expo.dev/push-notifications/sending-notifications/) - Mobile push notifications
- Endpoint: `https://exp.host/--/api/v2/push/send`
- SDK/Client: `httpx`
- Auth: None (push token identifies destination)
- Features: Title, body, sound, badge count, custom data payload, channel ID
- Implementation: `backend/app/services/notification_providers.py` - `ExpoPushProvider` class

**Email:**
- Service: Any SMTP server (Gmail, Mailgun, SendGrid, self-hosted)
- SDK/Client: `aiosmtplib` (async SMTP client)
- Auth: SMTP username/password
- Config: `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL`
- Security: STARTTLS by default (`SMTP_USE_TLS`)
- Features: HTML emails with embedded styles for outfit suggestions, family invitations
- Implementation: `backend/app/services/notification_providers.py` - `EmailProvider` class + template builders

**Background Removal (optional):**
- Two providers supported:
  - **rembg** (local, default): `RembgProvider` - Uses `rembg` library with `u2net` model (~500MB weights). Pre-downloaded during Docker build for instant first request.
  - **HTTP provider**: `HttpProvider` - Calls external API at `BG_REMOVAL_URL/api/remove-background` with Bearer auth
- Config: `BG_REMOVAL_PROVIDER` ("rembg" or "http"), `BG_REMOVAL_MODEL` (default "u2net"), `BG_REMOVAL_URL`, `BG_REMOVAL_API_KEY`
- Implementation: `backend/app/services/background_removal.py` (82 lines)

## Data Storage

**Databases:**
- **PostgreSQL 15** (`postgres:15-alpine` Docker image)
  - Connection: `DATABASE_URL` env var - `postgresql+asyncpg://user:pass@postgres:5432/dbname`
  - Client: SQLAlchemy 2.0 async engine with `asyncpg` driver
  - Pool: 5 pool_size, 10 max_overflow, `pool_pre_ping=True`
  - Migrations: Alembic (`backend/migrations/versions/`)
  - Schema: 9 models (`backend/app/models/`) - User, ClothingItem, Outfit, OutfitItem, Family, FamilyMember, Notification, NotificationSettings, Schedule, LearningProfile, LearningFeedback, etc.
  - K8s: `k8s/postgres.yaml` - StatefulSet with 1Gi PVC (`local-path` storage class)
  - Healthcheck: `pg_isready`
  - Test DB: `aiosqlite` for in-memory SQLite during unit tests; `wardrobe_test` database with `asyncpg` in CI

**File Storage:**
- **Local filesystem** (mounted volume)
  - Upload path: `STORAGE_PATH` (/data/wardrobe in Docker, /data/uploads in k8s/prod)
  - Docker volumes: `wardrobe_data`, `uploads_data`
  - K8s: `uploads-pvc` - 1Gi PersistentVolumeClaim (`local-path` storage class)
  - Image processing pipeline: original -> medium (800px) -> thumbnail (400px), JPEG quality 90
  - Max upload: 10MB per file, 20 files per bulk upload
  - HEIC support via `pillow-heif` library

**Caching:**
- **Redis 7** (`redis:7-alpine` Docker image)
  - Connection: `REDIS_URL` env var - `redis://redis:6379/0`
  - Client: `redis.asyncio` (`backend/app/utils/redis_lock.py`)
  - Uses:
    - **Job queue**: arq worker pool (`backend/app/workers/worker.py`)
    - **Weather cache**: 1-hour TTL (`backend/app/services/weather_service.py`)
    - **Geocoding cache**: 30-day TTL for successes, 1-hour TTL for misses
    - **Suggestion cache**: Cached outfit suggestions
    - **Distributed locks**: Redis `Lock` for concurrency control (`backend/app/utils/redis_lock.py`)
  - K8s: `k8s/redis.yaml` - Deployment with 1Gi PVC

## Authentication & Identity

**Auth Provider (choice of three):**
1. **OIDC (OpenID Connect)** - Primary production auth
   - Supports any OIDC-compliant provider (Authentik, Keycloak, Authelia, Pocket ID, etc.)
   - Implementation: `backend/app/utils/oidc.py` - `validate_oidc_id_token()` fetches JWKS, validates RS256/ES256 tokens
   - Frontend: NextAuth OAuth provider (`frontend/lib/auth.ts`) with PKCE + state checks
   - Config: `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_MOBILE_CLIENT_ID`, `OIDC_CA_BUNDLE`, `OIDC_END_SESSION_URL`
   - Security: Optional CA bundle for private/internal CAs (`OIDC_CA_BUNDLE`), TLS verification always on
   - Mobile: OIDC callback route at `GET /api/v1/auth/mobile-callback` redirects to `wardrowbe://auth/callback` URI scheme

2. **Forward Auth** - Alternative production auth
   - Works with TinyAuth, Authelia, Authentik proxy
   - Config: `AUTH_TRUST_PROXY=true`, backend reads `Remote-User` header
   - Used in production Compose (`docker-compose.prod.yml`)

3. **Dev Credentials** - Local development only
   - Activated when `DEBUG=true` and `SECRET_KEY=change-me-in-production`
   - Frontend: `CredentialsProvider` (`frontend/lib/auth.ts`) accepts any email/name
   - Backend: JWT token issued on sync (`backend/app/api/auth.py`)

**API Auth:**
- JWT tokens (HS256) created by backend on user sync (`backend/app/api/auth.py:create_access_token()`)
- 7-day expiry by default
- Frontend stores token via NextAuth JWT session and sends in `Authorization: Bearer <token>` header (`frontend/lib/api.ts`)
- Backend dependency injection: `get_current_user()` at `backend/app/utils/auth.py`

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Datadog, or similar SDK in dependencies)

**Logs:**
- Python `logging` module throughout backend
- `docker compose logs` for Docker deployments
- `kubectl logs` for K8s
- `LOG_LEVEL` env var configurable (default INFO)
- Backend access logs via nginx in production (`nginx/nginx.conf`)
- Health check: `GET /api/v1/health` endpoint (`backend/app/api/health.py`)

**Coverage:**
- **Codecov** - Uploaded in CI (`codecov/codecov-action@v6`) for backend test coverage (`backend/coverage.xml`)

## CI/CD & Deployment

**Hosting:**
- Self-hosted via Docker Compose or Kubernetes (no cloud vendor lock-in)
- Docker images hosted on **GitHub Container Registry (GHCR)**: `ghcr.io/anyesh/wardrowbe:backend-latest`, `ghcr.io/anyesh/wardrowbe:frontend-latest`
- Multi-architecture builds: `linux/amd64`, `linux/arm64` (Raspberry Pi support)

**CI Pipeline:**
- **GitHub Actions** (`.github/workflows/`):
  - `ci.yml` (217 lines): Runs on push/PR to main/master:
    - Backend lint (Ruff), Frontend lint (ESLint, TypeScript check)
    - Backend tests (pytest with Postgres + Redis service containers)
    - Frontend tests (Vitest)
    - Frontend build (Next.js)
    - Docker build verification (Buildx, no push, GHA cache)
  - `docker-publish.yml` (97 lines): On release publish or workflow_dispatch:
    - Builds and pushes multi-arch images to GHCR
    - Tags: `backend-latest`, `frontend-latest`, SHA, semver tags
  - `release.yml`, `pr-context.yml`, `issue-context.yml`: Additional automation

**Release Automation:**
- **Release Please** - Automated release PRs and changelogs (`release-please-config.json`, `.release-please-manifest.json`, `CHANGELOG.md`)

## Environment Configuration

**Required env vars:**
- `SECRET_KEY` - JWT signing secret (generate with `openssl rand -hex 32`)
- `NEXTAUTH_SECRET` - NextAuth encryption secret
- `DATABASE_URL` - PostgreSQL connection string (auto-built from component vars in Compose)
- `POSTGRES_PASSWORD` - Database password (production only, must be set in .env)

**Conditional env vars (required by feature):**
- AI: `AI_BASE_URL`, `AI_API_KEY`, `AI_VISION_MODEL`, `AI_TEXT_MODEL`
- OIDC: `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`
- Notifications: `NTFY_SERVER`, `NTFY_TOPIC`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `MATTERMOST_WEBHOOK_URL`
- Background removal: `BG_REMOVAL_URL`, `BG_REMOVAL_API_KEY` (when using HTTP provider)

**Secrets location:**
- `.env` file at project root (not committed, must be copied from `.env.example`)
- K8s: `k8s/secrets.yaml` (applied separately, not in git; template at `k8s/secrets.yaml.template`)
- K8s secrets: `wardrobe-secrets` (database-url, ai-api-key, backend-secret-key, oidc-client-id, oidc-client-secret), `wardrobe-notifications` (ntfy-token, smtp-user, smtp-password)

## Webhooks & Callbacks

**Incoming:**
- **Mattermost webhook**: Receives POST from Mattermost at configured webhook URL (backend is the consumer, not the provider)
- **OIDC callback**: `GET /api/v1/auth/mobile-callback` redirects to `wardrowbe://auth/callback` (mobile app deep link)

**Outgoing:**
- **ntfy.sh**: Push notifications via HTTP POST with custom headers
- **Mattermost**: Chat notifications via webhook POST
- **Expo Push**: Mobile push notifications via POST to `https://exp.host/--/api/v2/push/send`
- **Email**: Outgoing SMTP via `aiosmtplib`
- **Background removal HTTP**: POST multipart image to `BG_REMOVAL_URL/api/remove-background`

## Scheduled Jobs

- Managed by **arq** cron jobs (`backend/app/workers/worker.py`):
  - `recover_stale_processing_items()` - Marks timed-out AI processing items as error
  - `check_scheduled_notifications()` - Checks for scheduled daily outfit notifications
  - `check_wash_reminders()` - Wash cycle reminders
  - `retry_failed_notifications()` - Retries failed notification deliveries
  - `update_learning_profiles()` - Updates user learning/preference profiles
- Managed by **APScheduler** (`backend/requirements.txt`): Scheduled notification processing

## Docker Compose Services

**`docker-compose.yml`** (base, 132 lines):
- `postgres` - PostgreSQL 15 database
- `redis` - Redis 7 job queue/cache
- `backend` - FastAPI application
- `frontend` - Next.js application
- `worker` - arq background job worker (same image as backend)

**`docker-compose.dev.yml`** (dev overlay, 74 lines):
- `caddy` - Caddy 2 reverse proxy with auto HTTPS
- Overrides: hot reload, build from source, bind mounts, debug mode

**`docker-compose.prod.yml`** (production overlay, 197 lines):
- `nginx` - Production reverse proxy with envsubst template
- Adds: dedicated network (`wardrobe_net`), DNS config, `extra_hosts` for OIDC, `APP_URL`
- Differences: Secrets must be set (fail if unset via `:?` syntax), `AUTH_TRUST_HEADER` defaults to true

**`docker-compose.oidc-test.yml`** (66 lines):
- `authelia/authelia:latest` - OIDC provider for integration testing
- Mounts CA cert into all services for TLS testing

## Kubernetes (Kustomize)

**`k8s/` directory:**
- `namespace.yaml` - `wardrobe` namespace
- `configmap.yaml` - Non-sensitive config (AI URL, modes, etc.)
- `postgres.yaml` - PostgreSQL StatefulSet with 1Gi PVC
- `redis.yaml` - Redis Deployment with 1Gi PVC
- `backend.yaml` - Backend Deployment (arm64-capable, security-hardened), Service on port 8000, 1Gi PVC for uploads
- `worker.yaml` - Background worker Deployment
- `frontend.yaml` - Frontend Deployment, Service on port 3000
- `ingress.yaml` - Traefik Ingress with cert-manager (Let's Encrypt), security headers middleware, HTTP->HTTPS redirect
- `network-policy.yaml` - Network segmentation
- `kustomization.yaml` - Resource aggregation
- `secrets.yaml.template` - Secret template (database-url, ai-api-key, oidc secrets, etc.)

---

*Integration audit: 2026-07-17*
