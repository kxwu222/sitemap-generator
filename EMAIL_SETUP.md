# Email Invite Setup Guide

This guide explains how to set up email sending functionality for the invite feature using Supabase's built-in email templates.

## Prerequisites

1. A Supabase project with Edge Functions enabled
2. Supabase CLI installed
3. Service Role Key from your Supabase project

## Step 1: Configure Site URL and Redirect URLs in Supabase

**CRITICAL**: Before setting up email templates, you must configure redirect URLs. Supabase will block redirects to non-whitelisted URLs.

### 1.1: Configure Site URL

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **Auth** → **URL Configuration**
3. Set **Site URL** to your application URL:
   - Production: `https://yourdomain.com`
   - Development: `http://localhost:5173` (or your dev port)

### 1.2: Configure Redirect URLs

1. In **URL Configuration**, find the **Redirect URLs** section
2. Add allowed redirect URL patterns (use wildcards for flexibility):
   - Production: `https://yourdomain.com/**` (allows any path with share token)
   - Development: `http://localhost:5173/**` (for local development)
   - Development (alternate): `http://localhost:3000/**` (if using different port)

3. **Important**: The `**` wildcard allows any path and query parameters after the domain. This is necessary because each share link has a unique token (e.g., `?share=abc123`, `?share=xyz789`).

**Why wildcards?**: Each sitemap share has a unique token, so the full URL is different each time. You can't whitelist every possible token combination, so use `**` to allow all paths/query parameters.

## Step 2: Configure Email Templates in Supabase

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **Auth** → **Email Templates**
3. Select **"Invite user"** template
4. Customize the template to include your share URL:
   - Use `{{ .ConfirmationURL }}` to include the share link (this contains the redirect URL)
   - Use `{{ .Token }}` to include the invite token
   - Use `{{ .TokenHash }}` for the token hash
   - Use `{{ .SiteURL }}` for your site URL

**Important**: `{{ .ConfirmationURL }}` is the variable that contains the full confirmation link, including your `redirectTo` URL. This is what you should use in your email template.

Example template customization:
```html
<h2>You've been invited!</h2>
<p>You've been invited to create a user on {{ .SiteURL }}. Follow this link to accept the invite:</p>
<p><a href="{{ .ConfirmationURL }}">Accept the invite</a></p>
<p>Or copy and paste this link: {{ .ConfirmationURL }}</p>
```

**Note**: The `{{ .ConfirmationURL }}` will automatically include the share URL (e.g., `https://yourdomain.com?share=TOKEN`) that was passed as `redirectTo` in the Edge Function.

## Step 3: Configure SMTP (Optional)

If you want to use a custom SMTP provider instead of Supabase's default email service:

1. Go to **Settings** → **Auth** → **SMTP Settings**
2. Enable **"Enable Custom SMTP"**
3. Enter your SMTP credentials (Gmail, SendGrid, etc.)

**Note**: If you don't configure custom SMTP, Supabase will use its default email service.

## Step 4: Get Your Service Role Key

1. Go to **Settings** → **API**
2. Copy your **service_role key** (keep this secret!)
3. You'll need this to set as a secret for the Edge Function

**Important**: Never expose the service role key in client-side code. It's only used in Edge Functions.

## Step 5: Install Supabase CLI

```bash
npm install -g supabase
```

## Step 6: Login to Supabase

```bash
supabase login
```

## Step 7: Link Your Project

1. Get your project reference ID from your Supabase dashboard URL:
   - URL format: `https://supabase.com/dashboard/project/[PROJECT_REF]`
   - The `[PROJECT_REF]` is your project reference

2. Link your project:
```bash
supabase link --project-ref your-project-ref
```

## Step 8: Set Edge Function Secret

Set the Service Role Key as a secret (required for `auth.admin` methods):

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**Important**: Replace `your-service-role-key-here` with your actual service role key from Step 3.

## Step 9: Deploy the Function

```bash
supabase functions deploy send-invite
```

## Step 10: Test the Function

```bash
supabase functions invoke send-invite \
  --body '{
    "email": "test@example.com",
    "shareUrl": "https://yourdomain.com?share=test-token",
    "sitemapId": "test-id",
    "sitemapName": "Test Sitemap"
  }'
```

## Step 11: Verify It Works

1. Open your application
2. Create or open a sitemap
3. Click "Share" button
4. Add an email address and click "Send Invite"
5. Check the recipient's inbox (and spam folder)
6. The email will use Supabase's "Invite user" template

## How It Works

### Complete User Flow:

1. **Owner sends invite**: Clicks Share → enters email → clicks Send Invite
2. **Edge Function**: Calls `auth.admin.inviteUserByEmail()` with `redirectTo: shareUrl`
3. **Email sent**: Supabase sends invite email using "Invite user" template
4. **User clicks email**: Goes to Supabase confirmation page (via `{{ .ConfirmationURL }}`)
5. **User creates account**: Sets password on Supabase's page
6. **Redirect**: After account creation, Supabase redirects to `shareUrl` (e.g., `https://domain.com?share=TOKEN`)
7. **App loads sitemap**: Detects `?share=TOKEN` in URL and loads the specific sitemap via `getSitemapByShareToken()`
8. **User views sitemap**: Views sitemap in viewer mode (or edit mode based on permission)

### Technical Details:

- Uses `auth.admin.inviteUserByEmail()` which leverages Supabase's built-in email templates
- The email template is customizable in **Settings → Auth → Email Templates**
- Creates a user account if one doesn't exist
- The share URL is passed as the `redirectTo` parameter, so users are redirected there after accepting the invite
- **Critical**: The redirect URL must be whitelisted in Supabase Auth settings, or the redirect will be blocked

## Customizing the Email Template

The email template can be customized in **Settings → Auth → Email Templates → Invite user**:

### Available Variables:
- `{{ .ConfirmationURL }}` - **The full invite confirmation URL** (includes your share URL as redirect). This is the main variable to use for the invite link.
- `{{ .Token }}` - The invite token
- `{{ .TokenHash }}` - The token hash
- `{{ .Email }}` - The recipient's email address
- `{{ .SiteURL }}` - Your site URL from Supabase settings (configured in Auth → URL Configuration)

**Important**: `{{ .ConfirmationURL }}` contains the complete confirmation link that includes your `redirectTo` URL. After the user accepts the invite and creates their account, Supabase will redirect them to the URL specified in `redirectTo` (your share URL).

### Example Custom Template:

**Subject**: `You've been invited to collaborate!`

**HTML Body**:
```html
<h2>You've been invited!</h2>
<p>You've been invited to view and collaborate on a sitemap.</p>
<p>Click the button below to access it:</p>
<p><a href="{{ .ConfirmationURL }}" style="background-color: #CB6015; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Open Sitemap</a></p>
<p>Or copy and paste this link: {{ .ConfirmationURL }}</p>
```

## Troubleshooting

### "Missing service role key" Error

- Make sure `SUPABASE_SERVICE_ROLE_KEY` is set as a secret
- Verify the key is correct (from Settings → API → service_role key)
- Check: `supabase secrets list`

### "Unauthorized" Error

- Ensure the user calling the function is authenticated
- Check that the Authorization header is being sent correctly

### Redirect URL Not Working / "Invalid redirect URL" Error

**This is the most common issue!** If users can't access the shared sitemap after accepting the invite:

1. **Check Redirect URLs whitelist**: Go to **Settings → Auth → URL Configuration → Redirect URLs**
   - Ensure your domain is whitelisted with wildcard: `https://yourdomain.com/**`
   - For localhost: `http://localhost:5173/**`
   - The `**` wildcard is required to allow query parameters like `?share=TOKEN`

2. **Verify Site URL**: Check that **Site URL** is set correctly in **Settings → Auth → URL Configuration**

3. **Check shareUrl format**: The Edge Function validates that `shareUrl` is a valid HTTP/HTTPS URL
   - Should be: `https://yourdomain.com?share=TOKEN` or `http://localhost:5173?share=TOKEN`
   - Check function logs: `supabase functions logs send-invite`
   - Look for "Share URL (redirectTo):" in the logs

4. **Test redirect URL manually**: Try accessing the share URL directly in a browser to ensure it works

### Emails Not Received

1. **Check spam folder**: Emails might be filtered as spam
2. **Verify email template is enabled**: Go to Settings → Auth → Email Templates and ensure "Invite user" is enabled
3. **Check SMTP configuration**: If using custom SMTP, verify it's configured correctly
4. **Check function logs**: 
   ```bash
   supabase functions logs send-invite
   ```
5. **Verify Service Role Key**: Make sure the service role key is set correctly
6. **Check email template variables**: Ensure `{{ .ConfirmationURL }}` is used in the template

### User Account Creation

- This function creates a user account if one doesn't exist
- The invited user will need to set a password when they click the invite link
- If the email already has an account, an invite email is still sent

### Function Not Found

- Make sure the function is deployed: `supabase functions deploy send-invite`
- Verify the function name matches exactly: `send-invite`

## Benefits of Using Supabase Email Templates

- **No additional setup**: Uses Supabase's built-in email infrastructure
- **Customizable templates**: Edit templates directly in the Supabase dashboard
- **Consistent branding**: Same email system as authentication emails
- **No third-party services**: Works with Supabase's default email service or your custom SMTP

## Production Considerations

1. **Supabase Configuration**: **REQUIRED** - Ensure production environment has:
   - `VITE_SUPABASE_URL` environment variable set to your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` environment variable set to your Supabase anon/public key
   - Database schema includes `share_token` and `share_permission` columns in the `sitemaps` table (see `SUPABASE_SETUP.md`)

2. **Redirect URL Whitelisting**: **CRITICAL** - Ensure all production domains are whitelisted in Supabase Auth settings:
   - Go to **Settings → Auth → URL Configuration → Redirect URLs**
   - Add `https://yourdomain.com/**` (with wildcard for query parameters)
   - Add `http://localhost:5173/**` for local development

3. **Edge Function Deployment**: **REQUIRED** - The `send-invite` Edge Function must be deployed:
   - Deploy using: `supabase functions deploy send-invite`
   - Ensure `SUPABASE_SERVICE_ROLE_KEY` is set as a secret
   - Verify function is accessible at `https://[PROJECT_REF].supabase.co/functions/v1/send-invite`

4. **Customize Email Template**: Make sure the invite template matches your brand and uses `{{ .ConfirmationURL }}`

5. **SMTP Configuration**: For production, consider configuring custom SMTP for better deliverability

6. **Error Handling**: Monitor function logs for delivery failures and redirect URL issues:
   - Check Supabase function logs: `supabase functions logs send-invite`
   - Monitor browser console for client-side errors
   - Check Network tab for failed API calls

7. **User Experience**: The invite creates a user account, so users will need to set a password

8. **Testing**: Test the complete flow: invite → email → account creation → redirect → sitemap load

9. **Troubleshooting Common Issues**:
   - **"Generating..." never stops**: Check browser console for errors, verify Supabase connection, check if `share_token` column exists
   - **"Send Invite" doesn't work**: Check authentication status, verify Edge Function is deployed, check Network tab for errors
   - **Share links don't work**: Verify redirect URLs are whitelisted, check token exists in database

## Support

If you encounter issues:
1. Check Supabase function logs: `supabase functions logs send-invite`
2. Verify email template is enabled in Auth settings
3. Check that Service Role Key is set correctly
4. Review Supabase dashboard for any email delivery errors
