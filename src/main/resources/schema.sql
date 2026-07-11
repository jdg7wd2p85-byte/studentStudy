CREATE TABLE IF NOT EXISTS children (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(64) NOT NULL,
  grade VARCHAR(32) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subjects (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_subject_name (name)
);

CREATE TABLE IF NOT EXISTS item_categories (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL,
  subject_id BIGINT NULL,
  default_display_mode VARCHAR(32) NOT NULL,
  field_schema_json JSON NULL,
  schema_version INT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  is_system TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_category_code (code)
);

CREATE TABLE IF NOT EXISTS learning_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  child_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  category_id BIGINT NOT NULL,
  item_type VARCHAR(32) NOT NULL,
  display_mode VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  prompt TEXT NULL,
  content TEXT NULL,
  answer TEXT NULL,
  explanation TEXT NULL,
  extra_json JSON NULL,
  source VARCHAR(128) NULL,
  tags VARCHAR(255) NULL,
  first_learned_at DATETIME NOT NULL,
  last_review_at DATETIME NULL,
  next_review_at DATETIME NOT NULL,
  review_stage INT NOT NULL DEFAULT 0,
  mastery_score INT NOT NULL DEFAULT 20,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  correct_count INT NOT NULL DEFAULT 0,
  wrong_count INT NOT NULL DEFAULT 0,
  total_review_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_items_child_next_review (child_id, next_review_at),
  KEY idx_items_child_type (child_id, item_type),
  KEY idx_items_child_subject (child_id, subject_id),
  KEY idx_items_child_category (child_id, category_id),
  KEY idx_items_mastery (child_id, mastery_score)
);

CREATE TABLE IF NOT EXISTS review_records (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  child_id BIGINT NOT NULL,
  item_id BIGINT NOT NULL,
  reviewed_at DATETIME NOT NULL,
  rating TINYINT NOT NULL,
  before_mastery_score INT NOT NULL,
  after_mastery_score INT NOT NULL,
  before_stage INT NOT NULL,
  after_stage INT NOT NULL,
  next_review_at DATETIME NOT NULL,
  note VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_review_item_time (item_id, reviewed_at),
  KEY idx_review_child_time (child_id, reviewed_at),
  KEY idx_review_rating (child_id, rating)
);

CREATE TABLE IF NOT EXISTS practice_papers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  child_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  source_type VARCHAR(32) NOT NULL,
  filter_json JSON NULL,
  question_count INT NOT NULL DEFAULT 0,
  include_answer TINYINT NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS practice_paper_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  paper_id BIGINT NOT NULL,
  item_id BIGINT NOT NULL,
  question_type VARCHAR(32) NOT NULL,
  question_text TEXT NOT NULL,
  answer_text TEXT NULL,
  explanation_text TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  config_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_paper_items_paper (paper_id, sort_order)
);
