-- Add ui_language preference to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS ui_language TEXT NOT NULL DEFAULT 'en'
CHECK (ui_language IN ('en', 'hi'));
