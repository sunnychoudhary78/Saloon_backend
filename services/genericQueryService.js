const { buildWhereFromFilters } = require('./employeeFilterBuilder');
const { registryByKey } = require('../config/columnRegistry');
const { TableConfig } = require('../models');

/**
 * Generic query handler for simple models (BloodGroup, MaritalStatus, Gender, etc.)
 * @param {Object} Model - Sequelize Model
 * @param {Object} req - Express request object
 * @param {String} tableKey - Key for TableConfig (e.g., 'blood_groups')
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
  const { columnFilters, advancedFilters, search, is_active } = req.body;

  // Determine search columns (use string columns from defaultColumns)
  const searchCols = defaultColumns.filter(key => {
    const reg = getReg(key);
    return reg && reg.type === 'string';
  });

  const payload = {
    columnFilters,
    advancedFilters,
    search,
    is_active,
    searchCols
  };

  const { where } = buildWhereFromFilters(payload, contextRegistry);

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
