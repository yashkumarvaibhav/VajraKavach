"""
Run the FastAPI backend with HTTPS enabled for local development.

Usage:
    cd backend
    source venv/bin/activate
    python serve_https.py
"""

import os

import uvicorn

from app.config import settings
from app.services.pki_service import generate_self_signed_cert


def ensure_local_tls_certificates() -> None:
    cert_path = settings.PKI_CERTIFICATE_PATH
    key_path = settings.PKI_PRIVATE_KEY_PATH
    os.makedirs(os.path.dirname(cert_path) or ".", exist_ok=True)
    os.makedirs(os.path.dirname(key_path) or ".", exist_ok=True)

    if not os.path.exists(cert_path) or not os.path.exists(key_path):
        generate_self_signed_cert(
            common_name="localhost",
            cert_path=cert_path,
            key_path=key_path,
        )


if __name__ == "__main__":
    ensure_local_tls_certificates()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        ssl_certfile=settings.PKI_CERTIFICATE_PATH,
        ssl_keyfile=settings.PKI_PRIVATE_KEY_PATH,
    )
