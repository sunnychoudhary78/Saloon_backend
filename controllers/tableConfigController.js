// controllers/tableConfigController.js
const { sequelize } = require('../models'); // adjust path if needed
const { Op } = require('sequelize');
const { columnRegistry, departmentRegistry, rolesRegistry, permissionsRegistry } = require('../config/columnRegistry');

const TableConfig = sequelize.models.TableConfig;

// canonical registry of available columns for the "employees" table.
// extend keys, labels and metadata as needed.


// helper: get registry by tableKey (we only support 'employees' now)
function getRegistryForTable(tableKey = 'employees') {
  if (tableKey === 'employees') return columnRegistry;
  if (tableKey === 'department') return departmentRegistry;
  if (tableKey === 'roles') return rolesRegistry;
  if (tableKey === 'permissions') return permissionsRegistry;
  return [];
}

// GET /api/table-configs?table=employees
// returns: { columns: [registry], config: { id, user_id, table_key, config }, meta: ... }
exports.getTableConfig = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const tableKey = (req.query.table || 'employees').trim();

    const registry = getRegistryForTable(tableKey);

    const existing = await TableConfig.findOne({
      where: { user_id: userId, table_key: tableKey, is_active: true },
    });

    // If not found, you can return a default (e.g. first N visible by default).
    // We'll return the registry as `columns` and existing config (if any).
    res.json({
      columns: registry,
      config: existing ? {
        id: existing.id,
        user_id: existing.user_id,
        table_key: existing.table_key,
        config: existing.config,
        is_active: existing.is_active,
        created_at: existing.created_at,
        updated_at: existing.updated_at,
      } : null,
    });
  } catch (err) {
    console.error('getTableConfig error', err);
    res.status(500).json({ message: 'Failed to fetch table config', error: err.message });
  }
};

// POST /api/table-configs
// body: { table_key: 'employees', config: [ { key, visible: true/false, order: 1, width? }, ... ] }
// server validates keys, normalizes order and upserts an entry for current user
exports.upsertTableConfig = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const tableKey = (req.body.table_key || 'employees').trim();
    const rawConfig = Array.isArray(req.body.config) ? req.body.config : [];

    const registry = getRegistryForTable(tableKey);
    const allowedKeys = new Set(registry.map((c) => c.key));

    // Validate & filter incoming config — keep only allowed keys
    let filtered = rawConfig
      .filter((c) => {
        if (!c || typeof c.key !== 'string') return false;
        if (allowedKeys.has(c.key)) return true;
        return false;
      })
      .map((c, idx) => ({
        key: c.key,
        visible: !!c.visible,
        // if order is present and valid use it; else fallback to array order
        order: Number.isInteger(c.order) ? c.order : idx + 1,
        width: c.width ? Number(c.width) : undefined,
      }));

    // Normalize order to consecutive integers based on requested order
    filtered = filtered
      .sort((a, b) => a.order - b.order)
      .map((c, idx) => ({ ...c, order: idx + 1 }));

    // Ensure at least one column visible
    if (!filtered.some((c) => c.visible)) {
      return res.status(400).json({ message: 'At least one column must be visible' });
    }

    // Upsert: try update first (prefer using upsert if DB supports it)
    // We use findOne -> update or create to keep it simple/portable
    const existing = await TableConfig.findOne({ where: { user_id: userId, table_key: tableKey } });

    if (existing) {
      existing.config = filtered;
      existing.updated_by = userId;
      existing.is_active = true;
      await existing.save();
      return res.json({ ok: true, config: existing });
    } else {
      const created = await TableConfig.create({
        user_id: userId,
        table_key: tableKey,
        config: filtered,
        created_by: userId,
        updated_by: userId,
        is_active: true,
      });
      return res.json({ ok: true, config: created });
    }
  } catch (err) {
    console.error('upsertTableConfig error', err);
    res.status(500).json({ message: 'Failed to save table config', error: err.message });
  }
};
