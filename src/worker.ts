import { handle } from '@astrojs/cloudflare/handler';
import { createClient } from '@supabase/supabase-js';

/**
 * Custom Worker entry. Astro generates only a `fetch` handler; we wrap it so a
 * `scheduled()` cron can live alongside SSR. `wrangler.jsonc > main` points here.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handle(request, env, ctx);
  },

  /**
   * Cron (Mon & Thu 07:17 UTC). Hits Postgres so Supabase free-tier never pauses,
   * and records the ping into keep_alive + activity_logs for the admin dashboard.
   */
  async scheduled(event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const startedAt = Date.now();
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      global: { fetch: (...args: Parameters<typeof fetch>) => fetch(...args) },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    try {
      // 1. Activity ping — resets the inactivity clock.
      const { error: pingErr } = await supabase
        .from('keep_alive')
        .update({ pinged_at: new Date().toISOString() })
        .eq('id', 1);
      if (pingErr) throw pingErr;

      // 2. Audit trail for the admin "keep-alive status" panel.
      await supabase.from('activity_logs').insert({
        action: 'keepalive.ping',
        category: 'system',
        message: `Supabase keep-alive ping OK (${Date.now() - startedAt}ms)`,
        actor: 'cron',
        metadata: { cron: event.cron, scheduledTime: event.scheduledTime },
      });

      console.log('[keep-alive] ok', event.cron, `${Date.now() - startedAt}ms`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[keep-alive] FAILED', message);
      // Best-effort failure record (may itself fail if the DB is down).
      try {
        await supabase.from('activity_logs').insert({
          action: 'keepalive.fail',
          category: 'system',
          message: `Supabase keep-alive FAILED: ${message}`,
          actor: 'cron',
          metadata: { cron: event.cron },
        });
      } catch {
        /* swallow — nothing more we can do */
      }
    }
  },
} satisfies ExportedHandler<Env>;
