# Project Gravity 🛰️

A high-performance, real-time messaging web application inspired by WhatsApp Web. Built with an asynchronous **Python (FastAPI)** backend and a zero-framework, modern **HTML5 / CSS3 / Vanilla JavaScript (ES6)** frontend.

---

## 🌟 Key Features

1. **WhatsApp Web Architecture & Design:**
   - Pixel-perfect 2-column responsive dashboard layout (Sidebar + Chat Viewport).
   - Theme toggle (Dark / Light) with CSS custom properties.
   - SVG Doodle wallpaper pattern and authentic status tick icons (Single grey = Sent, Double grey = Delivered, Double blue = Read).
2. **Real-Time Event Engine (WebSockets + Redis Pub/Sub):**
   - Bidirectional real-time messaging (`ws://` / `wss://`).
   - Heartbeat ping-pong monitoring and exponential backoff auto-reconnection.
   - Live presence indicator (Online / Offline / Last seen timestamps).
   - Real-time debounced typing indicators.
   - Immediate optimistic UI message rendering with server ACK reconciliation.
3. **Robust Database Layer (MySQL 8.0+ / InnoDB):**
   - Full MySQL 8.0+ DDL schema (`sql/schema.sql`) with foreign key cascading deletes and compound indexes (`idx_conversation_created`, `unique_user_conversation`).
   - SQLAlchemy 2.0 async ORM engine with support for `aiomysql`, `asyncmy`, and zero-setup local SQLite fallback.
4. **Media & File Attachments:**
   - Asynchronous streaming file upload for photos, documents, and voice audio notes.
5. **Interactive Controls:**
   - Built-in Emoji picker, Group Channel creator, User search directory, and Profile bio editor.

---

## 🏗️ Project Structure

```
Gravity/
├── run.py                      # One-command server runner
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py         # Registration, Login, Profile endpoints
│   │   │   ├── users.py        # User directory & contact search
│   │   │   ├── conversations.py# Direct & Group chat creation and listing
│   │   │   ├── messages.py     # Paginated history & read receipts
│   │   │   └── media.py        # Async media file upload handler
│   │   ├── core/
│   │   │   ├── config.py       # Pydantic V2 application settings
│   │   │   ├── security.py     # JWT & direct bcrypt password hashing
│   │   │   └── database.py     # SQLAlchemy async engine & auto-seeding
│   │   ├── models/
│   │   │   ├── user.py         # User model
│   │   │   ├── conversation.py # Conversation & Participant models
│   │   │   └── message.py      # Message model with microsecond timestamps
│   │   ├── schemas/            # Pydantic validation schemas
│   │   ├── services/
│   │   │   ├── redis_pubsub.py # Multi-worker Redis Pub/Sub + local fallback
│   │   │   └── websocket_manager.py # WebSocket multi-session connection manager
│   │   ├── websockets/
│   │   │   └── chat_ws.py      # WebSocket endpoint (/ws/chat)
│   │   └── main.py             # FastAPI entrypoint, CORS, static mounting
│   ├── sql/
│   │   ├── schema.sql          # Pure MySQL 8.0+ InnoDB DDL
│   │   └── seed.sql            # Demo seed data
│   ├── tests/
│   │   └── test_api_and_ws.py  # Comprehensive test suite
│   └── requirements.txt
└── frontend/
    ├── index.html              # WhatsApp Web 2-column semantic interface
    ├── css/                    # Modular stylesheets (Dark/Light themes, chat, sidebar)
    ├── js/                     # Modular ES6 Vanilla JS (WebSocket, API, UI, Auth)
    └── assets/                 # SVGs (doodle wallpaper, default avatar)
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pip install -r backend/requirements.txt
```

### 2. Run the Application
```bash
python run.py
```
Open **http://localhost:8000** in your browser.

### 3. Quick Demo Logins
You can use the instant quick-login buttons on the login modal:
- **Alex Rivers:** `alex@gravity.chat` / `password123`
- **Sarah Connor:** `sarah@gravity.chat` / `password123`
- **David Kim:** `david@gravity.chat` / `password123`

*Tip: Open two different browser tabs (or an incognito window) with Alex in one and Sarah in the other to experience live real-time messaging, typing indicators, and double blue ticks!*

---

## 🧪 Running Automated Tests
```bash
$env:PYTHONPATH="c:\GMCH Intern\Gravity\backend"; python -m pytest backend/tests/test_api_and_ws.py -v
```
