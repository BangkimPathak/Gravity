import asyncio
import json
import logging
from typing import Callable, Optional
import redis.asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger("gravity.pubsub")

class RedisPubSubManager:
    """
    Distributed Pub/Sub system for multi-worker scaling.
    Falls back gracefully to in-memory async message queues when Redis is not running.
    """
    def __init__(self):
        self.redis_client: Optional[aioredis.Redis] = None
        self.pubsub: Optional[aioredis.client.PubSub] = None
        self.is_connected: bool = False
        self.channel_name = "gravity_events_channel"
        self._local_subscribers = set()
        self._listener_task: Optional[asyncio.Task] = None

    async def initialize(self, on_message_callback: Callable[[dict], None]):
        """Connects to Redis or falls back to in-memory mode."""
        self._on_message = on_message_callback
        if settings.USE_REDIS:
            try:
                self.redis_client = aioredis.from_url(
                    settings.REDIS_URL, 
                    decode_responses=True,
                    socket_connect_timeout=2.0
                )
                await self.redis_client.ping()
                self.pubsub = self.redis_client.pubsub()
                await self.pubsub.subscribe(self.channel_name)
                self.is_connected = True
                self._listener_task = asyncio.create_task(self._listen_redis())
                logger.info("Connected to Redis Pub/Sub successfully.")
                return
            except Exception as exc:
                logger.warning(f"Could not connect to Redis ({exc}). Using in-memory PubSub fallback.")
                self.is_connected = False
        else:
            logger.info("Redis disabled via config. Using high-performance in-memory event bus.")
            self.is_connected = False

    async def _listen_redis(self):
        """Asynchronously listens for messages on the Redis channel."""
        try:
            while self.is_connected and self.pubsub:
                message = await self.pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message and message.get("type") == "message":
                    data_str = message.get("data")
                    if data_str:
                        event_dict = json.loads(data_str)
                        await self._on_message(event_dict)
                await asyncio.sleep(0.01)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.error(f"Redis PubSub listener error: {exc}")

    async def publish_event(self, event_data: dict):
        """Publishes an event to Redis (or locally in fallback mode)."""
        if self.is_connected and self.redis_client:
            try:
                await self.redis_client.publish(self.channel_name, json.dumps(event_data, default=str))
                return
            except Exception as exc:
                logger.error(f"Failed to publish to Redis: {exc}. Processing locally.")
        
        # Local processing fallback
        if self._on_message:
            await self._on_message(event_data)

    async def close(self):
        """Cleanly closes Redis connections."""
        if self._listener_task:
            self._listener_task.cancel()
        if self.pubsub:
            await self.pubsub.unsubscribe(self.channel_name)
            await self.pubsub.close()
        if self.redis_client:
            await self.redis_client.close()

pubsub_manager = RedisPubSubManager()
