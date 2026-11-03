import httpx


class ProviderError(Exception):
    def __init__(self, code: str, retryable: bool):
        super().__init__(code)
        self.code, self.retryable = code, retryable


def raise_for(r: httpx.Response):
    if r.status_code == 429:
        raise ProviderError("rate_limited", True)
    if r.status_code in (401, 403):
        raise ProviderError("invalid_key", False)
    if r.status_code >= 500:
        raise ProviderError(f"http_{r.status_code}", True)
    if r.status_code >= 400:
        raise ProviderError(f"http_{r.status_code}", False)

