-- ============================================================
-- Migration 001: chemical stock + ISO documents features
-- Apply against an existing LabCEI database:
--   psql -U postgres -d labcei -f db/migrations/001_chemicals_iso_documents.sql
-- Idempotent — safe to run more than once.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- update_updated_at() is assumed to already exist (created by schema.sql).
-- Re-create it here so this migration is self-contained.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── chemical_stock ──────────────────────────────────────────
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

-- ── chemical_activity ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS chemical_activity (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chemical_id UUID REFERENCES chemical_stock(id) ON DELETE CASCADE,
  action      VARCHAR(50) NOT NULL,
  description TEXT,
  logged_by   VARCHAR(255),
  time        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chemical_activity_chemical_id ON chemical_activity(chemical_id);

-- ── iso_documents ───────────────────────────────────────────
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

-- ── iso_document_activity ───────────────────────────────────
CREATE TABLE IF NOT EXISTS iso_document_activity (
  id          VARCHAR(64) PRIMARY KEY,
  action      VARCHAR(50) NOT NULL,
  "docId"     VARCHAR(100),
  description TEXT,
  "user"      VARCHAR(255),
  time        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iso_document_activity_doc_id ON iso_document_activity("docId");

-- ── notification_settings: chemical alert columns ───────────
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS alert_chem_low_stock    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS alert_chem_out_of_stock BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS alert_chem_expiring     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS expiring_days           INTEGER NOT NULL DEFAULT 30;
