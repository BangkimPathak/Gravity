#!/usr/bin/env python3
"""
Gravity Web Application Runner
Launches the FastAPI backend and serves the frontend on http://localhost:8000
"""
import sys
import uvicorn
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(backend_dir))

if __name__ == "__main__":
    print("==================================================================")
    print(" 🚀 Launching Project Gravity Real-Time Messaging Platform")
    print(" 🌐 Web UI & API available at: http://localhost:8000")
    print(" 📖 Interactive OpenAPI Docs at: http://localhost:8000/docs")
    print(" 🔌 Real-Time WebSocket endpoint at: ws://localhost:8000/ws/chat")
    print("==================================================================")
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
