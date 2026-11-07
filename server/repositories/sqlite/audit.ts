import type { Db } from './util';
import type { AuditRepository } from '../types';

export function createSqliteAuditRepository(db: Db): AuditRepository {
  return {
    insert(entry) {
      db.prepare(
        `INSERT INTO audit_log (actor_id, action, entity, entity_id, before_json, after_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        entry.actorId,
        entry.action,
        entry.entity,
        entry.entityId,
        entry.before === null || entry.before === undefined ? null : JSON.stringify(entry.before),
        entry.after === null || entry.after === undefined ? null : JSON.stringify(entry.after)
      );
    },
  };
}
