"""JanaVaani API — FastAPI app, CORS, routers, startup warm-up, scheduler."""
import logging
import sys
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from . import __version__
from .core import errors, storage
from .core.config import REPO_DIR, get_settings
from .core.db import create_all, engine, session_scope
from .core.ratelimit import limiter

logging.basicConfig(level=logging.INFO, format='{"t":"%(asctime)s","lvl":"%(levelname)s","log":"%(name)s","msg":"%(message)s"}')
logging.getLogger("httpx").setLevel(logging.WARNING)     # its INFO lines carry full request URLs
log = logging.getLogger("janavaani")


def _warm():
    from .ml import classifier, embeddings
    classifier.load()
    embeddings.load()
    embeddings.embed("warm up")
    _auto_seed()
    log.info("warm-up done: classifier=%s embeddings=%s", classifier.available(), embeddings.mode())


def _auto_seed():
    """A Space without Supabase starts on an empty SQLite file; seed it so the demo works from the first request."""
    if not (get_settings().auto_seed and engine.dialect.name == "sqlite"):
        return
    from sqlalchemy import func, select

    from .models import Profile
    with session_scope() as db:
        if db.scalar(select(func.count()).select_from(Profile)):
            return
    sys.path.insert(0, str(REPO_DIR / "ml"))
    import seed_db
    seed_db.main(quick=True)
    log.info("auto-seeded the demo city")


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_all()
    from .core import settings_store
    settings_store.load_clock()
    threading.Thread(target=_warm, daemon=True).start()
    sched = None
    if get_settings().enable_scheduler:
        from .jobs.scheduler import start
        sched = start()
    yield
    if sched:
        sched.shutdown(wait=False)


app = FastAPI(title="JanaVaani API", version=__version__, lifespan=lifespan,
              description="AI engine and backend for JanaVaani (HI-02 multilingual citizen grievance platform).",
              docs_url="/docs", openapi_url="/api/v1/openapi.json")
app.state.limiter = limiter
errors.install(app)


@app.exception_handler(RateLimitExceeded)
async def _rl(_: Request, e: RateLimitExceeded):
    return JSONResponse({"error": {"code": "rate_limited", "message": "Too many requests. Please wait a minute and try again.",
                                   "details": str(e.detail)}}, status_code=429)


@app.middleware("http")
async def _remember_request_base(request: Request, call_next):
    storage.request_base.set(str(request.base_url).rstrip("/"))
    return await call_next(request)


app.add_middleware(CORSMiddleware, allow_origins=get_settings().origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

from .routers import admin, auth, citizen, meta, officer  # noqa: E402

for r in (meta.router, auth.router, citizen.router, officer.router, admin.router):
    app.include_router(r, prefix="/api/v1")


@app.get("/")
def root():
    return {"name": "JanaVaani API", "version": __version__, "docs": "/docs", "health": "/api/v1/health"}
