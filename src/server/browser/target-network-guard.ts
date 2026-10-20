import type { BrowserContext } from 'playwright';
import { SafeTargetProfile } from '@/contracts/targets';

export class TargetScopeViolationError extends Error {
  constructor(
    public readonly requestedUrl: string,
    public readonly targetBaseUrl: string,
    public readonly allowedOrigins: string[],
    public readonly reason: string
  ) {
    super(`[TargetNetworkGuard] Navigation to '${requestedUrl}' blocked: ${reason}`);
    this.name = 'TargetScopeViolationError';
  }
}

export class TargetNetworkGuard {
  private allowedOriginSet: Set<string>;
  private isLocalTargetAllowed: boolean;

  constructor(private target: SafeTargetProfile) {
    this.allowedOriginSet = new Set(
      target.allowedOrigins.map((o) => this.normalizeOrigin(o))
    );

    // Also include target.baseUrl origin
    try {
      const baseOrigin = new URL(target.baseUrl).origin;
      this.allowedOriginSet.add(this.normalizeOrigin(baseOrigin));
    } catch {
      // Ignore URL parse error on constructor, handled in validation
    }

    // Check if target baseUrl itself is local/staging exception (supporting IPv4 and IPv6 loopback variants)
    this.isLocalTargetAllowed = Array.from(this.allowedOriginSet).some(
      (origin) =>
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.includes('::1') ||
        origin.includes('[::1]') ||
        origin.includes('0.0.0.0')
    );
  }

  private normalizeOrigin(originOrUrl: string): string {
    try {
      const u = new URL(originOrUrl);
      return u.origin.toLowerCase();
    } catch {
      return originOrUrl.trim().toLowerCase();
    }
  }

  /**
   * Validates whether a URL is permitted to be navigated to or loaded as a subresource.
   * Enforces protocol, credentials, metadata service, and origin boundaries.
   */
  validateUrl(urlStr: string): { isAllowed: boolean; reason?: string } {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      return { isAllowed: false, reason: 'Malformed URL' };
    }

    // 1. Strict protocol check: only http and https (and data/blob for images/subresources if safe)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      if (urlStr === 'about:blank' || parsed.protocol === 'data:' || parsed.protocol === 'blob:') {
        return { isAllowed: true };
      }
      return { isAllowed: false, reason: `Unsupported protocol '${parsed.protocol}'` };
    }

    // 2. Disallow embedded credentials
    if (parsed.username || parsed.password) {
      return { isAllowed: false, reason: 'URL must not contain embedded user credentials' };
    }

    const host = parsed.hostname.toLowerCase();

    // 3. Block Cloud Provider Metadata IPs strictly (AWS, GCP, Azure, OpenStack)
    if (
      host === '169.254.169.254' ||
      host === 'metadata.google.internal' ||
      host === '169.254.169.253' ||
      host === '100.100.100.200'
    ) {
      return { isAllowed: false, reason: 'Cloud instance metadata endpoints are strictly blocked' };
    }

    // 4. Private / Loopback Guard with narrow explicit local target exception
    const rawHost = host.replace(/^\[|\]$/g, '');
    const isLoopback =
      rawHost === 'localhost' ||
      rawHost === '127.0.0.1' ||
      rawHost === '::1' ||
      rawHost === '0.0.0.0';
    if (isLoopback && !this.isLocalTargetAllowed) {
      return { isAllowed: false, reason: 'Local and loopback network addresses are blocked' };
    }

    // 5. Origin membership check
    const requestOrigin = parsed.origin.toLowerCase();
    if (!this.allowedOriginSet.has(requestOrigin)) {
      return {
        isAllowed: false,
        reason: `Origin '${requestOrigin}' is not in authorized target origins [${Array.from(this.allowedOriginSet).join(', ')}]`,
      };
    }

    return { isAllowed: true };
  }

  /**
   * Asserts URL is allowed or throws TargetScopeViolationError.
   */
  assertUrlAllowed(urlStr: string): void {
    const result = this.validateUrl(urlStr);
    if (!result.isAllowed) {
      throw new TargetScopeViolationError(
        urlStr,
        this.target.baseUrl,
        this.target.allowedOrigins,
        result.reason || 'Unauthorized destination'
      );
    }
  }

  /**
   * Installs route interception on a Playwright BrowserContext to block
   * any out-of-scope egress at network level.
   */
  async setupRouteInterception(context: BrowserContext): Promise<void> {
    await context.route('**/*', (route) => {
      const url = route.request().url();
      const check = this.validateUrl(url);
      if (!check.isAllowed) {
        route.abort('blockedbyclient').catch(() => {});
      } else {
        route.continue().catch(() => {});
      }
    });
  }
}
