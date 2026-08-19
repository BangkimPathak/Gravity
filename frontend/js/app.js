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
      btnOpenProfile.addEventListener("click", () => {
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
      itemProfile.addEventListener("click", () => {
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
          document.getElementById("val-profile-about").textContent = updated.status_bio || "Available";
          document.getElementById("settings-status-text").textContent = updated.status_bio || "Available";
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

    // 2. Edit Name
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

    // 3. Copy Phone Number
    const btnCopyPhone = document.getElementById("btn-copy-phone");
    if (btnCopyPhone) {
      btnCopyPhone.addEventListener("click", () => {
        const phone = auth.currentUser ? (auth.currentUser.phone || "+91 93655 62292") : "+91 93655 62292";
        navigator.clipboard.writeText(phone).then(() => {
          UI.showToast("Phone number copied to clipboard!");
        }).catch(() => {
          UI.showToast(`Phone: ${phone}`);
        });
      });
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

  populateSettingsDrawer() {
    if (!auth.currentUser) return;
    const user = auth.currentUser;

    // Header Name
    const headerName = document.getElementById("settings-header-name");
    if (headerName) headerName.textContent = user.full_name || user.username || "My Account";

    // Status Bubble
    const statusText = document.getElementById("settings-status-text");
    if (statusText) statusText.textContent = user.status_bio || "Available";

    // Avatar Images (both main and edit profile view)
    const avatarUrl = user.avatar_url || "assets/default-avatar.svg";
    const avatarImg = document.getElementById("profile-modal-avatar");
    if (avatarImg) avatarImg.src = avatarUrl;
    const avatarEditImg = document.getElementById("profile-edit-avatar-img");
    if (avatarEditImg) avatarEditImg.src = avatarUrl;

    // Edit Profile Display Values (Matching 3rd Pic)
    const valAbout = document.getElementById("val-profile-about");
    if (valAbout) valAbout.textContent = user.status_bio || "Busy";

    const valName = document.getElementById("val-profile-name");
    if (valName) valName.textContent = user.full_name || user.username || "Bangkim Pathak";

    const valPhone = document.getElementById("val-profile-phone");
    if (valPhone) valPhone.textContent = user.phone || "+91 93655 62292";

    // Reset inline edit containers if any were open
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

    const accRole = document.getElementById("account-display-role");
    if (accRole) accRole.textContent = user.role || "Member";

    // Current Theme Display
    const curTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const curThemeEl = document.getElementById("current-theme-display");
    if (curThemeEl) curThemeEl.textContent = curTheme === "dark" ? "Dark Theme" : "Light Theme";
  }

  showSettingsMainView() {
    const mainView = document.getElementById("settings-main-view");
    if (mainView) mainView.style.display = "block";
    document.querySelectorAll(".settings-detail-panel").forEach((p) => p.classList.remove("active"));
  }

  showSettingsPanel(panelId) {
    const mainView = document.getElementById("settings-main-view");
    if (mainView) mainView.style.display = "none";
    document.querySelectorAll(".settings-detail-panel").forEach((p) => p.classList.remove("active"));
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add("active");
  }

  setupEventListeners() {

    // Search / Filter Input
    const searchInput = document.getElementById("search-chats-input");
    searchInput.addEventListener("input", (e) => {
      this.filterConversations(e.target.value.trim().toLowerCase());
    });

    // Filter Chips
    document.querySelectorAll(".filter-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        this.currentFilter = chip.getAttribute("data-filter");
        this.filterConversations(searchInput.value.trim().toLowerCase());
      });
    });

    // New Direct Chat Modal Trigger
    const handleNewChatClick = async () => {
      document.getElementById("modal-new-chat").classList.add("active");
      await this.loadDirectoryUsers();
    };

    const btnNewChat = document.getElementById("btn-new-chat");
    if (btnNewChat) btnNewChat.addEventListener("click", handleNewChatClick);

    const btnHeaderNewChat = document.getElementById("btn-header-new-chat");
    if (btnHeaderNewChat) btnHeaderNewChat.addEventListener("click", handleNewChatClick);

    // New Group Chat Modal Triggers
    const handleNewGroupClick = async () => {
      document.getElementById("modal-new-group").classList.add("active");
      this.selectedGroupMembers.clear();
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

    // Mobile Back Button
    document.getElementById("btn-back-to-sidebar").addEventListener("click", () => {
      document.body.classList.remove("chat-open");
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

  filterConversations(query) {
    const listEl = document.getElementById("conversation-list");
    const items = listEl.querySelectorAll(".chat-item");
    items.forEach((item) => {
      const title = item.querySelector(".chat-item-title").textContent.toLowerCase();
      const snippet = item.querySelector(".chat-item-snippet").textContent.toLowerCase();
      if (title.includes(query) || snippet.includes(query)) {
        item.style.display = "flex";
      } else {
        item.style.display = "none";
      }
    });
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
    listEl.innerHTML = `<div style="text-align:center; padding:10px; color:var(--text-muted);">Loading contacts...</div>`;
    try {
      const users = await api.getDirectory();
      if (users.length === 0) {
        listEl.innerHTML = `<p style="text-align:center; color:var(--text-muted);">No other users found</p>`;
        return;
      }

      listEl.innerHTML = users.map((u) => `
        <div class="user-select-item" data-user-id="${u.id}">
          <div class="avatar-wrapper" style="width:36px; height:36px;">
            <img src="${u.avatar_url || "assets/default-avatar.svg"}" class="avatar-img">
          </div>
          <div style="flex:1;">
            <div style="font-weight:500; font-size:14px;">${UI.escapeHtml(u.full_name || u.username)}</div>
            <div style="font-size:12px; color:var(--text-secondary);">${UI.escapeHtml(u.status_bio || "")}</div>
          </div>
        </div>
      `).join("");

      listEl.querySelectorAll(".user-select-item").forEach((el) => {
        el.addEventListener("click", async () => {
          const uid = el.getAttribute("data-user-id");
          document.getElementById("modal-new-chat").classList.remove("active");
          const conv = await api.createDirectConversation(uid);
          await this.loadConversations();
          this.selectConversation(conv.id);
        });
      });
    } catch (err) {
      listEl.innerHTML = `<p style="color:var(--accent-danger); text-align:center;">Failed to load contacts</p>`;
    }
  }

  async loadGroupSelectionUsers() {
    const listEl = document.getElementById("group-member-select-list");
    listEl.innerHTML = `<div style="text-align:center; padding:10px; color:var(--text-muted);">Loading contacts...</div>`;
    try {
      const users = await api.getDirectory();
      listEl.innerHTML = users.map((u) => `
        <div class="user-select-item" data-user-id="${u.id}">
          <div class="avatar-wrapper" style="width:36px; height:36px;">
            <img src="${u.avatar_url || "assets/default-avatar.svg"}" class="avatar-img">
          </div>
          <div style="flex:1;">
            <div style="font-weight:500; font-size:14px;">${UI.escapeHtml(u.full_name || u.username)}</div>
          </div>
        </div>
      `).join("");

      listEl.querySelectorAll(".user-select-item").forEach((el) => {
        el.addEventListener("click", () => {
          const uid = el.getAttribute("data-user-id");
          if (this.selectedGroupMembers.has(uid)) {
            this.selectedGroupMembers.delete(uid);
            el.classList.remove("selected");
          } else {
            this.selectedGroupMembers.add(uid);
            el.classList.add("selected");
          }
        });
      });
    } catch (err) {
      listEl.innerHTML = `<p style="color:var(--accent-danger); text-align:center;">Failed to load contacts</p>`;
    }
  }
}

// Instantiate and initialize app on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  const app = new GravityApp();
  app.init();
  window.gravityApp = app;
});
