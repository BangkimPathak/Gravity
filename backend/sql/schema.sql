-- ==========================================================
-- Project Gravity (WhatsApp Web High-Performance Architecture)
-- MySQL 8.0+ Database Schema (InnoDB Engine for ACID & FK)
-- Database Name: gravity
-- ==========================================================

-- 1. Create and Select Database
CREATE DATABASE IF NOT EXISTS gravity 
    CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;

USE gravity;

-- Drop tables in reverse order of foreign keys
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS participants;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS otp;
DROP TABLE IF EXISTS users;

-- ==========================================================
-- 2. Users Table (Core Auth & Profile)
-- ==========================================================
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    phone_or_email VARCHAR(100) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500) NULL,
    status_bio VARCHAR(255) DEFAULT 'Available',
    full_name VARCHAR(100) NULL,
    birthday VARCHAR(50) NULL,
    phone VARCHAR(50) NULL,
    region VARCHAR(100) DEFAULT 'India (Asia/Kolkata)',
    role VARCHAR(50) DEFAULT 'Member',
    gender VARCHAR(20) NULL,
    age INT NULL,
    address TEXT NULL,
    last_seen DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_username (username),
    INDEX idx_user_phone_or_email (phone_or_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- 3. OTP Verification Table (Multi-Step Onboarding)
-- ==========================================================
CREATE TABLE otp (
    email VARCHAR(100) PRIMARY KEY,
    otp_number VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    attempts INT DEFAULT 0,
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME DEFAULT (CURRENT_TIMESTAMP + INTERVAL 10 MINUTE),
    INDEX idx_otp_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- 4. Conversations Table (Direct & Group Chats)
-- ==========================================================
CREATE TABLE conversations (
    id VARCHAR(36) PRIMARY KEY,
    is_group TINYINT(1) DEFAULT 0,
    title VARCHAR(100) NULL,
    avatar_url VARCHAR(500) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_conv_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- 5. Participants Table (Membership & Read Tracking)
-- ==========================================================
CREATE TABLE participants (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    role ENUM('admin', 'member') DEFAULT 'member',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_read_message_id VARCHAR(36) NULL,
    CONSTRAINT fk_participant_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_participant_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_conversation (conversation_id, user_id),
    INDEX idx_participant_user (user_id),
    INDEX idx_participant_conv (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- 6. Messages Table (Real-Time Bidirectional Event Streaming)
-- ==========================================================
CREATE TABLE messages (
    id VARCHAR(36) PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL,
    sender_id VARCHAR(36) NOT NULL,
    content TEXT NULL,
    message_type ENUM('text', 'image', 'file', 'audio') DEFAULT 'text',
    media_url VARCHAR(500) NULL,
    status ENUM('sent', 'delivered', 'read') DEFAULT 'sent',
    created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_message_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_message_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_conversation_created (conversation_id, created_at),
    INDEX idx_message_sender (sender_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- 7. Seed Initial Demo Accounts (Passwords hashed: 'password123')
-- ==========================================================
INSERT INTO users (id, username, phone_or_email, hashed_password, avatar_url, status_bio, full_name, role)
VALUES 
('u-alex', 'alex_rivers', 'alex@gravity.chat', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 'Building the future of real-time messaging', 'Alex Rivers', 'Lead Engineer'),
('u-sarah', 'sarah_chen', 'sarah@gravity.chat', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150', 'UI/UX Designer & Product Lead', 'Sarah Chen', 'Product Designer'),
('u-david', 'david_kim', 'david@gravity.chat', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 'Backend Architect & DevOps', 'David Kim', 'Backend Architect')
ON DUPLICATE KEY UPDATE username=username;
