import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.database import init_db
from app.services.websocket_manager import ws_manager
from app.services.redis_pubsub import pubsub_manager
from app.routes import register_all_routes

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle hook: database and real-time manager setup & teardown."""
    # Startup
    await init_db()
    await ws_manager.initialize()
    yield
    # Shutdown
    await pubsub_manager.close()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="High-performance real-time messaging platform inspired by WhatsApp Web",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all application routes (Health, API v1, WebSockets, Frontend HTML pages)
register_all_routes(app)

frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"

# Mount Uploads directory
uploads_dir = Path(settings.UPLOAD_FOLDER)
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

# Mount Frontend static directory
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
