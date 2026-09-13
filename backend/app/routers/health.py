from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db

router = APIRouter(tags=["health"])


@router.get("/api/hello")
def hello():
    """Simple sanity-check endpoint for the frontend to call."""
    return {"message": "Hello from Nexgrid backend!"}


@router.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    """Confirms the API is up AND the database connection works."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}
