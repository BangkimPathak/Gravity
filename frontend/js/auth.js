import { CONFIG } from "./config.js";
import { api } from "./api.js";
import { wsManager } from "./websocket.js";

/**
 * Authentication and Session State Manager for Gravity Chat App
 */
class AuthManager {
  constructor() {
    this.currentUser = null;
  }

  async initAuth() {
    const token = api.getToken();
    if (!token) {
      this.redirectToLogin();
      return null;
    }

    try {
      this.currentUser = await api.getMe();
      this.updateHeaderProfile();
      wsManager.connect();
      return this.currentUser;
    } catch (err) {
      console.warn("Stored auth token invalid. Redirecting to login portal.");
      this.logout();
      return null;
    }
  }

  async login(identifier, password) {
    const res = await api.login(identifier, password);
    api.setToken(res.access_token);
    this.currentUser = res.user;
    this.updateHeaderProfile();
    wsManager.connect();
    return this.currentUser;
  }

  async register(username, phone_or_email, password) {
    const res = await api.register(username, phone_or_email, password);
    api.setToken(res.access_token);
    this.currentUser = res.user;
    this.updateHeaderProfile();
    wsManager.connect();
    return this.currentUser;
  }

  logout() {
    api.setToken(null);
    this.currentUser = null;
    wsManager.disconnect();
    this.redirectToLogin();
  }

  switchUser() {
    api.setToken(null);
    this.currentUser = null;
    wsManager.disconnect();
    window.location.href = "/register";
  }

  redirectToLogin() {
    // Only redirect if not already on login/register/verify/set-password pages
    const path = window.location.pathname;
    if (path !== "/login" && path !== "/register" && path !== "/verify-otp" && path !== "/set-password" && path !== "/auth") {
      window.location.href = "/login";
    }
  }

  updateHeaderProfile() {
    if (!this.currentUser) return;
    const avatarEl = document.getElementById("my-avatar");
    const usernameEl = document.getElementById("my-username");
    const bioEl = document.getElementById("my-status-bio");

    if (avatarEl) avatarEl.src = this.currentUser.avatar_url || "assets/default-avatar.svg";
    if (usernameEl) usernameEl.textContent = this.currentUser.full_name || this.currentUser.username;
    if (bioEl) bioEl.textContent = this.currentUser.status_bio || "Online";

    // Update settings drawer and profile detail view elements
    const valUsername = document.getElementById("val-profile-username");
    if (valUsername) valUsername.textContent = this.currentUser.username || this.currentUser.phone_or_email?.split("@")[0] || "";

    const valName = document.getElementById("val-profile-name");
    if (valName) valName.textContent = this.currentUser.full_name || this.currentUser.username || "";

    const valAbout = document.getElementById("val-profile-about");
    if (valAbout) valAbout.textContent = this.currentUser.status_bio || "Hey there! I am using Gravity";

    const headerName = document.getElementById("settings-header-name");
    if (headerName) headerName.textContent = this.currentUser.full_name || this.currentUser.username || "My Account";
  }
}

export const auth = new AuthManager();
