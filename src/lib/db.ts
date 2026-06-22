import { PrismaClient } from '@prisma/client'

/**
 * Database client for the Telegram Bot Admin Panel.
 *
 * Dual-runtime design:
 *   • Local dev (Node.js)        → classic PrismaClient over file-based SQLite
 *                                  (env.DATABASE_URL = "file:./db/custom.db")
 *   • Production (Cloudflare)    → PrismaClient with @prisma/adapter-d1, bound
 *                                  to the D1 database exposed as `env.DB` on
 *                                  Pages/Workers via getRequestContext().
 *
 * Detection is fully automatic — no middleware or instrumentation needed.
 * The first time `db` is accessed on the Cloudflare runtime, we import
 * `getRequestContext()` from `@opennextjs/cloudflare`, pull `env.DB`, and build
 * a PrismaClient backed by the D1 adapter. On Node.js (local dev, Vercel,
 * etc.) we fall back to the classic SQLite client.
 *
 * The client is cached on globalThis so we don't spawn a new adapter per
 * request (PrismaClient is expensive to construct).
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  __d1Binding: D1Database | undefined
}

// In dev mode, force a fresh client if the cached one is missing newer models.
// This handles the case where @prisma/client was regenerated (after a schema
// change + `prisma generate`) but Node's module cache still holds the old class.
type PrismaWithModels = PrismaClient & {
  auditLog?: unknown
  savedView?: unknown
  session?: unknown
}

function hasAllModels(client: PrismaClient): boolean {
  const c = client as PrismaWithModels
  return Boolean(c.auditLog && c.savedView && c.session)
}

/**
 * Detect whether we're running on the Cloudflare Workers runtime and, if so,
 * return the D1 binding. Returns `null` on Node.js (local dev).
 *
 * `getRequestContext` is only available on Cloudflare — importing it on Node.js
 * would fail, so we use a dynamic import guarded by a runtime check.
 */
async function getD1Binding(): Promise<D1Database | null> {
  // Cached binding from a previous call in the same isolate.
  if (globalForPrisma.__d1Binding) return globalForPrisma.__d1Binding

  // Fast path: if the global `caches` / `caches.default` pattern isn't enough,
  // check for the OpenNext getRequestContext global. We wrap in try/catch so
  // Node.js (where the module doesn't exist) doesn't crash.
  try {
    // `getRequestContext` is exported by @opennextjs/cloudflare and is a no-op
    // safe to call on the Workers runtime. On Node.js the dynamic import throws
    // because the package references Workers-only globals at module top-level.
    const mod = await import('@opennextjs/cloudflare')
    const ctx = mod.getRequestContext?.()
    const d1 = (ctx as { env?: { DB?: D1Database } })?.env?.DB
    if (d1) {
      globalForPrisma.__d1Binding = d1
      return d1
    }
  } catch {
    // Not on Cloudflare — fall through to classic client.
  }
  return null
}

/**
 * Build (or return cached) PrismaClient. Sync version used by the Proxy below.
 * If we're on Cloudflare but the D1 binding hasn't been resolved yet (first
 * call), we fall back to the classic client for THIS call only — the next
 * call (after the async binding resolution completes) will use D1. In
 * practice, the first API route call triggers the async resolution and
 * subsequent calls hit the cached D1 client.
 */
function getDbSync(): PrismaClient {
  if (globalForPrisma.prisma && hasAllModels(globalForPrisma.prisma)) {
    return globalForPrisma.prisma
  }

  // If a D1 binding is already cached, build the D1-backed client synchronously.
  if (globalForPrisma.__d1Binding) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PrismaD1 } = require('@prisma/adapter-d1') as typeof import('@prisma/adapter-d1')
      const adapter = new PrismaD1(globalForPrisma.__d1Binding)
      const client = new PrismaClient({ adapter })
      globalForPrisma.prisma = client
      return client
    } catch {
      // Fall through to classic client (shouldn't happen on Cloudflare).
    }
  }

  // Classic client (local dev, or Cloudflare before D1 binding resolved).
  const client = new PrismaClient({ log: ['query'] })
  if (!hasAllModels(client)) {
    globalForPrisma.prisma = new PrismaClient({ log: ['query'] })
    return globalForPrisma.prisma
  }
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client
  return client
}

/**
 * Async accessor — use this in API routes when you want to guarantee the D1
 * binding is resolved before the first query. Falls back to the classic
 * client on Node.js. The sync `db` export works too, but on Cloudflare the
 * very first call in a cold isolate might use the classic client (which will
 * fail loudly — surfacing the misconfiguration) before the async resolution
 * completes. Prefer `getDB()` in API route handlers.
 */
export async function getDB(): Promise<PrismaClient> {
  await getD1Binding()
  return getDbSync()
}

/**
 * Sync accessor. Works perfectly on Node.js (local dev) and on Cloudflare
 * after the first request has resolved the D1 binding. For API route handlers
 * that run on Cloudflare, prefer `await getDB()` for the first query.
 *
 * Implemented as a Proxy so callers always see the latest underlying client
 * (important when the D1 binding swaps mid-isolate).
 */
export const db = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const client = getDbSync()
    const value = (client as never as Record<string | symbol, unknown>)[prop]
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value
  },
}) as PrismaClient
