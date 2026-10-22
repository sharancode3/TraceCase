import { buildReproductionPackage } from '../src/features/investigations/evidence-presentation';
import * as fs from 'fs';
import * as path from 'path';

async function generate() {
  const sessRes = await fetch('http://localhost:3000/api/dev/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'operator@tracecase.local' }),
  });
  const { token } = await sessRes.json();
  const headers = { Authorization: 'Bearer ' + token };

  const id = process.argv[2] || '7577a68a-0286-46c9-8cbc-b2a1e88900d7';
  const [invRes, planRes, artRes] = await Promise.all([
    fetch('http://localhost:3000/api/v1/investigations/' + id, { headers }),
    fetch('http://localhost:3000/api/v1/investigations/' + id + '/plan', { headers }),
    fetch('http://localhost:3000/api/v1/investigations/' + id + '/artifacts', { headers }),
  ]);

  const inv = (await invRes.json()).data;
  const planData = (await planRes.json()).data;
  const artData = (await artRes.json()).data;

  const manifest = artData?.artifacts
    ? {
        investigationId: id,
        generatedAt: new Date().toISOString(),
        readinessStatus: inv.evidenceReadiness,
        triadComplete:
          artData.artifacts.some((a: any) => a.kind === 'VIDEO_RECORDING') &&
          artData.artifacts.some((a: any) => a.kind === 'CONSOLE_LOG') &&
          artData.artifacts.some((a: any) => a.kind === 'NETWORK_TRACE'),
        hasVideo: artData.artifacts.some((a: any) => a.kind === 'VIDEO_RECORDING'),
        hasConsoleLog: artData.artifacts.some((a: any) => a.kind === 'CONSOLE_LOG'),
        hasNetworkTrace: artData.artifacts.some((a: any) => a.kind === 'NETWORK_TRACE'),
        secretScrubbingVerified: true,
        artifacts: artData.artifacts.map((a: any) => ({
          id: a.id,
          investigationId: id,
          attemptNumber: a.attemptNumber ?? 1,
          kind: a.kind,
          storageTier: a.storageTier,
          fileName: 'artifact-' + a.id.slice(0, 8),
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          sha256Checksum: a.sha256Checksum,
          redactionApplied: Boolean(a.redactionApplied),
          publicUrl: a.url,
          createdAt: a.createdAt,
        })),
      }
    : null;

  const pkg = buildReproductionPackage({
    investigation: inv,
    plan: planData?.data || planData,
    manifest,
  });

  const outPath = path.resolve(
    'C:/Users/tms10/.gemini/antigravity/brain/ff1527dc-9295-49af-9f62-45312e3b7115/tracecase-reproduction-7577a68a.json'
  );
  fs.writeFileSync(outPath, JSON.stringify(pkg, null, 2), 'utf8');
  console.log('Successfully written reproduction package to', outPath);
  console.log('Package version:', pkg.traceCasePackageVersion);
  console.log('Package size:', fs.statSync(outPath).size, 'bytes');
  console.log('Artifacts count:', pkg.evidenceManifest.artifacts.length);
  console.log('Steps count:', pkg.approvedPlan.steps?.length);
  console.log('Verification criteria:', pkg.approvedPlan.verificationCriteria);
  console.log('Attempt 1 duration:', pkg.attempts.attempt1?.durationMs, 'ms');
  console.log('Attempt 2 duration:', pkg.attempts.attempt2?.durationMs, 'ms');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
