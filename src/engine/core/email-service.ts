import type {Transporter} from 'nodemailer';
import {MAGIC_LINK_MAX_AGE_SECONDS} from './constants';
import {wait} from './utils';

export interface EmailService {
  /**
   * Sends a magic link authentication email
   */
  sendMagicLink(params: {to: string; url: string; host: string}): Promise<void>;

  /**
   * Sends a notification when a proposal is waiting for review
   */
  sendProposalWaitingForReview(params: {
    to: string[];
    proposalUrl: string;
    configName: string;
    projectName: string;
    authorName: string;
  }): Promise<void>;

  /**
   * Sends a notification when a proposal is approved
   */
  sendProposalApproved(params: {
    to: string;
    proposalUrl: string;
    configName: string;
    projectName: string;
    reviewerName: string;
  }): Promise<void>;

  /**
   * Sends a notification when a proposal is rejected
   */
  sendProposalRejected(params: {
    to: string;
    proposalUrl: string;
    configName: string;
    projectName: string;
    reviewerName: string;
  }): Promise<void>;
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
  <title>Sign in to ${escapedHost}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .content-padding { padding: 16px !important; }
      .button-cell { padding: 12px 24px !important; font-size: 14px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f8fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f6f8fa;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" class="email-container" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #ffffff; border: 1px solid #d0d7de; border-radius: 6px;">

          <!-- Header -->
          <tr>
            <td class="content-padding" style="padding: 24px; border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <div style="font-size: 12px; color: #656d76; margin-bottom: 4px;">
                      <strong style="color: #1f2328;">Replane</strong>
                    </div>
                    <div style="font-size: 14px; color: #656d76;">
                      Sign in to <strong style="color: #1f2328;">${escapedHost}</strong>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td class="content-padding" style="padding: 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding-bottom: 16px;">
                    <div style="font-size: 14px; color: #1f2328; line-height: 1.5; margin-bottom: 12px;">
                      Hello,
                    </div>
                    <div style="font-size: 14px; color: #1f2328; line-height: 1.5;">
                      Click the button below to sign in to your account. This link will expire in <strong>${maxAgeHours} hours</strong> and can only be used once.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="border-radius: 6px; background-color: #24292f;">
                          <a href="${url}" target="_blank" class="button-cell" style="display: inline-block; padding: 14px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px;">
                            Sign In
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 16px;">
                    <div style="background-color: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; padding: 16px;">
                      <div style="font-size: 13px; color: #656d76; margin-bottom: 8px;">
                        Or copy this link:
                      </div>
                      <div style="font-size: 12px; word-break: break-all; line-height: 1.5;">
                        <a href="${url}" target="_blank" style="color: #0969da; text-decoration: none;">${url}</a>
                      </div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Security notice -->
          <tr>
            <td class="content-padding" style="padding: 0 24px 24px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #fff8c5; border: 1px solid #d4a72c; border-radius: 6px;">
                <tr>
                  <td style="padding: 12px 16px;">
                    <div style="font-size: 13px; color: #3f2200; line-height: 1.5;">
                      <strong>Security Notice:</strong> If you didn't request this, please ignore this email.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="content-padding" style="padding: 16px 24px; border-top: 1px solid #d0d7de; background-color: #f6f8fa;">
              <div style="font-size: 12px; color: #656d76; text-align: center;">
                <div style="margin-bottom: 4px;">Powered by <strong>Replane</strong></div>
                <div>© ${new Date().getFullYear()} ${escapedHost}</div>
              </div>
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

/**
 * HTML email for proposal waiting for review notification
 */
function createProposalWaitingForReviewHtml(params: {
  proposalUrl: string;
  configName: string;
  projectName: string;
  authorName: string;
}): string {
  const {proposalUrl, configName, projectName, authorName} = params;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proposal Waiting for Review</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .content-padding { padding: 16px !important; }
      .button-cell { padding: 12px 24px !important; font-size: 14px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f8fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f6f8fa;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" class="email-container" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #ffffff; border: 1px solid #d0d7de; border-radius: 6px;">

          <!-- Header -->
          <tr>
            <td class="content-padding" style="padding: 24px; border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <div style="font-size: 12px; color: #656d76; margin-bottom: 4px;">
                      <strong style="color: #1f2328;">Replane</strong>
                    </div>
                    <div style="font-size: 14px; color: #656d76;">
                      <strong style="color: #1f2328;">${authorName}</strong> submitted a proposal
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td class="content-padding" style="padding: 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding-bottom: 16px;">
                    <div style="font-size: 14px; color: #1f2328; line-height: 1.5;">
                      A new proposal is waiting for your review.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding-bottom: 8px;">
                          <div style="font-size: 13px; color: #656d76;">
                            <strong style="color: #1f2328; font-weight: 600;">Config:</strong> ${configName}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 8px;">
                          <div style="font-size: 13px; color: #656d76;">
                            <strong style="color: #1f2328; font-weight: 600;">Project:</strong> ${projectName}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <div style="font-size: 13px; color: #656d76;">
                            <strong style="color: #1f2328; font-weight: 600;">Author:</strong> ${authorName}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 8px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="border-radius: 6px; background-color: #24292f;">
                          <a href="${proposalUrl}" target="_blank" class="button-cell" style="display: inline-block; padding: 14px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px;">
                            Review Proposal
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="content-padding" style="padding: 16px 24px; border-top: 1px solid #d0d7de; background-color: #f6f8fa;">
              <div style="font-size: 12px; color: #656d76; text-align: center;">
                <div style="margin-bottom: 4px;">Powered by <strong>Replane</strong></div>
                <div>
                  <a href="${proposalUrl}" style="color: #0969da; text-decoration: none;">View on Replane</a>
                </div>
              </div>
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
 * HTML email for proposal approved notification
 */
function createProposalApprovedHtml(params: {
  proposalUrl: string;
  configName: string;
  projectName: string;
  reviewerName: string;
}): string {
  const {proposalUrl, configName, projectName, reviewerName} = params;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proposal Approved</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .content-padding { padding: 16px !important; }
      .button-cell { padding: 12px 24px !important; font-size: 14px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f8fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f6f8fa;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" class="email-container" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #ffffff; border: 1px solid #d0d7de; border-radius: 6px;">

          <!-- Header -->
          <tr>
            <td class="content-padding" style="padding: 24px; border-bottom: 1px solid #d0d7de; background-color: #dafbe1;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <div style="font-size: 12px; color: #1a7f37; margin-bottom: 4px;">
                      <strong style="color: #1a7f37;">✓ Replane</strong>
                    </div>
                    <div style="font-size: 14px; color: #1a7f37;">
                      <strong style="color: #1a7f37;">${reviewerName}</strong> approved your proposal
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td class="content-padding" style="padding: 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding-bottom: 16px;">
                    <div style="font-size: 14px; color: #1f2328; line-height: 1.5;">
                      Great news! Your proposal has been approved and the changes have been applied.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding-bottom: 8px;">
                          <div style="font-size: 13px; color: #656d76;">
                            <strong style="color: #1f2328; font-weight: 600;">Config:</strong> ${configName}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 8px;">
                          <div style="font-size: 13px; color: #656d76;">
                            <strong style="color: #1f2328; font-weight: 600;">Project:</strong> ${projectName}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <div style="font-size: 13px; color: #656d76;">
                            <strong style="color: #1f2328; font-weight: 600;">Reviewer:</strong> ${reviewerName}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 8px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="border-radius: 6px; background-color: #24292f;">
                          <a href="${proposalUrl}" target="_blank" class="button-cell" style="display: inline-block; padding: 14px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px;">
                            View Proposal
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="content-padding" style="padding: 16px 24px; border-top: 1px solid #d0d7de; background-color: #f6f8fa;">
              <div style="font-size: 12px; color: #656d76; text-align: center;">
                <div style="margin-bottom: 4px;">Powered by <strong>Replane</strong></div>
                <div>
                  <a href="${proposalUrl}" style="color: #0969da; text-decoration: none;">View on Replane</a>
                </div>
              </div>
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
 * HTML email for proposal rejected notification
 */
function createProposalRejectedHtml(params: {
  proposalUrl: string;
  configName: string;
  projectName: string;
  reviewerName: string;
}): string {
  const {proposalUrl, configName, projectName, reviewerName} = params;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proposal Rejected</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .content-padding { padding: 16px !important; }
      .button-cell { padding: 12px 24px !important; font-size: 14px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f8fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f6f8fa;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" class="email-container" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #ffffff; border: 1px solid #d0d7de; border-radius: 6px;">

          <!-- Header -->
          <tr>
            <td class="content-padding" style="padding: 24px; border-bottom: 1px solid #d0d7de; background-color: #ffebe9;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <div style="font-size: 12px; color: #a40e26; margin-bottom: 4px;">
                      <strong style="color: #a40e26;">✕ Replane</strong>
                    </div>
                    <div style="font-size: 14px; color: #a40e26;">
                      <strong style="color: #a40e26;">${reviewerName}</strong> rejected your proposal
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td class="content-padding" style="padding: 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding-bottom: 16px;">
                    <div style="font-size: 14px; color: #1f2328; line-height: 1.5;">
                      Your proposal has been rejected. You can review the proposal details and submit a new one if needed.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding-bottom: 8px;">
                          <div style="font-size: 13px; color: #656d76;">
                            <strong style="color: #1f2328; font-weight: 600;">Config:</strong> ${configName}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 8px;">
                          <div style="font-size: 13px; color: #656d76;">
                            <strong style="color: #1f2328; font-weight: 600;">Project:</strong> ${projectName}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <div style="font-size: 13px; color: #656d76;">
                            <strong style="color: #1f2328; font-weight: 600;">Reviewer:</strong> ${reviewerName}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 8px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="border-radius: 6px; background-color: #24292f;">
                          <a href="${proposalUrl}" target="_blank" class="button-cell" style="display: inline-block; padding: 14px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px;">
                            View Proposal
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="content-padding" style="padding: 16px 24px; border-top: 1px solid #d0d7de; background-color: #f6f8fa;">
              <div style="font-size: 12px; color: #656d76; text-align: center;">
                <div style="margin-bottom: 4px;">Powered by <strong>Replane</strong></div>
                <div>
                  <a href="${proposalUrl}" style="color: #0969da; text-decoration: none;">View on Replane</a>
                </div>
              </div>
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

const DEFAULT_MAX_RETRIES = 16;
const DEFAULT_INITIAL_DELAY_MS = 1000;

export class NodemailerEmailService implements EmailService {
  constructor(
    private readonly transport: Transporter,
    private readonly fromAddress: string,
    private readonly maxRetries: number = DEFAULT_MAX_RETRIES,
    private readonly initialDelayMs: number = DEFAULT_INITIAL_DELAY_MS,
  ) {}

  /**
   * Sends an email with exponential backoff retry logic.
   * @param mailOptions - The mail options to send
   * @param attempt - Current attempt number (1-indexed)
   */
  private async sendMailWithRetry(
    mailOptions: {
      to: string | string[];
      from: string;
      subject: string;
      text: string;
      html?: string;
    },
    attempt: number = 1,
  ): Promise<void> {
    try {
      const result = await this.transport.sendMail(mailOptions);

      const failed = result.rejected.filter(Boolean);
      if (failed.length) {
        throw new Error(`Email(s) (${failed.join(', ')}) could not be sent`);
      }
    } catch (error) {
      if (attempt >= this.maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff: initialDelay * 2^(attempt-1)
      const delay = this.initialDelayMs * Math.pow(2, attempt - 1) * (Math.random() * 0.2 + 0.9);

      // Wait before retrying
      await wait(delay);

      // Retry with incremented attempt counter
      return this.sendMailWithRetry(mailOptions, attempt + 1);
    }
  }

  async sendMagicLink(params: {to: string; url: string; host: string}): Promise<void> {
    const {to, url, host} = params;

    await this.sendMailWithRetry({
      to,
      from: this.fromAddress,
      subject: `Sign in to ${host}`,
      text: createMagicLinkText({url, host}),
      html: createMagicLinkHtml({url, host}),
    });
  }

  async sendProposalWaitingForReview(params: {
    to: string[];
    proposalUrl: string;
    configName: string;
    projectName: string;
    authorName: string;
  }): Promise<void> {
    const {to, proposalUrl, configName, projectName, authorName} = params;

    if (to.length === 0) return;

    const subject = `${authorName} submitted a proposal for ${configName}`;
    const text = `
${authorName} submitted a proposal for review

Config: ${configName}
Project: ${projectName}
Author: ${authorName}

Review the proposal:
${proposalUrl}

Powered by Replane
`;

    const html = createProposalWaitingForReviewHtml({
      proposalUrl,
      configName,
      projectName,
      authorName,
    });

    await this.sendMailWithRetry({
      to,
      from: this.fromAddress,
      subject,
      text,
      html,
    });
  }

  async sendProposalApproved(params: {
    to: string;
    proposalUrl: string;
    configName: string;
    projectName: string;
    reviewerName: string;
  }): Promise<void> {
    const {to, proposalUrl, configName, projectName, reviewerName} = params;

    const subject = `Your proposal for ${configName} was approved`;
    const text = `
Your proposal was approved by ${reviewerName}

Config: ${configName}
Project: ${projectName}
Reviewer: ${reviewerName}

View proposal:
${proposalUrl}

Powered by Replane
`;

    const html = createProposalApprovedHtml({
      proposalUrl,
      configName,
      projectName,
      reviewerName,
    });

    await this.sendMailWithRetry({
      to,
      from: this.fromAddress,
      subject,
      text,
      html,
    });
  }

  async sendProposalRejected(params: {
    to: string;
    proposalUrl: string;
    configName: string;
    projectName: string;
    reviewerName: string;
  }): Promise<void> {
    const {to, proposalUrl, configName, projectName, reviewerName} = params;

    const subject = `Your proposal for ${configName} was rejected`;
    const text = `
Your proposal was rejected by ${reviewerName}

Config: ${configName}
Project: ${projectName}
Reviewer: ${reviewerName}

View proposal:
${proposalUrl}

Powered by Replane
`;

    const html = createProposalRejectedHtml({
      proposalUrl,
      configName,
      projectName,
      reviewerName,
    });

    await this.sendMailWithRetry({
      to,
      from: this.fromAddress,
      subject,
      text,
      html,
    });
  }
}
