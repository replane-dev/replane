import {
  getAllowedEmailDomains,
  hasEmailDomainRestrictions,
  isEmailDomainAllowed,
} from '@/lib/email-domain-validator';
import {describe, expect, it, beforeEach, afterEach} from 'vitest';

describe('Email Domain Validation', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    // Save original env value
    originalEnv = process.env.ALLOWED_EMAIL_DOMAINS;
  });

  afterEach(() => {
    // Restore original env value
    if (originalEnv === undefined) {
      delete process.env.ALLOWED_EMAIL_DOMAINS;
    } else {
      process.env.ALLOWED_EMAIL_DOMAINS = originalEnv;
    }
  });

  describe('getAllowedEmailDomains', () => {
    it('should return null when ALLOWED_EMAIL_DOMAINS is not set', () => {
      delete process.env.ALLOWED_EMAIL_DOMAINS;
      expect(getAllowedEmailDomains()).toBeNull();
    });

    it('should parse comma-separated domains correctly', () => {
      process.env.ALLOWED_EMAIL_DOMAINS = 'gmail.com,my-company.com,example.org';
      expect(getAllowedEmailDomains()).toEqual(['gmail.com', 'my-company.com', 'example.org']);
    });

    it('should handle domains with extra whitespace', () => {
      process.env.ALLOWED_EMAIL_DOMAINS = ' gmail.com , my-company.com , example.org ';
      expect(getAllowedEmailDomains()).toEqual(['gmail.com', 'my-company.com', 'example.org']);
    });

    it('should be case-insensitive', () => {
      process.env.ALLOWED_EMAIL_DOMAINS = 'Gmail.COM,My-Company.COM';
      expect(getAllowedEmailDomains()).toEqual(['gmail.com', 'my-company.com']);
    });

    it('should filter out empty domains', () => {
      process.env.ALLOWED_EMAIL_DOMAINS = 'gmail.com,,my-company.com, ,example.org';
      expect(getAllowedEmailDomains()).toEqual(['gmail.com', 'my-company.com', 'example.org']);
    });
  });

  describe('isEmailDomainAllowed', () => {
    it('should allow all domains when ALLOWED_EMAIL_DOMAINS is not set', () => {
      delete process.env.ALLOWED_EMAIL_DOMAINS;
      expect(isEmailDomainAllowed('user@any-domain.com')).toBe(true);
      expect(isEmailDomainAllowed('admin@example.org')).toBe(true);
    });

    it('should reject null or undefined emails', () => {
      expect(isEmailDomainAllowed(null)).toBe(false);
      expect(isEmailDomainAllowed(undefined)).toBe(false);
    });

    it('should reject emails without domain', () => {
      // Set restrictions so we can test the validation logic
      process.env.ALLOWED_EMAIL_DOMAINS = 'gmail.com';
      expect(isEmailDomainAllowed('notanemail')).toBe(false);
      expect(isEmailDomainAllowed('user@')).toBe(false);
    });

    it('should allow emails from configured domains', () => {
      process.env.ALLOWED_EMAIL_DOMAINS = 'gmail.com,my-company.com';
      expect(isEmailDomainAllowed('user@gmail.com')).toBe(true);
      expect(isEmailDomainAllowed('admin@my-company.com')).toBe(true);
    });

    it('should reject emails from non-configured domains', () => {
      process.env.ALLOWED_EMAIL_DOMAINS = 'gmail.com,my-company.com';
      expect(isEmailDomainAllowed('user@other.com')).toBe(false);
      expect(isEmailDomainAllowed('admin@example.org')).toBe(false);
    });

    it('should be case-insensitive for email addresses', () => {
      process.env.ALLOWED_EMAIL_DOMAINS = 'gmail.com,my-company.com';
      expect(isEmailDomainAllowed('user@GMAIL.COM')).toBe(true);
      expect(isEmailDomainAllowed('admin@My-Company.COM')).toBe(true);
    });
  });

  describe('hasEmailDomainRestrictions', () => {
    it('should return false when ALLOWED_EMAIL_DOMAINS is not set', () => {
      delete process.env.ALLOWED_EMAIL_DOMAINS;
      expect(hasEmailDomainRestrictions()).toBe(false);
    });

    it('should return true when ALLOWED_EMAIL_DOMAINS is set', () => {
      process.env.ALLOWED_EMAIL_DOMAINS = 'gmail.com';
      expect(hasEmailDomainRestrictions()).toBe(true);
    });
  });
});

