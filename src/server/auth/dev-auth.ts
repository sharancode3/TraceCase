import fs from 'node:fs/promises';
import path from 'node:path';
import * as jose from 'jose';
import { getServerEnv } from '@/server/config/env';

export interface DevKeyPairData {
  kid: string;
  privateJwk: jose.JWK;
  publicJwk: jose.JWK;
}

const DEV_KEY_ID = 'dev-operator-key-1';
const DEV_STORAGE_DIR = path.resolve(process.cwd(), '.tracecase-storage');
const DEV_KEYS_PATH = path.join(DEV_STORAGE_DIR, 'dev-auth-keys.json');

let cachedPrivateKey: CryptoKey | Uint8Array | null = null;
let cachedPublicKey: CryptoKey | Uint8Array | null = null;
let cachedPublicJwk: jose.JWK | null = null;

/**
 * Asserts that development authentication is allowed in current environment.
 * Fails closed in production.
 */
export function assertDevAuthAllowed(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[Security] Development authentication is strictly forbidden in production.');
  }
}

/**
 * Loads or initializes a persistent local EdDSA (Ed25519) keypair for development session tokens.
 */
export async function getDevKeyPair(): Promise<{
  privateKey: CryptoKey | Uint8Array;
  publicKey: CryptoKey | Uint8Array;
  publicJwk: jose.JWK;
}> {
  assertDevAuthAllowed();

  if (cachedPrivateKey && cachedPublicKey && cachedPublicJwk) {
    return {
      privateKey: cachedPrivateKey,
      publicKey: cachedPublicKey,
      publicJwk: cachedPublicJwk,
    };
  }

  // 1. Try reading existing keys from persistent disk storage
  try {
    const raw = await fs.readFile(DEV_KEYS_PATH, 'utf-8');
    const data = JSON.parse(raw) as DevKeyPairData;
    if (data.privateJwk && data.publicJwk) {
      cachedPrivateKey = (await jose.importJWK(data.privateJwk, 'EdDSA')) as CryptoKey | Uint8Array;
      cachedPublicKey = (await jose.importJWK(data.publicJwk, 'EdDSA')) as CryptoKey | Uint8Array;
      cachedPublicJwk = data.publicJwk;
      return {
        privateKey: cachedPrivateKey,
        publicKey: cachedPublicKey,
        publicJwk: cachedPublicJwk,
      };
    }
  } catch {
    // Generate fresh keys below
  }

  // 2. Generate new Ed25519 keypair
  const { privateKey, publicKey } = await jose.generateKeyPair('EdDSA', { extractable: true });
  const privateJwk = await jose.exportJWK(privateKey);
  const publicJwk = await jose.exportJWK(publicKey);

  publicJwk.kid = DEV_KEY_ID;
  publicJwk.use = 'sig';
  publicJwk.alg = 'EdDSA';

  privateJwk.kid = DEV_KEY_ID;
  privateJwk.use = 'sig';
  privateJwk.alg = 'EdDSA';

  try {
    await fs.mkdir(DEV_STORAGE_DIR, { recursive: true });
    await fs.writeFile(
      DEV_KEYS_PATH,
      JSON.stringify({ kid: DEV_KEY_ID, privateJwk, publicJwk }, null, 2),
      'utf-8'
    );
  } catch {
    // Non-fatal if filesystem is read-only; in-memory keys will be used
  }

  cachedPrivateKey = privateKey as CryptoKey | Uint8Array;
  cachedPublicKey = publicKey as CryptoKey | Uint8Array;
  cachedPublicJwk = publicJwk;

  return {
    privateKey: cachedPrivateKey,
    publicKey: cachedPublicKey,
    publicJwk: cachedPublicJwk,
  };
}

/**
 * Returns public JWKS representing the local development token signer.
 */
export async function getDevPublicJwks(): Promise<{ keys: jose.JWK[] }> {
  const { publicJwk } = await getDevKeyPair();
  return {
    keys: [publicJwk],
  };
}

/**
 * Issues a genuine cryptographically signed JWT for the local development operator persona.
 */
export async function createDevOperatorToken(options?: {
  email?: string;
  subject?: string;
  roles?: string[];
  expiresIn?: string;
}): Promise<string> {
  assertDevAuthAllowed();
  const env = getServerEnv();
  const { privateKey } = await getDevKeyPair();

  const issuer = env.AUTH_ISSUER || `${env.APP_URL}/api/dev`;
  const audience = env.AUTH_AUDIENCE || 'tracecase-api';
  const email = options?.email || 'operator@tracecase.local';
  const sub = options?.subject || 'dev-operator-sub';
  const roles = options?.roles || ['operator', 'admin'];
  const expiresIn = options?.expiresIn || '24h';

  return new jose.SignJWT({
    email,
    roles,
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: DEV_KEY_ID })
    .setSubject(sub)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(privateKey);
}
