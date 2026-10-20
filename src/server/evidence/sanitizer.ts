/**
 * TraceCase — Shared Sanitization and Data-Minimization Module (P3-02 / TC-INV-009)
 *
 * Provides deterministic, in-stream and structured sanitization for console logs,
 * network traces, model prompts, and evidence metadata.
 *
 * Implements:
 * - TC-INV-009: In-Stream Redaction (Bearer tokens, JWTs, passwords, PII)
 * - Safe URL parameter scrubbing (query secrets, path tokens, basic auth credentials)
 * - HTTP headers minimization (Authorization, Cookie, X-Api-Key, X-Access-Token)
 * - Structured object traversal with bounded recursion depth and Date/RegExp preservation
 * - Content size capping with accurate truncation metadata
 */

export interface SanitizationOptions {
  /** Maximum size in UTF-8 bytes before bounded truncation occurs. Defaults to 1 MB (1,048,576 bytes). */
  maxSizeBytes?: number;
  /** Maximum recursion depth when traversing structured objects. Defaults to 10. */
  maxDepth?: number;
}

export interface SanitizationResult<T> {
  safeContent: T;
  redactionsApplied: boolean;
  redactionCount: number;
  categoriesTriggered: string[];
  truncated: boolean;
  scanCompleted: boolean;
}

export const REDACTION_TOKENS = {
  BEARER_TOKEN: '[REDACTED_BEARER_TOKEN]',
  JWT_TOKEN: '[REDACTED_JWT_TOKEN]',
  SECRET: '[REDACTED_SECRET]',
  EMAIL: '[REDACTED_EMAIL]',
  CREDIT_CARD: '[REDACTED_CREDIT_CARD]',
  HEADER: '[REDACTED_HEADER]',
  COOKIE: '[REDACTED_COOKIE]',
  QUERY_PARAM: '[REDACTED]',
} as const;

interface RedactionRule {
  category: string;
  regex: RegExp;
  token: string | ((substring: string, ...args: unknown[]) => string);
}

/** Non-secret unquoted literals explicitly exempted from secret-assignment redaction */
const EXEMPT_UNQUOTED_VALUES = new Set([
  'null',
  'undefined',
  'false',
  'true',
  'none',
  'nil',
  'nan',
  'empty',
  '[redacted_secret]',
  '[redacted]',
  '%5bredacted%5d',
  '%5bredacted_secret%5d',
]);

const REDACTION_RULES: RedactionRule[] = [
  // 1. Authorization Bearer Tokens (high priority before generic words)
  {
    category: 'BEARER_TOKEN',
    regex: /bearer\s+[a-zA-Z0-9_\-.~+/]+=*/gi,
    token: REDACTION_TOKENS.BEARER_TOKEN,
  },
  // 2. JWTs (RFC 7519 3-part base64url format starting with eyJ)
  {
    category: 'JWT_TOKEN',
    regex: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/gi,
    token: REDACTION_TOKENS.JWT_TOKEN,
  },
  // 3. Explicit Key/Secret/Password/Token key-value assignments
  // Handles:
  // - Quoted: password="secret key with spaces", api_key='alpha,beta'
  // - Unquoted: password=supersecret, token=abc123xyz
  // - Exempts unquoted non-secret literals: token: null, password: false
  {
    category: 'SECRET_ASSIGNMENT',
    regex: /(api[_-]?key|secret|password|auth[_-]?token|access[_-]?token|refresh[_-]?token|user[_-]?token|token)(\s*[:=]\s*)(?:(['"])((?:\\.|(?!\3)[^\\])*)\3|([^\s,;&]+))/gi,
    token: (_match, key, sepAndSpace, quote, quotedVal, unquotedVal) => {
      if (quote) {
        // If already redacted, do not double-redact
        if (typeof quotedVal === 'string' && quotedVal === REDACTION_TOKENS.SECRET) {
          return _match;
        }
        return `${key}${sepAndSpace}${quote}${REDACTION_TOKENS.SECRET}${quote}`;
      }
      if (typeof unquotedVal === 'string') {
        const lower = unquotedVal.toLowerCase();
        if (EXEMPT_UNQUOTED_VALUES.has(lower)) {
          return _match;
        }
        return `${key}${sepAndSpace}${REDACTION_TOKENS.SECRET}`;
      }
      return _match;
    },
  },
  // 4. Email Addresses
  {
    category: 'EMAIL_ADDRESS',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,7}\b/g,
    token: REDACTION_TOKENS.EMAIL,
  },
  // 5. Credit Card Numbers (13 to 16 digits, with optional spaces or dashes)
  {
    category: 'CREDIT_CARD',
    regex: /\b(?:\d{4}[ -]?){3}\d{4}\b/g,
    token: REDACTION_TOKENS.CREDIT_CARD,
  },
];

const SENSITIVE_QUERY_PARAMS = new Set([
  'token',
  'auth',
  'key',
  'apikey',
  'api_key',
  'secret',
  'password',
  'access_token',
  'refresh_token',
  'auth_token',
  'client_secret',
  'session',
  'sessionid',
  'session_id',
  'sig',
  'signature',
]);

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'proxy-authorization',
  'x-auth-token',
  'x-access-token',
  'x-refresh-token',
  'session-token',
]);

const SENSITIVE_OBJECT_KEYS = new Set([
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'authtoken',
  'auth_token',
  'authorization',
  'cookie',
  'setcookie',
  'set_cookie',
  'creditcard',
  'credit_card',
  'cvv',
  'ssn',
]);

const DEFAULT_MAX_SIZE_BYTES = 1024 * 1024; // 1 MB
const DEFAULT_MAX_DEPTH = 10;

/**
 * Pure, deterministic text scrubber that replaces sensitive patterns in string content.
 * Idempotent: scrubText(scrubText(input)) === scrubText(input).
 */
export function scrubText(rawText: string): string {
  if (!rawText) return rawText;

  let sanitized = rawText;
  for (const { regex, token } of REDACTION_RULES) {
    regex.lastIndex = 0;
    if (typeof token === 'function') {
      sanitized = sanitized.replace(regex, token as (substring: string, ...args: unknown[]) => string);
    } else {
      sanitized = sanitized.replace(regex, token);
    }
  }
  return sanitized;
}

/**
 * Alias matching the document specification name (TC-VES-001 Section 12.2).
 */
export const scrubStreamText = scrubText;

/**
 * Accurately measures the length of a string in UTF-8 bytes.
 */
function getUtf8ByteLength(str: string): number {
  if (typeof Buffer !== 'undefined') {
    return Buffer.byteLength(str, 'utf8');
  }
  return new TextEncoder().encode(str).length;
}

/**
 * Truncates a string to at most `maxBytes` UTF-8 bytes without creating invalid Unicode,
 * broken surrogate pairs, or malformed multi-byte sequences.
 *
 * Memory optimization: Since every UTF-16 code unit occupies at least 1 UTF-8 byte,
 * characters beyond `maxBytes + 2` cannot be part of the first `maxBytes` bytes.
 * This bounds buffer allocation to O(maxBytes) even for multi-megabyte inputs.
 */
function truncateToUtf8Bytes(str: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  const candidate = str.length > maxBytes + 2 ? str.slice(0, maxBytes + 2) : str;
  const buf: Uint8Array =
    typeof Buffer !== 'undefined'
      ? Buffer.from(candidate, 'utf8')
      : new TextEncoder().encode(candidate);

  if (buf.length <= maxBytes && str.length <= maxBytes) return str;

  let i = Math.min(maxBytes, buf.length);
  // Walk backward if we land on a UTF-8 continuation byte (10xxxxxx)
  while (i > 0 && (buf[i] & 0xc0) === 0x80) {
    i--;
  }

  let end = maxBytes;
  if (i < maxBytes && i < buf.length) {
    const lead = buf[i];
    let expectedLen = 1;
    if ((lead & 0x80) === 0) {
      expectedLen = 1;
    } else if ((lead & 0xe0) === 0xc0) {
      expectedLen = 2;
    } else if ((lead & 0xf0) === 0xe0) {
      expectedLen = 3;
    } else if ((lead & 0xf8) === 0xf0) {
      expectedLen = 4;
    }
    if (i + expectedLen > maxBytes) {
      end = i;
    }
  }

  const sliced = buf.subarray(0, end);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(sliced).toString('utf8');
  }
  return new TextDecoder('utf-8').decode(sliced);
}

/**
 * Sanitizes bounded text with size capping, redaction counting, and coverage metadata.
 * Accurately sets `scanCompleted: false` when input is truncated.
 */
export function sanitizeText(
  rawText: string,
  options: SanitizationOptions = {}
): SanitizationResult<string> {
  const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;

  if (typeof rawText !== 'string') {
    return {
      safeContent: '',
      redactionsApplied: false,
      redactionCount: 0,
      categoriesTriggered: [],
      truncated: false,
      scanCompleted: true,
    };
  }

  let textToProcess = rawText;
  let truncated = false;

  // Accurately determine if truncation by UTF-8 bytes is required:
  // Short-circuit: if rawText.length > maxSizeBytes, byteLength >= length > maxSizeBytes.
  if (rawText.length > maxSizeBytes || getUtf8ByteLength(rawText) > maxSizeBytes) {
    textToProcess = truncateToUtf8Bytes(rawText, maxSizeBytes) + '\n[TRUNCATED: Exceeded max allowed size]';
    truncated = true;
  }

  let sanitized = textToProcess;
  let redactionCount = 0;
  const categoriesTriggered: string[] = [];

  for (const { category, regex, token } of REDACTION_RULES) {
    regex.lastIndex = 0;
    const matches = textToProcess.match(regex);
    if (matches && matches.length > 0) {
      redactionCount += matches.length;
      if (!categoriesTriggered.includes(category)) {
        categoriesTriggered.push(category);
      }
      if (typeof token === 'function') {
        sanitized = sanitized.replace(regex, token as (substring: string, ...args: unknown[]) => string);
      } else {
        sanitized = sanitized.replace(regex, token);
      }
    }
  }

  if (truncated && !categoriesTriggered.includes('TRUNCATED_CONTENT')) {
    categoriesTriggered.push('TRUNCATED_CONTENT');
  }

  return {
    safeContent: sanitized,
    redactionsApplied: redactionCount > 0,
    redactionCount,
    categoriesTriggered,
    truncated,
    scanCompleted: !truncated, // Truthful metadata: truncated input is an incomplete scan
  };
}

/**
 * Sanitizes a URL string:
 * 1. Redacts sensitive query parameters (handles duplicates and percent-encoding)
 * 2. Redacts Basic Auth passwords embedded in URL authority
 * 3. Scrubs sensitive tokens embedded in URL paths or usernames
 * 4. Falls back safely to text scrubbing on malformed inputs
 */
export function sanitizeUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;

  try {
    const isAbsolute = /^https?:\/\//i.test(rawUrl);
    const parsed = isAbsolute ? new URL(rawUrl) : new URL(rawUrl, 'http://localhost');

    // 1. Redact Basic Auth passwords embedded in the authority
    if (parsed.password) {
      parsed.password = REDACTION_TOKENS.SECRET;
    }

    // 2. Redact sensitive query parameters (safely handles duplicate keys without mutation skips)
    const uniqueKeys = Array.from(new Set(parsed.searchParams.keys()));
    for (const key of uniqueKeys) {
      if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
        const count = parsed.searchParams.getAll(key).length;
        parsed.searchParams.delete(key);
        for (let i = 0; i < count; i++) {
          parsed.searchParams.append(key, REDACTION_TOKENS.QUERY_PARAM);
        }
      }
    }

    let reconstructedUrl: string;
    if (isAbsolute) {
      reconstructedUrl = parsed.toString();
    } else {
      reconstructedUrl = parsed.pathname + parsed.search + parsed.hash;
    }

    // 3. Always run scrubText on the reconstructed URL to ensure path/username secrets are redacted
    return scrubText(reconstructedUrl);
  } catch {
    // Fallback: If URL parsing throws on malformed input, scrub as raw text
    return scrubText(rawUrl);
  }
}

/**
 * Minimizes HTTP headers by masking sensitive headers (e.g., Authorization, Cookie, X-Access-Token)
 * and scrubbing sensitive patterns in remaining header values. Matching is strictly case-insensitive.
 */
export function sanitizeHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;

    const lowerKey = key.toLowerCase();
    if (SENSITIVE_HEADERS.has(lowerKey)) {
      result[key] = REDACTION_TOKENS.HEADER;
      continue;
    }

    if (Array.isArray(value)) {
      result[key] = value.map((v) => scrubText(v));
    } else {
      result[key] = scrubText(value);
    }
  }

  return result;
}

/**
 * Recursively traverses structured JSON data or objects:
 * - Preserves Date and RegExp objects with their native representations
 * - Redacts sensitive object keys
 * - Scrubs nested string values
 * - Protects against circular references and deep recursion
 */
export function sanitizeStructuredData<T>(
  data: T,
  options: SanitizationOptions = {}
): SanitizationResult<T> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  let redactionCount = 0;
  const categoriesTriggered: string[] = [];
  const seenObjects = new WeakSet<object>();
  let hasTruncated = false;

  function traverse(value: unknown, depth: number): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (depth > maxDepth) {
      hasTruncated = true;
      if (!categoriesTriggered.includes('TRUNCATED_CONTENT')) {
        categoriesTriggered.push('TRUNCATED_CONTENT');
      }
      return '[MAX_DEPTH_EXCEEDED]';
    }

    // Preserve Date instances
    if (value instanceof Date) {
      return new Date(value.getTime());
    }

    // Preserve RegExp instances
    if (value instanceof RegExp) {
      return new RegExp(value.source, value.flags);
    }

    if (typeof value === 'string') {
      const scrubResult = sanitizeText(value, options);
      if (scrubResult.truncated) {
        hasTruncated = true;
      }
      if (scrubResult.redactionsApplied) {
        redactionCount += scrubResult.redactionCount;
      }
      for (const cat of scrubResult.categoriesTriggered) {
        if (!categoriesTriggered.includes(cat)) {
          categoriesTriggered.push(cat);
        }
      }
      return scrubResult.safeContent;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => traverse(item, depth + 1));
    }

    if (typeof value === 'object') {
      if (seenObjects.has(value)) {
        return '[CIRCULAR_REFERENCE]';
      }
      seenObjects.add(value);

      const cleanedObj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        const lowerKey = k.toLowerCase().replace(/[-_]/g, '');
        if (SENSITIVE_OBJECT_KEYS.has(lowerKey)) {
          cleanedObj[k] = REDACTION_TOKENS.SECRET;
          redactionCount++;
          if (!categoriesTriggered.includes('SENSITIVE_OBJECT_KEY')) {
            categoriesTriggered.push('SENSITIVE_OBJECT_KEY');
          }
        } else {
          cleanedObj[k] = traverse(v, depth + 1);
        }
      }
      return cleanedObj;
    }

    return value;
  }

  const safeContent = traverse(data, 0) as T;

  return {
    safeContent,
    redactionsApplied: redactionCount > 0,
    redactionCount,
    categoriesTriggered,
    truncated: hasTruncated,
    scanCompleted: !hasTruncated,
  };
}

/**
 * Secondary pattern-based verification oracle. Evaluates whether any known redaction
 * regex patterns match the provided text.
 *
 * IMPORTANT SECURITY LIMITATIONS:
 * - This is an automated pattern-matching check, NOT proof that arbitrary text is free of all secrets.
 * - It checks only the specific known regex rules in REDACTION_RULES.
 * - It must never be used alone to grant public access without authoritative access controls,
 *   tenant isolation, and audit logging.
 */
export function isContentClean(text: string): boolean {
  if (!text || typeof text !== 'string') return true;

  for (const rule of REDACTION_RULES) {
    rule.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = rule.regex.exec(text)) !== null) {
      if (rule.category === 'SECRET_ASSIGNMENT') {
        const quote = match[3];
        const quotedVal = match[4];
        const unquotedVal = match[5];

        if (quote && quotedVal === REDACTION_TOKENS.SECRET) {
          continue; // Already clean quoted value
        }
        if (unquotedVal && EXEMPT_UNQUOTED_VALUES.has(unquotedVal.toLowerCase())) {
          continue; // Exempt literal or already redacted
        }
        rule.regex.lastIndex = 0;
        return false;
      }

      // For Bearer, JWT, Email, Credit Card: any match indicates an unredacted secret
      rule.regex.lastIndex = 0;
      return false;
    }
    rule.regex.lastIndex = 0;
  }

  return true;
}
