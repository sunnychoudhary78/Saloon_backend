const { buildWhereFromFilters } = require('./employeeFilterBuilder');
const { registryByKey } = require('../config/columnRegistry');
const { TableConfig } = require('../models');

function isTextSearchableAttribute(Model, path) {
  const attr = Model?.rawAttributes?.[path];
  if (!attr) return false;
  const typeKey = attr.type?.key;
  // PostgreSQL rejects ILIKE (~~*) on ENUM, UUID, INTEGER, BOOLEAN, etc.
  if (typeKey === 'ENUM' || Array.isArray(attr.values)) return false;
  return (
    typeKey === 'STRING' ||
    typeKey === 'TEXT' ||
    typeKey === 'CHAR' ||
    typeKey === 'CITEXT'
  );
}

function resolveSearchCols(Model, defaultColumns, contextRegistry) {
  const getReg = (key) =>
    contextRegistry && contextRegistry[key]
      ? contextRegistry[key]
      : registryByKey[key];

  const candidateKeys = new Set(defaultColumns || []);
  if (contextRegistry) {
    for (const key of Object.keys(contextRegistry)) {
      candidateKeys.add(key);
    }
  }

  return [...candidateKeys].filter((key) => {
    const reg = getReg(key);
    if (!reg || reg.type !== 'string') return false;
    return isTextSearchableAttribute(Model, reg.path);
  });
}

/**
 * Generic query handler for admin catalog models (Rewards, Coupons, Banners, etc.)
 * @param {Object} Model - Sequelize Model
 * @param {Object} req - Express request object
 * @param {String} tableKey - Key for TableConfig (e.g., 'rewards')
 * @param {Array} defaultColumns - Array of default column keys
 * @returns {Object} { rows, meta, columns }
 */
exports.genericQuery = async (Model, req, tableKey, defaultColumns, contextRegistry) => {
  const page = Math.max(parseInt(req.body.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.body.limit, 10) || 20, 1);
  const offset = (page - 1) * limit;

  // Helper to get registry entry
  const getReg = (key) => (contextRegistry && contextRegistry[key]) ? contextRegistry[key] : registryByKey[key];

  // 1. Build Where Clause
  const { columnFilters, advancedFilters, search, is_active, status } = req.body;

  // Only include actual STRING/TEXT columns in ILIKE search (never PostgreSQL ENUMs)
  const searchCols = resolveSearchCols(Model, defaultColumns, contextRegistry);

  const payload = {
    columnFilters,
    advancedFilters,
    search,
    is_active,
    searchCols,
  };

  const { where } = buildWhereFromFilters(payload, contextRegistry);

  if (status && Model.rawAttributes?.status) {
    where.status = status;
  }

  // 2. Sorting
  let order = [['created_at', 'DESC']];
  if (req.body.sort && req.body.sort.key && req.body.sort.dir) {
    const { key, dir } = req.body.sort;
    const reg = getReg(key);
    if (reg) {
      // Simple sort for now, assuming flat model
      order = [[reg.path, dir.toUpperCase()]];
    }
  }

  // 3. User Config (Columns)
  const userId = req.user.id;
  const userConfigRow = await TableConfig.findOne({
    where: { user_id: userId, table_key: tableKey, is_active: true }
  });

  let activeColumns;
  if (userConfigRow && Array.isArray(userConfigRow.config) && userConfigRow.config.length > 0) {
    const filtered = userConfigRow.config
      .filter(c => c && typeof c.key === 'string' && getReg(c.key))
      .map(c => ({ key: c.key, visible: !!c.visible, order: Number.isFinite(c.order) ? c.order : 999 }))
      .sort((a, b) => a.order - b.order);
    activeColumns = filtered;
  } else {
    activeColumns = defaultColumns.map((key, idx) => ({ key, visible: true, order: idx + 1 }));
  }

  const columnsMeta = activeColumns
    .filter(ac => ac.visible)
    .map(ac => {
      const reg = getReg(ac.key);
      return { key: ac.key, label: reg.label, type: reg.type };
    });

  // 4. Execute Query
  const { count, rows } = await Model.findAndCountAll({
    where,
    order,
    limit,
    offset,
  });

  return {
    rows,
    columns: columnsMeta,
    meta: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    }
  };
};

exports.resolveSearchCols = resolveSearchCols;
