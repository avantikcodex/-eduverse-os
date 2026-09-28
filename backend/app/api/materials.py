from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.document_service import extract_pdf_text


router = APIRouter(prefix="/materials", tags=["Materials"])

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


@router.post("/upload")
async def upload_material(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported right now",
        )

    material_id = str(uuid4())
    file_path = UPLOAD_DIR / f"{material_id}.pdf"

    content = await file.read()
    file_path.write_bytes(content)

    extracted_text = extract_pdf_text(str(file_path))

    if not extracted_text:
        raise HTTPException(
            status_code=400,
            detail="Could not extract readable text from this PDF",
        )

    return {
        "material_id": material_id,
        "filename": file.filename,
        "status": "ready",
        "characters": len(extracted_text),
        "preview": extracted_text[:1000],
    }
