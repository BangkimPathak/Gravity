/**
 * User Interface & DOM Rendering Helpers
 */
export const UI = {
  // SVG Icon Templates
  ICONS: {
    SENT_TICK: `<span class="status-tick sent" title="Sent"><svg viewBox="0 0 16 15" width="16" height="15"><path fill="currentColor" d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L6.5 11.238 2.978 7.425a.364.364 0 0 0-.51-.063l-.478.372a.365.365 0 0 0-.063.51l4.022 4.346c.14.152.36.152.5 0l8.5-9.764a.365.365 0 0 0 .06-.51z"/></svg></span>`,
    DELIVERED_TICK: `<span class="status-tick delivered" title="Delivered"><svg viewBox="0 0 16 15" width="16" height="15"><path fill="currentColor" d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L6.5 11.238 2.978 7.425a.364.364 0 0 0-.51-.063l-.478.372a.365.365 0 0 0-.063.51l4.022 4.346c.14.152.36.152.5 0l8.5-9.764a.365.365 0 0 0 .06-.51zm-3.5 0l-.478-.372a.365.365 0 0 0-.51.063L3 11.238l-.978-.978a.365.365 0 0 0-.51 0l-.478.478a.365.365 0 0 0 0 .51l1.5 1.5c.14.14.36.14.5 0l8.5-9.764a.365.365 0 0 0-.044-.668z"/></svg></span>`,
    READ_TICK: `<span class="status-tick read" title="Read"><svg viewBox="0 0 16 15" width="16" height="15"><path fill="currentColor" d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L6.5 11.238 2.978 7.425a.364.364 0 0 0-.51-.063l-.478.372a.365.365 0 0 0-.063.51l4.022 4.346c.14.152.36.152.5 0l8.5-9.764a.365.365 0 0 0 .06-.51zm-3.5 0l-.478-.372a.365.365 0 0 0-.51.063L3 11.238l-.978-.978a.365.365 0 0 0-.51 0l-.478.478a.365.365 0 0 0 0 .51l1.5 1.5c.14.14.36.14.5 0l8.5-9.764a.365.365 0 0 0-.044-.668z"/></svg></span>`,
    FILE: `<svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
    PLAY: `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`,
    PAUSE: `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`
  },

  formatTime(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  },

  formatDateHeader(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return "Today";
    }
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  },

  getStatusTick(status) {
    if (status === "read") return UI.ICONS.READ_TICK;
    if (status === "delivered") return UI.ICONS.DELIVERED_TICK;
    return UI.ICONS.SENT_TICK;
  },

  renderConversationItem(conv, currentUserId, isActive = false) {
    const isUnread = conv.unread_count > 0;
    const lastMsg = conv.last_message;
    const timeStr = lastMsg ? UI.formatTime(lastMsg.created_at) : UI.formatTime(conv.updated_at);

    let snippetHtml = "No messages yet";
    if (lastMsg) {
      const isOutgoing = lastMsg.sender_id === currentUserId;
      const tickHtml = isOutgoing ? UI.getStatusTick(lastMsg.status) : "";
      
      let content = lastMsg.content || "";
      if (lastMsg.message_type === "image") content = "📷 Photo";
      else if (lastMsg.message_type === "audio") content = "🎤 Voice message";
      else if (lastMsg.message_type === "file") content = "📎 Document";

      snippetHtml = `${tickHtml} <span>${UI.escapeHtml(content)}</span>`;
    }

    const avatarUrl = conv.display_avatar || conv.avatar_url || "assets/default-avatar.svg";
    const title = conv.display_title || conv.title || "Conversation";

    return `
      <li class="chat-item ${isActive ? "active" : ""} ${isUnread ? "has-unread" : ""}" data-conv-id="${conv.id}">
        <div class="chat-item-avatar">
          <img src="${avatarUrl}" alt="${UI.escapeHtml(title)}">
          ${conv.is_online ? '<span class="status-dot"></span>' : ''}
        </div>
        <div class="chat-item-content">
          <div class="chat-item-top">
            <span class="chat-item-title">${UI.escapeHtml(title)}</span>
            <span class="chat-item-time">${timeStr}</span>
          </div>
          <div class="chat-item-bottom">
            <div class="chat-item-snippet" id="snippet-${conv.id}">${snippetHtml}</div>
            ${isUnread ? `<span class="unread-badge">${conv.unread_count}</span>` : ""}
          </div>
        </div>
      </li>
    `;
  },

  renderMessageBubble(msg, currentUserId, isGroup = false) {
    const isOutgoing = msg.sender_id === currentUserId;
    const bubbleClass = isOutgoing ? "outgoing" : "incoming";
    const timeStr = UI.formatTime(msg.created_at);
    const tickHtml = isOutgoing ? UI.getStatusTick(msg.status) : "";

    let bodyHtml = "";

    // 1. Text Message
    if (msg.message_type === "text") {
      bodyHtml = `<div class="message-text">${UI.escapeHtml(msg.content || "")}</div>`;
    }
    // 2. Image Message
    else if (msg.message_type === "image" && msg.media_url) {
      bodyHtml = `
        <div class="media-image-container" onclick="window.open('${msg.media_url}', '_blank')">
          <img src="${msg.media_url}" alt="Photo Attachment" loading="lazy">
        </div>
        ${msg.content ? `<div class="message-text">${UI.escapeHtml(msg.content)}</div>` : ""}
      `;
    }
    // 3. Audio / Voice Message
    else if (msg.message_type === "audio" && msg.media_url) {
      bodyHtml = `
        <div class="media-audio-player">
          <button class="audio-play-btn" data-audio-src="${msg.media_url}">
            ${UI.ICONS.PLAY}
          </button>
          <div class="audio-waveform-bar">
            <div class="audio-progress"></div>
          </div>
        </div>
        ${msg.content ? `<div class="message-text" style="margin-top:4px;">${UI.escapeHtml(msg.content)}</div>` : ""}
      `;
    }
    // 4. Document / File Message
    else if (msg.message_type === "file" && msg.media_url) {
      const fileName = msg.content || "Document";
      bodyHtml = `
        <a href="${msg.media_url}" download class="media-file-card" target="_blank">
          <div class="file-card-icon">${UI.ICONS.FILE}</div>
          <div class="file-card-info">
            <span class="file-card-name">${UI.escapeHtml(fileName)}</span>
            <span class="file-card-size">Click to download</span>
          </div>
        </a>
      `;
    }

    const senderName = msg.sender ? (msg.sender.full_name || msg.sender.username) : "User";
    const senderNameHtml = (isGroup && !isOutgoing && msg.sender) 
      ? `<div class="message-sender-name">${UI.escapeHtml(senderName)}</div>` 
      : "";

    return `
      <div class="message-bubble ${bubbleClass}" id="msg-${msg.id}" data-msg-id="${msg.id}">
        ${senderNameHtml}
        ${bodyHtml}
        <div class="message-meta">
          <span>${timeStr}</span>
          <span class="msg-tick-container">${tickHtml}</span>
        </div>
      </div>
    `;
  },

  escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  showToast(message, duration = 3000) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
};
