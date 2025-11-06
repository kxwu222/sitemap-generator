# Supabase Setup Guide

This guide will help you set up Supabase to save and sync sitemaps across devices.

## Prerequisites

1. A Supabase account (sign up at https://supabase.com)
2. A Supabase project created

## Step 1: Create the Database Table

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run the following SQL to create the `sitemaps` table:

```sql
-- Create sitemaps table
CREATE TABLE IF NOT EXISTS sitemaps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  last_modified BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  user_id TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on created_at for faster queries
CREATE INDEX IF NOT EXISTS idx_sitemaps_created_at ON sitemaps(created_at DESC);

-- Create index on user_id if you plan to add authentication later
CREATE INDEX IF NOT EXISTS idx_sitemaps_user_id ON sitemaps(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE sitemaps ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations (for now)
-- In production, you should restrict this based on user authentication
CREATE POLICY "Allow all operations on sitemaps" ON sitemaps
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

## Step 2: Get Your Supabase Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy your **Project URL** (this is your `VITE_SUPABASE_URL`)
3. Copy your **anon/public key** (this is your `VITE_SUPABASE_ANON_KEY`)

## Step 3: Configure Environment Variables

1. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and add your Supabase credentials:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

## Step 4: Restart Your Development Server

If your dev server is running, restart it to load the new environment variables:
```bash
npm run dev
```

## How It Works

- **With Supabase**: Sitemaps are saved to your Supabase database and synced across devices
- **Without Supabase**: The app falls back to localStorage (data is stored locally in the browser)

The app automatically detects if Supabase is configured and uses it when available. If not, it gracefully falls back to localStorage.

## Security Notes

The current setup allows all operations on sitemaps. For production use, you should:

1. Enable Supabase Authentication
2. Update the RLS policies to restrict access based on user authentication
3. Add a `user_id` column and filter sitemaps by the authenticated user

Example policy for authenticated users:
```sql
-- Drop the open policy
DROP POLICY IF EXISTS "Allow all operations on sitemaps" ON sitemaps;

-- Create user-specific policies
CREATE POLICY "Users can view their own sitemaps" ON sitemaps
  FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own sitemaps" ON sitemaps
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own sitemaps" ON sitemaps
  FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own sitemaps" ON sitemaps
  FOR DELETE
  USING (auth.uid()::text = user_id);
```

