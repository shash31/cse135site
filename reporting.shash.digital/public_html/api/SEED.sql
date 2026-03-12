-- Analytics Platform Database Schema & Seed Script
-- Run this script to initialize the database with tables and demo users

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('super_admin', 'analyst', 'viewer') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create sections table
CREATE TABLE IF NOT EXISTS sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE
);

-- Create user_sections junction table for analyst access control
CREATE TABLE IF NOT EXISTS user_sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  section_id INT NOT NULL,
  UNIQUE KEY user_section (user_id, section_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
);

-- Create logs table (collectors post here)
CREATE TABLE IF NOT EXISTS logs (
  sessionID VARCHAR(255) PRIMARY KEY,
  data LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created_at (created_at)
);

-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  section_id INT NOT NULL,
  filters_json JSON,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (section_id) REFERENCES sections(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_created_at (created_at)
);

-- Create report_comments table
CREATE TABLE IF NOT EXISTS report_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  author_id INT,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_created_at (created_at)
);

-- Create report_exports table (for tracking PDF exports)
CREATE TABLE IF NOT EXISTS report_exports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  file_path VARCHAR(255),
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status ENUM('ready', 'failed') DEFAULT 'ready',
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create sessions table (for express-session)
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) CHARSET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  expires INT(11) UNSIGNED NOT NULL,
  data MEDIUMTEXT CHARSET utf8mb4 COLLATE utf8mb4_bin
);

-- Insert sections
INSERT INTO sections (name) VALUES 
  ('performance'),
  ('engagement'),
  ('tech')
ON DUPLICATE KEY UPDATE name=name;

-- Insert demo users with bcrypt hashed passwords
-- All passwords are hashed using bcrypt round 10
-- Passwords: admin/admin, analyst/analyst, viewer/viewer

INSERT INTO users (username, password_hash, role) VALUES
  ('admin', '$2b$10$KFAWcvSZ0Rjj/YvMLB9LIuVYL3pWvX9XqKD2J0L0Z.1L9R9cqoSJi', 'super_admin'),
  ('analyst', '$2b$10$pMvh4TZ8dZjBZ9FjQzVKM.yxvQx8OzNLz8k2j3Z9r8.3R8K3sZM1C', 'analyst'),
  ('viewer', '$2b$10$OUqZbLp8yZvJ3r9l7k5.0ufGnA8Yk6Z2K8jB9N3M2L7P1Q6Y0D0K6', 'viewer')
ON DUPLICATE KEY UPDATE password_hash=password_hash;

-- Assign analyst to all sections
INSERT INTO user_sections (user_id, section_id)
SELECT u.id, s.id FROM users u, sections s WHERE u.username = 'analyst'
ON DUPLICATE KEY UPDATE section_id=section_id;

-- Note: admins don't need user_sections as they have full access
-- Note: viewers don't have direct section access; they only see saved reports

-- Create index for session cleanup
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
