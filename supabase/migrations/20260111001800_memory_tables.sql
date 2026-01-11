-- AssistantOS Persistent Memory System
-- Migration: Create memory tables for cross-device user memory sync

-- ============================================================================
-- ENABLE EXTENSIONS
-- ============================================================================

-- Enable pgvector for semantic search (embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- USER MANAGEMENT
-- ============================================================================

-- Users table for identity (anonymous UUID-based)
CREATE TABLE IF NOT EXISTS memory_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id UUID UNIQUE NOT NULL,  -- Generated on first app launch, shared across devices
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_memory_users_anonymous_id ON memory_users(anonymous_id);

-- ============================================================================
-- CORE USER PROFILE
-- ============================================================================

-- Core Profile (always included, compact ~400 tokens)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES memory_users(id) ON DELETE CASCADE,

  -- Core identity info
  name TEXT,
  role TEXT,                           -- e.g., "Software Engineer"
  company TEXT,
  location TEXT,
  timezone TEXT,

  -- Communication preferences
  communication_style TEXT,            -- e.g., "direct", "detailed", "casual"

  -- Technical preferences (compact arrays)
  tech_stack TEXT[] DEFAULT '{}',      -- ["TypeScript", "React", "Python"]
  key_projects TEXT[] DEFAULT '{}',    -- Current projects (max 3)

  -- AI-generated summary (under 200 words, ~400 tokens)
  profile_summary TEXT,
  summary_updated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- ============================================================================
-- USER FACTS
-- ============================================================================

-- Facts (explicit user statements)
CREATE TABLE IF NOT EXISTS user_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES memory_users(id) ON DELETE CASCADE,

  -- Fact content
  category TEXT NOT NULL CHECK (category IN ('personal', 'work', 'project', 'preference')),
  fact TEXT NOT NULL,
  source TEXT DEFAULT 'explicit' CHECK (source IN ('explicit', 'inferred')),
  confidence FLOAT DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),

  -- For retrieval
  embedding vector(1536),              -- OpenAI text-embedding-3-small dimension
  keywords TEXT[] DEFAULT '{}',        -- Extracted keywords for fallback search

  -- Metadata
  extracted_from_conversation TEXT,    -- Which conversation this came from
  is_active BOOLEAN DEFAULT true,      -- Soft delete / contradiction resolution

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for facts
CREATE INDEX IF NOT EXISTS idx_user_facts_user_id ON user_facts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_facts_category ON user_facts(category);
CREATE INDEX IF NOT EXISTS idx_user_facts_keywords ON user_facts USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_user_facts_active ON user_facts(user_id, is_active) WHERE is_active = true;

-- Vector index for semantic search (IVFFlat for good performance)
CREATE INDEX IF NOT EXISTS idx_user_facts_embedding ON user_facts
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- USER PREFERENCES
-- ============================================================================

-- Preferences (learned patterns)
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES memory_users(id) ON DELETE CASCADE,

  -- Preference content
  domain TEXT NOT NULL,                -- 'coding', 'writing', 'communication', 'tools'
  preference_key TEXT NOT NULL,        -- e.g., 'indentation', 'commit_style'
  preference_value JSONB NOT NULL,     -- Flexible value storage

  -- Learning metadata
  observation_count INT DEFAULT 1,     -- How many times observed
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),

  first_observed_at TIMESTAMPTZ DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, domain, preference_key)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_domain ON user_preferences(user_id, domain);

-- ============================================================================
-- CONVERSATION SUMMARIES
-- ============================================================================

-- Conversation Summaries
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES memory_users(id) ON DELETE CASCADE,

  -- Reference to local conversation
  local_conversation_id TEXT NOT NULL, -- Maps to local storage ID
  workspace_path TEXT,

  -- Summary content
  title TEXT NOT NULL,
  summary TEXT NOT NULL,               -- AI-generated summary (100-200 words)
  key_decisions TEXT[] DEFAULT '{}',   -- Important decisions made
  outcomes TEXT[] DEFAULT '{}',        -- What was accomplished
  problems_solved TEXT[] DEFAULT '{}', -- Technical problems solved

  -- For retrieval
  embedding vector(1536),
  keywords TEXT[] DEFAULT '{}',

  -- Metadata
  message_count INT,
  model_used TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_summaries_user_id ON conversation_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_summaries_workspace ON conversation_summaries(workspace_path);
CREATE INDEX IF NOT EXISTS idx_conv_summaries_local_id ON conversation_summaries(user_id, local_conversation_id);

-- Vector index for semantic search
CREATE INDEX IF NOT EXISTS idx_conv_summaries_embedding ON conversation_summaries
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE memory_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow all operations with anon key
-- Security is handled at the application level via anonymous_id filtering
-- This is appropriate for a personal desktop app with single-user access per install

-- Memory users: allow all operations
CREATE POLICY "Allow all on memory_users" ON memory_users
  FOR ALL USING (true) WITH CHECK (true);

-- User profiles: allow all operations
CREATE POLICY "Allow all on user_profiles" ON user_profiles
  FOR ALL USING (true) WITH CHECK (true);

-- User facts: allow all operations
CREATE POLICY "Allow all on user_facts" ON user_facts
  FOR ALL USING (true) WITH CHECK (true);

-- User preferences: allow all operations
CREATE POLICY "Allow all on user_preferences" ON user_preferences
  FOR ALL USING (true) WITH CHECK (true);

-- Conversation summaries: allow all operations
CREATE POLICY "Allow all on conversation_summaries" ON conversation_summaries
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get or create user by anonymous_id
CREATE OR REPLACE FUNCTION get_or_create_memory_user(p_anonymous_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Try to find existing user
  SELECT id INTO v_user_id
  FROM memory_users
  WHERE anonymous_id = p_anonymous_id;

  -- If not found, create new user
  IF v_user_id IS NULL THEN
    INSERT INTO memory_users (anonymous_id)
    VALUES (p_anonymous_id)
    RETURNING id INTO v_user_id;

    -- Create empty profile
    INSERT INTO user_profiles (user_id)
    VALUES (v_user_id);
  ELSE
    -- Update last seen
    UPDATE memory_users
    SET last_seen_at = NOW()
    WHERE id = v_user_id;
  END IF;

  RETURN v_user_id;
END;
$$;

-- Function to search facts by semantic similarity
CREATE OR REPLACE FUNCTION search_facts_by_embedding(
  p_user_id UUID,
  p_query_embedding vector(1536),
  p_limit INT DEFAULT 5,
  p_min_similarity FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  category TEXT,
  fact TEXT,
  confidence FLOAT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.category,
    f.fact,
    f.confidence,
    1 - (f.embedding <=> p_query_embedding) as similarity
  FROM user_facts f
  WHERE f.user_id = p_user_id
    AND f.is_active = true
    AND f.embedding IS NOT NULL
    AND 1 - (f.embedding <=> p_query_embedding) >= p_min_similarity
  ORDER BY f.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

-- Function to search conversation summaries by semantic similarity
CREATE OR REPLACE FUNCTION search_summaries_by_embedding(
  p_user_id UUID,
  p_query_embedding vector(1536),
  p_limit INT DEFAULT 3,
  p_min_similarity FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  summary TEXT,
  workspace_path TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.title,
    s.summary,
    s.workspace_path,
    1 - (s.embedding <=> p_query_embedding) as similarity
  FROM conversation_summaries s
  WHERE s.user_id = p_user_id
    AND s.embedding IS NOT NULL
    AND 1 - (s.embedding <=> p_query_embedding) >= p_min_similarity
  ORDER BY s.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;
