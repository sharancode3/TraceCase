import crypto from 'node:crypto';

export interface BaselineComparisonResult {
  isEquivalent: boolean;
  expectedStateHash: string;
  observedStateHash: string;
  discrepancies: string[];
}

export class BaselineComparator {
  private static readonly DEFAULT_IGNORED_KEYS = new Set([
    'timestamp',
    'createdat',
    'updatedat',
    'lastmodified',
    'sessionid',
    'requesttimestamp',
    '_ts',
    'etag',
    'verifiedat',
  ]);

  /**
   * Recursively normalizes an object by sorting keys and pruning ignored volatile fields.
   */
  private static canonicalize(obj: unknown, ignoredKeys: Set<string>): unknown {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => BaselineComparator.canonicalize(item, ignoredKeys));
    }

    const sortedObj: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>).sort();

    for (const key of keys) {
      if (ignoredKeys.has(key.toLowerCase())) {
        continue;
      }
      sortedObj[key] = BaselineComparator.canonicalize(
        (obj as Record<string, unknown>)[key],
        ignoredKeys
      );
    }

    return sortedObj;
  }

  /**
   * Computes a deterministic SHA-256 digest of a canonicalized state projection.
   */
  public static computeStateHash(canonicalState: unknown): string {
    const serialized = JSON.stringify(canonicalState);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Pure deterministic comparison between expected baseline and observed readback baseline.
   */
  public static compareBaselines(
    expectedBaseline: Record<string, unknown>,
    observedBaseline: Record<string, unknown>,
    customIgnoredKeys?: string[]
  ): BaselineComparisonResult {
    const ignoredKeys = new Set(BaselineComparator.DEFAULT_IGNORED_KEYS);
    if (customIgnoredKeys && customIgnoredKeys.length > 0) {
      for (const k of customIgnoredKeys) {
        ignoredKeys.add(k.toLowerCase());
      }
    }

    const canonicalExpected = BaselineComparator.canonicalize(expectedBaseline, ignoredKeys);
    const canonicalObserved = BaselineComparator.canonicalize(observedBaseline, ignoredKeys);

    const expectedStateHash = BaselineComparator.computeStateHash(canonicalExpected);
    const observedStateHash = BaselineComparator.computeStateHash(canonicalObserved);

    const discrepancies: string[] = [];

    // Check specific critical semantic fields
    const expObj = canonicalExpected as Record<string, unknown>;
    const obsObj = canonicalObserved as Record<string, unknown>;

    for (const [key, expVal] of Object.entries(expObj)) {
      if (!(key in obsObj)) {
        discrepancies.push(`Missing key in observed baseline: '${key}'.`);
      } else {
        const obsVal = obsObj[key];
        const expJson = JSON.stringify(expVal);
        const obsJson = JSON.stringify(obsVal);
        if (expJson !== obsJson) {
          discrepancies.push(`Baseline mismatch at '${key}': expected ${expJson}, observed ${obsJson}.`);
        }
      }
    }

    for (const key of Object.keys(obsObj)) {
      if (!(key in expObj)) {
        discrepancies.push(`Unexpected additional key in observed baseline: '${key}'.`);
      }
    }

    const isEquivalent = discrepancies.length === 0 && expectedStateHash === observedStateHash;

    return {
      isEquivalent,
      expectedStateHash,
      observedStateHash,
      discrepancies,
    };
  }
}
