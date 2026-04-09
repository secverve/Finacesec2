# VERVE FDS Infra

VERVE FDS Infra is a working end-to-end fraud detection and trading operations sample for a stock MTS platform.

It includes:

- FastAPI backend with service-layer separation
- Independent FDS engine and extensible rules
- Persistent risk event and rule hit storage
- React frontend for login, trading, portfolio, and admin review
- Seed data, Docker support, and API tests

## Documentation

- [FEATURES.md](FEATURES.md): 기능 설명서
- [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md): 보안 아키텍처 설명서

## Directory Layout

```text
fds-infra/
|-- AGENTS.md
|-- .env.example
|-- docker-compose.yml
|-- backend/
|   |-- app/
|   |   |-- api/
|   |   |-- core/
|   |   |-- db/
|   |   |-- fds/
|   |   |-- models/
|   |   |-- schemas/
|   |   `-- services/
|   |-- tests/
|   `-- pyproject.toml
`-- frontend/
    |-- src/
    |-- package.json
    `-- Dockerfile
```

## Key Flows

- Every order is evaluated by the FDS engine before execution.
- Every evaluation creates a persisted `risk_event`.
- Every triggered rule creates a persisted `rule_hit`.
- Admin actions are written to audit logs and can approve, block, or step up review.

## Quick Start With Docker

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Services:

- Frontend: `http://localhost:3000`
- Backend API Docs: `http://localhost:8000/docs`
- Backend Health: `http://localhost:8000/api/v1/health`

## Local Backend Run

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e .[dev]
Copy-Item ..\.env.example ..\.env
uvicorn app.main:app --reload
```

## Local Frontend Run

```powershell
cd frontend
npm install
$env:VITE_API_BASE_URL="http://localhost:8000/api/v1"
npm run dev
```

## Demo Accounts

- Admin: `admin@verve.local` / `Admin1234!`
- Trader: `trader@verve.local` / `Trader1234!`
- Analyst: `analyst@verve.local` / `Analyst1234!`

## Tests

```powershell
cd backend
.\.venv\Scripts\pytest
```

## Current Scope

- JWT authentication and profile lookup
- Market data listing and quote lookup
- Order submission and execution handling
- Portfolio aggregation
- FDS scoring, persistence, and admin actions
- Audit logging
- React operations dashboard
