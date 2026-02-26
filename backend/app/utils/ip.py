"""
VajraKavach — IP Address Utility
Extract the real client IP from proxy headers.
"""

from fastapi import Request


def get_client_ip(request: Request) -> str:
    """
    Extract the real client IP address from the request.
    Checks X-Forwarded-For and X-Real-IP headers (set by reverse proxies)
    before falling back to request.client.host.
    """
    # X-Forwarded-For can contain a comma-separated list: client, proxy1, proxy2
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        # The first IP in the list is the original client
        return forwarded_for.split(",")[0].strip()

    # Some proxies use X-Real-IP instead
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    # Fallback to direct connection IP
    return request.client.host if request.client else "unknown"
