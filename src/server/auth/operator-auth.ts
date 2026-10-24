import * as jose from 'jose';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getServerEnv } from '@/server/config/env';

export interface OperatorKeyPairData {
  kid: string;
  privateJwk: jose.JWK;
  publicJwk: jose.JWK;
}

export const OPERATOR_KEY_ID = 'tc-operator-key-1';
const STORAGE_DIR = path.resolve(process.cwd(), '.tracecase-storage');
const KEYS_PATH = path.join(STORAGE_DIR, 'operator-auth-keys.json');

let cachedPrivateKey: CryptoKey | Uint8Array | null = null;
let cachedPublicKey: CryptoKey | Uint8Array | null = null;
let cachedPublicJwk: jose.JWK | null = null;

/**
 * Loads or initializes a persistent EdDSA (Ed25519) keypair for operator session tokens.
 */
export async function getOperatorKeyPair(): Promise<{
  privateKey: CryptoKey | Uint8Array;
  publicKey: CryptoKey | Uint8Array;
  publicJwk: jose.JWK;
}> {
  if (cachedPrivateKey && cachedPublicKey && cachedPublicJwk) {
    return {
      privateKey: cachedPrivateKey,
      publicKey: cachedPublicKey,
      publicJwk: cachedPublicJwk,
    };
  }

  // 1. Try reading existing keys from persistent disk storage
  try {
    const raw = await fs.readFile(KEYS_PATH, 'utf-8');
    const data = JSON.parse(raw) as OperatorKeyPairData;
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

  publicJwk.kid = OPERATOR_KEY_ID;
  publicJwk.use = 'sig';
  publicJwk.alg = 'EdDSA';

  privateJwk.kid = OPERATOR_KEY_ID;
  privateJwk.use = 'sig';
  privateJwk.alg = 'EdDSA';

  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
    await fs.writeFile(
      KEYS_PATH,
      JSON.stringify({ kid: OPERATOR_KEY_ID, privateJwk, publicJwk }, null, 2),
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
 * Returns public JWKS representing the operator token signer.
 */
export async function getOperatorPublicJwks(): Promise<{ keys: jose.JWK[] }> {
  const { publicJwk } = await getOperatorKeyPair();
  return {
    keys: [publicJwk],
  };
}

/**
 * Issues a genuine cryptographically signed JWT for the authenticated operator.
 */
export async function createOperatorToken(options?: {
  email?: string;
  subject?: string;
  roles?: string[];
  expiresIn?: string;
}): Promise<string> {
  const env = getServerEnv();
  const { privateKey } = await getOperatorKeyPair();

  const issuer = env.AUTH_ISSUER || `${env.APP_URL}/api/auth`;
  const audience = env.AUTH_AUDIENCE || 'tracecase-api';
  const email = options?.email || 'operator@tracecase.local';
  const sub = options?.subject || `op-${Buffer.from(email).toString('base64').replace(/=/g, '')}`;
  const roles = options?.roles || ['operator', 'admin'];
  const expiresIn = options?.expiresIn || '24h';

  return new jose.SignJWT({
    email,
    roles,
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: OPERATOR_KEY_ID })
    .setSubject(sub)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(privateKey);
}
