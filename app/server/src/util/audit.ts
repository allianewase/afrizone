import { prisma } from "../prisma";

// Write an AuditLog entry. `meta` is serialized to a JSON string (SQLite has
// no native Json type: see schema.prisma).
export async function writeAudit(
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  meta?: Record<string, unknown>
) {
  return prisma.auditLog.create({
    data: {
      actorId,
      action,
      entity,
      entityId,
      meta: meta ? JSON.stringify(meta) : null,
    },
  });
}
