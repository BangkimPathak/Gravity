import { CONFIG } from "./config.js";
import { api } from "./api.js";

/**
 * High-performance WebSocket client with automatic exponential backoff reconnects
 * and periodic heartbeat ping/pong.
 */
class WebSocketManager {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.heartbeatTimer = null;
    this.listeners = new Map();
    this.isConnected = false;
    this.isExplicitlyClosed = false;
  }

  connect() {
    const token = api.getToken();
    if (!token) return;

    this.isExplicitlyClosed = false;
    const wsUrl = `${CONFIG.WS_URL}?token=${encodeURIComponent(token)}`;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error("[WS] Connection creation failed:", err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log("[WS] Connected to Gravity Real-Time Server.");
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.dispatchEvent("connection_change", { status: "connected" });
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const eventType = payload.event;
        const data = payload.data;

        if (eventType === "pong") {
          return;
        }

        this.dispatchEvent(eventType, data);
      } catch (err) {
        console.error("[WS] Message parsing error:", err);
      }
    };

    this.ws.onclose = (event) => {
      console.warn(`[WS] Connection closed (code: ${event.code})`);
      this.isConnected = false;
      this.stopHeartbeat();
      this.dispatchEvent("connection_change", { status: "disconnected" });

      if (!this.isExplicitlyClosed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (err) => {
      console.error("[WS] WebSocket error observed:", err);
      this.ws.close();
    };
  }

  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), CONFIG.MAX_RECONNECT_DELAY);
    console.log(`[WS] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})...`);
    setTimeout(() => {
      if (!this.isConnected && !this.isExplicitlyClosed) {
        this.connect();
      }
    }, delay);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ event: "ping" }));
      }
    }, CONFIG.HEARTBEAT_INTERVAL);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  send(event, data = {}) {
    if (!this.isConnected || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[WS] Cannot send message: WebSocket is disconnected.");
      return false;
    }

    this.ws.send(JSON.stringify({ event, data }));
    return true;
  }

  sendChatMessage(conversationId, content, messageType = "text", mediaUrl = null, clientTempId = null) {
    return this.send("message_send", {
      conversation_id: conversationId,
      content: content,
      message_type: messageType,
      media_url: mediaUrl,
      client_temp_id: clientTempId
    });
  }

  sendTyping(conversationId, isTyping) {
    const event = isTyping ? "typing_start" : "typing_stop";
    return this.send(event, { conversation_id: conversationId });
  }

  sendStatusUpdate(conversationId, status, messageIds = []) {
    return this.send("status_update", {
      conversation_id: conversationId,
      status: status,
      message_ids: messageIds
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  dispatchEvent(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error(`[WS] Error in event listener '${event}':`, e);
        }
      });
    }
  }

  disconnect() {
    this.isExplicitlyClosed = true;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

export const wsManager = new WebSocketManager();
