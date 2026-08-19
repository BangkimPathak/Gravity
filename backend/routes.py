"""
Root-level routes alias module.
Re-exports routes and routers from `app.routes`.
"""
from app.routes import (
    api_router,
    ws_router,
    pages_router,
    health_router,
    register_all_routes
)

__all__ = [
    "api_router",
    "ws_router",
    "pages_router",
    "health_router",
    "register_all_routes"
]
