# Authentication Setup

Replane uses OAuth 2.0 for authentication. You can configure one or more providers to allow users to sign in. All configured providers will be displayed on the sign-in page.

## Supported Providers

- GitHub
- GitLab  
- Google
- Okta

## Configuration

Set the environment variables for the provider(s) you want to enable. Your `BASE_URL` must be set correctly as it's used to construct the OAuth callback URLs.

### GitHub

1. Go to [GitHub Settings > Developer Settings > OAuth Apps](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the application details:
   - **Application name**: Replane (or your organization name)
   - **Homepage URL**: Your Replane BASE_URL
   - **Authorization callback URL**: `{BASE_URL}/api/auth/callback/github`
4. After creating the app, note the **Client ID**
5. Generate a new **Client Secret**

Set environment variables:
```bash
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
```

### GitLab

1. Go to [GitLab User Settings > Applications](https://gitlab.com/-/profile/applications)
2. Create a new application:
   - **Name**: Replane
   - **Redirect URI**: `{BASE_URL}/api/auth/callback/gitlab`
   - **Scopes**: Select `read_user` (required)
3. Save the application
4. Copy the **Application ID** and **Secret**

Set environment variables:
```bash
GITLAB_CLIENT_ID=your_application_id_here
GITLAB_CLIENT_SECRET=your_secret_here
```

**Self-hosted GitLab**: If you're using a self-hosted GitLab instance, also set:
```bash
GITLAB_ISSUER=https://gitlab.yourdomain.com
```

### Google

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Go to **APIs & Services > Credentials**
4. Click **Create Credentials > OAuth client ID**
5. Configure the OAuth consent screen if you haven't already:
   - User Type: Internal (for Google Workspace) or External
   - Add required scopes: `email`, `profile`, `openid`
6. Create OAuth client ID:
   - **Application type**: Web application
   - **Authorized redirect URIs**: `{BASE_URL}/api/auth/callback/google`
7. Copy the **Client ID** and **Client Secret**

Set environment variables:
```bash
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
```

### Okta

1. Log in to your [Okta Admin Console](https://login.okta.com/)
2. Go to **Applications > Applications**
3. Click **Create App Integration**
4. Select **OIDC - OpenID Connect**
5. Select **Web Application**
6. Configure the application:
   - **App integration name**: Replane
   - **Grant type**: Authorization Code
   - **Sign-in redirect URIs**: `{BASE_URL}/api/auth/callback/okta`
   - **Sign-out redirect URIs**: `{BASE_URL}` (optional)
   - **Controlled access**: Choose who can access (e.g., "Allow everyone in your organization to access")
7. Save and note the **Client ID** and **Client Secret**
8. Your **Issuer** URL is typically: `https://{your-okta-domain}.okta.com`

Set environment variables:
```bash
OKTA_CLIENT_ID=your_client_id_here
OKTA_CLIENT_SECRET=your_client_secret_here
OKTA_ISSUER=https://your-domain.okta.com
```

## Multiple Providers

You can enable multiple providers simultaneously. Users will see all configured providers on the sign-in page and can choose which one to use.

Example configuration with multiple providers:
```bash
# Enable GitHub
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Enable Google
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Enable GitLab
GITLAB_CLIENT_ID=...
GITLAB_CLIENT_SECRET=...
```

## Security Best Practices

1. **Use HTTPS in production**: Always set `BASE_URL` to an HTTPS URL in production
2. **Restrict callback URLs**: Only whitelist your exact callback URLs in the OAuth provider settings
3. **Rotate secrets regularly**: Change OAuth client secrets periodically
4. **Set strong SECRET_KEY_BASE**: Use a cryptographically random string (at least 32 characters)
   ```bash
   # Generate a secure secret:
   openssl rand -base64 32
   ```
5. **Limit OAuth scope**: Only request the minimum required scopes (email and profile)
6. **Review OAuth permissions**: Periodically review which users have access

## Troubleshooting

### "No authentication providers configured"
- Ensure you've set at least one set of OAuth credentials
- Verify environment variables are correctly spelled
- Check that both CLIENT_ID and CLIENT_SECRET are set for the provider
- Restart the application after setting environment variables

### Redirect URI mismatch
- Ensure your `BASE_URL` environment variable matches the domain you're accessing
- Verify the callback URL in your OAuth provider settings exactly matches: `{BASE_URL}/api/auth/callback/{provider}`
- Common mistake: Using `http` in production instead of `https`

### Sign-in button redirects but fails
- Check the application logs for detailed error messages
- Verify your CLIENT_ID and CLIENT_SECRET are correct
- Ensure your OAuth application is active/enabled in the provider's console
- For Okta: Verify the ISSUER URL is correct and includes the full domain

### "This account is not linked"
- This occurs when the same email is used with different OAuth providers
- Sign in with the original provider you used to create the account
- Account linking across providers is not currently supported

## User Management

- The first user to sign in becomes an owner of the default organization
- Additional users can be invited through the Replane UI
- User sessions last 24 hours by default
- Users can sign out at any time via the user menu

## Database Schema

OAuth accounts are stored in the `accounts` table (managed by NextAuth.js). User information is stored in the `users` table. The schema is automatically created when you run database migrations.

