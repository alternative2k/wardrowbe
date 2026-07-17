# Testing Patterns

**Analysis Date:** 2026-07-17

---

## Backend Testing (Python/pytest)

### Test Framework

**Runner:** pytest 8+
**Async support:** pytest-asyncio 0.23+
**HTTP client:** httpx 0.26+ (AsyncClient)
**Coverage:** pytest-cov 4.1+
**Test DB:** aiosqlite 0.19+ (local); asyncpg with PostgreSQL `wardrobe_test` database (CI)

**Config:** `backend/pytest.ini`
```ini
[pytest]
asyncio_mode = auto
testpaths = tests
python_files = test_*.py
python_functions = test_*
python_classes = Test*
addopts = -v --tb=short
filterwarnings =
    ignore::DeprecationWarning
    ignore::PendingDeprecationWarning
```

**Run Commands:**
```bash
cd backend && pytest                          # Run all tests
cd backend && pytest tests/test_auth.py       # Run specific file
cd backend && pytest -k "TestJWTToken"        # Run by class name
cd backend && pytest --cov=app                # With coverage
cd backend && pytest --cov=app --cov-report=html  # HTML coverage report
```

### Test File Organization

**Location:** All tests in `backend/tests/`, flat structure (no subdirectories).

**Naming:**
- Files: `test_<module>.py` — maps to source modules (e.g., `test_items.py` tests `app/api/items.py`)
- Test classes: `Test<Feature>` — e.g., `TestItemList`, `TestItemCRUD`, `TestBulkCreateSkipAI`
- Test functions: `test_<behavior>` — e.g., `test_list_items_empty`, `test_delete_item`

**Structure:**
```
backend/tests/
├── conftest.py              # Shared fixtures (db_session, client, test_user, auth_headers)
├── __init__.py              # Empty
├── test_auth.py             # Auth API tests
├── test_items.py            # Items API + service tests
├── test_health.py           # Health endpoint tests
├── test_ai_service.py       # AI service unit tests
├── test_clothing_utils.py   # Utility function tests
├── test_pairings.py         # Pairings API tests
├── test_security.py         # Security/injection tests
├── test_recommendation_service.py  # Recommendation logic tests
├── test_learning_service.py        # Learning service tests
├── test_weather_service.py         # Weather service tests
├── test_weather_api.py             # Weather API tests
├── test_studio_service.py          # Studio service tests
├── test_background_removal.py      # Background removal tests
├── test_suggestion_cache.py        # Suggestion cache tests
├── test_notifications.py           # Notification tests
├── test_notification_workers.py    # Notification worker tests
├── test_tagging_worker.py          # Tagging worker tests
├── test_worker_db.py               # Worker DB tests
├── test_users.py                   # User API tests
├── test_preferences.py             # Preferences tests
├── test_oidc.py                    # OIDC auth tests
├── test_capabilities.py            # Capabilities tests
├── test_image_undo_replace.py      # Image undo/replace tests
├── test_remove_bg_endpoint.py      # Remove background endpoint tests
├── test_stale_recovery.py          # Stale recovery tests
└── test_item_scorer.py             # Item scoring tests
```

### Test Structure

**Suite Organization — Class-based with docstrings:**
```python
class TestItemList:
    """Tests for item listing endpoint."""

    @pytest.mark.asyncio
    async def test_list_items_empty(self, client: AsyncClient, test_user, auth_headers):
        """Test listing items when none exist."""
        response = await client.get("/api/v1/items", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0
```

**Patterns:**
- **Arrange-Act-Assert** (AAA): Setup (fixtures + data creation), action (API call), assertion
- Tests are thorough: happy path, empty states, error states, edge cases, auth boundaries
- Use descriptive test function names that document the scenario

**Assertion Pattern:**
1. Assert HTTP status code first
2. Assert response body structure
3. Assert specific values in the response

### Conftest Fixtures (`backend/tests/conftest.py`)

| Fixture | Scope | Purpose |
|---------|-------|---------|
| `event_loop` | session | Provides async event loop for pytest-asyncio |
| `async_engine` | function | Creates test database engine (PostgreSQL or SQLite) |
| `db_session` | function | Provides a fresh SQLAlchemy `AsyncSession` per test |
| `client` | function | FastAPI test client with `ASGITransport`, DB overridden |
| `_clear_rate_limits` | function (autouse) | Clears Redis rate limits before each test (best-effort) |
| `test_user` | function | Creates a `User` in the test DB |
| `test_user_with_preferences` | function | User with `UserPreference` entries |
| `auth_headers` | function | JWT auth header dict for `test_user` |
| `sample_item_data` | function | Dict with sample item creation data |
| `sample_tags` | function | Dict with sample AI tag data |

**Test DB Setup:**
- Environment variables set at import time: `DEBUG=true`, `SECRET_KEY=change-me-in-production`, `STORAGE_PATH=/tmp/wardrobe_test`
- OIDC vars cleared so auth tests run with known state (`dev_mode=true`)
- Database created on-demand via `asyncpg` + Alembic migrations run fresh

### Fixture Usage Pattern

```python
# async fixtures use pytest_asyncio.fixture
@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
```

### Test Helper Functions

**Pattern:** Module-level `_make_*` functions create test data objects.

```python
# In test file or conftest.py
def _make_item(user_id, item_type="shirt", **kwargs) -> ClothingItem:
    return ClothingItem(
        user_id=user_id,
        type=item_type,
        image_path=f"test/{uuid4()}.jpg",
        status=ItemStatus.ready,
        **kwargs,
    )

def _make_pairing(user_id, items: list[ClothingItem], source_item=None) -> Outfit:
    outfit = Outfit(user_id=user_id, occasion="casual", ...)
    for i, item in enumerate(items):
        outfit.items.append(OutfitItem(item_id=item.id, position=i))
    return outfit
```

### Mocking

**Framework:** `unittest.mock` (AsyncMock, patch)

**Patterns:**
- Use `patch()` as context manager for external dependencies (ARQ Redis, asyncpg, httpx calls)
- Use `new_callable=AsyncMock` for async functions
- Assert mock calls with `assert_called_once_with()`, `assert_awaited_once_with()`, `assert_not_called()`
- Mock cleanup is automatic via context manager exit

**Async Mocking Pattern:**
```python
from unittest.mock import AsyncMock, patch

with patch("app.api.items.create_pool", new_callable=AsyncMock) as mock_create_pool:
    mock_redis = AsyncMock()
    mock_redis.enqueue_job.return_value.job_id = "fake-job-id"
    mock_create_pool.return_value = mock_redis

    response = await client.post("/api/v1/items/bulk", files=files, headers=auth_headers)

assert response.status_code == 201
mock_redis.enqueue_job.assert_called_once()
```

**Multiple Patches:**
```python
with (
    patch("app.api.auth._is_dev_mode", return_value=False),
    patch("app.api.auth._oidc_configured", return_value=True),
    patch("app.api.auth.validate_oidc_id_token", return_value=mock_claims),
):
    response = await client.post("/api/v1/auth/sync", json={...})
```

**What to Mock:**
- External services (AI endpoints, Redis/ARQ, notification providers)
- Time-dependent functions (`datetime.now`, `datetime.utcnow`)
- HTTP calls to third-party APIs

**What NOT to Mock:**
- Database (use real test DB with transactions)
- Pydantic validation (test real validation)
- Internal service-layer logic (test with real DB session)

### Parametrized Tests

```python
@pytest.mark.parametrize(
    "hour,expected",
    [
        (6, "morning"),
        (12, "afternoon"),
        (17, "evening"),
        (21, "night"),
        (0, "night"),
    ],
)
def test_time_buckets(self, hour, expected):
    # Parametrized test for time-of-day buckets
    ...
```

### Coverage

**Config:** `backend/pyproject.toml`
```toml
[tool.coverage.run]
source = ["app"]
omit = ["app/workers/*"]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "if TYPE_CHECKING:",
    "raise NotImplementedError",
]
```

**View Coverage:**
```bash
cd backend && pytest --cov=app --cov-report=html
```

---

## Frontend Testing (TypeScript/Vitest)

### Test Framework

**Runner:** Vitest 4+
**Environment:** jsdom (browser-like DOM)
**Testing Library:** @testing-library/react 16+, @testing-library/jest-dom 6+
**Mocking:** Vitest built-in (`vi.fn()`, `vi.mocked()`, `vi.mock()`)
**DOM:** jsdom 27+

**Config:** `frontend/vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['./tests/**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
```

**Run Commands:**
```bash
cd frontend && npm test              # vitest run
cd frontend && npm run test:watch    # vitest (watch mode)
cd frontend && npx vitest --coverage # With coverage
```

### Test File Organization

**Location:** All tests in `frontend/tests/`, flat structure.

**Naming:**
- Files: `<name>.test.ts` — e.g., `api.test.ts`, `utils.test.ts`, `hooks.test.ts`

**Structure:**
```
frontend/tests/
├── setup.ts                    # Global mocks and setup
├── api.test.ts                 # API client tests
├── utils.test.ts               # Utility function tests
├── hooks.test.ts               # Hook tests (structure/placeholder)
├── location.test.ts            # Location utility tests
├── bulk-upload.test.ts         # Bulk upload merge logic tests
└── studio.test.ts              # Studio editor state/ordering tests
```

### Test Setup (`frontend/tests/setup.ts`)

```typescript
import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

// Mock NextAuth
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signIn: vi.fn(),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Global fetch mock
global.fetch = vi.fn()

// Browser API mocks
Object.defineProperty(window, 'matchMedia', { ... })
global.IntersectionObserver = vi.fn()
global.ResizeObserver = vi.fn()
```

### Test Structure

**Suite Organization — `describe`/`it` blocks:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET requests', () => {
    it('should make a successful GET request', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => mockData,
      } as Response)
      const result = await api.get('/test')
      expect(result).toEqual(mockData)
    })
  })
})
```

### Mocking

**Pattern:** Mock `global.fetch` directly with `vi.mocked()`:
```typescript
vi.mocked(global.fetch).mockResolvedValueOnce({
  ok: true, status: 200,
  json: async () => ({ items: [], total: 0 }),
} as Response)
```

**Module mocking with `vi.mock()`:**
```typescript
vi.mock('next/navigation', () => ({ ... }))
vi.mock('next-auth/react', () => ({ ... }))
```

**Test wrappers for React Query:**
```typescript
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}
```

### Fixtures and Test Data

**Pattern:** Inline factory functions or mock objects in test files.
```typescript
function makeItem(id: string, type: string): StudioItem {
  return {
    id, type,
    name: `${type} item`,
    thumbnail_url: null, image_url: null, primary_color: null,
  }
}

// Inline mock data
const mockData = { id: 1, name: 'Test' }
const postData = { name: 'Test Item' }
```

### Coverage

**Requirements:** Not strictly enforced (no threshold set), but coverage reporter is configured.

**View Coverage:**
```bash
cd frontend && npx vitest --coverage
```

---

## Cross-Platform Testing Patterns

### Test Types

**Unit Tests:**
- Backend: Pure function tests (tag parsing, clothing utils, schema validation) — no DB needed
- Frontend: Utility functions (`cn`, `chunkArray`, `mergeBulkUploadResponses`, `canonicalItemOrder`)

**Integration Tests:**
- Backend: API endpoint tests with real test DB (PostgreSQL or SQLite) — these are the majority of tests
- Tests use FastAPI `TestClient` via `httpx.AsyncClient` with DB dependency overridden
- Auth flow, CRUD operations, pagination, filter logic tested against real DB

**End-to-End Tests:** Not present. No Cypress/Playwright tests.

### Common Patterns

**Async Testing (Backend):**
```python
@pytest.mark.asyncio
async def test_something(self, db_session: AsyncSession, test_user):
    service = ItemService(db_session)
    result = await service.get_ready_item_count(test_user.id)
    assert result == 1
```

**Error Testing (Backend):**
```python
@pytest.mark.asyncio
async def test_get_item_not_found(self, client, test_user, auth_headers):
    response = await client.get(f"/api/v1/items/{uuid4()}", headers=auth_headers)
    assert response.status_code == 404

def test_rejects_invalid(self):
    with pytest.raises(ValidationError):
        ScheduleBase(day_of_week=0, notification_time="08:00", occasion="invalid-occasion")
```

**Error Testing (Frontend):**
```typescript
it('should throw ApiError for 4xx/5xx responses', async () => {
  vi.mocked(global.fetch).mockResolvedValueOnce({
    ok: false, status: 404,
    json: async () => ({ detail: 'Not found' }),
  } as Response)
  await expect(api.get('/not-found')).rejects.toThrow(ApiError)
})

it('should throw NetworkError when offline', async () => {
  Object.defineProperty(navigator, 'onLine', { value: false, writable: true })
  await expect(api.get('/test')).rejects.toThrow(NetworkError)
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true })
})
```

### What Good Tests Look Like (Patterns to Follow)

1. **Test empty states:** `test_list_items_empty` — assert empty array and zero total
2. **Test pagination:** `test_list_items_pagination` — create 25 items, assert page 1 returns 10, page 3 returns 5
3. **Test filtering:** `test_list_items_filter_by_type` — create mixed types, filter by one, assert filtered count
4. **Test 404/not found:** `test_get_item_not_found` — UUID that doesn't exist, assert 404
5. **Test auth rejection:** `test_unauthenticated_request_fails` — no header, assert 401
6. **Test business logic directly:** `TestItemService` class tests service methods against real DB
7. **Test edge cases:** `test_parse_invalid_json`, `test_cancel_without_job_id_skips_job_construction`
8. **Test happy + sad paths:** Same test class covers both `test_accepts_valid` and `test_rejects_invalid`

---

*Testing analysis: 2026-07-17*
