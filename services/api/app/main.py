"""JanaVaani API — FastAPI app, CORS, routers, startup warm-up, scheduler."""
import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from . import __version__
from .core import errors
from .core.config import get_settings
from .core.db import create_all
from .core.ratelimit import limiter

logging.basicConfig(level=logging.INFO, format='{"t":"%(asctime)s","lvl":"%(levelname)s","log":"%(name)s","msg":"%(message)s"}')
log = logging.getLogger("janavaani")


def _warm():
    from .ml import classifier, embeddings
    classifier.load()
    embeddings.load()
    embeddings.embed("warm up")
    log.info("warm-up done: classifier=%s embeddings=%s", classifier.available(), embeddings.mode())


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_all()
    from .core import settings_store
    settings_store.load_clock()
    threading.Thread(target=_warm, daemon=True).start()
    yield


app = FastAPI(title="JanaVaani API", version=__version__, lifespan=lifespan,
              description="AI engine and backend for JanaVaani (HI-02 multilingual citizen grievance platform).",
              docs_url="/docs", openapi_url="/api/v1/openapi.json")
app.state.limiter = limiter
errors.install(app)


@app.exception_handler(RateLimitExceeded)
async def _rl(_: Request, e: RateLimitExceeded):
    return JSONResponse({"error": {"code": "rate_limited", "message": "Too many requests. Please wait a minute and try again.",
                                   "details": str(e.detail)}}, status_code=429)


app.add_middleware(CORSMiddleware, allow_origins=get_settings().origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

from .routers import meta  # noqa: E402

for r in (meta.router,):
    app.include_router(r, prefix="/api/v1")


@app.get("/")
def root():
    return {"name": "JanaVaani API", "version": __version__, "docs": "/docs", "health": "/api/v1/health"}
