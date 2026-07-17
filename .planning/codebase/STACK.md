# Technology Stack

**Analysis Date:** 2026-07-17

## Languages

**Primary:**
- Python 3.11+ - Backend API (`backend/`) - Fastify web framework, async database access, AI service orchestration
- TypeScript 5.7 - Frontend (`frontend/`) - Next.js application with React 18

**Secondary:**
- SQL - Database schema managed via SQLAlchemy ORM / Alembic migrations (`backend/app/models/`, `backend/migrations/`)
- YAML - Docker Compose, K8s manifests, CI workflow definitions
- HTML/CSS - Frontend templating (Tailwind CSS + shadcn/ui)

## Runtime

**Environment:**
- Python 3.11 via `python:3.11-slim` Docker image (`backend/Dockerfile`)
- Node.js 24 via `node:24-alpine` Docker image (`frontend/Dockerfile`, `frontend/Dockerfile.dev`)

**Package Manager:**
- Backend: `pip` with `requirements.txt`, `requirements-extras.txt`, `requirements-test.txt`. Also `uv.lock` present (likely `uv` for locking)
- Frontend: `npm` with `package.json` / `package-lock.json` (npm ci in CI)

## Frameworks

**Core (Backend):**
- **FastAPI** >=0.109.0 - Async REST API framework with Pydantic v2 validation, auto OpenAPI docs (`backend/requirements.txt`, `backend/app/main.py`)
- **SQLAlchemy** 2.0.25+ (asyncio) - Async ORM for PostgreSQL (`backend/app/database.py`)
- **Alembic** >=1.13.1 - Database migrations (`backend/migrations/`)
- **Pydantic** v2 + **pydantic-settings** >=2.1.0 - Configuration and validation (`backend/app/config.py`)

**Core (Frontend):**
- **Next.js** 14.2.35 - React framework with App Router (`frontend/package.json`)
- **React** 18.2.0 - UI library
- **Next-Auth** ^4.24.5 - Authentication library supporting OIDC and credentials (`frontend/lib/auth.ts`)
- **TanStack Query** ^5.17.19 - Server state management with caching (`frontend/app/providers.tsx`)
- **Zustand** ^4.5.0 - Client-side state management

**Testing:**
- **pytest** >=8.0.0 + **pytest-asyncio** + **pytest-cov** - Backend test runner (`backend/pytest.ini`)
- **httpx** >=0.26.0 - Async HTTP client used for both API calls and integration testing
- **aiosqlite** >=0.19.0 - SQLite async driver for test database replacement
- **Vitest** ^4.0.17 - Frontend test runner (`frontend/vitest.config.ts`)
- **Testing Library** (DOM ^10.4.1, jest-dom ^6.9.1, React ^16.3.2) - Component testing utilities
- **jsdom** ^27.4.0 - DOM environment for frontend tests

**Build/Dev:**
- **Uvicorn** >=0.27.0 - ASGI server for the backend (`backend/requirements.txt`)
- **Ruff** (config in `pyproject.toml`) - Python linter and formatter (pycodestyle, isort, flake8-bugbear, pyupgrade)
- **ESLint** 8.56.0 + `eslint-config-next` 14.2.35 - Frontend linting (`frontend/.eslintrc.json`)
- **PostCSS** + **Autoprefixer** - CSS processing (`frontend/postcss.config.js`)
- **Docker Buildx** - Multi-architecture images (linux/amd64, linux/arm64) built via CI (`docker-publish.yml`)
- **QEMU** - Cross-platform emulation for ARM64 Docker builds

## Key Dependencies

**Critical:**
- `asyncpg>=0.29.0` - PostgreSQL async driver (backend, `requirements.txt`)
- `redis>=5.0.1` + `redis.asyncio` - Redis client for job queue caching (backend, `requirements.txt`)
- `arq>=0.25.0` - Redis-backed async job queue for background workers (`backend/app/workers/worker.py`)
- `apscheduler>=3.10.4` - Scheduled task execution for notifications (`backend/requirements.txt`)
- `Pillow>=10.2.0` + `pillow-heif>=0.14.0` - Image processing (HEIC support) (`backend/requirements.txt`)
- `rembg[cpu]>=2.0.50` - AI background removal (optional, ~500MB model weights) (`backend/requirements-extras.txt`)
- `PyJWT[crypto]>=2.8.0` - JWT encoding/decoding for auth tokens (`backend/requirements.txt`)
- `sharp` ^0.33.5 - Image processing on frontend (Next.js) (`frontend/package.json`)

**Infrastructure:**
- `httpx>=0.26.0` - Async HTTP client for all external API calls (AI, weather, geocoding, notifications) (`backend/requirements.txt`)
- `tenacity>=8.2.3` - Retry logic for transient failures (`backend/requirements.txt`)
- `python-dateutil>=2.8.2` - Date/time utilities
- `imagehash>=4.3.1` - Perceptual image hashing for duplicate detection
- `aiosmtplib>=3.0.1` - Async SMTP client for email notifications (`backend/requirements.txt`)
- `lucide-react` ^0.316.0 - Icon library (`frontend/package.json`)
- `date-fns` ^3.3.1 - Date formatting (`frontend/package.json`)
- `zod` ^3.22.4 - Schema validation on frontend (`frontend/package.json`)
- `react-hook-form` ^7.50.0 + `@hookform/resolvers` ^3.3.4 - Form management
- `sonner` ^1.4.0 - Toast notifications (`frontend/package.json`)
- `zustand` ^4.5.0 - Lightweight state management
- `react-dropzone` ^14.2.3 - File upload UI
- `yet-another-react-lightbox` ^3.31.0 - Image lightbox gallery

**UI Component Library:**
- **shadcn/ui** (based on Radix UI primitives) - Component system (`frontend/components.json`):
  - `@radix-ui/react-alert-dialog`, `@radix-ui/react-avatar`, `@radix-ui/react-checkbox`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-label`, `@radix-ui/react-progress`, `@radix-ui/react-scroll-area`, `@radix-ui/react-select`, `@radix-ui/react-slider`, `@radix-ui/react-slot`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`
- `class-variance-authority` ^0.7.0 - Component variant management
- `clsx` ^2.1.0 + `tailwind-merge` ^2.2.1 - Class name utilities
- `tailwindcss-animate` ^1.0.7 - Animation plugin

## Configuration

**Environment:**
- Configured via `.env` file (pydantic-settings on backend, `process.env` on frontend)
- Backend settings class: `backend/app/config.py` - `Settings(BaseSettings)` reads from env/file
  - Auto-rejection of default SECRET_KEY in production (validated at startup)
  - Supports OIDC, dev credentials, or forward auth modes
- Frontend config via `NEXT_PUBLIC_*` env vars (browser accessible) and server-side env vars
- Required env vars template: `.env.example` at project root (157 lines documenting all options)
- K8s: ConfigMap (`k8s/configmap.yaml`) + Secrets (`k8s/secrets.yaml`, `k8s/secrets.yaml.template`)

**Build:**
- Backend: Docker multi-stage builds (`backend/Dockerfile`) - pre-downloads rembg model
- Frontend: Docker multi-stage with standalone output (`frontend/Dockerfile` - builder + runner)
- Dev: Docker Compose with bind mounts + hot reload (`docker-compose.dev.yml`)

## Platform Requirements

**Development:**
- Docker + Docker Compose (for full stack with Postgres, Redis, Caddy)
- Python 3.11+ for local backend runs
- Node.js 24 for local frontend runs
- Ollama (optional, for local AI inference - models: llava:7b vision, gemma3 text)
- 500MB+ disk for rembg model weights (optional, for background removal)

**Production:**
- Docker or Kubernetes cluster
- PostgreSQL 15 (docker image `postgres:15-alpine`)
- Redis 7 (docker image `redis:7-alpine`)
- AI provider: Ollama, OpenAI, Azure OpenAI, or LocalAI (OpenAI-compatible API)
- Reverse proxy: nginx (prod Docker Compose) or Caddy (dev) or Traefik (K8s with cert-manager)
- GHCR (GitHub Container Registry) for Docker image distribution
- CI: GitHub Actions (lint, test, Docker build)

---

*Stack analysis: 2026-07-17*
