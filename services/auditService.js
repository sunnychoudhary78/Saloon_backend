const { AuditLog } = require('../models');

async function logAudit({
  userId,
  action,
  entityType,
  entityId,
  oldValues = null,
  newValues = null,
  req = null,
}) {
  try {
    await AuditLog.create({
      user_id: userId || null,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      old_values: oldValues,
      new_values: newValues,
      ip_address: req?.ip || req?.headers?.['x-forwarded-for'] || null,
      user_agent: req?.headers?.['user-agent'] || null,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

module.exports = { logAudit };
