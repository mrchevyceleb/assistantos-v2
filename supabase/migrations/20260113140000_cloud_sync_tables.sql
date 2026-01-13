-- AssistantOS Cloud Sync System
-- Migration: Create tables for multi-device cloud sync

-- ============================================================================
-- SYNC DEVICES
-- ============================================================================

-- Track devices linked to a sync namespace
CREATE TABLE IF NOT EXISTS sync_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_id UUID NOT NULL,                    -- Groups all user devices together
  device_name TEXT,                         -- User-friendly name (e.g., "Desktop-Work")
  device_type TEXT DEFAULT 'desktop',       -- 'desktop' | 'mobile'
  platform TEXT,                            -- 'windows' | 'macos' | 'linux' | 'ios' | 'android'
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_devices_sync_id ON sync_devices(sync_id);

-- ============================================================================
-- SYNC SETTINGS
-- ============================================================================

-- Shared settings across all devices in a sync namespace
CREATE TABLE IF NOT EXISTS sync_settings (
  sync_id UUID PRIMARY KEY,
  settings JSONB NOT NULL DEFAULT '{}',     -- Full app settings blob
  version INT DEFAULT 1,                    -- For optimistic locking
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES sync_devices(id)
);

-- ============================================================================
-- SYNC CONVERSATIONS
-- ============================================================================

-- Synced conversations across devices
CREATE TABLE IF NOT EXISTS sync_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_id UUID NOT NULL,
  conversation_id TEXT NOT NULL,            -- Local conversation ID
  agent_id TEXT,                            -- Which agent this belongs to
  title TEXT,
  data JSONB NOT NULL,                      -- Full conversation data (messages, etc.)
  message_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sync_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_conversations_sync_id ON sync_conversations(sync_id);
CREATE INDEX IF NOT EXISTS idx_sync_conversations_agent ON sync_conversations(sync_id, agent_id);

-- ============================================================================
-- SYNC PAIRING CODES
-- ============================================================================

-- Temporary pairing codes for device linking
CREATE TABLE IF NOT EXISTS sync_pairing_codes (
  code TEXT PRIMARY KEY,                    -- 8-char code like "BEAR-7K2M"
  sync_id UUID NOT NULL,
  secret_encrypted TEXT NOT NULL,           -- Encrypted sync secret
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-cleanup expired codes (function + trigger)
CREATE INDEX IF NOT EXISTS idx_pairing_codes_expires ON sync_pairing_codes(expires_at) WHERE used = FALSE;

-- ============================================================================
-- WORKSPACE FILE MANIFESTS
-- ============================================================================

-- Track file sync state for workspaces
CREATE TABLE IF NOT EXISTS sync_file_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_id UUID NOT NULL,
  workspace_hash TEXT NOT NULL,             -- Hash of workspace path for privacy
  manifest JSONB NOT NULL DEFAULT '{}',     -- File paths -> {hash, size, modified}
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES sync_devices(id),
  UNIQUE(sync_id, workspace_hash)
);

CREATE INDEX IF NOT EXISTS idx_file_manifests_sync_id ON sync_file_manifests(sync_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE sync_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_pairing_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_file_manifests ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow all operations with anon key
-- Security is handled at the application level via sync_id + secret validation
-- This is appropriate for a personal/team app with device-based access

CREATE POLICY "Allow all on sync_devices" ON sync_devices
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on sync_settings" ON sync_settings
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on sync_conversations" ON sync_conversations
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on sync_pairing_codes" ON sync_pairing_codes
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on sync_file_manifests" ON sync_file_manifests
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to clean up expired pairing codes
CREATE OR REPLACE FUNCTION cleanup_expired_pairing_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM sync_pairing_codes
  WHERE expires_at < NOW() OR used = TRUE;
END;
$$;

-- Function to generate a unique pairing code
CREATE OR REPLACE FUNCTION generate_pairing_code(
  p_sync_id UUID,
  p_secret_encrypted TEXT,
  p_ttl_minutes INT DEFAULT 5
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code TEXT;
  v_attempts INT := 0;
  v_max_attempts INT := 10;
  v_words TEXT[] := ARRAY[
    'BEAR', 'WOLF', 'HAWK', 'LION', 'DEER', 'FISH', 'FROG', 'DUCK', 'SWAN', 'CROW',
    'BLUE', 'GOLD', 'JADE', 'RUBY', 'OPAL', 'PINK', 'MINT', 'COAL', 'SAND', 'SNOW',
    'STAR', 'MOON', 'BOLT', 'FIRE', 'WAVE', 'WIND', 'RAIN', 'LEAF', 'ROCK', 'TREE'
  ];
BEGIN
  -- Clean up expired codes first
  PERFORM cleanup_expired_pairing_codes();

  -- Try to generate a unique code
  WHILE v_attempts < v_max_attempts LOOP
    -- Generate code like "BEAR-7K2M"
    v_code := v_words[1 + floor(random() * array_length(v_words, 1))::int] || '-' ||
              chr(65 + floor(random() * 26)::int) ||
              floor(random() * 10)::int ||
              chr(65 + floor(random() * 26)::int) ||
              floor(random() * 10)::int;

    -- Try to insert (will fail if code exists)
    BEGIN
      INSERT INTO sync_pairing_codes (code, sync_id, secret_encrypted, expires_at)
      VALUES (v_code, p_sync_id, p_secret_encrypted, NOW() + (p_ttl_minutes || ' minutes')::interval);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      v_attempts := v_attempts + 1;
    END;
  END LOOP;

  RAISE EXCEPTION 'Failed to generate unique pairing code after % attempts', v_max_attempts;
END;
$$;

-- Function to validate and consume a pairing code
CREATE OR REPLACE FUNCTION consume_pairing_code(p_code TEXT)
RETURNS TABLE (
  sync_id UUID,
  secret_encrypted TEXT,
  success BOOLEAN,
  error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record sync_pairing_codes%ROWTYPE;
BEGIN
  -- Look up the code
  SELECT * INTO v_record
  FROM sync_pairing_codes
  WHERE code = p_code AND used = FALSE AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, FALSE, 'Invalid or expired pairing code';
    RETURN;
  END IF;

  -- Mark as used
  UPDATE sync_pairing_codes SET used = TRUE WHERE code = p_code;

  RETURN QUERY SELECT v_record.sync_id, v_record.secret_encrypted, TRUE, NULL::TEXT;
END;
$$;

-- Function to register/update a device
CREATE OR REPLACE FUNCTION register_device(
  p_sync_id UUID,
  p_device_id UUID DEFAULT NULL,
  p_device_name TEXT DEFAULT NULL,
  p_device_type TEXT DEFAULT 'desktop',
  p_platform TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_device_id UUID;
BEGIN
  IF p_device_id IS NOT NULL THEN
    -- Update existing device
    UPDATE sync_devices
    SET last_seen = NOW(),
        device_name = COALESCE(p_device_name, device_name),
        device_type = COALESCE(p_device_type, device_type),
        platform = COALESCE(p_platform, platform)
    WHERE id = p_device_id AND sync_id = p_sync_id
    RETURNING id INTO v_device_id;

    IF v_device_id IS NOT NULL THEN
      RETURN v_device_id;
    END IF;
  END IF;

  -- Create new device
  INSERT INTO sync_devices (sync_id, device_name, device_type, platform)
  VALUES (p_sync_id, p_device_name, p_device_type, p_platform)
  RETURNING id INTO v_device_id;

  RETURN v_device_id;
END;
$$;
