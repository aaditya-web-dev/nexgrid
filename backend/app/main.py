from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import health, auth, workspaces, collections
from app import models  # noqa: F401  (registers all models with SQLAlchemy)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Schema is now managed by Alembic migrations (`alembic upgrade head`),
    # not by Base.metadata.create_all(). Nothing to do on startup for now.
    yield


app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)

# Allow the React dev server to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(workspaces.router)
app.include_router(collections.router)


@app.get("/")
def root():
    return {"project": settings.PROJECT_NAME, "status": "running"}
