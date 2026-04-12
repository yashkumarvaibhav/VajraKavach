"""
VajraKavach — Resume Service
Handles secure upload, encryption, storage, and retrieval of resumes.
"""

import os
import uuid
import aiofiles
from fastapi import UploadFile
from app.config import settings
from app.services.encryption_service import encrypt_data, decrypt_data, compute_sha256
from app.services.pki_service import sign_data


ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # docx
}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


async def save_encrypted_resume(
    file: UploadFile,
    user_id: str,
    server_private_key: str = None,
) -> dict:
    """
    Read upload, encrypt, save to disk, compute hash + digital signature.
    Returns metadata dict for storing in DB.
    """
    # Read file content
    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise ValueError("File exceeds maximum size of 5 MB")

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise ValueError(f"Invalid file type: {file.content_type}. Only PDF and DOCX are allowed.")

    # Validate magic bytes (server-side, not trusting client Content-Type alone)
    if content[:4] == b'%PDF':
        pass  # Valid PDF
    elif content[:4] == b'PK\x03\x04':
        pass  # Valid DOCX (ZIP-based)
    else:
        raise ValueError("File content does not match PDF or DOCX format.")

    # Compute integrity hash of original content
    file_hash = compute_sha256(content)

    # Encrypt content
    encrypted_content = encrypt_data(content)

    # Save to disk
    upload_dir = os.path.join(settings.UPLOAD_DIR, str(user_id))
    os.makedirs(upload_dir, exist_ok=True)
    file_id = str(uuid.uuid4())
    encrypted_path = os.path.join(upload_dir, f"{file_id}.enc")

    async with aiofiles.open(encrypted_path, "wb") as f:
        await f.write(encrypted_content)

    # Digital signature for integrity (PKI function #2)
    digital_signature = None
    if server_private_key:
        digital_signature = sign_data(content, server_private_key)

    return {
        "file_id": file_id,
        "original_filename": file.filename,
        "encrypted_path": encrypted_path,
        "file_hash": file_hash,
        "digital_signature": digital_signature,
        "file_size": str(len(content)),
        "mime_type": file.content_type,
    }


async def read_decrypted_resume(encrypted_path: str) -> bytes:
    """Read and decrypt a resume file from disk."""
    async with aiofiles.open(encrypted_path, "rb") as f:
        encrypted_content = await f.read()
    return decrypt_data(encrypted_content)
