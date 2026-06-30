-- ============================================================
-- LabCEI PostgreSQL Schema
-- Run once against your local PostgreSQL database:
--   psql -U postgres -d labcei -f db/schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── update_updated_at trigger function ──────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- USERS  (replaces Supabase Auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- PROFILES  (role-based access control)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email      VARCHAR(255),
  role       VARCHAR(50) NOT NULL DEFAULT 'viewer'
               CHECK (role IN ('admin', 'technician', 'viewer')),
  full_name  VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- REFRESH TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(512) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token   ON refresh_tokens(token);

-- ============================================================
-- INSTRUMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS instruments (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                   VARCHAR(255) NOT NULL,
  model                  VARCHAR(255),
  serial_number          VARCHAR(255),
  location               VARCHAR(255),
  category               VARCHAR(255),
  status                 VARCHAR(50) NOT NULL DEFAULT 'operational'
                           CHECK (status IN ('operational','maintenance','calibration_due','out_of_service')),
  purchase_date          DATE,
  last_maintenance       DATE,
  next_maintenance       DATE,
  last_calibration       DATE,
  next_calibration       DATE,
  notes                  TEXT,
  -- AI / Compliance fields
  cei_score              INTEGER        NOT NULL DEFAULT 0,
  risk_score             INTEGER        NOT NULL DEFAULT 0,
  predicted_failure_days INTEGER,
  failure_probability    NUMERIC(5, 4),
  prediction_confidence  NUMERIC(5, 4),
  prediction_reasoning   TEXT,
  prediction_updated_at  TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_instruments_updated_at
  BEFORE UPDATE ON instruments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- MAINTENANCE LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS maintenance_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  log_type      VARCHAR(50) NOT NULL DEFAULT 'maintenance'
                  CHECK (log_type IN ('maintenance','calibration','repair','inspection')),
  description   TEXT,
  technician    VARCHAR(255),
  log_date      DATE NOT NULL,
  next_due_date DATE,
  cost          NUMERIC(10, 2),
  status        VARCHAR(50) NOT NULL DEFAULT 'completed'
                  CHECK (status IN ('completed','in_progress','failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_instrument_id ON maintenance_logs(instrument_id);
CREATE INDEX IF NOT EXISTS idx_logs_log_date      ON maintenance_logs(log_date DESC);

-- ============================================================
-- DOCUMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  log_id        UUID REFERENCES maintenance_logs(id) ON DELETE SET NULL,
  file_name     VARCHAR(255) NOT NULL,
  file_path     VARCHAR(500) NOT NULL,
  file_type     VARCHAR(100),
  ocr_text      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_instrument_id ON documents(instrument_id);

-- ============================================================
-- NOTIFICATION SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_settings (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                VARCHAR(255) UNIQUE NOT NULL,
  full_name            VARCHAR(255),
  role                 VARCHAR(50) NOT NULL DEFAULT 'viewer',
  cadence              VARCHAR(20) NOT NULL DEFAULT 'daily'
                         CHECK (cadence IN ('daily','weekly','off')),
  alert_overdue        BOOLEAN NOT NULL DEFAULT TRUE,
  alert_upcoming       BOOLEAN NOT NULL DEFAULT TRUE,
  alert_out_of_service BOOLEAN NOT NULL DEFAULT TRUE,
  alert_low_cei        BOOLEAN NOT NULL DEFAULT FALSE,
  upcoming_days        INTEGER NOT NULL DEFAULT 7,
  last_sent_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_notif_settings_updated_at
  BEFORE UPDATE ON notification_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- NOTIFICATIONS LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) NOT NULL,
  subject         VARCHAR(255),
  summary         TEXT,
  html_body       TEXT,
  delivery_status VARCHAR(50) NOT NULL DEFAULT 'sent'
                    CHECK (delivery_status IN ('sent','failed','pending')),
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_log_email ON notifications_log(email);

-- ============================================================
-- CHEMICAL STOCK  (chemical inventory + NFPA 704 hazard ratings)
-- ============================================================
CREATE TABLE IF NOT EXISTS chemical_stock (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  cas_number    VARCHAR(100),
  storage_class VARCHAR(100),
  location      VARCHAR(255),
  health        INTEGER NOT NULL DEFAULT 0,
  fire          INTEGER NOT NULL DEFAULT 0,
  instability   INTEGER NOT NULL DEFAULT 0,
  special       VARCHAR(100),
  quantity      NUMERIC(12, 4) NOT NULL DEFAULT 0,
  unit          VARCHAR(50) NOT NULL DEFAULT 'L',
  min_stock     NUMERIC(12, 4) NOT NULL DEFAULT 1,
  expiry_date   DATE,
  supplier      VARCHAR(255),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_chemical_stock_updated_at
  BEFORE UPDATE ON chemical_stock
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CHEMICAL ACTIVITY  (audit log for chemical stock changes)
-- ============================================================
CREATE TABLE IF NOT EXISTS chemical_activity (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chemical_id UUID REFERENCES chemical_stock(id) ON DELETE CASCADE,
  action      VARCHAR(50) NOT NULL,
  description TEXT,
  logged_by   VARCHAR(255),
  time        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chemical_activity_chemical_id ON chemical_activity(chemical_id);

-- ============================================================
-- ISO DOCUMENTS  (controlled document register, TEXT ids e.g. 'QM-001')
-- ============================================================
CREATE TABLE IF NOT EXISTS iso_documents (
  id          VARCHAR(100) PRIMARY KEY,
  type        VARCHAR(20),
  category    VARCHAR(50),
  description TEXT,
  location    VARCHAR(500),
  retention   VARCHAR(100),
  status      VARCHAR(50) NOT NULL DEFAULT 'active',
  notes       TEXT,
  revision    VARCHAR(50),
  date        VARCHAR(50),
  files       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_iso_documents_updated_at
  BEFORE UPDATE ON iso_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ISO DOCUMENT ACTIVITY  (audit log for controlled documents)
-- NOTE: "docId" and "user" are quoted (camelCase / reserved word)
-- ============================================================
CREATE TABLE IF NOT EXISTS iso_document_activity (
  id          VARCHAR(64) PRIMARY KEY,
  action      VARCHAR(50) NOT NULL,
  "docId"     VARCHAR(100),
  description TEXT,
  "user"      VARCHAR(255),
  time        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iso_document_activity_doc_id ON iso_document_activity("docId");

-- ============================================================
-- NOTIFICATION SETTINGS — chemical alert columns
-- ============================================================
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS alert_chem_low_stock    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS alert_chem_out_of_stock BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS alert_chem_expiring     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS expiring_days           INTEGER NOT NULL DEFAULT 30;
