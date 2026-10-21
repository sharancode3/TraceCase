import { describe, it, expect } from 'vitest';
import {
  scrubText,
  scrubStreamText,
  sanitizeText,
  sanitizeUrl,
  sanitizeHeaders,
  sanitizeStructuredData,
  isContentClean,
  REDACTION_TOKENS,
} from '@/server/evidence/sanitizer';

describe('Shared Sanitization and Minimization Module (P3-02 / TC-INV-009)', () => {
  describe('TC4: In-Stream Bearer and JWT Token Scrubbing', () => {
    it('redacts Bearer tokens and JWTs in console log streams', () => {
      const rawConsoleMessage =
        'Console Error: Request failed with header Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.do_not_leak_signature';

      const scrubbed = scrubStreamText(rawConsoleMessage);

      // Raw secrets must not appear anywhere in the sanitized text
      expect(scrubbed).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(scrubbed).not.toContain('do_not_leak_signature');

      // The formal redaction token must be present
      expect(scrubbed).toContain(REDACTION_TOKENS.BEARER_TOKEN);
    });

    it('redacts standalone JWT tokens outside of Bearer strings', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsaWNlIn0.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ';
      const input = `User session token found in local storage: ${jwt}`;

      const scrubbed = scrubText(input);
      expect(scrubbed).not.toContain('TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ');
      expect(scrubbed).toContain(REDACTION_TOKENS.JWT_TOKEN);
    });
  });

  describe('Explicit Key, Password, and Secret Assignments', () => {
    it('redacts quoted secrets containing spaces or commas without exposing suffixes', () => {
      const logWithSpaces = 'Connecting with password="secret key with spaces" and active=true';
      const logWithCommas = "Config: api_key='alpha,beta,gamma' in region us-east";

      const scrubbedSpaces = scrubText(logWithSpaces);
      const scrubbedCommas = scrubText(logWithCommas);

      // The entire quoted string must be replaced, with no leftover suffix
      expect(scrubbedSpaces).not.toContain('secret key with spaces');
      expect(scrubbedSpaces).not.toContain('with spaces');
      expect(scrubbedSpaces).toContain('password="[REDACTED_SECRET]"');
      expect(scrubbedSpaces).toContain('active=true');

      expect(scrubbedCommas).not.toContain('alpha,beta,gamma');
      expect(scrubbedCommas).not.toContain('beta');
      expect(scrubbedCommas).toContain("api_key='[REDACTED_SECRET]'");
      expect(scrubbedCommas).toContain('in region us-east');
    });

    it('redacts quoted secrets containing escaped quotes without splitting or leaking suffixes', () => {
      const logWithEscapedDouble = 'Connecting with password="abc\\"def" and active=true';
      const logWithEscapedSingle = "Config: api_key='abc\\'def' in test run";

      const scrubbedDouble = scrubText(logWithEscapedDouble);
      const scrubbedSingle = scrubText(logWithEscapedSingle);

      expect(scrubbedDouble).not.toContain('abc');
      expect(scrubbedDouble).not.toContain('def');
      expect(scrubbedDouble).toContain('password="[REDACTED_SECRET]"');
      expect(scrubbedDouble).toContain('active=true');

      expect(scrubbedSingle).not.toContain('abc');
      expect(scrubbedSingle).not.toContain('def');
      expect(scrubbedSingle).toContain("api_key='[REDACTED_SECRET]'");

      // Verify isContentClean correctly flags escaped-quote secrets as dirty
      expect(isContentClean(logWithEscapedDouble)).toBe(false);
      expect(isContentClean(scrubbedDouble)).toBe(true);
    });

    it('redacts unquoted secrets and empty quoted secrets', () => {
      const log1 = 'user_token=secret_val_12345; session=active';
      const log2 = 'User login request with password="" in auth request';

      const scrubbed1 = scrubText(log1);
      const scrubbed2 = scrubText(log2);

      expect(scrubbed1).not.toContain('secret_val_12345');
      expect(scrubbed1).toContain('user_token=[REDACTED_SECRET]');
      expect(scrubbed2).toContain('password="[REDACTED_SECRET]"');
    });

    it('exempts non-secret literals like null, undefined, false, and true when unquoted', () => {
      const diagnosticLog = 'Diagnostics: token: null, password: undefined, auth_token: false, secret: none';
      const scrubbed = scrubText(diagnosticLog);

      // Diagnostic indicators must be preserved to avoid misleading developers
      expect(scrubbed).toContain('token: null');
      expect(scrubbed).toContain('password: undefined');
      expect(scrubbed).toContain('auth_token: false');
      expect(scrubbed).toContain('secret: none');
    });

    it('does not corrupt ordinary non-secret text mentioning the word token or secret', () => {
      const normalText = 'Total token count is 150 items. The algorithm uses secret key concepts.';
      const scrubbed = scrubText(normalText);

      // Non-assignment mentions should remain untouched
      expect(scrubbed).toBe(normalText);
    });
  });

  describe('PII Redaction: Email Addresses and Credit Cards', () => {
    it('redacts email addresses', () => {
      const input = 'Exception encountered for user john.doe@corp.example.com while querying records.';
      const scrubbed = scrubText(input);

      expect(scrubbed).not.toContain('john.doe@corp.example.com');
      expect(scrubbed).toContain(REDACTION_TOKENS.EMAIL);
    });

    it('redacts credit card numbers', () => {
      const input = 'Payment error for card 4532-1234-5678-9012 during checkout.';
      const scrubbed = scrubText(input);

      expect(scrubbed).not.toContain('4532-1234-5678-9012');
      expect(scrubbed).toContain(REDACTION_TOKENS.CREDIT_CARD);
    });
  });

  describe('URL Sanitization', () => {
    it('redacts path secrets and query parameters simultaneously', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature_payload_123';
      const url = `https://app.corp/api/v1/sessions/${jwt}/refresh?token=my_secret_token&user=john`;
      const sanitized = sanitizeUrl(url);

      // Both path JWT and query token must be redacted
      expect(sanitized).not.toContain('signature_payload_123');
      expect(sanitized).not.toContain('my_secret_token');
      expect(sanitized).toContain(REDACTION_TOKENS.JWT_TOKEN);
      expect(sanitized).toContain('token=%5BREDACTED%5D');
      expect(sanitized).toContain('user=john');
    });

    it('redacts Basic Authentication credentials embedded in URL authority', () => {
      const url = 'https://admin_user:superSecretPassword99@staging.corp/dashboard';
      const sanitized = sanitizeUrl(url);

      expect(sanitized).not.toContain('superSecretPassword99');
      expect(sanitized).toContain('admin_user');
      expect(sanitized).toContain('/dashboard');
    });

    it('redacts duplicate and repeated sensitive query parameters without skipping', () => {
      const url = 'https://api.corp/auth?token=first_secret&token=second_secret&safe=true';
      const sanitized = sanitizeUrl(url);

      expect(sanitized).not.toContain('first_secret');
      expect(sanitized).not.toContain('second_secret');
      expect(sanitized).toContain('safe=true');
      // Both instances must be redacted as %5BREDACTED%5D
      const matches = sanitized.match(/%5BREDACTED%5D/g);
      expect(matches?.length).toBe(2);
    });

    it('handles relative URLs and malformed inputs safely', () => {
      const relative = '/tasks?action=filter&session=xyz999';
      const sanitizedRelative = sanitizeUrl(relative);
      expect(sanitizedRelative).not.toContain('xyz999');
      expect(sanitizedRelative).toContain('action=filter');
      expect(sanitizedRelative).toContain('session=%5BREDACTED%5D');

      // Malformed URL with spaces and unquoted token falls back to text scrubbing
      const malformed = 'https://invalid host with spaces and token=unquoted_secret_val';
      const sanitizedMalformed = sanitizeUrl(malformed);
      expect(sanitizedMalformed).not.toContain('unquoted_secret_val');
      expect(sanitizedMalformed).toContain('token=[REDACTED_SECRET]');
    });
  });

  describe('HTTP Header Minimization', () => {
    it('replaces sensitive headers with [REDACTED_HEADER] including mixed case and access tokens', () => {
      const headers = {
        'content-type': 'application/json',
        Authorization: 'Bearer test-token-123',
        Cookie: 'session_id=sess_abcdef',
        'X-Access-Token': 'access-token-999',
        'x-refresh-token': 'refresh-token-888',
        'API-KEY': 'custom-api-key',
        'X-Trace-Id': 'trace-001',
      };

      const sanitized = sanitizeHeaders(headers);

      expect(sanitized['Authorization']).toBe(REDACTION_TOKENS.HEADER);
      expect(sanitized['Cookie']).toBe(REDACTION_TOKENS.HEADER);
      expect(sanitized['X-Access-Token']).toBe(REDACTION_TOKENS.HEADER);
      expect(sanitized['x-refresh-token']).toBe(REDACTION_TOKENS.HEADER);
      expect(sanitized['API-KEY']).toBe(REDACTION_TOKENS.HEADER);
      expect(sanitized['content-type']).toBe('application/json');
      expect(sanitized['X-Trace-Id']).toBe('trace-001');
    });
  });

  describe('Structured JSON and Object Traversal', () => {
    it('preserves Date and RegExp objects while redacting sensitive properties', () => {
      const testDate = new Date('2026-10-20T10:00:00.000Z');
      const testRegex = /^[a-z0-9]+$/i;

      const payload = {
        id: 'evt-001',
        createdAt: testDate,
        validator: testRegex,
        user: {
          name: 'Alice',
          password: 'plain-text-password',
        },
      };

      const result = sanitizeStructuredData(payload);

      expect(result.redactionsApplied).toBe(true);
      expect(result.safeContent.user.password).toBe(REDACTION_TOKENS.SECRET);

      // Date must be preserved as a Date instance with matching timestamp
      expect(result.safeContent.createdAt).toBeInstanceOf(Date);
      expect(result.safeContent.createdAt.getTime()).toBe(testDate.getTime());

      // RegExp must be preserved as a RegExp instance with matching source and flags
      expect(result.safeContent.validator).toBeInstanceOf(RegExp);
      expect(result.safeContent.validator.source).toBe(testRegex.source);
      expect(result.safeContent.validator.flags).toBe(testRegex.flags);
    });

    it('prevents infinite loops on circular references', () => {
      const circular: Record<string, unknown> = { name: 'Root' };
      circular.self = circular;

      const result = sanitizeStructuredData(circular);
      expect(result.safeContent.self).toBe('[CIRCULAR_REFERENCE]');
    });

    it('bounds recursion depth on deeply nested structures', () => {
      let deep: Record<string, unknown> = { leaf: 'target' };
      for (let i = 0; i < 15; i++) {
        deep = { next: deep };
      }

      const result = sanitizeStructuredData(deep, { maxDepth: 5 });
      expect(JSON.stringify(result.safeContent)).toContain('[MAX_DEPTH_EXCEEDED]');
      expect(result.truncated).toBe(true);
      expect(result.scanCompleted).toBe(false);
      expect(result.categoriesTriggered).toContain('TRUNCATED_CONTENT');
    });

    it('aggregates nested string truncation into top-level metadata and scanCompleted', () => {
      const payloadWithLongString = {
        id: 'msg-001',
        details: {
          logMessage: 'Very long diagnostic message '.repeat(50),
        },
      };

      const result = sanitizeStructuredData(payloadWithLongString, { maxSizeBytes: 50 });
      expect(result.truncated).toBe(true);
      expect(result.scanCompleted).toBe(false);
      expect(result.categoriesTriggered).toContain('TRUNCATED_CONTENT');
      expect(result.safeContent.details.logMessage).toContain('[TRUNCATED: Exceeded max allowed size]');
    });
  });

  describe('Bounded Size Limits and Truncation Metadata', () => {
    it('accurately sets scanCompleted to false when input is truncated', () => {
      const longText = 'Log entry message. '.repeat(100);
      const result = sanitizeText(longText, { maxSizeBytes: 100 });

      expect(result.truncated).toBe(true);
      // TRUTHFULNESS: scanCompleted must be false when truncated
      expect(result.scanCompleted).toBe(false);
      expect(result.categoriesTriggered).toContain('TRUNCATED_CONTENT');
      expect(result.safeContent).toContain('[TRUNCATED: Exceeded max allowed size]');
    });

    it('measures size limit in UTF-8 bytes rather than UTF-16 code units for multibyte Unicode and emojis', () => {
      // Emoji 🔥: 2 UTF-16 code units, but 4 UTF-8 bytes
      // Three fire emojis: 6 chars in JS, but 12 UTF-8 bytes
      const emojis = '🔥🔥🔥';

      // Setting maxSizeBytes to 10:
      // In UTF-16 chars, 6 < 10 (would NOT truncate under JS .length bug).
      // In UTF-8 bytes, 12 > 10 (MUST truncate to 2 emojis = 8 bytes, avoiding surrogate pair split).
      const result = sanitizeText(emojis, { maxSizeBytes: 10 });
      expect(result.truncated).toBe(true);
      expect(result.scanCompleted).toBe(false);
      expect(result.categoriesTriggered).toContain('TRUNCATED_CONTENT');
      expect(result.safeContent).toContain('🔥🔥\n[TRUNCATED: Exceeded max allowed size]');

      const retainedPrefix = result.safeContent.split('\n')[0];
      expect(Buffer.byteLength(retainedPrefix, 'utf8')).toBe(8);

      // Multibyte CJK characters (3 UTF-8 bytes each)
      // '你好世界' = 4 characters, 12 UTF-8 bytes
      const cjk = '你好世界';
      const cjkResult = sanitizeText(cjk, { maxSizeBytes: 7 }); // fits 2 chars = 6 bytes
      expect(cjkResult.truncated).toBe(true);
      expect(cjkResult.scanCompleted).toBe(false);
      const cjkPrefix = cjkResult.safeContent.split('\n')[0];
      expect(cjkPrefix).toBe('你好');
      expect(Buffer.byteLength(cjkPrefix, 'utf8')).toBe(6);
    });

    it('redacts retained credentials near the truncation boundary and marks scan as incomplete', () => {
      const padding = 'X'.repeat(30);
      const secret = 'password="superSecretValue12345"';
      const input = padding + secret; // 30 + 32 = 62 bytes

      // Truncate at 45 bytes (cuts right inside the secret)
      const result = sanitizeText(input, { maxSizeBytes: 45 });
      expect(result.truncated).toBe(true);
      expect(result.scanCompleted).toBe(false);
      expect(result.categoriesTriggered).toContain('TRUNCATED_CONTENT');
      // The retained secret prefix must be redacted, not left in the clear
      expect(result.safeContent).not.toContain('superSecretValue');
      expect(result.safeContent).toContain('password=[REDACTED_SECRET]');
    });
  });

  describe('Idempotence and Clean-Content Check', () => {
    it('is strictly idempotent across repeated sanitizations', () => {
      const dirty = 'Error Authorization: Bearer token-12345678 and email user@corp.com password="my secret"';
      const pass1 = scrubText(dirty);
      const pass2 = scrubText(pass1);

      expect(pass1).toBe(pass2);
      expect(isContentClean(pass1)).toBe(true);
    });

    it('isContentClean detects unredacted tokens and confirms clean tokens', () => {
      const dirty = 'Auth: Bearer secret-token-xyz';
      const clean = 'Auth: Bearer [REDACTED_BEARER_TOKEN]';

      expect(isContentClean(dirty)).toBe(false);
      expect(isContentClean(clean)).toBe(true);
    });
  });
});
