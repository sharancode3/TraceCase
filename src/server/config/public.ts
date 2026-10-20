/**
 * Browser-Safe Configuration
 * Strictly exposes non-sensitive flags and URLs to client components.
 * Contains ZERO secrets, provider keys, or private storage credentials.
 */
export interface PublicConfig {
  appUrl: string;
  isDevelopment: boolean;
  previewModeAvailable: boolean;
}

export const publicConfig: PublicConfig = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  isDevelopment: process.env.NODE_ENV !== 'production',
  previewModeAvailable: true,
};
