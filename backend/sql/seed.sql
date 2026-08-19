-- Seed Data for Project Gravity
USE gravity_db;

-- Passwords are bcrypt hash for 'password123'
-- Hash: $2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW

INSERT INTO users (id, username, phone_or_email, hashed_password, avatar_url, status_bio, last_seen) VALUES
('u-alex-101', 'alex_rivers', 'alex@gravity.chat', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 'Building the future of real-time web 🚀', NOW()),
('u-sarah-102', 'sarah_connor', 'sarah@gravity.chat', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150', 'Available for async collabs 💬', NOW()),
('u-david-103', 'david_kim', 'david@gravity.chat', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 'Coding in Python & Rust ⚡', NOW()),
('u-elena-104', 'elena_rostova', 'elena@gravity.chat', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150', 'Designing beautiful interfaces 🎨', NOW());

-- Direct Chat between Alex and Sarah
INSERT INTO conversations (id, is_group, title, avatar_url) VALUES
('c-alex-sarah', 0, NULL, NULL);

INSERT INTO participants (conversation_id, user_id, role) VALUES
('c-alex-sarah', 'u-alex-101', 'member'),
('c-alex-sarah', 'u-sarah-102', 'member');

INSERT INTO messages (id, conversation_id, sender_id, content, message_type, status, created_at) VALUES
('m-001', 'c-alex-sarah', 'u-sarah-102', 'Hey Alex! Have you reviewed the new WebSocket architecture?', 'text', 'read', NOW() - INTERVAL 10 MINUTE),
('m-002', 'c-alex-sarah', 'u-alex-101', 'Yes! The latency metrics are looking incredible. Zero dropped frames.', 'text', 'read', NOW() - INTERVAL 8 MINUTE),
('m-003', 'c-alex-sarah', 'u-sarah-102', 'Awesome! Let us test group channels next.', 'text', 'delivered', NOW() - INTERVAL 2 MINUTE);

-- Group Chat: Engineering Team
INSERT INTO conversations (id, is_group, title, avatar_url) VALUES
('c-gravity-core-eng', 1, 'Gravity Core Engineering 🛰️', 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150');

INSERT INTO participants (conversation_id, user_id, role) VALUES
('c-gravity-core-eng', 'u-alex-101', 'admin'),
('c-gravity-core-eng', 'u-sarah-102', 'member'),
('c-gravity-core-eng', 'u-david-103', 'member'),
('c-gravity-core-eng', 'u-elena-104', 'member');

INSERT INTO messages (id, conversation_id, sender_id, content, message_type, status, created_at) VALUES
('m-004', 'c-gravity-core-eng', 'u-alex-101', 'Welcome everyone to Project Gravity development channel!', 'text', 'read', NOW() - INTERVAL 1 HOUR),
('m-005', 'c-gravity-core-eng', 'u-david-103', 'MySQL 8.0 schema and Redis Pub/Sub integration is live.', 'text', 'read', NOW() - INTERVAL 45 MINUTE),
('m-006', 'c-gravity-core-eng', 'u-elena-104', 'Frontend UI templates are styled with pure CSS variables and dark mode.', 'text', 'read', NOW() - INTERVAL 30 MINUTE);
