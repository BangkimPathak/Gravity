/**
 * Project Gravity Configuration & Constants
 */
const isHttps = window.location.protocol === "https:";
const host = window.location.host || "localhost:8000";

export const CONFIG = {
  API_BASE_URL: `${window.location.origin}/api/v1`,
  WS_URL: `${isHttps ? "wss" : "ws"}://${host}/ws/chat`,
  MAX_RECONNECT_DELAY: 30000,
  HEARTBEAT_INTERVAL: 25000,
  TYPING_DEBOUNCE_MS: 300,
  TYPING_TIMEOUT_MS: 2500,
  STORAGE_TOKEN_KEY: "gravity_auth_token",
  STORAGE_USER_KEY: "gravity_auth_user",
  STORAGE_THEME_KEY: "gravity_app_theme"
};
