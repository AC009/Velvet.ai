-- Migration 003: Add story_id column to conversations for timeline isolation
-- Run after 002_message_media_urls.sql in Supabase SQL Editor

BEGIN;

-- Add story_id to conversations (default 'default' for existing rows)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS story_id TEXT NOT NULL DEFAULT 'default';

-- Drop the old unique constraint and replace with one that includes story_id
-- so each (user, world, story) gets its own isolated conversation timeline
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_user_world_unique;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_user_world_story_unique UNIQUE (user_id, world_id, story_id);

-- Index for efficient story-scoped lookups
CREATE INDEX IF NOT EXISTS idx_conversations_story_id
  ON public.conversations (story_id);

COMMIT;
