const { Department } = require('../models');
const { Op, Sequelize } = require('sequelize');
const { logger } = require('../utils/logger');
const AppError = require('../middlewares/AppError');

exports.getAllDepartments = async (req, res) => {
  const log = req?.log || logger;

  const where = {};

  // Filter: active=true / active=false
  if (req.query.active === "true") {
    where.is_active = true;
  } else if (req.query.active === "false") {
    where.is_active = false;
  }

  try {
    const departments = await Department.findAll({
      where,
      attributes: ["id", "name", "is_active", "created_at", "updated_at", "created_by", "updated_by", "department_head_id", "company_id"],
      include: [
        { model: Department.sequelize.models.User, as: 'createdBy', attributes: ['id','name'] },
        { model: Department.sequelize.models.User, as: 'updatedBy', attributes: ['id','name'] },
        { model: Department.sequelize.models.User, as: 'department_head', attributes: ['id','name','email'] },
      ],
      order: [["created_at", "DESC"]],
    });

    const shaped = departments.map(d => {
      const plain = d.get ? d.get({ plain: true }) : d;
      plain.created_by = plain.createdBy?.name || plain.created_by || null;
      plain.updated_by = plain.updatedBy?.name || plain.updated_by || null;
      plain.department_head_id = plain.department_head_id || plain.department_head?.id || null;
      plain.department_head_name = plain.department_head?.name || null;
      delete plain.createdBy;
      delete plain.updatedBy;
      delete plain.department_head;
      return plain;
    });

    res.json({ departments: shaped });
  } catch (err) {
    log.error("Error fetching departments", err);
    res.status(500).json({ message: "Failed to fetch departments" });
  }
};


exports.createDepartment = async (req, res) => {
  const log = req && req.log ? req.log : logger;
  const { name, company_id, companyId } = req.body;

  if (!name || !String(name).trim()) {
    // client error — will be handled by central error middleware
    throw new AppError('Department name is required', 400);
  }

  const userId = req.user && req.user.id;
  const payload = { name: name.trim() };
  if (company_id || companyId) {
    payload.company_id = String(company_id || companyId);
  }
  if (userId) {
    payload.created_by = userId;
    payload.updated_by = userId;
  }
  const department = await Department.create(payload);

  log.info({ departmentId: department.id }, 'Department created');

  res.status(201).json({ department });
};

exports.updateDepartment = async (req, res) => {
  const log = req && req.log ? req.log : logger;
  const deptId = req.params.id || req.params.departmentId;

  if (!deptId) {
    throw new AppError('Department id is required', 400);
  }

  const { name, is_active, active, department_head_id, company_id, companyId } = req.body;
  const hasName = typeof name !== 'undefined';
  const hasActive = typeof is_active !== 'undefined' || typeof active !== 'undefined';
  const hasHead = typeof department_head_id !== 'undefined';
  const hasCompany = typeof company_id !== 'undefined' || typeof companyId !== 'undefined';
  if (!hasName && !hasActive && !hasHead && !hasCompany) {
    throw new AppError('No update fields provided', 400);
  }

  const department = await Department.findByPk(deptId);
  if (!department) {
    throw new AppError('Department not found', 404);
  }

  if (hasName) {
    const nm = String(name).trim();
    if (!nm) {
      throw new AppError('Department name is required', 400);
    }
    department.name = nm;
  }

  if (hasActive) {
    let newActive;
    if (typeof is_active !== 'undefined') {
      newActive = typeof is_active === 'string' ? (is_active === 'true' || is_active === '1') : Boolean(is_active);
    } else {
      newActive = typeof active === 'string' ? (active === 'true' || active === '1') : Boolean(active);
    }
    if ('is_active' in department) department.is_active = newActive;
    if ('active' in department) department.active = newActive;
    if (department.set) {
      department.set('is_active', newActive);
      department.set('active', newActive);
    }
  }

  if (hasHead) {
    if (department_head_id === null || department_head_id === '' ) {
      department.department_head_id = null;
    } else {
      department.department_head_id = String(department_head_id);
    }
  }
  if (hasCompany) {
    const cid = company_id || companyId;
    if (cid === null || cid === '') {
      department.company_id = null;
    } else {
      department.company_id = String(cid);
    }
  }

  if (req.user && req.user.id) {
    department.updated_by = req.user.id;
  }
  department.updated_at = new Date();
  await department.save();

  log.info({ departmentId: department.id }, 'Department updated');

  res.json({ department });
};

/**
 * Make department inactive
 * PATCH /api/departments/:id/inactivate
 */
exports.inactivateDepartment = async (req, res) => {
  const log = req && req.log ? req.log : logger;
  const deptId = req.params.id || req.params.departmentId;

  if (!deptId) {
    throw new AppError('Department id is required', 400);
  }

  const department = await Department.findByPk(deptId);
  if (!department) {
    throw new AppError('Department not found', 404);
  }

  // Support both 'active' and 'is_active' column names if present in your schema
  if ('active' in department) department.active = false;
  if ('is_active' in department) department.is_active = false;

  // also keep a generic updated flag if your model uses different column names
  if (department.set) {
    // safe set for any additional underscored column names
    department.set('active', false);
    department.set('is_active', false);
  }

  if (req.user && req.user.id) {
    department.updated_by = req.user.id;
  }
  department.updated_at = new Date();
  await department.save();

  log.info({ departmentId: department.id }, 'Department inactivated');

  res.json({ department });
};

exports.departmentsQuery = async (req, res) => {
  try {
    const payload = req.body || {};
    const page = Math.max(parseInt(payload.page, 10) || 1, 1);
    const limit = Math.min(parseInt(payload.limit, 10) || 10, 500);
    const offset = (page - 1) * limit;

    const statusFilter = String(payload.statusFilter || '').toLowerCase();
    const query = typeof payload.query === 'string' ? payload.query.trim() : '';
    const columnFilters = payload.columnFilters || {};
    const advancedFilters = Array.isArray(payload.advancedFilters) ? payload.advancedFilters : [];

    const andConds = [];

    if (statusFilter === 'active') andConds.push({ is_active: true });
    else if (statusFilter === 'inactive') andConds.push({ is_active: false });

    if (query) {
      andConds.push({ name: { [Op.iLike]: `%${query}%` } });
    }
    if (payload.company_id || payload.companyId) {
      andConds.push({ company_id: String(payload.company_id || payload.companyId) });
    }

    const addFilter = (rawKey, op, value) => {
      const key = String(rawKey);
      if (typeof value === 'undefined' || value === null || value === '') return;
      const opNorm = op || 'contains';
      const isDate = key === 'created_at' || key === 'updated_at';
      const isBool = key === 'is_active';
      const isCreatedBy = key === 'created_by';
      const isUpdatedBy = key === 'updated_by';

      if (isBool) {
        if (opNorm === 'ne') andConds.push({ is_active: { [Op.ne]: Boolean(value) } });
        else andConds.push({ is_active: Boolean(value) });
        return;
      }

      if (isDate) {
        const colName = key === 'updated_at' ? 'Department.updated_at' : 'Department.created_at';
        const col = Sequelize.fn('DATE', Sequelize.col(colName));
        if (opNorm === 'between' && Array.isArray(value)) {
          const [from, to] = value;
          if (from && to) andConds.push(Sequelize.where(col, { [Op.between]: [from, to] }));
          else if (from) andConds.push(Sequelize.where(col, { [Op.gte]: from }));
          else if (to) andConds.push(Sequelize.where(col, { [Op.lte]: to }));
        } else if (opNorm === 'eq') andConds.push(Sequelize.where(col, { [Op.eq]: String(value) }));
        else if (opNorm === 'ne') andConds.push(Sequelize.where(col, { [Op.ne]: String(value) }));
        else if (opNorm === 'lt') andConds.push(Sequelize.where(col, { [Op.lt]: String(value) }));
        else if (opNorm === 'lte') andConds.push(Sequelize.where(col, { [Op.lte]: String(value) }));
        else if (opNorm === 'gt') andConds.push(Sequelize.where(col, { [Op.gt]: String(value) }));
        else if (opNorm === 'gte') andConds.push(Sequelize.where(col, { [Op.gte]: String(value) }));
        else andConds.push(Sequelize.where(col, { [Op.eq]: String(value) }));
        return;
      }

      // created_by / updated_by should search joined user name, not UUID FK
      const valStr = String(value);
      const applyStringFilter = (colPath) => {
        if (opNorm === 'eq') {
          andConds.push(Sequelize.where(Sequelize.fn('LOWER', Sequelize.col(colPath)), Op.eq, valStr.toLowerCase()));
        } else if (opNorm === 'ne') {
          andConds.push(Sequelize.where(Sequelize.fn('LOWER', Sequelize.col(colPath)), Op.ne, valStr.toLowerCase()));
        } else if (opNorm === 'startsWith') {
          andConds.push(Sequelize.where(Sequelize.col(colPath), { [Op.iLike]: `${valStr}%` }));
        } else if (opNorm === 'endsWith') {
          andConds.push(Sequelize.where(Sequelize.col(colPath), { [Op.iLike]: `%${valStr}` }));
        } else if (opNorm === 'notContains') {
          andConds.push(Sequelize.where(Sequelize.col(colPath), { [Op.notILike]: `%${valStr}%` }));
        } else if (opNorm === 'in' && Array.isArray(value)) {
          andConds.push(Sequelize.where(Sequelize.col(colPath), { [Op.in]: value }));
        } else if (opNorm === 'isEmpty') {
          andConds.push({ [Op.or]: [Sequelize.where(Sequelize.col(colPath), null), Sequelize.where(Sequelize.col(colPath), '')] });
        } else if (opNorm === 'isNotEmpty') {
          andConds.push({ [Op.and]: [Sequelize.where(Sequelize.col(colPath), { [Op.ne]: null }), Sequelize.where(Sequelize.col(colPath), { [Op.ne]: '' })] });
        } else if (opNorm === 'isAnything') {
          // no-op
        } else {
          andConds.push(Sequelize.where(Sequelize.col(colPath), { [Op.iLike]: `%${valStr}%` }));
        }
      };

      if (isCreatedBy) {
        applyStringFilter('createdBy.name');
        return;
      }
      if (isUpdatedBy) {
        applyStringFilter('updatedBy.name');
        return;
      }

      // default string filter on direct column (qualify to avoid ambiguity)
      applyStringFilter(`Department.${key}`);
    };

    for (const [key, spec] of Object.entries(columnFilters)) {
      if (!spec) continue;
      addFilter(key, spec.op, spec.value);
    }
    for (const f of advancedFilters) {
      if (!f) continue;
      const k = f.key || f.field;
      if (!k) continue;
      addFilter(k, f.op || f.operator, f.value);
    }

    const where = andConds.length ? { [Op.and]: andConds } : {};

    const { rows, count } = await Department.findAndCountAll({
      where,
      attributes: [
        'id', 'name', 'is_active', 'created_at', 'updated_at', 'created_by', 'updated_by', 'company_id'
      ],
      include: [
        { model: Department.sequelize.models.User, as: 'createdBy', attributes: ['id','name'] },
        { model: Department.sequelize.models.User, as: 'updatedBy', attributes: ['id','name'] },
        { model: Department.sequelize.models.Company, as: 'company', attributes: ['id','name'] },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    const totalPages = Math.max(1, Math.ceil((count || 0) / limit));
    return res.status(200).json({
      meta: { page, limit, total: count || 0, totalPages },
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'is_active', label: 'Active', type: 'boolean' },
        { key: 'created_at', label: 'Created At', type: 'date' },
        { key: 'updated_at', label: 'Updated At', type: 'date' },
        { key: 'created_by', label: 'Created By' },
        { key: 'updated_by', label: 'Updated By' },
        { key: 'company_id', label: 'Company' },
      ],
      rows: rows.map(r => {
        const plain = r.get ? r.get({ plain: true }) : r;
        plain.created_by = plain.createdBy?.name || plain.created_by || null;
        plain.updated_by = plain.updatedBy?.name || plain.updated_by || null;
        plain.company_id = plain.company?.name || plain.company_id || null;
        delete plain.createdBy;
        delete plain.updatedBy;
        delete plain.company;
        return plain;
      }),
    });
  } catch (err) {
    console.error('departmentsQuery error', err);
    return res.status(500).json({ message: 'Failed to query departments', error: err.message });
  }
};
