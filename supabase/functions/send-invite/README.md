# Send Invite Edge Function

This Supabase Edge Function sends invitation emails using Supabase's built-in email templates (the same templates used for authentication emails).

## How It Works

This function uses `auth.admin.inviteUserByEmail()` which:
- Uses Supabase's email templates configured in **Settings → Auth → Email Templates**
- Sends emails through Supabase's email infrastructure
- Creates a user account if one doesn't exist
- Includes the share URL in the invite email

## Setup Instructions

### 1. Configure Site URL and Redirect URLs in Supabase

**CRITICAL**: Before setting up email templates, you must configure redirect URLs. Supabase will block redirects to non-whitelisted URLs.

#### 1.1: Configure Site URL

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **Auth** → **URL Configuration**
3. Set **Site URL** to your application URL:
   - Production: `https://yourdomain.com`
   - Development: `http://localhost:5173` (or your dev port)

#### 1.2: Configure Redirect URLs

1. In **URL Configuration**, find the **Redirect URLs** section
2. Add allowed redirect URL patterns (use wildcards for flexibility):
   - Production: `https://yourdomain.com/**` (allows any path with share token)
   - Development: `http://localhost:5173/**` (for local development)
   - Development (alternate): `http://localhost:3000/**` (if using different port)

3. **Important**: The `**` wildcard allows any path and query parameters after the domain. This is necessary because each share link has a unique token (e.g., `?share=abc123`, `?share=xyz789`).

**Why wildcards?**: Each sitemap share has a unique token, so the full URL is different each time. You can't whitelist every possible token combination, so use `**` to allow all paths/query parameters.

### 2. Configure Email Templates in Supabase

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **Auth** → **Email Templates**
3. Select **"Invite user"** template
4. Customize the template to include your share URL:
   - Use `{{ .ConfirmationURL }}` to include the share link (this contains the redirect URL)
   - Use `{{ .Token }}` to include the invite token
   - Use `{{ .TokenHash }}` for the token hash
   - Use `{{ .SiteURL }}` for your site URL

**Important**: `{{ .ConfirmationURL }}` is the variable that contains the full confirmation link, including your `redirectTo` URL. This is what you should use in your email template.

**Note**: The `{{ .ConfirmationURL }}` will automatically include the share URL (e.g., `https://yourdomain.com?share=TOKEN`) that was passed as `redirectTo` in the Edge Function.

### 3. Configure SMTP (if not already done)

1. Go to **Settings** → **Auth** → **SMTP Settings**
2. Enable **"Enable Custom SMTP"** (optional - Supabase has default email service)
3. Enter your SMTP credentials if you want to use a custom SMTP provider

### 4. Set Service Role Key

The Edge Function needs the Supabase Service Role Key to use `auth.admin` methods:

1. Go to **Settings** → **API**
2. Copy your **service_role key** (keep this secret!)
3. Set it as a secret for the Edge Function:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Important**: Never expose the service role key in client-side code. It's only used in Edge Functions.

### 5. Install Supabase CLI

```bash
npm install -g supabase
```

### 6. Login and Link Your Project

```bash
supabase login
supabase link --project-ref your-project-ref
```

### 7. Deploy the Function

```bash
supabase functions deploy send-invite
```

### 8. Test the Function

```bash
supabase functions invoke send-invite \
  --body '{
    "email": "test@example.com",
    "shareUrl": "https://yourdomain.com?share=test-token",
    "sitemapId": "test-id",
    "sitemapName": "Test Sitemap"
  }'
```

## Customizing the Email Template

1. Go to **Settings** → **Auth** → **Email Templates**
2. Select **"Invite user"** template
3. Customize the HTML and text templates
4. Use `{{ .ConfirmationURL }}` to include the share link (this contains the redirect URL)
5. Use `{{ .Token }}` to include the invite token
6. Use `{{ .TokenHash }}` for the token hash
7. Use `{{ .SiteURL }}` for your site URL

**Important**: `{{ .ConfirmationURL }}` contains the complete confirmation link that includes your `redirectTo` URL. After the user accepts the invite and creates their account, Supabase will redirect them to the URL specified in `redirectTo` (your share URL).

Example template:
```html
<h2>You've been invited!</h2>
<p>You've been invited to create a user on {{ .SiteURL }}. Follow this link to accept the invite:</p>
<p><a href="{{ .ConfirmationURL }}">Accept the invite</a></p>
<p>Or copy and paste this link: {{ .ConfirmationURL }}</p>
```

**Note**: The `{{ .ConfirmationURL }}` will automatically include the share URL (e.g., `https://yourdomain.com?share=TOKEN`) that was passed as `redirectTo` in the Edge Function.

## Important Notes

- **Redirect URL Whitelisting**: **CRITICAL** - The redirect URL must be whitelisted in Supabase Auth settings (Settings → Auth → URL Configuration → Redirect URLs), or the redirect will be blocked. Use wildcards like `https://yourdomain.com/**` to allow query parameters.
- **User Account Creation**: This function creates a user account if one doesn't exist. The invited user will need to set a password when they click the invite link.
- **Service Role Key**: Required for `auth.admin` methods. Keep it secure and never expose it in client code.
- **Email Templates**: Uses Supabase's built-in email template system, which you can customize in the dashboard.
- **Redirect URL**: The `redirectTo` parameter in `inviteUserByEmail` is set to your share URL, so users are redirected there after accepting the invite.
- **Email Template Variable**: Use `{{ .ConfirmationURL }}` in your email template - this contains the full confirmation link including your share URL.

## Complete User Flow

1. **Owner sends invite**: Clicks Share → enters email → clicks Send Invite
2. **Edge Function**: Calls `auth.admin.inviteUserByEmail()` with `redirectTo: shareUrl`
3. **Email sent**: Supabase sends invite email using "Invite user" template
4. **User clicks email**: Goes to Supabase confirmation page (via `{{ .ConfirmationURL }}`)
5. **User creates account**: Sets password on Supabase's page
6. **Redirect**: After account creation, Supabase redirects to `shareUrl` (e.g., `https://domain.com?share=TOKEN`)
7. **App loads sitemap**: Detects `?share=TOKEN` in URL and loads the specific sitemap
8. **User views sitemap**: Views sitemap in viewer mode (or edit mode based on permission)

## Troubleshooting

### "Missing service role key" Error

- Make sure `SUPABASE_SERVICE_ROLE_KEY` is set as a secret
- Verify the key is correct (from Settings → API → service_role key)

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

1. Check spam folder
2. Verify SMTP is configured in Supabase (Settings → Auth → SMTP Settings)
3. Check function logs: `supabase functions logs send-invite`
4. Verify email template is enabled in Auth settings
5. Check email template variables: Ensure `{{ .ConfirmationURL }}` is used in the template

### User Account Already Exists

- If the email already has an account, `inviteUserByEmail` will still send an invite email
- The user can use the invite link to access the shared resource
