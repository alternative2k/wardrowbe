# Coding Conventions

**Analysis Date:** 2026-07-17

## Languages & Runtimes

**Backend:** Python 3.11+ — FastAPI application in `backend/app/`
**Frontend:** TypeScript (strict mode) — Next.js 14 App Router in `frontend/`

---

## Backend Conventions (Python)

### Naming Patterns

**Files:**
- `snake_case.py` — e.g., `item_service.py`, `user_service.py`
- Test files: `test_<module>.py` — e.g., `test_items.py`, `test_auth.py`

**Functions & Methods:**
- `snake_case` — e.g., `get_by_id()`, `decode_token()`, `list_items()`
- Private helpers prefixed with underscore: `_make_item()`, `_parse_tags_from_response()`
- Async functions always use `async def`

**Variables:**
- `snake_case` — e.g., `user_service`, `db_session`, `settings`

**Classes:**
- `PascalCase` — e.g., `ItemService`, `ClothingItem`, `ItemStatus`
- Exception classes: `ApiError`, `NetworkError` (in frontend)

**Types/Type Aliases:**
- `Annotated` with `Depends` for FastAPI DI: `Annotated[User, Depends(get_current_user)]`
- Type aliases via `Annotated`: `CurrentUser = Annotated[User, Depends(get_current_user)]`

### Code Style

**Formatter:** Ruff (`ruff format`), configured in `backend/pyproject.toml`
- Line length: 100
- Quote style: double quotes
- Indent style: spaces
- Line ending: auto

**Linter:** Ruff (`ruff check`), configured in `backend/pyproject.toml`
- Rules: pycodestyle (E, W), pyflakes (F), isort (I), flake8-bugbear (B), flake8-comprehensions (C4), pyupgrade (UP)
- Ignored: E501 (handled by formatter), B008 (function calls in defaults), C901 (complexity)
- Known first-party: `app`

**Pre-commit hook (`.pre-commit-config.yaml`):**
- `ruff --fix` on all backend files
- `ruff-format` on all backend files
- TypeScript typecheck (`tsc --noEmit`) on frontend files
- ESLint (`next lint`) on frontend files

### Import Organization

**Order:**
1. Standard library (`asyncio`, `datetime`, `uuid`, etc.)
2. Third-party (`fastapi`, `sqlalchemy`, `pytest`, `jwt`, etc.)
3. First-party (`app.*`)
4. Separate groups with blank lines

**Example:**
```python
import asyncio
import logging
from datetime import UTC, date, datetime
from uuid import UUID

import pytest
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.item import ClothingItem
```

### Error Handling

**Patterns:**
- Raise `HTTPException` with appropriate status codes in API endpoints
- Use `from None` to suppress exception chaining in auth helpers
- Global exception handlers in `backend/app/main.py` for `RequestValidationError`, `ValidationError`, and generic `Exception`
- Generic handler returns 500 with no internal details exposed
- Service layer raises exceptions to API layer (which catches as needed)
- Pydantic validators handle input validation before routes

**Example:**
```python
# backend/app/utils/auth.py
def decode_token(token: str) -> TokenPayload:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        return TokenPayload(**payload)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from None

# backend/app/main.py — global handler
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(f"Unhandled exception on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected error occurred. Please try again later."},
    )
```

### Logging

**Framework:** Standard `logging` module

**Patterns:**
- Module-level logger: `logger = logging.getLogger(__name__)`
- Use `logger.info()`, `logger.error()`, `logger.exception()` for error-level with traceback
- Configuration via `app/config.py` or environment

**Example:**
```python
logger = logging.getLogger(__name__)
logger.info("Auth mode: %s", settings.get_auth_mode())
logger.exception(f"Unhandled exception on {request.method} {request.url.path}: {exc}")
```

### Comments

**When to Comment:**
- Module docstrings at top of public API files: `"""Main API router."""` in `backend/app/api/router.py`
- Class docstrings for test classes: `"""Tests for JWT token creation and validation."""`
- Docstrings on every test function: `"""Test that access token is created successfully."""`
- Inline comments for non-obvious business logic (e.g., `# Confidence is now computed by compute_tag_completeness`)
- Architecture-specific comments explaining WHY, not WHAT

### Function Design

**Size:** Functions typically 5–50 lines. Service methods may be longer but stay focused on single responsibility.

**Parameters:**
- Named parameters with type annotations always
- Optional parameters get `| None` union type (Python 3.10+ style)
- FastAPI routes use `Annotated[Type, Depends()]`, `Query()`, etc.

**Return Values:**
- Typed return annotations always
- `None` return for void-like operations (e.g., `delete`)
- `ClothingItem | None` for lookup-or-null patterns

### Module Design

**Architecture layers in `backend/app/`:**
```
api/       — FastAPI route handlers (thin layer, delegates to services)
services/  — Business logic (ItemService, RecommendationService, etc.)
models/    — SQLAlchemy ORM models
schemas/   — Pydantic request/response schemas
utils/     — Shared utilities (auth, clothing, rate limiting, etc.)
workers/   — ARQ background job workers
```

**Exports:**
- Each module re-exports key symbols via `__init__.py` (e.g., `app/models/__init__.py` exports `User`, `ClothingItem`, etc.)
- API routers are named `router` and imported as `from app.api.items import router`
- Services are classes instantiated with dependencies (e.g., `ItemService(db)`)

---

## Frontend Conventions (TypeScript/React)

### Naming Patterns

**Files:**
- `kebab-case.ts` for lib utilities — e.g., `api.ts`, `utils.ts`, `use-items.ts`
- `kebab-case.tsx` for components — e.g., `header.tsx`, `item-detail-dialog.tsx`
- Test files: `<name>.test.ts` — e.g., `api.test.ts`, `utils.test.ts`

**Functions & Variables:**
- `camelCase` — e.g., `getAccessToken()`, `fetchApi()`, `mergeBulkUploadResponses()`
- React hooks: `use<Name>` — e.g., `useItems()`, `useAuth()`, `useCreateItem()`
- Component functions: `PascalCase` — e.g., `Header`, `ItemDetailDialog`

**Types & Interfaces:**
- `PascalCase` — e.g., `StudioItem`, `BulkUploadResponse`, `ItemFilter`
- Interfaces for object shapes: `interface HeaderProps { ... }`
- Type aliases for unions/complex types: `type StudioAction = ...`

### Code Style

**Formatter:** Prettier (inferred from consistent formatting)
**Linter:** ESLint with `next/core-web-vitals` config (`.eslintrc.json`)
**TypeScript:** Strict mode enabled (`tsconfig.json` — `"strict": true`)

### Import Organization

**Order:**
1. React/Next.js (`'react'`, `'next/navigation'`, `'next-auth/react'`)
2. Third-party libraries (`'lucide-react'`, `'@tanstack/react-query'`, `'clsx'`)
3. Internal aliased (`@/lib/api`, `@/components/ui/button`, `@/lib/types`)
4. Relative imports within same module area

**Path Aliases:**
```json
{
  "paths": {
    "@/*": ["./*"]
  }
}
```

### Error Handling

**Patterns:**
- Custom error classes: `ApiError` (with `status` + `data`) and `NetworkError`
- API client (`frontend/lib/api.ts`) wraps all fetch calls and throws typed errors
- Components catch errors from hooks and display user-friendly messages
- `getErrorMessage()` utility for extracting safe display messages

**Example:**
```typescript
// frontend/lib/api.ts
class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

// Usage in hooks
if (!response.ok) {
  const data = await response.json().catch(() => ({}));
  throw new ApiError(data.detail || 'Failed to upload', response.status, data);
}
```

### Logging

**Framework:** `console` (minimal) — not a dedicated logging library

**Patterns:**
- Minimal client-side logging; errors typically surface via UI toasts (sonner)
- Network errors caught and mapped to user-facing messages

### Comments

**When to Comment:**
- JSDoc/TSDoc for public utility functions: `/** Parse a date string (YYYY-MM-DD) to a Date object. */`
- Inline comments for business logic rationale: `// Must not exceed backend's MAX_BULK_UPLOAD_COUNT`
- Comments explaining complex type definitions or edge cases

### Function Design

**Size:** Small, focused functions. Hooks typically 30–80 lines.

**Parameters:** Named object parameters for hooks: `({ id, reason }: { id: string; reason?: string })`

**Return Values:** Typed with generics where applicable: `api.get<ItemListResponse>('/items')`

### Component Design

**Patterns:**
- Components are default exports as named functions: `export function Header(...)`
- Props interface defined in same file: `interface HeaderProps`
- 'use client' directive at top for client components
- shadcn/ui primitives (Radix UI + Tailwind) for UI elements
- React Query for server state management
- React Hook Form for form state

**Example:**
```tsx
'use client';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  // ...
}
```

### Module Design

**Directory structure in `frontend/`:**
```
app/          — Next.js App Router pages and layouts
components/   — Reusable React components
  ui/         — shadcn/ui primitives (button, dialog, etc.)
lib/          — Utilities, API client, types, hooks
  hooks/      — Custom React Query hooks (use-items, use-auth, etc.)
  studio/     — Studio editor specific logic
tests/        — Vitest test files
types/        — TypeScript type declaration files
```

**Exports:**
- Named exports for components and utilities
- Barrel exports from `lib/types.ts` and `lib/api.ts`
- Types exported from hook files when used elsewhere

---

## Shared Conventions (Both Projects)

### Git & Pre-commit

- Ruff lint+format for Python backend
- TypeScript typecheck + ESLint for frontend
- No TODO/FIXME markers currently present in codebase — maintain this standard

### Testing

- See TESTING.md for detailed test conventions
- Backend: pytest with async support, class-based organization
- Frontend: Vitest with descriptive `describe`/`it` blocks

---

*Convention analysis: 2026-07-17*
