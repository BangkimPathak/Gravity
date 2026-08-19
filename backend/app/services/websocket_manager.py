import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Dict, List, Set, Optional, Any
from fastapi import WebSocket
from app.services.redis_pubsub import pubsub_manager

logger = logging.getLogger("gravity.websocket")

class WebSocketConnectionManager:
    """
    Manages active WebSocket connections, multi-tab routing,
    presence status, typing indicators, and message broadcasts.
    """
    def __init__(self):
        # Maps user_id -> set of active WebSocket instances
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Maps user_id -> last_seen datetime
        self.user_presence: Dict[str, datetime] = {}
        # Maps conversation_id -> set of user_ids currently typing
        self.typing_users: Dict[str, Set[str]] = {}

    async def initialize(self):
        """Initializes Pub/Sub dispatcher callback."""
        await pubsub_manager.initialize(self._handle_pubsub_event)

    async def connect(self, user_id: str, websocket: WebSocket):
        """Registers a new WebSocket connection for a user."""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
            # Broadcast presence online
            await self.broadcast_presence(user_id, is_online=True)
            
        self.active_connections[user_id].add(websocket)
        self.user_presence[user_id] = datetime.now(timezone.utc)
        logger.info(f"User {user_id} connected via WebSocket. Active sessions: {len(self.active_connections[user_id])}")

    async def disconnect(self, user_id: str, websocket: WebSocket):
        """Removes a WebSocket connection and updates presence when all sessions close."""
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
                self.user_presence[user_id] = datetime.now(timezone.utc)
                # Broadcast presence offline
                await self.broadcast_presence(user_id, is_online=False, last_seen=self.user_presence[user_id])
                logger.info(f"User {user_id} went completely offline.")

    def is_user_online(self, user_id: str) -> bool:
        """Returns whether a user has at least one active connection."""
        return bool(self.active_connections.get(user_id))

    def get_last_seen(self, user_id: str) -> Optional[datetime]:
        """Returns the last known presence timestamp of a user."""
        return self.user_presence.get(user_id)

    async def send_personal_message(self, user_id: str, payload: dict):
        """Sends a JSON payload to all active connections for a single user."""
        connections = self.active_connections.get(user_id, set())
        dead_connections = set()
        for ws in connections:
            try:
                await ws.send_text(json.dumps(payload, default=str))
            except Exception as exc:
                logger.warning(f"Failed to send to user {user_id} socket: {exc}")
                dead_connections.add(ws)
        
        for dead_ws in dead_connections:
            await self.disconnect(user_id, dead_ws)

    async def broadcast_to_users(self, user_ids: List[str], event: str, data: Any):
        """Broadcasts an event to a list of target user IDs via PubSub."""
        payload = {
            "target_users": user_ids,
            "event": event,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await pubsub_manager.publish_event(payload)

    async def broadcast_presence(self, user_id: str, is_online: bool, last_seen: Optional[datetime] = None):
        """Broadcasts a user's presence state change to all clients."""
        payload = {
            "target_users": "ALL",
            "event": "presence",
            "data": {
                "user_id": user_id,
                "is_online": is_online,
                "last_seen": (last_seen or datetime.now(timezone.utc)).isoformat()
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await pubsub_manager.publish_event(payload)

    async def _handle_pubsub_event(self, event_envelope: dict):
        """Dispatches an incoming pub/sub event to locally connected WebSocket clients."""
        target_users = event_envelope.get("target_users")
        event = event_envelope.get("event")
        data = event_envelope.get("data")
        timestamp = event_envelope.get("timestamp")

        out_msg = {
            "event": event,
            "data": data,
            "timestamp": timestamp
        }

        if target_users == "ALL":
            for uid in list(self.active_connections.keys()):
                await self.send_personal_message(uid, out_msg)
        elif isinstance(target_users, list):
            for uid in target_users:
                if uid in self.active_connections:
                    await self.send_personal_message(uid, out_msg)

ws_manager = WebSocketConnectionManager()
