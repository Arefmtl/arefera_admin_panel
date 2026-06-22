import { db } from "./db";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "cancel"
  | "clone"
  | "send"
  | "run"
  | "login"
  | "settings"
  | "pause"
  | "resume"
  | "bulk";

export type AuditEntity =
  | "scheduled"
  | "channel"
  | "admin"
  | "template"
  | "post"
  | "settings"
  | "broadcast"
  | "auth";

/**
 * Who triggered the audit event. Today we only have a single panel admin,
 * but failed logins record `anonymous` so the activity log can distinguish
 * "admin signed in" from "anonymous tried to sign in".
 */
export type AuditActor = "admin" | "anonymous" | "system" | (string & {});

export type AuditOptions = {
  entityId?: string;
  title?: string;
  detail?: string;
  actor?: AuditActor;
  /** Client IP of the request that triggered the event, if applicable. */
  ip?: string;
  /** User-Agent of the client, if applicable. */
  userAgent?: string;
  /** Extra structured context, stored as JSON alongside ip + userAgent. */
  meta?: Record<string, unknown>;
};

/**
 * Append an entry to the audit log. Non-blocking — failures are swallowed so
 * they never break the calling request.
 *
 * The `ip` and `userAgent` fields (when provided) are stored inside the
 * `meta` JSON column as `meta.ip` and `meta.userAgent`. We chose not to add
 * dedicated DB columns for these so existing rows don't need a migration and
 * the activity-log UI keeps working unchanged.
 */
export async function audit(
  action: AuditAction,
  entity: AuditEntity,
  opts: AuditOptions = {},
): Promise<void> {
  try {
    // Merge ip + userAgent into the meta object so we don't need a schema
    // migration for the new fields.
    const meta: Record<string, unknown> = { ...(opts.meta ?? {}) };
    if (opts.ip) meta.ip = opts.ip;
    if (opts.userAgent) meta.userAgent = opts.userAgent;

    await db.auditLog.create({
      data: {
        action,
        entity,
        entityId: opts.entityId ?? null,
        title: opts.title ?? null,
        detail: opts.detail ?? null,
        actor: opts.actor ?? "admin",
        meta: Object.keys(meta).length > 0 ? JSON.stringify(meta) : null,
      },
    });
  } catch (e) {
    // Audit log must never break the calling request.
    console.error("[audit] failed to write log:", e);
  }
}
