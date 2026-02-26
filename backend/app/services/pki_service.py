"""
VajraKavach — PKI Service
RSA key pair generation, signing, verification, and encryption for:
  1. Message signing / verification
  2. Resume integrity (digital signatures)
"""

import os
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.backends import default_backend
from cryptography import x509
from cryptography.x509.oid import NameOID
from datetime import datetime, timedelta
import base64


# ── Key Pair Generation ─────────────────────────────────────────────

def generate_rsa_key_pair(key_size: int = 2048) -> tuple[str, str]:
    """
    Generate an RSA key pair.
    Returns (private_key_pem, public_key_pem) as strings.
    """
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=key_size,
        backend=default_backend(),
    )

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")

    return private_pem, public_pem


# ── Digital Signing ──────────────────────────────────────────────────

def sign_data(data: bytes, private_key_pem: str) -> str:
    """
    Sign data with an RSA private key (SHA-256 + PKCS1v15).
    Returns base64-encoded signature.
    """
    private_key = serialization.load_pem_private_key(
        private_key_pem.encode("utf-8"),
        password=None,
        backend=default_backend(),
    )
    signature = private_key.sign(
        data,
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode("utf-8")


def verify_signature(data: bytes, signature_b64: str, public_key_pem: str) -> bool:
    """
    Verify an RSA signature.
    Returns True if valid, False otherwise.
    """
    try:
        public_key = serialization.load_pem_public_key(
            public_key_pem.encode("utf-8"),
            backend=default_backend(),
        )
        signature = base64.b64decode(signature_b64)
        public_key.verify(
            signature,
            data,
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True
    except Exception:
        return False


# ── Asymmetric Encryption (for E2E messaging) ───────────────────────

def encrypt_with_public_key(data: bytes, public_key_pem: str) -> str:
    """
    Encrypt data with recipient's RSA public key (OAEP + SHA-256).
    Returns base64-encoded ciphertext.
    """
    public_key = serialization.load_pem_public_key(
        public_key_pem.encode("utf-8"),
        backend=default_backend(),
    )
    ciphertext = public_key.encrypt(
        data,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return base64.b64encode(ciphertext).decode("utf-8")


def decrypt_with_private_key(ciphertext_b64: str, private_key_pem: str) -> bytes:
    """
    Decrypt ciphertext with RSA private key.
    Returns plaintext bytes.
    """
    private_key = serialization.load_pem_private_key(
        private_key_pem.encode("utf-8"),
        password=None,
        backend=default_backend(),
    )
    ciphertext = base64.b64decode(ciphertext_b64)
    return private_key.decrypt(
        ciphertext,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )


# ── Self-Signed Certificate Generation (for HTTPS / TLS) ────────────

def generate_self_signed_cert(
    common_name: str = "vajrakavach.local",
    cert_path: str = "certs/server.crt",
    key_path: str = "certs/server.key",
    days_valid: int = 365,
):
    """Generate a self-signed TLS certificate and private key."""
    os.makedirs(os.path.dirname(cert_path), exist_ok=True)

    key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend(),
    )

    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "IN"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Delhi"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "VajraKavach"),
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
    ])

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.utcnow())
        .not_valid_after(datetime.utcnow() + timedelta(days=days_valid))
        .sign(key, hashes.SHA256(), default_backend())
    )

    with open(key_path, "wb") as f:
        f.write(key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        ))

    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))

    return cert_path, key_path
