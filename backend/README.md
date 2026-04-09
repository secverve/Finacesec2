# Backend

The backend is a FastAPI application backed by SQLAlchemy models, an independent FDS engine, and a service-oriented API layer.

## Main Areas

- `app/api`: route handlers and dependency wiring
- `app/services`: business logic
- `app/fds`: risk engine and rules
- `app/models`: database models
- `app/tests`: backend verification

## Run

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e .[dev]
uvicorn app.main:app --reload
```
