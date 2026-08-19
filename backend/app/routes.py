from pathlib import Path
from fastapi import APIRouter, FastAPI
from fastapi.responses import FileResponse

from app.core.config import settings
from app.api import auth, users, conversations, messages, media
from app.websockets import chat_ws

# Base directory for static frontend templates
frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"

# ====================================================================
# 1. HEALTH CHECK ROUTER
# ====================================================================
health_router = APIRouter(tags=["Health"])

@health_router.get("/health")
async def health_check():
    """Health check endpoint to verify backend service status."""
    return {
        "status": "healthy",
        "project": settings.PROJECT_NAME,
        "version": "1.0.0"
    }


# ====================================================================
# 2. WEB PAGE / FRONTEND NAVIGATION ROUTER
# ====================================================================
pages_router = APIRouter(tags=["Pages"])

@pages_router.get("/", include_in_schema=False)
@pages_router.get("/login", include_in_schema=False)
@pages_router.get("/register", include_in_schema=False)
@pages_router.get("/auth", include_in_schema=False)
async def serve_auth_portal():
    """Serves the authentication and registration portal."""
    return FileResponse(frontend_dir / "auth.html")

@pages_router.get("/verify-otp", include_in_schema=False)
async def serve_verify_otp():
    """Serves the multi-step OTP verification page."""
    return FileResponse(frontend_dir / "verify.html")

@pages_router.get("/set-password", include_in_schema=False)
async def serve_set_password():
    """Serves the password creation and onboarding completion page."""
    return FileResponse(frontend_dir / "set_password.html")

@pages_router.get("/home", include_in_schema=False)
@pages_router.get("/app", include_in_schema=False)
@pages_router.get("/chat", include_in_schema=False)
async def serve_chat_app():
    """Serves the main real-time WhatsApp Web-inspired chat application."""
    return FileResponse(frontend_dir / "chat.html")


# ====================================================================
# 3. CONSOLIDATED API ROUTER (REST ENDPOINTS)
# ====================================================================
api_router = APIRouter()

# Auth routes: /signup, /login, /verify-otp, /set-password, /otp-time, /resend-otp, /me
api_router.include_router(auth.router)
# User routes: search, presence, profile
api_router.include_router(users.router)
# Conversation routes: direct chats, group chats, participant management
api_router.include_router(conversations.router)
# Message routes: history, search, text/media sending, reactions, read status
api_router.include_router(messages.router)
# Media routes: file and attachment upload & streaming
api_router.include_router(media.router)


# ====================================================================
# 4. WEBSOCKET ROUTER
# ====================================================================
ws_router = chat_ws.router


# ====================================================================
# 5. ALL ROUTES REGISTRATION HELPER
# ====================================================================
def register_all_routes(app: FastAPI) -> None:
    """
    Registers all routes used in this application to the provided FastAPI instance:
    - Health check endpoint (/health)
    - REST API routes (mounted under /api/v1 and /api)
    - Real-time WebSocket routes (/ws/chat)
    - Frontend HTML page routes (/, /login, /register, /auth, /verify-otp, /set-password, /home, /app, /chat)
    """
    # 1. Health Router
    app.include_router(health_router)

    # 2. REST API Routers (both /api/v1 and /api for backward compatibility)
    app.include_router(api_router, prefix=settings.API_V1_STR)
    app.include_router(api_router, prefix="/api")

    # 3. WebSocket Router
    app.include_router(ws_router)

    # 4. Page navigation routes
    app.include_router(pages_router)
