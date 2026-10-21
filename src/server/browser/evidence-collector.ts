import type { Page, ConsoleMessage, Request, Response } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface CapturedConsoleEntry {
  level: 'log' | 'warn' | 'error' | 'info';
  text: string;
  timestamp: string;
  pageId: string;
}

export interface CapturedNetworkEntry {
  requestId: string;
  method: string;
  url: string;
  resourceType: string;
  status?: number;
  isTransportFailure: boolean;
  failureText?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export class EvidenceCollector {
  private consoleEntries: CapturedConsoleEntry[] = [];
  private requestToEntry = new Map<Request, CapturedNetworkEntry>();
  private allNetworkEntries: CapturedNetworkEntry[] = [];
  private networkFailures: Array<{
    url: string;
    method: string;
    status?: number;
    failureText?: string;
    isTransportFailure: boolean;
    timestamp: string;
  }> = [];
  private listenerInstalled = false;
  private droppedConsoleCount = 0;
  private droppedNetworkCount = 0;

  constructor(
    private investigationId: string,
    private attemptNumber: 1 | 2,
    private stagingDir: string
  ) {}

  /**
   * Sanitizes sensitive credentials, tokens, and secrets from recorded log text.
   */
  private sanitizeText(raw: string): string {
    return raw
      .replace(/bearer\s+[a-zA-Z0-9_\-\.]{10,}/gi, 'Bearer [REDACTED]')
      .replace(/(password|secret|token|api_key|apiKey)=([^&\s]+)/gi, '$1=[REDACTED]')
      .replace(/basic\s+[a-zA-Z0-9+/=]{10,}/gi, 'Basic [REDACTED]')
      .slice(0, 500);
  }

  /**
   * Attaches listeners to a page before navigation begins.
   */
  attachPageListeners(page: Page, pageId: string = 'page-1'): void {
    this.listenerInstalled = true;

    page.on('console', (msg: ConsoleMessage) => {
      if (this.consoleEntries.length >= 1000) {
        this.droppedConsoleCount++;
        return;
      }

      const type = msg.type();
      const level: 'log' | 'warn' | 'error' | 'info' =
        type === 'error' ? 'error' : type === 'warning' ? 'warn' : type === 'info' ? 'info' : 'log';

      this.consoleEntries.push({
        level,
        text: this.sanitizeText(msg.text()),
        timestamp: new Date().toISOString(),
        pageId,
      });
    });

    page.on('pageerror', (err: Error) => {
      this.consoleEntries.push({
        level: 'error',
        text: this.sanitizeText(`Uncaught Page Error: ${err.message}`),
        timestamp: new Date().toISOString(),
        pageId,
      });
    });

    // Keyed by actual Playwright Request object to avoid overwriting concurrent/repeated requests to the same URL
    page.on('request', (req: Request) => {
      if (this.allNetworkEntries.length >= 1000) {
        this.droppedNetworkCount++;
        return;
      }

      const reqId = `${pageId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const safeUrl = this.sanitizeText(req.url());

      const entry: CapturedNetworkEntry = {
        requestId: reqId,
        method: req.method(),
        url: safeUrl,
        resourceType: req.resourceType(),
        isTransportFailure: false,
        startedAt: new Date().toISOString(),
      };

      this.requestToEntry.set(req, entry);
      this.allNetworkEntries.push(entry);
    });

    page.on('response', (res: Response) => {
      const entry = this.requestToEntry.get(res.request());
      if (entry) {
        const completedAt = new Date().toISOString();
        const startMs = new Date(entry.startedAt).getTime();
        entry.status = res.status();
        entry.completedAt = completedAt;
        entry.durationMs = Math.max(0, Date.now() - startMs);

        // Track HTTP client/server errors (distinct from transport failure)
        if (res.status() >= 400) {
          this.networkFailures.push({
            url: entry.url,
            method: entry.method,
            status: res.status(),
            isTransportFailure: false,
            timestamp: completedAt,
          });
        }
      }
    });

    page.on('requestfailed', (req: Request) => {
      const entry = this.requestToEntry.get(req);
      if (entry) {
        entry.isTransportFailure = true;
        entry.failureText = req.failure()?.errorText || 'Transport Failure';
        entry.completedAt = new Date().toISOString();

        this.networkFailures.push({
          url: entry.url,
          method: entry.method,
          status: undefined, // Distinct from an HTTP status code
          failureText: entry.failureText,
          isTransportFailure: true,
          timestamp: entry.completedAt,
        });
      }
    });
  }

  getRecentConsole(count: number = 20): Array<{ level: 'log' | 'warn' | 'error' | 'info'; text: string; timestamp: string }> {
    return this.consoleEntries.slice(-count).map((e) => ({
      level: e.level,
      text: e.text,
      timestamp: e.timestamp,
    }));
  }

  getRecentNetworkFailures(count: number = 10): Array<{ url: string; method: string; status: number; timestamp: string }> {
    return this.networkFailures.slice(-count).map((f) => ({
      url: f.url,
      method: f.method,
      status: f.status ?? 0,
      timestamp: f.timestamp,
    }));
  }

  getAllNetworkEntries(): readonly CapturedNetworkEntry[] {
    return this.allNetworkEntries;
  }

  getAllConsoleEntries(): readonly CapturedConsoleEntry[] {
    return this.consoleEntries;
  }

  findNetworkEntry(urlSubstringOrPattern: string): CapturedNetworkEntry | undefined {
    return this.allNetworkEntries.find((e) => e.url.includes(urlSubstringOrPattern));
  }

  isCoverageComplete(): boolean {
    return this.listenerInstalled && this.droppedConsoleCount === 0 && this.droppedNetworkCount === 0;
  }

  /**
   * Flushes logs to private disk staging directory and returns coverage metadata.
   */
  async finalizeEvidence(): Promise<{
    consolePath?: string;
    networkPath?: string;
    hasConsoleLogs: boolean;
    consoleStatus: 'CAPTURED_WITH_ENTRIES' | 'CAPTURED_EMPTY' | 'CAPTURE_FAILED' | 'UNAVAILABLE';
    hasNetworkTrace: boolean;
    networkStatus: 'CAPTURED_WITH_REQUESTS' | 'CAPTURED_EMPTY' | 'CAPTURE_FAILED' | 'UNAVAILABLE';
  }> {
    if (!this.listenerInstalled) {
      return {
        hasConsoleLogs: false,
        consoleStatus: 'UNAVAILABLE',
        hasNetworkTrace: false,
        networkStatus: 'UNAVAILABLE',
      };
    }

    await fs.mkdir(this.stagingDir, { recursive: true });

    let consolePath: string | undefined;
    let consoleStatus: 'CAPTURED_WITH_ENTRIES' | 'CAPTURED_EMPTY' | 'CAPTURE_FAILED' = 'CAPTURED_EMPTY';

    try {
      consolePath = path.join(this.stagingDir, `console-attempt-${this.attemptNumber}.json`);
      await fs.writeFile(consolePath, JSON.stringify(this.consoleEntries, null, 2), 'utf-8');
      consoleStatus = this.consoleEntries.length > 0 ? 'CAPTURED_WITH_ENTRIES' : 'CAPTURED_EMPTY';
    } catch {
      consoleStatus = 'CAPTURE_FAILED';
    }

    let networkPath: string | undefined;
    let networkStatus: 'CAPTURED_WITH_REQUESTS' | 'CAPTURED_EMPTY' | 'CAPTURE_FAILED' = 'CAPTURED_EMPTY';

    try {
      networkPath = path.join(this.stagingDir, `network-attempt-${this.attemptNumber}.json`);
      await fs.writeFile(networkPath, JSON.stringify(this.allNetworkEntries, null, 2), 'utf-8');
      networkStatus = this.allNetworkEntries.length > 0 ? 'CAPTURED_WITH_REQUESTS' : 'CAPTURED_EMPTY';
    } catch {
      networkStatus = 'CAPTURE_FAILED';
    }

    return {
      consolePath,
      networkPath,
      hasConsoleLogs: consoleStatus === 'CAPTURED_WITH_ENTRIES',
      consoleStatus,
      hasNetworkTrace: networkStatus === 'CAPTURED_WITH_REQUESTS',
      networkStatus,
    };
  }
}
