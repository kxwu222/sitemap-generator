import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface InviteRequest {
  email: string
  shareUrl: string
  sitemapId: string
  sitemapName?: string
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase admin client (needed for auth.admin methods)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Initialize regular client for user verification
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Verify user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { email, shareUrl, sitemapId, sitemapName }: InviteRequest = await req.json()

    if (!email || !shareUrl || !sitemapId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, shareUrl, sitemapId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Validate and log redirect URL
    try {
      const shareUrlObj = new URL(shareUrl)
      console.log('Share URL (redirectTo):', shareUrl)
      console.log('Share URL origin:', shareUrlObj.origin)
      console.log('Share URL pathname:', shareUrlObj.pathname)
      console.log('Share URL search:', shareUrlObj.search)
      
      // Basic validation: ensure it's a valid HTTP/HTTPS URL
      if (!['http:', 'https:'].includes(shareUrlObj.protocol)) {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid redirect URL protocol. Must be http:// or https://',
            hint: 'Make sure the shareUrl starts with http:// or https://'
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }
    } catch (urlError) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid redirect URL format',
          details: urlError.message,
          hint: 'The shareUrl must be a valid URL (e.g., https://yourdomain.com?share=TOKEN). Make sure it matches the redirect URL patterns configured in Supabase Auth settings.'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Use Supabase's built-in invite email template
    // This sends an email using Supabase's email templates configured in Auth settings
    // Note: This creates a user account if one doesn't exist
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        share_url: shareUrl,
        sitemap_id: sitemapId,
        sitemap_name: sitemapName || 'Untitled Sitemap',
      },
      redirectTo: shareUrl, // The invite email will contain a link to this URL
    })

    if (inviteError) {
      console.error('Error sending invite via Supabase:', inviteError)
      return new Response(
        JSON.stringify({ error: 'Failed to send invite email', details: inviteError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Invite email sent successfully',
        userId: inviteData?.user?.id
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error) {
    console.error('Error sending invite:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
})
