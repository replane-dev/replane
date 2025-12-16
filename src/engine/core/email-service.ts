import type {Transporter} from 'nodemailer';
import {MAGIC_LINK_MAX_AGE_SECONDS} from './constants';

export interface EmailService {
  /**
   * Sends a magic link authentication email
   */
  sendMagicLink(params: {to: string; url: string; host: string}): Promise<void>;
}

/**
 * Email HTML body for magic link sign-in
 * Insert invisible space into domains to prevent them from being turned into hyperlinks
 * by email clients like Outlook and Apple mail.
 */
function createMagicLinkHtml(params: {url: string; host: string}): string {
  const {url, host} = params;
  const escapedHost = host.replace(/\./g, '&#8203;.');
  const maxAgeHours = Math.floor(MAGIC_LINK_MAX_AGE_SECONDS / 3600);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Sign in to ${escapedHost}</title>
  <!--[if mso]>
  <style type="text/css">
    table { border-collapse: collapse; }
  </style>
  <![endif]-->
  <style type="text/css">
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
        margin: auto !important;
      }
      .mobile-padding {
        padding-left: 20px !important;
        padding-right: 20px !important;
      }
      .mobile-text {
        font-size: 14px !important;
      }
      .mobile-title {
        font-size: 22px !important;
      }
      .button-cell {
        padding: 14px 32px !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 20px 10px;">

        <!-- Main container -->
        <table role="presentation" class="email-container" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);">

          <!-- Header -->
          <tr>
            <td class="mobile-padding" style="background: linear-gradient(135deg, #0f172a 0%, #334155 100%); padding: 40px 40px 36px 40px; border-radius: 12px 12px 0 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center">
                    <div style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">
                      Replane
                    </div>
                    <h1 class="mobile-title" style="margin: 0 0 12px 0; font-size: 26px; font-weight: 700; color: #ffffff; letter-spacing: -0.025em; line-height: 1.2;">
                      Sign In Request
                    </h1>
                    <p style="margin: 0; font-size: 15px; color: #cbd5e1; line-height: 1.5;">
                      ${escapedHost}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body content -->
          <tr>
            <td class="mobile-padding" style="padding: 40px 40px 32px 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <p class="mobile-text" style="margin: 0 0 20px 0; font-size: 16px; color: #334155; line-height: 1.6;">
                      Hello,
                    </p>
                    <p class="mobile-text" style="margin: 0 0 32px 0; font-size: 16px; color: #64748b; line-height: 1.6;">
                      Click the button below to sign in to your account. This link will expire in <strong>${maxAgeHours} hours</strong> and can only be used once.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 32px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="center" style="border-radius: 8px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);">
                          <a href="${url}" target="_blank" class="button-cell" style="display: inline-block; padding: 16px 40px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                            Sign In
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Alternative link -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 8px;">
                <tr>
                  <td style="background-color: #f8fafc; border-radius: 8px; padding: 20px;">
                    <p style="margin: 0 0 10px 0; font-size: 13px; color: #64748b; line-height: 1.4;">
                      Or copy this link:
                    </p>
                    <p style="margin: 0; word-break: break-all; font-size: 12px; line-height: 1.5;">
                      <a href="${url}" target="_blank" style="color: #3b82f6; text-decoration: none;">${url}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Security notice -->
          <tr>
            <td class="mobile-padding" style="padding: 0 40px 32px 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #fef9e7; border-left: 3px solid #f59e0b; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px 18px;">
                    <p style="margin: 0; font-size: 13px; color: #78350f; line-height: 1.5;">
                      <strong>Security Notice:</strong> If you didn't request this, please ignore this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="mobile-padding" style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;">
              <p style="margin: 0 0 4px 0; font-size: 13px; color: #64748b; line-height: 1.4;">
                Automated email, please do not reply
              </p>
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                Powered by <strong>Replane</strong> · © ${new Date().getFullYear()} ${escapedHost}
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/**
 * Email text body (fallback for email clients that don't render HTML)
 */
function createMagicLinkText(params: {url: string; host: string}): string {
  const {url, host} = params;
  const maxAgeHours = Math.floor(MAGIC_LINK_MAX_AGE_SECONDS / 3600);

  return `
REPLANE - SIGN IN REQUEST
${host}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hello,

Click the link below to sign in to your account:

${url}

This link will expire in ${maxAgeHours} hours and can only be used once.

SECURITY NOTICE:
If you didn't request this email, please ignore it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Automated email, please do not reply
Powered by Replane · © ${new Date().getFullYear()} ${host}
`;
}

export class NodemailerEmailService implements EmailService {
  constructor(
    private readonly transport: Transporter,
    private readonly fromAddress: string,
  ) {}

  async sendMagicLink(params: {to: string; url: string; host: string}): Promise<void> {
    const {to, url, host} = params;

    const result = await this.transport.sendMail({
      to,
      from: this.fromAddress,
      subject: `Sign in to ${host}`,
      text: createMagicLinkText({url, host}),
      html: createMagicLinkHtml({url, host}),
    });

    const failed = result.rejected.filter(Boolean);
    if (failed.length) {
      throw new Error(`Email(s) (${failed.join(', ')}) could not be sent`);
    }
  }
}
