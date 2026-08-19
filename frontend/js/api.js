import { CONFIG } from "./config.js";

/**
 * Robust HTTP client with Bearer token authentication
 */
class ApiClient {
  constructor() {
    this.token = localStorage.getItem(CONFIG.STORAGE_TOKEN_KEY) || null;
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem(CONFIG.STORAGE_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(CONFIG.STORAGE_TOKEN_KEY);
    }
  }

  getToken() {
    return this.token;
  }

  async request(endpoint, options = {}) {
    const url = `${CONFIG.API_BASE_URL}${endpoint}`;
    const headers = { ...options.headers };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      let errorDetail = "API Error";
      try {
        const errJson = await response.json();
        errorDetail = errJson.detail || errorDetail;
      } catch (_) {}
      throw new Error(errorDetail);
    }

    return response.json();
  }

  // Auth endpoints
  async login(username_or_email, password) {
    return this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username_or_email, password })
    });
  }

  async register(username, phone_or_email, password) {
    return this.request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, phone_or_email, password })
    });
  }

  async getMe() {
    return this.request("/auth/me");
  }

  // User endpoints
  async searchUsers(query) {
    return this.request(`/users/search?q=${encodeURIComponent(query)}`);
  }

  async getDirectory() {
    return this.request("/users/directory");
  }

  async updateProfile(profileData) {
    return this.request("/users/me", {
      method: "PUT",
      body: JSON.stringify(profileData)
    });
  }

  // Conversation endpoints
  async getConversations() {
    return this.request("/conversations");
  }

  async createDirectConversation(targetUserId) {
    return this.request(`/conversations/direct?target_user_id=${targetUserId}`, {
      method: "POST"
    });
  }

  async createGroupConversation(title, participantIds) {
    return this.request("/conversations/group", {
      method: "POST",
      body: JSON.stringify({ title, participant_ids: participantIds, is_group: true })
    });
  }

  // Message endpoints
  async getMessages(conversationId, beforeId = null) {
    const url = beforeId 
      ? `/messages/${conversationId}?before_id=${beforeId}` 
      : `/messages/${conversationId}`;
    return this.request(url);
  }

  async markAsRead(conversationId) {
    return this.request(`/messages/${conversationId}/read`, {
      method: "POST"
    });
  }

  // Media endpoints
  async uploadMedia(file) {
    const formData = new FormData();
    formData.append("file", file);
    return this.request("/media/upload", {
      method: "POST",
      body: formData
    });
  }
}

export const api = new ApiClient();
