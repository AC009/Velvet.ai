-- Add payment_intent_clicks to conversations (run in Supabase SQL Editor)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS payment_intent_clicks INTEGER NOT NULL DEFAULT 0;
