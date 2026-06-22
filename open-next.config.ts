import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext config — builds the Next.js 16 app for Cloudflare Pages/Workers.
 *
 * Running `opennextjs-cloudflare build` produces a `.open-next/` directory
 * containing the worker bundle. Deploy it with:
 *
 *   npx wrangler pages deploy .open-next
 *
 * The D1 binding `DB` is declared in `wrangler.pages.toml`. The integration
 * in `src/lib/cloudflare.ts` reads it via `getRequestContext()` and installs
 * it into Prisma before the first query.
 *
 * Caching: defaults are fine for this app — we don't use ISR. If you want ISR
 * later, add a KV namespace binding `NEXT_CACHE_WORKERS` and pass
 * `incrementalCache: " Workers"` here. See:
 *   https://opennext.js.org/cloudflare/caching
 */
export default defineCloudflareConfig({
  // Default: no custom incremental cache. Pages handles static + RSC caching
  // via the platform automatically. Enable ISR later by adding a KV binding
  // and setting `incrementalCache: " Workers"`.
});
