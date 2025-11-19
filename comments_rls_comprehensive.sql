-- ============================================================================
-- COMMENTS TABLE - COMPREHENSIVE RLS FIX
-- ============================================================================
-- This script replaces all existing policies for the comments table with a 
-- comprehensive set that covers both shared sitemaps AND owner access.
-- ============================================================================

-- Step 1: Remove foreign key constraint if it still exists
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;

-- Step 2: Drop ALL existing policies to ensure a clean slate
DROP POLICY IF EXISTS "Users can read comments for shared sitemaps" ON comments;
DROP POLICY IF EXISTS "Users can create their own comments" ON comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON comments;
DROP POLICY IF EXISTS "Users can delete their own comments or owners can delete any" ON comments;
DROP POLICY IF EXISTS "Allow all operations on comments" ON comments;
DROP POLICY IF EXISTS "Allow create comments for shared sitemaps" ON comments;
DROP POLICY IF EXISTS "Allow update comments for shared sitemaps" ON comments;
DROP POLICY IF EXISTS "Allow delete comments for shared sitemaps" ON comments;
DROP POLICY IF EXISTS "Allow read comments for shared sitemaps" ON comments;

-- Step 3: Create comprehensive policies

-- Policy 1: READ Access
-- Allow if:
-- A) The sitemap is shared (has a share_token)
-- B) OR The user is the owner of the sitemap (user_id matches auth.uid())
CREATE POLICY "Allow read comments" ON comments
  FOR SELECT
  USING (
    -- Case A: Shared sitemap
    EXISTS (
      SELECT 1 FROM sitemaps 
      WHERE sitemaps.id = comments.sitemap_id 
      AND sitemaps.share_token IS NOT NULL
    )
    OR
    -- Case B: Sitemap owner
    EXISTS (
      SELECT 1 FROM sitemaps 
      WHERE sitemaps.id = comments.sitemap_id 
      AND sitemaps.user_id = auth.uid()::text
    )
  );

-- Policy 2: INSERT Access
-- Allow if:
-- A) The sitemap is shared (has a share_token)
-- B) OR The user is the owner of the sitemap
CREATE POLICY "Allow create comments" ON comments
  FOR INSERT
  WITH CHECK (
    -- Case A: Shared sitemap
    EXISTS (
      SELECT 1 FROM sitemaps 
      WHERE sitemaps.id = comments.sitemap_id 
      AND sitemaps.share_token IS NOT NULL
    )
    OR
    -- Case B: Sitemap owner
    EXISTS (
      SELECT 1 FROM sitemaps 
      WHERE sitemaps.id = comments.sitemap_id 
      AND sitemaps.user_id = auth.uid()::text
    )
  );

-- Policy 3: UPDATE Access
-- Allow if:
-- A) The sitemap is shared
-- B) OR The user is the owner of the sitemap
CREATE POLICY "Allow update comments" ON comments
  FOR UPDATE
  USING (
    -- Case A: Shared sitemap
    EXISTS (
      SELECT 1 FROM sitemaps 
      WHERE sitemaps.id = comments.sitemap_id 
      AND sitemaps.share_token IS NOT NULL
    )
    OR
    -- Case B: Sitemap owner
    EXISTS (
      SELECT 1 FROM sitemaps 
      WHERE sitemaps.id = comments.sitemap_id 
      AND sitemaps.user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    -- Case A: Shared sitemap
    EXISTS (
      SELECT 1 FROM sitemaps 
      WHERE sitemaps.id = comments.sitemap_id 
      AND sitemaps.share_token IS NOT NULL
    )
    OR
    -- Case B: Sitemap owner
    EXISTS (
      SELECT 1 FROM sitemaps 
      WHERE sitemaps.id = comments.sitemap_id 
      AND sitemaps.user_id = auth.uid()::text
    )
  );

-- Policy 4: DELETE Access
-- Allow if:
-- A) The sitemap is shared
-- B) OR The user is the owner of the sitemap
CREATE POLICY "Allow delete comments" ON comments
  FOR DELETE
  USING (
    -- Case A: Shared sitemap
    EXISTS (
      SELECT 1 FROM sitemaps 
      WHERE sitemaps.id = comments.sitemap_id 
      AND sitemaps.share_token IS NOT NULL
    )
    OR
    -- Case B: Sitemap owner
    EXISTS (
      SELECT 1 FROM sitemaps 
      WHERE sitemaps.id = comments.sitemap_id 
      AND sitemaps.user_id = auth.uid()::text
    )
  );
