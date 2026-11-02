"""slowapi limiter (Spec B §10). Friendly 429 via the ApiError envelope."""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])
