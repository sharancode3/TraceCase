/**
 * ============================================================================
 * TRACECASE PERSON 2: DEMO TARGET CONFIGURATION
 * ============================================================================
 */

export interface DemoTargetConfig {
  port: number;
  bugModeActive: boolean;
  buildVersion: string;
  resetSecret: string;
  isSandbox: boolean;
  allowFaultInjection: boolean;
}

export function loadDemoTargetConfig(overrides?: Partial<DemoTargetConfig>): DemoTargetConfig {
  const bugModeActive =
    overrides?.bugModeActive ??
    (process.env.DEMO_TARGET_BUG_MODE !== undefined
      ? process.env.DEMO_TARGET_BUG_MODE === 'true'
      : true);

  const buildVersion =
    overrides?.buildVersion ??
    process.env.DEMO_TARGET_BUILD_VERSION ??
    (bugModeActive ? 'v1.0.0-buggy' : 'v1.0.1-fixed');

  // Privileged reset secret: Missing, empty, or whitespace configuration disables
  // privileged target operations (fails closed). No implicit fallback string is permitted.
  const rawSecret =
    overrides?.resetSecret !== undefined
      ? overrides.resetSecret
      : (process.env.TARGET_RESET_SECRET ?? '');
  const resetSecret = typeof rawSecret === 'string' ? rawSecret.trim() : '';

  const isSandbox = overrides?.isSandbox ?? process.env.DEMO_TARGET_IS_SANDBOX !== 'false';

  // Fault injection is restricted to development/evaluation sandbox environments
  // and can be explicitly toggled via config override or DEMO_TARGET_ALLOW_FAULT_INJECTION.
  const allowFaultInjection =
    overrides?.allowFaultInjection !== undefined
      ? overrides.allowFaultInjection
      : process.env.DEMO_TARGET_ALLOW_FAULT_INJECTION !== undefined
        ? process.env.DEMO_TARGET_ALLOW_FAULT_INJECTION === 'true'
        : isSandbox;

  return {
    port: overrides?.port ?? parseInt(process.env.PORT || process.env.DEMO_TARGET_PORT || '3005', 10),
    bugModeActive,
    buildVersion,
    resetSecret,
    isSandbox,
    allowFaultInjection,
  };
}
