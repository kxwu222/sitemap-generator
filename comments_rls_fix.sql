-- ============================================================================
-- COMMENTS TABLE - FIXED RLS POLICIES FOR ANONYMOUS USERS
-- ============================================================================
-- This script fixes the RLS policies to allow anonymous viewers to read/write
-- comments on shared sitemaps, enabling real-time collaboration.
-- ============================================================================

-- Step 1: Remove foreign key constraint that requires auth.users
-- This allows anonymous user IDs (like 'anon-xxx') to be stored
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;

-- Step 2: Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can read comments for shared sitemaps" ON comments;
DROP POLICY IF EXISTS "Users can create their own comments" ON comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON comments;
DROP POLICY IF EXISTS "Users can delete their own comments or owners can delete any" ON comments;
DROP POLICY IF EXISTS "Allow all operations on comments" ON comments;
DROP POLICY IF EXISTS "Allow create comments for shared sitemaps" ON comments;
DROP POLICY IF EXISTS "Allow update comments for shared sitemaps" ON comments;
DROP POLICY IF EXISTS "Allow delete comments for shared sitemaps" ON comments;

-- Step 3: Create new policies that allow anonymous users
-- Note: We drop them first in case they already exist, then create fresh

-- Policy 1: Allow reading comments for shared sitemaps (works for everyone, including anonymous)
DROP POLICY IF EXISTS "Allow read comments for shared sitemaps" ON comments;
CREATE POLICY "Allow read comments for shared sitemaps" ON comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sitemaps 
      WHERE sitemaps.id = comments.sitemap_id 
      AND sitemaps.share_token IS NOT NULL
    )
  );

-- Policy 2: Allow creating comments for shared sitemaps (works for everyone, including anonymous)
-- Removed the auth.uid() requirement to allow anonymous users
DROP POLICY IF EXISTS "Allow create comments for shared sitemaps" ON comments;
CREATE POLICY "Allow create comments for shared sitemaps" ON comments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sitemaps 
      WHERE sitemaps.id = comments.sitemap_id 
      AND sitemaps.share_token IS NOT NULL
    )
  );

-- Policy 3: Allow updating comments for shared sitemaps
-- Users can update any comment on shared sitemaps (or restrict to own comments if preferred)
DROP POLICY IF EXISTS "Allow update comments for shared sitemaps" ON comments;
CREATE POLICY "Allow update comments for shared sitemaps" ON comments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM sitemaps 
      WHERE sitemaps.id = comments.sitemap_id 
      AND sitemaps.share_token IS NOT NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sitemaps 
      WHERE sitemaps.id = comments.sitemap_id 
      AND sitemaps.share_token IS NOT NULL
    )
  );

-- Policy 4: Allow deleting comments for shared sitemaps
-- Users can delete any comment on shared sitemaps (or restrict to own comments if preferred)
DROP POLICY IF EXISTS "Allow delete comments for shared sitemaps" ON comments;
CREATE POLICY "Allow delete comments for shared sitemaps" ON comments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM sitemaps 
      WHERE sitemaps.id = comments.sitemap_id 
      AND sitemaps.share_token IS NOT NULL
    )
  );

-- ============================================================================
-- ALTERNATIVE: More restrictive policies (uncomment if you want users to only
-- edit/delete their own comments)
-- ============================================================================

-- Policy 3 (Alternative): Users can only update their own comments
-- CREATE POLICY "Allow update own comments for shared sitemaps" ON comments
--   FOR UPDATE
--   USING (
--     EXISTS (
--       SELECT 1 FROM sitemaps 
--       WHERE sitemaps.id = comments.sitemap_id 
--       AND sitemaps.share_token IS NOT NULL
--     )
--     AND (
--       -- Allow if user is authenticated and matches, OR if anonymous user_id matches
--       (auth.uid()::text = comments.user_id) OR
--       (auth.uid() IS NULL AND comments.user_id LIKE 'anon-%')
--     )
--   )
--   WITH CHECK (
--     EXISTS (
--       SELECT 1 FROM sitemaps 
--       WHERE sitemaps.id = comments.sitemap_id 
--       AND sitemaps.share_token IS NOT NULL
--     )
--     AND (
--       (auth.uid()::text = comments.user_id) OR
--       (auth.uid() IS NULL AND comments.user_id LIKE 'anon-%')
--     )
--   );

-- Policy 4 (Alternative): Users can only delete their own comments, or owners can delete any
-- CREATE POLICY "Allow delete own comments or owners can delete any" ON comments
--   FOR DELETE
--   USING (
--     EXISTS (
--       SELECT 1 FROM sitemaps 
--       WHERE sitemaps.id = comments.sitemap_id 
--       AND sitemaps.share_token IS NOT NULL
--     )
--     AND (
--       -- User can delete their own comment
--       (auth.uid()::text = comments.user_id) OR
--       (auth.uid() IS NULL AND comments.user_id LIKE 'anon-%') OR
--       -- OR sitemap owner can delete any comment
--       EXISTS (
--         SELECT 1 FROM sitemaps 
--         WHERE sitemaps.id = comments.sitemap_id 
--         AND sitemaps.user_id = auth.uid()::text
--       )
--     )
--   );

-- ============================================================================
-- VERIFICATION QUERIES (OPTIONAL - FOR TESTING)
-- ============================================================================
-- Uncomment these to verify the setup:

-- SELECT 
--   policyname, 
--   permissive, 
--   roles, 
--   cmd, 
--   qual,
--   with_check
-- FROM pg_policies 
-- WHERE tablename = 'comments';

-- ============================================================================
-- END OF FIX
-- ============================================================================

