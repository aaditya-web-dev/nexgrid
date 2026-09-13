from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import Base, engine
from app.routers import health
from app import models  # noqa: F401  (ensures models are registered before create_all)

app = FastAPI(title=settings.PROJECT_NAME)

# Allow the React dev server to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)


@app.on_event("startup")
def on_startup():
    # Week 1: create tables directly. From Week 2 onward we switch to Alembic migrations.
    Base.metadata.create_all(bind=engine)


@app.get("/")
def root():
    return {"project": settings.PROJECT_NAME, "status": "running"}
