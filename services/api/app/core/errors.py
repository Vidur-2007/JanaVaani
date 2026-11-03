"""ApiError envelope: {"error": {"code", "message", "details"}} for every failure."""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("janavaani")


class ApiException(Exception):
    def __init__(self, status: int, code: str, message: str, details=None):
        self.status, self.code, self.message, self.details = status, code, message, details


def err(status: int, code: str, message: str, details=None) -> ApiException:
    return ApiException(status, code, message, details)


def _body(code, message, details=None):
    e = {"code": code, "message": message}
    if details is not None:
        e["details"] = details
    return {"error": e}


def install(app: FastAPI):
    @app.exception_handler(ApiException)
    async def _api(_: Request, e: ApiException):
        return JSONResponse(_body(e.code, e.message, e.details), status_code=e.status)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException):
        code = {401: "unauthorized", 403: "forbidden", 404: "not_found", 405: "method_not_allowed", 429: "rate_limited"}.get(e.status_code, "http_error")
        return JSONResponse(_body(code, str(e.detail)), status_code=e.status_code)

    @app.exception_handler(RequestValidationError)
    async def _val(_: Request, e: RequestValidationError):
        details = [{"loc": list(x.get("loc", [])), "msg": x.get("msg")} for x in e.errors()]
        return JSONResponse(_body("validation_error", "Request validation failed", details), status_code=422)

    @app.exception_handler(Exception)
    async def _any(_: Request, e: Exception):
        log.exception("unhandled error: %s", type(e).__name__)
        return JSONResponse(_body("internal_error", "Something went wrong. Please try again."), status_code=500)
