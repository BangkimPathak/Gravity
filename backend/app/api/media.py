import os
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.core.config import settings
from app.models.user import User
from app.api.auth import get_current_user

router = APIRouter(prefix="/media", tags=["Media"])

ALLOWED_EXTENSIONS = {
    "image": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"},
    "audio": {".mp3", ".wav", ".ogg", ".webm", ".m4a"},
    "file": {".pdf", ".doc", ".docx", ".txt", ".zip", ".xlsx", ".csv", ".json"}
}

@router.post("/upload")
async def upload_media(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Handles async media file uploads for images, voice notes, and documents."""
    filename = file.filename or "upload"
    ext = Path(filename).suffix.lower()

    # Determine media type
    media_type = "file"
    for mtype, extensions in ALLOWED_EXTENSIONS.items():
        if ext in extensions:
            media_type = mtype
            break

    # Generate unique filename
    unique_filename = f"{uuid.uuid4().hex}_{filename}"
    file_path = Path(settings.UPLOAD_FOLDER) / unique_filename

    # Read and write in chunks asynchronously
    file_size = 0
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    try:
        with open(file_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                file_size += len(chunk)
                if file_size > max_bytes:
                    if file_path.exists():
                        os.remove(file_path)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_MB}MB"
                    )
                f.write(chunk)
    except Exception as exc:
        if file_path.exists():
            os.remove(file_path)
        if isinstance(exc, HTTPException):
            raise exc
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(exc)}")

    media_url = f"/uploads/{unique_filename}"

    return {
        "media_url": media_url,
        "filename": filename,
        "media_type": media_type,
        "size_bytes": file_size,
        "content_type": file.content_type
    }
