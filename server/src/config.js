// Settings from environment variables (server/.env locally, Vercel → Environment Variables in production).
// Nothing here is ever sent to the browser.

const list = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean)

export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || '',
  clerk: {
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY || '',
    secretKey: process.env.CLERK_SECRET_KEY || '',
    webhookSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET || '',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder: (process.env.CLOUDINARY_FOLDER || 'worldtour/avatars').replace(/^\/+|\/+$/g, ''),
  },
  allowedOrigins: list(process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:4173'),
  appUrl: (process.env.APP_URL || 'https://worldtour-xi.vercel.app').replace(/\/$/, ''),
  // The planner (ai/), asked which of its own keys are set (yes/no only).
  aiUrl: (process.env.AI_URL || 'https://world-tour-nine.vercel.app').replace(/\/$/, ''),
  // Opens the private /admin dashboard. Empty = dashboard switched off. Never sent to the browser.
  adminCode: String(process.env.ADMIN_CODE || '').trim(),
  // Shared with the planner (ai/ INTERNAL_API_SECRET): it reads the spare API keys with this.
  internalSecret: String(process.env.INTERNAL_API_SECRET || '').trim(),
  // Encrypts the spare API keys stored in MongoDB. Falls back to INTERNAL_API_SECRET.
  keyEncryptionSecret: String(process.env.KEY_ENCRYPTION_SECRET || process.env.INTERNAL_API_SECRET || '').trim(),
  // Limits that keep one trip document well under MongoDB's 16 MB.
  maxMessages: 400,
  maxVersions: 15,
}

export const configured = {
  database: () => !!config.mongoUri,
  clerk: () => !!config.clerk.secretKey && !!config.clerk.publishableKey,
  webhook: () => !!config.clerk.webhookSecret,
  cloudinary: () => !!(config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret),
  admin: () => config.adminCode.length >= 6,
  apiKeys: () => config.internalSecret.length >= 16 && config.keyEncryptionSecret.length >= 16,
}
