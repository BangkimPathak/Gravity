import { CONFIG } from "./config.js";
import { api } from "./api.js";
import { auth } from "./auth.js";
import { wsManager } from "./websocket.js";
import { UI } from "./ui.js";

/**
 * Main Application Orchestrator for Gravity Web
 */
class GravityApp {
  constructor() {
    this.conversations = [];
    this.activeConversation = null;
    this.typingTimeout = null;
    this.isTypingSent = false;
    this.currentFilter = "all";
    this.selectedGroupMembers = new Set();
    this.archivedIds = new Set(JSON.parse(localStorage.getItem("gravity_archived_chats") || "[]"));
    this.contactSearchDebounce = null;
    this.sidebarSearchDebounce = null;
    this.groupSearchDebounce = null;
    this.directoryUsers = [];
    this.groupUsers = [];
  }

  async init() {
    console.log("Initializing Gravity Web Application...");
    this.setupTheme();
    this.setupModals();
    this.setupAuthPortalHandlers();
    this.setupEventListeners();
    this.setupWebSocketListeners();
    this.setupEmojiPicker();

    // Check user authentication
    const user = await auth.initAuth();
    if (user) {
      this.populateSettingsDrawer();
      await this.loadConversations();
    }
  }

  setupTheme() {
    const savedTheme = localStorage.getItem(CONFIG.STORAGE_THEME_KEY) || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);

    const themeToggleBtn = document.getElementById("btn-theme-toggle");
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme");
        const next = current === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem(CONFIG.STORAGE_THEME_KEY, next);
        const dropdownMenu = document.getElementById("main-menu-dropdown");
        if (dropdownMenu) dropdownMenu.classList.remove("active");
      });
    }
  }

  setupAuthPortalHandlers() {
    // Mode switching function (Login <=> Register)
    window.switchMode = (mode) => {
      const loginTab = document.getElementById("tab-login");
      const signupTab = document.getElementById("tab-signup");
      const loginForm = document.getElementById("login-form");
      const signupForm = document.getElementById("signup-form");

      window.hideToast();

      if (mode === "login") {
        loginTab.classList.add("active");
        signupTab.classList.remove("active");
        loginForm.classList.add("active");
        signupForm.classList.remove("active");
      } else {
        signupTab.classList.add("active");
        loginTab.classList.remove("active");
        signupForm.classList.add("active");
        loginForm.classList.remove("active");
      }
    };

    // Helper to show custom toast message
    window.showToast = (message, type = "error") => {
      const toast = document.getElementById("toast-message");
      if (!toast) return;
      toast.textContent = message;
      toast.className = `toast ${type}`; // 'success' or 'error'
    };

    // Helper to hide toast message
    window.hideToast = () => {
      const toast = document.getElementById("toast-message");
      if (!toast) return;
      toast.className = "toast hidden";
      toast.textContent = "";
    };

    // Handle Form Submissions asynchronously exactly like hospital portal
    window.handleFormSubmit = async (event, mode) => {
      event.preventDefault();
      window.hideToast();

      const form = event.target;
      const submitBtn = form.querySelector(".submit-btn");
      const originalBtnText = submitBtn.textContent;
      submitBtn.textContent = "Processing...";
      submitBtn.disabled = true;

      try {
        let endpoint = "";
        let payload = {};

        if (mode === "login") {
          endpoint = "/api/login";
          payload = {
            email: document.getElementById("login-email").value.trim(),
            password: document.getElementById("login-password").value
          };
        } else {
          endpoint = "/api/signup";
          payload = {
            name: document.getElementById("signup-name").value.trim(),
            email: document.getElementById("signup-email").value.trim(),
            birthday: document.getElementById("signup-dob").value
          };
        }

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
          window.showToast(result.message || "Operation successful", "success");
          
          if (mode === "signup" && result.redirect) {
            form.reset();
            setTimeout(() => {
              window.location.href = result.redirect;
            }, 1000);
          } else {
            if (result.access_token) {
              api.setToken(result.access_token);
              auth.currentUser = result.user;
              auth.updateHeaderProfile();
              wsManager.connect();
            }

            setTimeout(async () => {
              auth.hideAuthModal();
              await this.loadConversations();
            }, 800);
          }
        } else {
          window.showToast(result.detail || result.message || "An error occurred during submission.", "error");
        }
      } catch (error) {
        console.error("Auth API Error:", error);
        window.showToast("Network error: Could not reach the authentication server.", "error");
      } finally {
        submitBtn.textContent = originalBtnText;
        submitBtn.disabled = false;
      }
    };
  }

  setupModals() {
    // Close buttons for modals
    document.querySelectorAll(".btn-close-modal").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".modal-overlay").forEach((modal) => {
          if (modal.id !== "modal-auth" || auth.currentUser) {
            modal.classList.remove("active");
          }
        });
      });
    });

    // View User / Settings Modal Trigger
    const btnOpenProfile = document.getElementById("btn-open-profile");
    if (btnOpenProfile) {
      btnOpenProfile.addEventListener("click", async () => {
        try {
          const freshUser = await api.getMe();
          if (freshUser) {
            auth.currentUser = freshUser;
            auth.updateHeaderProfile();
          }
        } catch (_) {}
        if (!auth.currentUser) return;
        this.populateSettingsDrawer();
        this.showSettingsMainView();
        document.getElementById("modal-profile").classList.add("active");
      });
    }

    // Settings Navigation: Back buttons
    document.querySelectorAll(".btn-settings-back").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.showSettingsMainView();
      });
    });

    // Settings Navigation: Open General
    const itemGeneral = document.getElementById("item-open-general");
    if (itemGeneral) {
      itemGeneral.addEventListener("click", () => {
        this.showSettingsPanel("panel-general");
      });
    }

    // Settings Navigation: Open Profile Detail
    const itemProfile = document.getElementById("item-open-profile-detail");
    if (itemProfile) {
      itemProfile.addEventListener("click", async () => {
        try {
          const freshUser = await api.getMe();
          if (freshUser) {
            auth.currentUser = freshUser;
            auth.updateHeaderProfile();
          }
        } catch (_) {}
        this.populateSettingsDrawer();
        this.showSettingsPanel("panel-profile");
      });
    }

    // Settings Navigation: Open Account Detail
    const itemAccount = document.getElementById("item-open-account-detail");
    if (itemAccount) {
      itemAccount.addEventListener("click", () => {
        this.showSettingsPanel("panel-account");
      });
    }

    // Settings: Toggle Theme from General Panel
    const btnPanelThemeToggle = document.getElementById("btn-panel-theme-toggle");
    if (btnPanelThemeToggle) {
      btnPanelThemeToggle.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme");
        const next = current === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem(CONFIG.STORAGE_THEME_KEY, next);
        document.getElementById("current-theme-display").textContent = next === "dark" ? "Dark Theme" : "Light Theme";
        UI.showToast(`Switched to ${next} mode`);
      });
    }

    // Settings: Change Profile Photo Trigger (Both from Main & Edit View)
    const avatarFileInput = document.getElementById("avatar-upload-file-input");
    const triggerAvatarUpload = () => {
      if (avatarFileInput) avatarFileInput.click();
    };

    const btnChangeAvatarMain = document.getElementById("btn-change-avatar-main");
    if (btnChangeAvatarMain) btnChangeAvatarMain.addEventListener("click", triggerAvatarUpload);

    const btnChangeAvatarEdit = document.getElementById("btn-change-avatar-edit");
    if (btnChangeAvatarEdit) btnChangeAvatarEdit.addEventListener("click", triggerAvatarUpload);

    if (avatarFileInput) {
      avatarFileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          UI.showToast("Uploading profile photo...");
          const uploadRes = await api.uploadMedia(file);
          const updated = await api.updateProfile({ avatar_url: uploadRes.media_url });
          auth.currentUser = updated;
          auth.updateHeaderProfile();
          const avatarUrl = updated.avatar_url;
          if (document.getElementById("profile-modal-avatar")) document.getElementById("profile-modal-avatar").src = avatarUrl;
          if (document.getElementById("profile-edit-avatar-img")) document.getElementById("profile-edit-avatar-img").src = avatarUrl;
          if (document.getElementById("my-avatar")) document.getElementById("my-avatar").src = avatarUrl;
          UI.showToast("Profile picture updated successfully!");
        } catch (err) {
          UI.showToast(`Failed to update photo: ${err.message}`);
        } finally {
          avatarFileInput.value = "";
        }
      });
    }

    // ==========================================
    // EXACT "EDIT PROFILE" INLINE ACTIONS
    // Order: Username (static) > About > Name > Phone
    // ==========================================

    // 1. Edit About / Status
    const btnEditAbout = document.getElementById("btn-edit-about");
    const displayRowAbout = document.getElementById("display-row-about");
    const containerEditAbout = document.getElementById("container-edit-about");
    const inputEditAbout = document.getElementById("input-edit-about");
    const btnSaveAbout = document.getElementById("btn-save-about");
    const btnCancelAbout = document.getElementById("btn-cancel-about");

    if (btnEditAbout) {
      btnEditAbout.addEventListener("click", () => {
        displayRowAbout.style.display = "none";
        containerEditAbout.style.display = "flex";
        inputEditAbout.value = auth.currentUser.status_bio || "";
        inputEditAbout.focus();
      });

      const handleSaveAbout = async () => {
        const newBio = inputEditAbout.value.trim();
        try {
          const updated = await api.updateProfile({ status_bio: newBio });
          auth.currentUser = updated;
          auth.updateHeaderProfile();
          document.getElementById("val-profile-about").textContent = updated.status_bio || "Hey there! I am using Gravity";
          document.getElementById("settings-status-text").textContent = updated.status_bio || "Hey there! I am using Gravity";
          containerEditAbout.style.display = "none";
          displayRowAbout.style.display = "flex";
          UI.showToast("About status updated!");
        } catch (err) {
          UI.showToast(err.message);
        }
      };

      if (btnSaveAbout) btnSaveAbout.addEventListener("click", handleSaveAbout);
      if (inputEditAbout) {
        inputEditAbout.addEventListener("keydown", (e) => {
          if (e.key === "Enter") handleSaveAbout();
          if (e.key === "Escape") btnCancelAbout.click();
        });
      }

      if (btnCancelAbout) {
        btnCancelAbout.addEventListener("click", () => {
          containerEditAbout.style.display = "none";
          displayRowAbout.style.display = "flex";
        });
      }
    }

    // 3. Edit Name
    const btnEditName = document.getElementById("btn-edit-name");
    const displayRowName = document.getElementById("display-row-name");
    const containerEditName = document.getElementById("container-edit-name");
    const inputEditName = document.getElementById("input-edit-name");
    const btnSaveName = document.getElementById("btn-save-name");
    const btnCancelName = document.getElementById("btn-cancel-name");

    if (btnEditName) {
      btnEditName.addEventListener("click", () => {
        displayRowName.style.display = "none";
        containerEditName.style.display = "flex";
        inputEditName.value = auth.currentUser.full_name || auth.currentUser.username || "";
        inputEditName.focus();
      });

      const handleSaveName = async () => {
        const newName = inputEditName.value.trim();
        try {
          const updated = await api.updateProfile({ full_name: newName });
          auth.currentUser = updated;
          auth.updateHeaderProfile();
          document.getElementById("val-profile-name").textContent = updated.full_name || updated.username;
          document.getElementById("settings-header-name").textContent = updated.full_name || updated.username;
          containerEditName.style.display = "none";
          displayRowName.style.display = "flex";
          UI.showToast("Name updated successfully!");
        } catch (err) {
          UI.showToast(err.message);
        }
      };

      if (btnSaveName) btnSaveName.addEventListener("click", handleSaveName);
      if (inputEditName) {
        inputEditName.addEventListener("keydown", (e) => {
          if (e.key === "Enter") handleSaveName();
          if (e.key === "Escape") btnCancelName.click();
        });
      }

      if (btnCancelName) {
        btnCancelName.addEventListener("click", () => {
          containerEditName.style.display = "none";
          displayRowName.style.display = "flex";
        });
      }
    }

    // Settings: Switch User (Redirects to Registration / Signup Portal)
    const itemSwitchUser = document.getElementById("item-switch-user");
    if (itemSwitchUser) {
      itemSwitchUser.addEventListener("click", () => {
        document.getElementById("modal-profile").classList.remove("active");
        auth.switchUser();
      });
    }

    // Settings: Log Out (Redirects to Login Portal)
    const btnSettingsLogout = document.getElementById("btn-settings-logout");
    if (btnSettingsLogout) {
      btnSettingsLogout.addEventListener("click", () => {
        document.getElementById("modal-profile").classList.remove("active");
        auth.logout();
      });
    }
  }

  async populateSettingsDrawer(overrideUser = null) {
    let user = overrideUser || auth.currentUser;
    if (!user) {
      try {
        user = await api.getMe();
        if (user) {
          auth.currentUser = user;
        }
      } catch (_) {}
    }
    if (!user) return;

    // Header Name
    const headerName = document.getElementById("settings-header-name");
    if (headerName) headerName.textContent = user.full_name || user.username || "My Account";

    // Status Bubble
    const statusText = document.getElementById("settings-status-text");
    if (statusText) statusText.textContent = user.status_bio || "Available";

    // Avatar Images (both main and edit profile view)
    const avatarUrl = user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.username || 'gravity')}`;
    const avatarImg = document.getElementById("profile-modal-avatar");
    if (avatarImg) avatarImg.src = avatarUrl;
    const avatarEditImg = document.getElementById("profile-edit-avatar-img");
    if (avatarEditImg) avatarEditImg.src = avatarUrl;

    // Edit Profile Display Values in Strict Order: Username > About > Name
    const valUsername = document.getElementById("val-profile-username");
    if (valUsername) {
      valUsername.textContent = user.username || user.phone_or_email?.split("@")[0] || "";
    }

    const valAbout = document.getElementById("val-profile-about");
    if (valAbout) valAbout.textContent = user.status_bio || "Hey there! I am using Gravity";

    const valName = document.getElementById("val-profile-name");
    if (valName) valName.textContent = user.full_name || user.username || "";

    const contEditAbout = document.getElementById("container-edit-about");
    const rowAbout = document.getElementById("display-row-about");
    if (contEditAbout && rowAbout) {
      contEditAbout.style.display = "none";
      rowAbout.style.display = "flex";
    }

    const contEditName = document.getElementById("container-edit-name");
    const rowName = document.getElementById("display-row-name");
    if (contEditName && rowName) {
      contEditName.style.display = "none";
      rowName.style.display = "flex";
    }

    // Account Details
    const accEmail = document.getElementById("account-display-email");
    if (accEmail) accEmail.textContent = user.phone_or_email || "N/A";

    const accCreated = document.getElementById("account-display-created");
    if (accCreated) {
      if (user.created_at) {
        const d = new Date(user.created_at);
        accCreated.textContent = d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "short", day: "numeric" });
      } else {
        accCreated.textContent = "Recently Opened";
      }
    }

    const accRegion = document.getElementById("account-display-region");
    if (accRegion) accRegion.textContent = user.region || "India (Asia/Kolkata)";

    // Current Theme Display
    const curTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const curThemeEl = document.getElementById("current-theme-display");
    if (curThemeEl) curThemeEl.textContent = curTheme === "dark" ? "Dark Theme" : "Light Theme";
  }

  showSettingsMainView() {
    this.populateSettingsDrawer();
    const mainView = document.getElementById("settings-main-view");
    if (mainView) mainView.style.display = "block";
    document.querySelectorAll(".settings-detail-panel").forEach((p) => p.classList.remove("active"));
  }

  showSettingsPanel(panelId) {
    this.populateSettingsDrawer();
    const mainView = document.getElementById("settings-main-view");
    if (mainView) mainView.style.display = "none";
    document.querySelectorAll(".settings-detail-panel").forEach((p) => p.classList.remove("active"));
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add("active");
  }

  setupEventListeners() {

    // Main Sidebar Search / Filter Input
    const searchInput = document.getElementById("search-chats-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.handleSidebarSearch(e.target.value);
      });
    }

    // New Contact Modal Real-Time Database Search Input
    const inputSearchDir = document.getElementById("input-search-directory");
    if (inputSearchDir) {
      inputSearchDir.addEventListener("input", (e) => {
        const query = e.target.value.trim();
        clearTimeout(this.contactSearchDebounce);
        this.contactSearchDebounce = setTimeout(() => {
          this.searchDirectoryUsers(query);
        }, 250);
      });
    }

    // Group Member Search Input
    const inputSearchGroup = document.getElementById("input-search-group-members");
    if (inputSearchGroup) {
      inputSearchGroup.addEventListener("input", (e) => {
        const query = e.target.value.trim();
        clearTimeout(this.groupSearchDebounce);
        this.groupSearchDebounce = setTimeout(() => {
          this.searchGroupMembers(query);
        }, 250);
      });
    }

    // Filter Chips
    document.querySelectorAll(".filter-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        this.currentFilter = chip.getAttribute("data-filter");
        if (searchInput) {
          this.filterConversations(searchInput.value.trim().toLowerCase());
        }
      });
    });

    // New Direct Chat Modal Trigger
    const handleNewChatClick = async () => {
      const modal = document.getElementById("modal-new-chat");
      if (modal) modal.classList.add("active");
      const input = document.getElementById("input-search-directory");
      if (input) {
        input.value = "";
        setTimeout(() => input.focus(), 150);
      }
      await this.loadDirectoryUsers();
    };

    const btnNewChat = document.getElementById("btn-new-chat");
    if (btnNewChat) btnNewChat.addEventListener("click", handleNewChatClick);

    const btnHeaderNewChat = document.getElementById("btn-header-new-chat");
    if (btnHeaderNewChat) btnHeaderNewChat.addEventListener("click", handleNewChatClick);

    // New Group Chat Modal Triggers
    const handleNewGroupClick = async () => {
      const modal = document.getElementById("modal-new-group");
      if (modal) modal.classList.add("active");
      this.selectedGroupMembers.clear();
      const input = document.getElementById("input-search-group-members");
      if (input) {
        input.value = "";
        setTimeout(() => input.focus(), 150);
      }
      await this.loadGroupSelectionUsers();
    };

    const btnNewGroup = document.getElementById("btn-new-group");
    if (btnNewGroup) btnNewGroup.addEventListener("click", handleNewGroupClick);

    const btnHeaderNewGroup = document.getElementById("btn-header-new-group");
    if (btnHeaderNewGroup) btnHeaderNewGroup.addEventListener("click", handleNewGroupClick);

    // Archived Chats Views & Header Triggers
    const btnHeaderArchive = document.getElementById("btn-header-archive");
    if (btnHeaderArchive) {
      btnHeaderArchive.addEventListener("click", () => {
        this.toggleArchivedView();
      });
    }

    const btnSidebarArchived = document.getElementById("btn-sidebar-archived");
    if (btnSidebarArchived) {
      btnSidebarArchived.addEventListener("click", () => {
        this.toggleArchivedView();
      });
    }

    const btnToggleArchiveChat = document.getElementById("btn-toggle-archive-chat");
    if (btnToggleArchiveChat) {
      btnToggleArchiveChat.addEventListener("click", () => {
        if (this.activeConversation) {
          this.toggleArchive(this.activeConversation.id);
        } else {
          UI.showToast("Select a conversation first");
        }
      });
    }

    // Submit Group Creation
    document.getElementById("btn-submit-create-group").addEventListener("click", async () => {
      const title = document.getElementById("input-group-title").value.trim();
      if (!title) {
        UI.showToast("Please enter a group title");
        return;
      }
      if (this.selectedGroupMembers.size === 0) {
        UI.showToast("Select at least one member for the group");
        return;
      }
      try {
        const newGroup = await api.createGroupConversation(title, Array.from(this.selectedGroupMembers));
        document.getElementById("modal-new-group").classList.remove("active");
        document.getElementById("input-group-title").value = "";
        await this.loadConversations();
        this.selectConversation(newGroup.id);
        UI.showToast(`Group "${title}" created!`);
      } catch (err) {
        UI.showToast(err.message);
      }
    });

    // Textarea Auto-Resize & Enter to Send
    const chatTextarea = document.getElementById("chat-textarea");
    chatTextarea.addEventListener("input", () => {
      chatTextarea.style.height = "auto";
      chatTextarea.style.height = Math.min(chatTextarea.scrollHeight, 80) + "px";
      this.handleTyping();
    });

    chatTextarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Send Button
    document.getElementById("btn-send-message").addEventListener("click", () => {
      this.sendMessage();
    });

    // Mobile & Tablet Back Button to return to Sidebar
    const btnBack = document.getElementById("btn-back-to-sidebar");
    if (btnBack) {
      btnBack.addEventListener("click", () => {
        document.body.classList.remove("chat-open");
      });
    }

    // Handle dynamic viewport resize
    window.addEventListener("resize", () => {
      if (window.innerWidth > 768 && !this.activeConversation) {
        document.body.classList.remove("chat-open");
      }
    });

    // Attachments Menu Toggle
    const btnAttach = document.getElementById("btn-toggle-attach");
    const attachMenu = document.getElementById("attachment-menu");
    btnAttach.addEventListener("click", (e) => {
      e.stopPropagation();
      attachMenu.classList.toggle("active");
    });

    document.addEventListener("click", (e) => {
      if (!attachMenu.contains(e.target) && e.target !== btnAttach) {
        attachMenu.classList.remove("active");
      }
    });

    // Media File Input Triggers
    const mediaFileInput = document.getElementById("media-file-input");
    document.getElementById("btn-attach-photo").addEventListener("click", () => {
      attachMenu.classList.remove("active");
      mediaFileInput.accept = "image/*,video/*";
      mediaFileInput.click();
    });

    document.getElementById("btn-attach-doc").addEventListener("click", () => {
      attachMenu.classList.remove("active");
      mediaFileInput.accept = ".pdf,.doc,.docx,.txt,.zip,.xlsx,.csv,.json";
      mediaFileInput.click();
    });

    document.getElementById("btn-attach-audio").addEventListener("click", () => {
      attachMenu.classList.remove("active");
      mediaFileInput.accept = "audio/*";
      mediaFileInput.click();
    });

    mediaFileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file || !this.activeConversation) return;

      try {
        UI.showToast("Uploading attachment...");
        const uploadRes = await api.uploadMedia(file);
        const tempId = `temp-${Date.now()}`;
        
        wsManager.sendChatMessage(
          this.activeConversation.id,
          file.name,
          uploadRes.media_type,
          uploadRes.media_url,
          tempId
        );

        // Optimistic UI append
        this.appendMessageBubble({
          id: tempId,
          conversation_id: this.activeConversation.id,
          sender_id: auth.currentUser.id,
          content: file.name,
          message_type: uploadRes.media_type,
          media_url: uploadRes.media_url,
          status: "sent",
          created_at: new Date().toISOString(),
          sender: auth.currentUser
        });
      } catch (err) {
        UI.showToast(`Upload failed: ${err.message}`);
      } finally {
        mediaFileInput.value = "";
      }
    });
  }

  setupEmojiPicker() {
    const emojis = ["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔","🤭","🤫","🤥","😶","😐","😑","😬","🙄","😯","😦","😧","😮","😲","🥱","😴","🤤","😪","😵","🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕","🤑","🤠","😈","👿","👹","👺","🤡","💩","👻","💀","☠️","👽","👾","🤖","🎃","😺","😸","😹","😻","😼","😽","🙀","😿","😾","❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","👍","👎","👏","🙌","🤝","🙏","✌️","🤞","🤟","🤘","👌","🤌","🤏","👈","👉","👆","👇","☝️","✋","🤚","🖐️","🖖","👋","🤙","💪","🦾","🖕","✍️","🤳","💅","💃","🕺","✨","🔥","⚡","🎉","🚀","💡","⭐","🌟","💯"];
    
    const emojiGrid = document.getElementById("emoji-grid");
    const emojiPanel = document.getElementById("emoji-picker-panel");
    const emojiToggleBtn = document.getElementById("btn-toggle-emoji");
    const textarea = document.getElementById("chat-textarea");

    emojis.forEach((emoji) => {
      const span = document.createElement("span");
      span.className = "emoji-item";
      span.textContent = emoji;
      span.addEventListener("click", () => {
        textarea.value += emoji;
        textarea.focus();
      });
      emojiGrid.appendChild(span);
    });

    emojiToggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      emojiPanel.classList.toggle("active");
    });

    document.addEventListener("click", (e) => {
      if (!emojiPanel.contains(e.target) && e.target !== emojiToggleBtn) {
        emojiPanel.classList.remove("active");
      }
    });
  }

  setupWebSocketListeners() {
    // 1. Live Incoming Message
    wsManager.on("message_receive", (msg) => {
      if (this.activeConversation && msg.conversation_id === this.activeConversation.id) {
        this.appendMessageBubble(msg);
        this.scrollToBottom();
        wsManager.sendStatusUpdate(this.activeConversation.id, "read", [msg.id]);
        api.markAsRead(this.activeConversation.id);
      } else {
        const conv = this.conversations.find((c) => c.id === msg.conversation_id);
        if (conv) {
          conv.unread_count = (conv.unread_count || 0) + 1;
        }
      }
      this.updateConversationSnippet(msg.conversation_id, msg);
    });

    // 2. Message ACK
    wsManager.on("message_ack", (msg) => {
      if (msg.client_temp_id) {
        const tempEl = document.getElementById(`msg-${msg.client_temp_id}`);
        if (tempEl) {
          tempEl.id = `msg-${msg.id}`;
          tempEl.dataset.msgId = msg.id;
          const tickContainer = tempEl.querySelector(".msg-tick-container");
          if (tickContainer) {
            tickContainer.innerHTML = UI.getStatusTick(msg.status);
          }
        }
      }
      this.updateConversationSnippet(msg.conversation_id, msg);
    });

    // 3. Status Updates (Read Receipts / Delivery status)
    wsManager.on("status_update", (data) => {
      const { conversation_id, message_ids, status } = data;
      if (this.activeConversation && this.activeConversation.id === conversation_id) {
        if (message_ids && message_ids.length > 0) {
          message_ids.forEach((mid) => {
            const msgEl = document.getElementById(`msg-${mid}`);
            if (msgEl) {
              const tickContainer = msgEl.querySelector(".msg-tick-container");
              if (tickContainer) tickContainer.innerHTML = UI.getStatusTick(status);
            }
          });
        } else {
          document.querySelectorAll(".message-bubble.outgoing .msg-tick-container").forEach((el) => {
            el.innerHTML = UI.getStatusTick(status);
          });
        }
      }
    });

    // 4. Typing Indicators
    wsManager.on("typing_start", (data) => {
      const { conversation_id, username } = data;
      if (this.activeConversation && this.activeConversation.id === conversation_id) {
        const statusEl = document.getElementById("active-chat-presence");
        statusEl.textContent = `${username} is typing...`;
        statusEl.className = "chat-header-status typing";
        document.getElementById("typing-indicator-row").style.display = "flex";
        this.scrollToBottom();
      }
      const snippetEl = document.getElementById(`snippet-${conversation_id}`);
      if (snippetEl) {
        snippetEl.textContent = "typing...";
        snippetEl.classList.add("typing-active");
      }
    });

    wsManager.on("typing_stop", (data) => {
      const { conversation_id } = data;
      if (this.activeConversation && this.activeConversation.id === conversation_id) {
        this.updateActiveChatPresence();
        document.getElementById("typing-indicator-row").style.display = "none";
      }
      const snippetEl = document.getElementById(`snippet-${conversation_id}`);
      if (snippetEl) {
        snippetEl.classList.remove("typing-active");
        const conv = this.conversations.find((c) => c.id === conversation_id);
        if (conv && conv.last_message) {
          snippetEl.innerHTML = `${conv.last_message.sender_id === auth.currentUser.id ? UI.getStatusTick(conv.last_message.status) : ""} <span>${UI.escapeHtml(conv.last_message.content || "")}</span>`;
        }
      }
    });

    // 5. User Presence Changes (Online / Offline)
    wsManager.on("presence", (data) => {
      const { user_id, is_online, last_seen } = data;
      this.conversations.forEach((conv) => {
        if (!conv.is_group) {
          const other = conv.participants.find((p) => p.user_id === user_id);
          if (other) {
            conv.is_online = is_online;
            conv.last_seen = last_seen;
          }
        }
      });
      this.renderConversationList();

      if (this.activeConversation && !this.activeConversation.is_group) {
        const other = this.activeConversation.participants.find((p) => p.user_id === user_id);
        if (other) {
          this.activeConversation.is_online = is_online;
          this.activeConversation.last_seen = last_seen;
          this.updateActiveChatPresence();
        }
      }
    });

    // 6. Conversation Created Events
    wsManager.on("conversation_created", async () => {
      await this.loadConversations();
    });
    wsManager.on("group_created", async () => {
      await this.loadConversations();
    });
  }

  async loadConversations() {
    try {
      this.conversations = await api.getConversations();
      this.renderConversationList();
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  }

  toggleArchive(convId) {
    if (this.archivedIds.has(convId)) {
      this.archivedIds.delete(convId);
      UI.showToast("Conversation unarchived", "success");
    } else {
      this.archivedIds.add(convId);
      UI.showToast("Conversation archived", "success");
    }
    localStorage.setItem("gravity_archived_chats", JSON.stringify(Array.from(this.archivedIds)));

    if (this.activeConversation && this.activeConversation.id === convId) {
      const btnArchive = document.getElementById("btn-toggle-archive-chat");
      if (btnArchive) {
        const isArchived = this.archivedIds.has(convId);
        btnArchive.title = isArchived ? "Unarchive conversation" : "Archive conversation";
        btnArchive.style.color = isArchived ? "#818cf8" : "";
      }
    }

    this.renderConversationList();
  }

  toggleArchivedView() {
    const searchInput = document.getElementById("search-chats-input");
    if (this.currentFilter === "archived") {
      this.currentFilter = "all";
      document.querySelectorAll(".filter-chip").forEach((c) => {
        c.classList.toggle("active", c.getAttribute("data-filter") === "all");
      });
      document.getElementById("btn-sidebar-archived")?.classList.remove("active");
    } else {
      this.currentFilter = "archived";
      document.querySelectorAll(".filter-chip").forEach((c) => {
        c.classList.toggle("active", c.getAttribute("data-filter") === "archived");
      });
      document.getElementById("btn-sidebar-archived")?.classList.add("active");
    }
    this.renderConversationList();
    if (searchInput && searchInput.value.trim()) {
      this.filterConversations(searchInput.value.trim().toLowerCase());
    }
  }

  renderConversationList() {
    const listEl = document.getElementById("conversation-list");
    if (!listEl) return;

    const archivedCount = this.conversations.filter((c) => this.archivedIds.has(c.id)).length;
    const badgeEl = document.getElementById("archived-badge-count");
    if (badgeEl) {
      badgeEl.textContent = archivedCount;
      badgeEl.classList.toggle("has-items", archivedCount > 0);
    }

    let filtered = this.conversations;
    if (this.currentFilter === "archived") {
      filtered = filtered.filter((c) => this.archivedIds.has(c.id));
    } else {
      filtered = filtered.filter((c) => !this.archivedIds.has(c.id));
      if (this.currentFilter === "unread") {
        filtered = filtered.filter((c) => c.unread_count > 0);
      } else if (this.currentFilter === "groups") {
        filtered = filtered.filter((c) => c.is_group);
      } else if (this.currentFilter === "favourites") {
        filtered = filtered.filter((c) => c.is_favorite);
      }
    }

    if (filtered.length === 0) {
      const emptyMsg = this.currentFilter === "archived" 
        ? "No archived conversations yet" 
        : "No conversations found";
      listEl.innerHTML = `
        <div class="empty-chat-list" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px 20px; text-align:center; color:var(--text-muted);">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px; opacity:0.6;"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="m10 12 2 2 2-2"/></svg>
          <p style="font-size:14px;">${emptyMsg}</p>
        </div>
      `;
      return;
    }

    const currentUserId = auth.currentUser ? auth.currentUser.id : null;
    listEl.innerHTML = filtered
      .map((c) => {
        const isActive = this.activeConversation && this.activeConversation.id === c.id;
        return UI.renderConversationItem(c, currentUserId, isActive);
      })
      .join("");

    listEl.querySelectorAll(".chat-item").forEach((item) => {
      item.addEventListener("click", () => {
        const convId = item.getAttribute("data-conv-id");
        this.selectConversation(convId);
      });
    });
  }

  handleSidebarSearch(rawQuery) {
    const query = (rawQuery || "").trim().toLowerCase();
    this.filterConversations(query);

    // Remove any previous global results section
    const existingSection = document.getElementById("global-search-section");
    if (existingSection) existingSection.remove();

    clearTimeout(this.sidebarSearchDebounce);
    if (query.length === 0) return;

    this.sidebarSearchDebounce = setTimeout(async () => {
      try {
        const users = await api.searchUsers(query);
        // Exclude users already present in open 1-on-1 conversations
        const currentUserId = auth.currentUser ? auth.currentUser.id : null;
        const open1on1UserIds = new Set(
          this.conversations
            .filter((c) => !c.is_group && c.participants)
            .map((c) => {
              const other = c.participants.find((p) => p.user_id !== currentUserId);
              return other ? other.user_id : null;
            })
            .filter(Boolean)
        );

        const newContacts = users.filter((u) => !open1on1UserIds.has(u.id));
        if (newContacts.length === 0) return;

        const listEl = document.getElementById("conversation-list");
        if (!listEl) return;

        // Check if global section is already present
        const currentGlobal = document.getElementById("global-search-section");
        if (currentGlobal) currentGlobal.remove();

        const section = document.createElement("div");
        section.id = "global-search-section";
        section.className = "global-search-container";
        section.innerHTML = `
          <div class="global-search-header">
            <span>Global Contacts (${newContacts.length})</span>
          </div>
          <div class="global-search-list">
            ${newContacts.map((u) => `
              <div class="global-search-item" data-user-id="${u.id}">
                <div class="avatar-wrapper" style="width:36px; height:36px;">
                  <img src="${u.avatar_url || "assets/default-avatar.svg"}" class="avatar-img" alt="${UI.escapeHtml(u.full_name || u.username)}">
                  ${u.is_online ? '<span class="status-dot"></span>' : ''}
                </div>
                <div class="global-search-info">
                  <div class="global-search-title-row">
                    <span class="global-search-title">${UI.escapeHtml(u.full_name || u.username)}</span>
                    <span class="user-id-badge">ID: #${u.id}</span>
                  </div>
                  <div class="global-search-snippet">
                    ${UI.escapeHtml(u.phone_or_email)}
                  </div>
                </div>
              </div>
            `).join("")}
          </div>
        `;

        section.querySelectorAll(".global-search-item").forEach((item) => {
          item.addEventListener("click", async () => {
            const uid = item.getAttribute("data-user-id");
            try {
              UI.showToast("Starting chat...");
              const conv = await api.createDirectConversation(uid);
              const sInput = document.getElementById("search-chats-input");
              if (sInput) sInput.value = "";
              section.remove();
              await this.loadConversations();
              this.selectConversation(conv.id);
            } catch (err) {
              UI.showToast(`Error starting chat: ${err.message}`);
            }
          });
        });

        listEl.appendChild(section);
      } catch (err) {
        console.warn("Sidebar database search error:", err);
      }
    }, 300);
  }

  filterConversations(query) {
    const listEl = document.getElementById("conversation-list");
    if (!listEl) return;
    const items = listEl.querySelectorAll(".chat-item");
    let visibleCount = 0;
    items.forEach((item) => {
      const title = item.querySelector(".chat-item-title")?.textContent.toLowerCase() || "";
      const snippet = item.querySelector(".chat-item-snippet")?.textContent.toLowerCase() || "";
      if (!query || title.includes(query) || snippet.includes(query)) {
        item.style.display = "flex";
        visibleCount++;
      } else {
        item.style.display = "none";
      }
    });

    const emptyExisting = listEl.querySelector(".empty-chat-list");
    if (emptyExisting) emptyExisting.remove();

    if (visibleCount === 0 && query && !document.getElementById("global-search-section")) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "empty-chat-list";
      emptyDiv.style.cssText = "display:flex; flex-direction:column; align-items:center; justify-content:center; padding:30px 16px; text-align:center; color:var(--text-muted);";
      emptyDiv.innerHTML = `
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:8px; opacity:0.6;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <p style="font-size:13px;">No active conversations match "<strong>${UI.escapeHtml(query)}</strong>"</p>
      `;
      listEl.prepend(emptyDiv);
    }
  }

  async selectConversation(conversationId) {
    const conv = this.conversations.find((c) => c.id === conversationId);
    if (!conv) return;

    this.activeConversation = conv;
    conv.unread_count = 0;
    this.renderConversationList();

    document.body.classList.add("chat-open");

    document.getElementById("empty-chat-placeholder").style.display = "none";
    const chatPane = document.getElementById("active-chat-pane");
    chatPane.style.display = "flex";

    document.getElementById("active-chat-avatar").src = conv.display_avatar || conv.avatar_url || "assets/default-avatar.svg";
    document.getElementById("active-chat-title").textContent = conv.display_title || conv.title || "Conversation";
    this.updateActiveChatPresence();

    const btnArchive = document.getElementById("btn-toggle-archive-chat");
    if (btnArchive) {
      const isArchived = this.archivedIds.has(conv.id);
      btnArchive.title = isArchived ? "Unarchive conversation" : "Archive conversation";
      btnArchive.style.color = isArchived ? "#818cf8" : "";
    }

    const container = document.getElementById("messages-container");
    container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">Loading messages...</div>`;

    try {
      const messages = await api.getMessages(conv.id);
      container.innerHTML = "";

      const encNotice = document.createElement("div");
      encNotice.className = "e2e-notice";
      encNotice.innerHTML = `<svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg><span>Messages are end-to-end encrypted. No one outside of this chat can read them.</span>`;
      container.appendChild(encNotice);

      let lastDateStr = null;
      messages.forEach((msg) => {
        const msgDateStr = UI.formatDateHeader(msg.created_at);
        if (msgDateStr !== lastDateStr) {
          const dateBadge = document.createElement("div");
          dateBadge.className = "date-divider";
          dateBadge.innerHTML = `<span class="date-badge">${msgDateStr}</span>`;
          container.appendChild(dateBadge);
          lastDateStr = msgDateStr;
        }

        const bubbleWrapper = document.createElement("div");
        bubbleWrapper.innerHTML = UI.renderMessageBubble(msg, auth.currentUser.id, conv.is_group);
        container.appendChild(bubbleWrapper.firstElementChild);
      });

      this.scrollToBottom();
      api.markAsRead(conv.id);
      wsManager.sendStatusUpdate(conv.id, "read");
    } catch (err) {
      container.innerHTML = `<div style="color:var(--accent-danger); text-align:center;">Failed to load messages</div>`;
    }
  }

  updateActiveChatPresence() {
    if (!this.activeConversation) return;
    const statusEl = document.getElementById("active-chat-presence");
    statusEl.className = "chat-header-status";

    if (this.activeConversation.is_group) {
      const count = this.activeConversation.participants ? this.activeConversation.participants.length : 0;
      statusEl.textContent = `${count} members`;
    } else {
      if (this.activeConversation.is_online) {
        statusEl.textContent = "online";
        statusEl.classList.add("online");
      } else if (this.activeConversation.last_seen) {
        statusEl.textContent = `last seen ${UI.formatTime(this.activeConversation.last_seen)}`;
      } else {
        statusEl.textContent = "offline";
      }
    }
  }

  sendMessage() {
    const textarea = document.getElementById("chat-textarea");
    const content = textarea.value.trim();
    if (!content || !this.activeConversation) return;

    const tempId = `temp-${Date.now()}`;
    const convId = this.activeConversation.id;

    wsManager.sendChatMessage(convId, content, "text", null, tempId);

    this.appendMessageBubble({
      id: tempId,
      conversation_id: convId,
      sender_id: auth.currentUser.id,
      content: content,
      message_type: "text",
      media_url: null,
      status: "sent",
      created_at: new Date().toISOString(),
      sender: auth.currentUser
    });

    textarea.value = "";
    textarea.style.height = "auto";
    this.scrollToBottom();
    this.stopTyping();
  }

  appendMessageBubble(msg) {
    const container = document.getElementById("messages-container");
    if (!container) return;

    const bubbleWrapper = document.createElement("div");
    bubbleWrapper.innerHTML = UI.renderMessageBubble(
      msg, 
      auth.currentUser.id, 
      this.activeConversation ? this.activeConversation.is_group : false
    );
    container.appendChild(bubbleWrapper.firstElementChild);
    this.scrollToBottom();
  }

  updateConversationSnippet(conversationId, msg) {
    const conv = this.conversations.find((c) => c.id === conversationId);
    if (conv) {
      conv.last_message = msg;
      conv.updated_at = msg.created_at;
      this.conversations.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      this.renderConversationList();
    }
  }

  handleTyping() {
    if (!this.activeConversation) return;

    if (!this.isTypingSent) {
      this.isTypingSent = true;
      wsManager.sendTyping(this.activeConversation.id, true);
    }

    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.stopTyping();
    }, CONFIG.TYPING_TIMEOUT_MS);
  }

  stopTyping() {
    if (this.isTypingSent && this.activeConversation) {
      this.isTypingSent = false;
      wsManager.sendTyping(this.activeConversation.id, false);
    }
    clearTimeout(this.typingTimeout);
  }

  scrollToBottom() {
    const container = document.getElementById("messages-container");
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  async loadDirectoryUsers() {
    const listEl = document.getElementById("directory-user-list");
    if (!listEl) return;
    listEl.innerHTML = `
      <div class="search-loading-state">
        <div class="spinner-sm"></div>
        <span>Loading contacts from database...</span>
      </div>
    `;
    try {
      const users = await api.getDirectory();
      this.directoryUsers = users;
      this.renderDirectoryUserList(users, listEl);
    } catch (err) {
      listEl.innerHTML = `<p style="color:var(--accent-danger); text-align:center; padding:16px;">Failed to load contacts: ${UI.escapeHtml(err.message)}</p>`;
    }
  }

  async searchDirectoryUsers(query) {
    const listEl = document.getElementById("directory-user-list");
    if (!listEl) return;

    if (!query || query.trim().length === 0) {
      return this.loadDirectoryUsers();
    }

    const trimmed = query.trim();
    listEl.innerHTML = `
      <div class="search-loading-state">
        <div class="spinner-sm"></div>
        <span>Searching database for "<strong>${UI.escapeHtml(trimmed)}</strong>"...</span>
      </div>
    `;

    try {
      const users = await api.searchUsers(trimmed);
      if (users.length === 0) {
        listEl.innerHTML = `
          <div class="empty-search-state">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <p>No users found for "<strong>${UI.escapeHtml(trimmed)}</strong>"</p>
            <span class="empty-hint">Search by exact User ID (e.g. 1, 2), Email address, or Username</span>
          </div>
        `;
        return;
      }
      this.renderDirectoryUserList(users, listEl);
    } catch (err) {
      listEl.innerHTML = `<p style="color:var(--accent-danger); text-align:center; padding:16px;">Search failed: ${UI.escapeHtml(err.message)}</p>`;
    }
  }

  renderDirectoryUserList(users, listEl) {
    if (!users || users.length === 0) {
      listEl.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px;">No other users found in database</p>`;
      return;
    }

    listEl.innerHTML = users.map((u) => {
      const displayName = u.full_name || u.username;
      const email = u.phone_or_email || "";
      const statusBio = u.status_bio || "Available";
      const isOnline = !!u.is_online;

      return `
        <div class="user-select-item" data-user-id="${u.id}">
          <div class="avatar-wrapper" style="width:40px; height:40px; min-width:40px;">
            <img src="${u.avatar_url || "assets/default-avatar.svg"}" class="avatar-img" alt="${UI.escapeHtml(displayName)}">
            ${isOnline ? '<span class="status-dot"></span>' : ''}
          </div>
          <div class="user-select-info">
            <div class="user-select-header">
              <span class="user-select-name">${UI.escapeHtml(displayName)}</span>
              <span class="user-id-badge">ID: #${u.id}</span>
            </div>
            <div class="user-select-subtitle">
              <span class="user-email-text">${UI.escapeHtml(email)}</span>
              <span class="user-bio-sep">•</span>
              <span class="user-bio-text">${UI.escapeHtml(statusBio)}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");

    listEl.querySelectorAll(".user-select-item").forEach((el) => {
      el.addEventListener("click", async () => {
        const uid = el.getAttribute("data-user-id");
        document.getElementById("modal-new-chat")?.classList.remove("active");
        try {
          UI.showToast("Opening conversation...");
          const conv = await api.createDirectConversation(uid);
          await this.loadConversations();
          this.selectConversation(conv.id);
        } catch (err) {
          UI.showToast(`Failed to start conversation: ${err.message}`);
        }
      });
    });
  }

  async loadGroupSelectionUsers() {
    const listEl = document.getElementById("group-member-select-list");
    if (!listEl) return;
    listEl.innerHTML = `
      <div class="search-loading-state">
        <div class="spinner-sm"></div>
        <span>Loading contacts from database...</span>
      </div>
    `;
    try {
      const users = await api.getDirectory();
      this.groupUsers = users;
      this.renderGroupUserList(users, listEl);
    } catch (err) {
      listEl.innerHTML = `<p style="color:var(--accent-danger); text-align:center; padding:16px;">Failed to load contacts: ${UI.escapeHtml(err.message)}</p>`;
    }
  }

  async searchGroupMembers(query) {
    const listEl = document.getElementById("group-member-select-list");
    if (!listEl) return;

    if (!query || query.trim().length === 0) {
      return this.loadGroupSelectionUsers();
    }

    const trimmed = query.trim();
    listEl.innerHTML = `
      <div class="search-loading-state">
        <div class="spinner-sm"></div>
        <span>Searching members for "<strong>${UI.escapeHtml(trimmed)}</strong>"...</span>
      </div>
    `;

    try {
      const users = await api.searchUsers(trimmed);
      if (users.length === 0) {
        listEl.innerHTML = `
          <div class="empty-search-state">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <p>No members found for "<strong>${UI.escapeHtml(trimmed)}</strong>"</p>
          </div>
        `;
        return;
      }
      this.renderGroupUserList(users, listEl);
    } catch (err) {
      listEl.innerHTML = `<p style="color:var(--accent-danger); text-align:center; padding:16px;">Search failed: ${UI.escapeHtml(err.message)}</p>`;
    }
  }

  renderGroupUserList(users, listEl) {
    if (!users || users.length === 0) {
      listEl.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px;">No users found</p>`;
      return;
    }

    listEl.innerHTML = users.map((u) => {
      const isSelected = this.selectedGroupMembers.has(String(u.id)) || this.selectedGroupMembers.has(Number(u.id));
      const displayName = u.full_name || u.username;
      const email = u.phone_or_email || "";
      const isOnline = !!u.is_online;

      return `
        <div class="user-select-item ${isSelected ? "selected" : ""}" data-user-id="${u.id}">
          <div class="avatar-wrapper" style="width:40px; height:40px; min-width:40px;">
            <img src="${u.avatar_url || "assets/default-avatar.svg"}" class="avatar-img" alt="${UI.escapeHtml(displayName)}">
            ${isOnline ? '<span class="status-dot"></span>' : ''}
          </div>
          <div class="user-select-info">
            <div class="user-select-header">
              <span class="user-select-name">${UI.escapeHtml(displayName)}</span>
              <span class="user-id-badge">ID: #${u.id}</span>
            </div>
            <div class="user-select-subtitle">
              <span class="user-email-text">${UI.escapeHtml(email)}</span>
            </div>
          </div>
          <div class="selection-checkbox ${isSelected ? "checked" : ""}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </div>
      `;
    }).join("");

    listEl.querySelectorAll(".user-select-item").forEach((el) => {
      el.addEventListener("click", () => {
        const uid = el.getAttribute("data-user-id");
        const numericUid = Number(uid) || uid;
        if (this.selectedGroupMembers.has(uid) || this.selectedGroupMembers.has(numericUid)) {
          this.selectedGroupMembers.delete(uid);
          this.selectedGroupMembers.delete(numericUid);
          el.classList.remove("selected");
          el.querySelector(".selection-checkbox")?.classList.remove("checked");
        } else {
          this.selectedGroupMembers.add(numericUid);
          el.classList.add("selected");
          el.querySelector(".selection-checkbox")?.classList.add("checked");
        }
      });
    });
  }
}

// Instantiate and initialize app on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  const app = new GravityApp();
  app.init();
  window.gravityApp = app;
});
