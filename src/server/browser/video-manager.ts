import type { Page } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { CaptureCoverageReceipt } from '@/contracts/evidence';

export interface FinalizedVideoInfo {
  pageId: string;
  videoPath: string;
  sizeBytes: number;
  sha256Checksum: string;
}

export class VideoManager {
  private trackedPages = new Map<string, Page>();
  private videoDir: string;

  constructor(
    private investigationId: string,
    private attemptNumber: 1 | 2,
    private stagingDir: string
  ) {
    this.videoDir = path.join(this.stagingDir, 'videos');
  }

  getVideoDir(): string {
    return this.videoDir;
  }

  async initialize(): Promise<void> {
    // Ensure clean, isolated namespace for this attempt; remove any residual files
    await fs.rm(this.videoDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(this.videoDir, { recursive: true });
  }

  /**
   * Tracks a page created in the context for video resolution after close.
   */
  trackPage(page: Page, pageId: string = 'page-1'): void {
    this.trackedPages.set(pageId, page);
  }

  /**
   * Finalizes video recordings after context closure, verifying on-disk integrity.
   * Strictly matches tracked pages for this attempt, rejecting leftover files.
   */
  async finalizeVideos(contextCrashed: boolean = false): Promise<{
    videos: FinalizedVideoInfo[];
    videoStatus: 'FINALIZED' | 'MISSING' | 'UNFINALIZED_CORRUPT' | 'CONTEXT_CRASH';
    primaryVideo?: FinalizedVideoInfo;
  }> {
    if (contextCrashed) {
      return {
        videos: [],
        videoStatus: 'CONTEXT_CRASH',
      };
    }

    const finalizedVideos: FinalizedVideoInfo[] = [];

    for (const [pageId, page] of this.trackedPages.entries()) {
      try {
        const video = page.video();
        if (!video) continue;

        let videoPath: string;
        try {
          videoPath = await video.path();
        } catch {
          // If video.path() fails because page wasn't closed or crashed
          continue;
        }

        if (!videoPath) continue;

        const stat = await fs.stat(videoPath).catch(() => null);
        if (!stat || stat.size === 0) {
          // File is missing or empty (0 bytes)
          continue;
        }

        const buffer = await fs.readFile(videoPath);
        const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

        finalizedVideos.push({
          pageId,
          videoPath,
          sizeBytes: stat.size,
          sha256Checksum: sha256,
        });
      } catch {
        // Ignored, handled by overall status evaluation below
      }
    }

    if (finalizedVideos.length > 0) {
      return {
        videos: finalizedVideos,
        videoStatus: 'FINALIZED',
        primaryVideo: finalizedVideos[0],
      };
    }

    // Check if any 0-byte corrupt files were generated
    try {
      const files = await fs.readdir(this.videoDir).catch(() => []);
      for (const file of files) {
        const filePath = path.join(this.videoDir, file);
        const stat = await fs.stat(filePath).catch(() => null);
        if (stat && stat.size === 0) {
          return {
            videos: [],
            videoStatus: 'UNFINALIZED_CORRUPT',
          };
        }
      }
    } catch {
      // Ignore
    }

    return {
      videos: [],
      videoStatus: 'MISSING',
    };
  }

  /**
   * Combines video results and collector results into a verified CaptureCoverageReceipt.
   */
  buildCoverageReceipt(params: {
    videoStatus: 'FINALIZED' | 'MISSING' | 'UNFINALIZED_CORRUPT' | 'CONTEXT_CRASH';
    hasConsoleLogs: boolean;
    consoleStatus: 'CAPTURED_WITH_ENTRIES' | 'CAPTURED_EMPTY' | 'CAPTURE_FAILED' | 'UNAVAILABLE';
    hasNetworkTrace: boolean;
    networkStatus: 'CAPTURED_WITH_REQUESTS' | 'CAPTURED_EMPTY' | 'CAPTURE_FAILED' | 'UNAVAILABLE';
  }): CaptureCoverageReceipt {
    const isVideoOk = params.videoStatus === 'FINALIZED';
    const isConsoleOk =
      params.consoleStatus === 'CAPTURED_WITH_ENTRIES' || params.consoleStatus === 'CAPTURED_EMPTY';
    const isNetworkOk =
      params.networkStatus === 'CAPTURED_WITH_REQUESTS' || params.networkStatus === 'CAPTURED_EMPTY';

    return {
      investigationId: this.investigationId,
      attemptNumber: this.attemptNumber,
      hasVideoRecording: isVideoOk,
      videoStatus: params.videoStatus,
      hasConsoleLogs: params.hasConsoleLogs,
      consoleStatus: params.consoleStatus,
      hasNetworkTrace: params.hasNetworkTrace,
      networkStatus: params.networkStatus,
      coverageComplete: isVideoOk && isConsoleOk && isNetworkOk,
    };
  }
}
