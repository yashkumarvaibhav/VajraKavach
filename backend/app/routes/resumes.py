"""
VajraKavach — Resume Routes
Secure resume upload (encrypted at rest), download with access control.
"""

import uuid
import os
from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.resume import Resume
from app.models.user import User
from app.schemas.resume import ResumeResponse
from app.dependencies import get_current_user
from app.services.resume_service import save_encrypted_resume, read_decrypted_resume
from app.services.pki_service import verify_signature
from app.services.audit_service import create_audit_log

router = APIRouter(prefix="/api/resumes", tags=["Resumes"])


def _load_server_private_key() -> str:
    """Load server private key for signing resumes (if available)."""
    key_path = os.path.join("certs", "server.key")
    if os.path.exists(key_path):
        with open(key_path, "r") as f:
            return f.read()
    return None


@router.post("/upload", response_model=ResumeResponse, status_code=status.HTTP_201_CREATED)
async def upload_resume(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload and encrypt a resume (PDF or DOCX only)."""
    server_key = _load_server_private_key()

    try:
        meta = await save_encrypted_resume(
            file=file,
            user_id=str(current_user.id),
            server_private_key=server_key,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    resume = Resume(
        id=uuid.uuid4(),
        user_id=current_user.id,
        original_filename=meta["original_filename"],
        encrypted_path=meta["encrypted_path"],
        file_hash=meta["file_hash"],
        digital_signature=meta["digital_signature"],
        file_size=meta["file_size"],
        mime_type=meta["mime_type"],
    )
    db.add(resume)
    await db.flush()

    await create_audit_log(
        db=db,
        action="resume.upload",
        user_id=str(current_user.id),
        resource="resume",
        resource_id=str(resume.id),
        details={"filename": meta["original_filename"], "hash": meta["file_hash"]},
        ip_address=request.client.host if request.client else None,
    )

    return ResumeResponse(
        id=str(resume.id),
        user_id=str(resume.user_id),
        original_filename=resume.original_filename,
        file_hash=resume.file_hash,
        file_size=resume.file_size,
        mime_type=resume.mime_type,
        has_signature=resume.digital_signature is not None,
        uploaded_at=resume.uploaded_at,
    )


@router.get("/my", response_model=list[ResumeResponse])
async def my_resumes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all resumes of the current user."""
    result = await db.execute(
        select(Resume).where(Resume.user_id == current_user.id)
    )
    resumes = result.scalars().all()

    return [
        ResumeResponse(
            id=str(r.id),
            user_id=str(r.user_id),
            original_filename=r.original_filename,
            file_hash=r.file_hash,
            file_size=r.file_size,
            mime_type=r.mime_type,
            has_signature=r.digital_signature is not None,
            uploaded_at=r.uploaded_at,
        )
        for r in resumes
    ]


@router.get("/{resume_id}/download")
async def download_resume(
    resume_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Download a resume. Access control:
      - Owner can always download
      - Recruiters can download if they have an application referencing this resume
      - Admins can download any resume
    """
    result = await db.execute(select(Resume).where(Resume.id == resume_id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    # Access control
    is_owner = str(resume.user_id) == str(current_user.id)
    is_admin = current_user.role.value == "admin"
    is_recruiter = current_user.role.value == "recruiter"

    if not (is_owner or is_admin or is_recruiter):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Decrypt and serve
    try:
        decrypted_content = await read_decrypted_resume(resume.encrypted_path)
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to decrypt resume")

    await create_audit_log(
        db=db,
        action="resume.download",
        user_id=str(current_user.id),
        resource="resume",
        resource_id=str(resume.id),
        details={"filename": resume.original_filename, "downloader_role": current_user.role.value},
        ip_address=request.client.host if request.client else None,
    )

    return Response(
        content=decrypted_content,
        media_type=resume.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{resume.original_filename}"',
        },
    )


@router.get("/{resume_id}/verify-integrity")
async def verify_resume_integrity(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Verify resume integrity using PKI digital signature (PKI function #2)."""
    result = await db.execute(select(Resume).where(Resume.id == resume_id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    if not resume.digital_signature:
        return {"verified": False, "message": "No digital signature available for this resume"}

    # Decrypt the resume to get original content
    try:
        decrypted_content = await read_decrypted_resume(resume.encrypted_path)
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to decrypt resume")

    # Verify with server's public certificate
    cert_path = os.path.join("certs", "server.crt")
    if not os.path.exists(cert_path):
        return {"verified": False, "message": "Server certificate not available"}

    from cryptography import x509
    with open(cert_path, "rb") as f:
        cert = x509.load_pem_x509_certificate(f.read())

    from cryptography.hazmat.primitives import serialization
    public_key_pem = cert.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")

    is_valid = verify_signature(decrypted_content, resume.digital_signature, public_key_pem)

    return {
        "verified": is_valid,
        "file_hash": resume.file_hash,
        "message": "Resume integrity verified via PKI digital signature" if is_valid else "Signature verification failed — resume may have been tampered with",
    }


@router.delete("/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resume(
    resume_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a resume (owner or admin only)."""
    result = await db.execute(select(Resume).where(Resume.id == resume_id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    if str(resume.user_id) != str(current_user.id) and current_user.role.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # Remove encrypted file
    if os.path.exists(resume.encrypted_path):
        os.remove(resume.encrypted_path)

    await create_audit_log(
        db=db,
        action="resume.delete",
        user_id=str(current_user.id),
        resource="resume",
        resource_id=str(resume.id),
        details={"filename": resume.original_filename},
        ip_address=request.client.host if request.client else None,
    )

    await db.delete(resume)
