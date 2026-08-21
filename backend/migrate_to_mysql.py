import os
import sys
import sqlite3
import pymysql
from pathlib import Path
from datetime import datetime

# Connect to SQLite
sqlite_path = Path(__file__).resolve().parent / "gravity.db"
print(f"Reading from SQLite DB: {sqlite_path}")
sqlite_conn = sqlite3.connect(sqlite_path)
sqlite_conn.row_factory = sqlite3.Row
s_cur = sqlite_conn.cursor()

# Connect to MySQL
mysql_conn = pymysql.connect(
    host="127.0.0.1",
    port=3306,
    user="root",
    password="Bangkim",
    charset="utf8mb4",
    autocommit=True
)
m_cur = mysql_conn.cursor()

# Ensure Database Exists (Case-insensitive check for Gravity_database)
m_cur.execute("CREATE DATABASE IF NOT EXISTS Gravity_database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
m_cur.execute("USE Gravity_database;")

# Create Tables in MySQL
create_users_table = """
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    phone_or_email VARCHAR(100) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500) NULL,
    status_bio VARCHAR(255) DEFAULT 'Available',
    full_name VARCHAR(100) NULL,
    birthday VARCHAR(50) NULL,
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
"""

create_conversations_table = """
CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(36) PRIMARY KEY,
    is_group TINYINT(1) DEFAULT 0,
    title VARCHAR(100) NULL,
    avatar_url VARCHAR(500) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

create_participants_table = """
CREATE TABLE IF NOT EXISTS participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    role VARCHAR(20) DEFAULT 'member',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_read_message_id VARCHAR(36) NULL,
    UNIQUE KEY unique_user_conversation (conversation_id, user_id),
    INDEX idx_participant_conv (conversation_id),
    INDEX idx_participant_user (user_id),
    CONSTRAINT fk_part_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_part_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

create_messages_table = """
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(36) PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL,
    sender_id VARCHAR(36) NOT NULL,
    content TEXT NULL,
    message_type VARCHAR(20) DEFAULT 'text',
    media_url VARCHAR(500) NULL,
    status VARCHAR(20) DEFAULT 'sent',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_conversation_created (conversation_id, created_at),
    INDEX idx_msg_conv (conversation_id),
    INDEX idx_msg_sender (sender_id),
    CONSTRAINT fk_msg_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

create_otp_table = """
CREATE TABLE IF NOT EXISTS otp (
    email VARCHAR(100) PRIMARY KEY,
    otp_number VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    attempts INT DEFAULT 0,
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NULL,
    INDEX idx_otp_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

print("Creating MySQL tables in Gravity_database...")
m_cur.execute(create_users_table)
m_cur.execute(create_conversations_table)
m_cur.execute(create_participants_table)
m_cur.execute(create_messages_table)
m_cur.execute(create_otp_table)

# Function to copy data
def migrate_table(table_name, columns, conflict_col=None):
    try:
        s_cur.execute(f"SELECT {', '.join(columns)} FROM {table_name}")
        rows = s_cur.fetchall()
        print(f"Found {len(rows)} rows in SQLite table '{table_name}'")
        if not rows:
            return

        placeholders = ", ".join(["%s"] * len(columns))
        col_str = ", ".join([f"`{c}`" for c in columns])
        
        insert_sql = f"INSERT IGNORE INTO `{table_name}` ({col_str}) VALUES ({placeholders})"
        data_to_insert = []
        for r in rows:
            row_data = []
            for col in columns:
                val = r[col]
                # Convert string timestamps if needed
                if isinstance(val, str) and ("created_at" in col or "updated_at" in col or "joined_at" in col or "last_seen" in col or "requested_at" in col or "expires_at" in col):
                    try:
                        # parse ISO datetime
                        clean_dt = val.replace("Z", "+00:00").split("+")[0]
                        row_data.append(clean_dt)
                        continue
                    except Exception:
                        pass
                row_data.append(val)
            data_to_insert.append(tuple(row_data))

        m_cur.executemany(insert_sql, data_to_insert)
        print(f"Successfully migrated {len(data_to_insert)} rows into MySQL `{table_name}`")
    except Exception as e:
        print(f"Error migrating table '{table_name}': {e}")

# 1. Users
user_cols = ["id", "username", "phone_or_email", "hashed_password", "avatar_url", "status_bio", "full_name", "birthday", "region", "role", "gender", "age", "address", "last_seen", "created_at"]
# check if sqlite users has these cols
s_cur.execute("PRAGMA table_info(users)")
existing_user_cols = [r[1] for r in s_cur.fetchall()]
valid_user_cols = [c for c in user_cols if c in existing_user_cols]
migrate_table("users", valid_user_cols)

# 2. Conversations
conv_cols = ["id", "is_group", "title", "avatar_url", "created_at", "updated_at"]
s_cur.execute("PRAGMA table_info(conversations)")
existing_conv_cols = [r[1] for r in s_cur.fetchall()]
valid_conv_cols = [c for c in conv_cols if c in existing_conv_cols]
migrate_table("conversations", valid_conv_cols)

# 3. Participants
part_cols = ["id", "conversation_id", "user_id", "role", "joined_at", "last_read_message_id"]
s_cur.execute("PRAGMA table_info(participants)")
existing_part_cols = [r[1] for r in s_cur.fetchall()]
valid_part_cols = [c for c in part_cols if c in existing_part_cols]
migrate_table("participants", valid_part_cols)

# 4. Messages
msg_cols = ["id", "conversation_id", "sender_id", "content", "message_type", "media_url", "status", "created_at"]
s_cur.execute("PRAGMA table_info(messages)")
existing_msg_cols = [r[1] for r in s_cur.fetchall()]
valid_msg_cols = [c for c in msg_cols if c in existing_msg_cols]
migrate_table("messages", valid_msg_cols)

# 5. OTP
otp_cols = ["email", "otp_number", "status", "attempts", "requested_at", "expires_at"]
try:
    s_cur.execute("PRAGMA table_info(otp)")
    existing_otp_cols = [r[1] for r in s_cur.fetchall()]
    if existing_otp_cols:
        valid_otp_cols = [c for c in otp_cols if c in existing_otp_cols]
        migrate_table("otp", valid_otp_cols)
except Exception as e:
    print("No OTP table in sqlite or error:", e)

# Verify Row Counts in MySQL
print("\n--- MySQL Table Summary (Database: Gravity_database) ---")
for t in ["users", "conversations", "participants", "messages", "otp"]:
    m_cur.execute(f"SELECT COUNT(*) FROM `{t}`")
    count = m_cur.fetchone()[0]
    print(f"Table `{t}`: {count} records in MySQL")

m_cur.close()
mysql_conn.close()
sqlite_conn.close()
print("\nMigration Completed Successfully!")
