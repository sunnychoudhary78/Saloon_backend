// controllers/rolePermissionController.js
const { Op } = require('sequelize');
const { Role, Permission, RolePermission, sequelize, Sequelize } = require('../models'); // adjust path to your models
const { logger } = require('../utils/logger');
const AppError = require('../middlewares/AppError');


// Helper: find role by id or name
async function findRole({ roleId, roleName }) {
  if (roleId) return Role.findByPk(roleId);
  if (roleName) return Role.findOne({ where: { name: roleName } });
  return null;
}

exports.addPermission = async (req, res) => {
  const { name, display_name, description } = req.body;
  const log = req?.log || logger;

  // console.log(name, display_name, description);

  try {
    const payload = { name, displayName: display_name, description };
    if (req.user && req.user.id) {
      payload.created_by = req.user.id;
      payload.updated_by = req.user.id;
    }
    const permission = await Permission.create(payload);
    log.info({ permissionId: permission.id }, 'Permission created');
    res.status(201).json({ permission });
  } catch (err) {
    log.error({ err }, 'addPermission error');
    return res.status(500).json({ message: 'Failed to create permission', error: err.message });
  }

}

exports.getAllPermissions = async (req, res) => {
  try {
    // Pagination
    let page = parseInt(req.query.page, 10) || 1;
    let limit = parseInt(req.query.limit, 10) || 25;
    if (page < 1) page = 1;
    if (limit < 1) limit = 25;

    const offset = (page - 1) * limit;

    // Search filter
    const search = req.query.search ? String(req.query.search).trim() : null;
    const where = search
      ? {
        [Op.or]: [
          { name: { [Op.iLike]: `%${search}%` } },
          { displayName: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } },
          Sequelize.where(Sequelize.col('createdBy.name'), { [Op.iLike]: `%${search}%` }),
          Sequelize.where(Sequelize.col('updatedBy.name'), { [Op.iLike]: `%${search}%` }),
        ]
      }
      : {};

    // Fetch permissions with count
    const sortSpec = req.body && req.body.sort ? req.body.sort : {};
    const sortKeyRaw = typeof sortSpec.key === 'string' ? sortSpec.key : '';
    const sortDirRaw = typeof sortSpec.dir === 'string' ? sortSpec.dir : '';
    const dir = (sortDirRaw || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const keyMap = {
      name: 'name',
      display_name: 'displayName',
      description: 'description',
      created_at: 'created_at',
      updated_at: 'updated_at',
      is_active: 'is_active',
    };
    const sortCol = keyMap[sortKeyRaw] || null;

    const { rows, count } = await Permission.findAndCountAll({
      where,
      limit,
      offset,
      attributes: ['id','name','displayName','description','is_active','created_at','updated_at','created_by','updated_by'],
      include: [
        { model: Permission.sequelize.models.User, as: 'createdBy', attributes: ['id','name'] },
        { model: Permission.sequelize.models.User, as: 'updatedBy', attributes: ['id','name'] },
      ],
      order: sortCol ? [[sortCol, dir]] : [['name', 'ASC']],
      distinct: true,
    });

    const total = count || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.status(200).json({
      meta: { page, limit, total, totalPages },
      data: rows.map(r => {
        const plain = r.get ? r.get({ plain: true }) : r;
        plain.display_name = plain.display_name || plain.displayName || null;
        plain.created_by = plain.createdBy?.name || null;
        plain.updated_by = plain.updatedBy?.name || null;
        delete plain.displayName;
        delete plain.createdBy;
        delete plain.updatedBy;
        return plain;
      })
    });

  } catch (err) {
    console.error('getAllPermissions error', err);
    return res.status(500).json({
      message: 'Failed to list permissions',
      error: err.message
    });
  }
};


exports.editPermission = async (req, res) => {
  const { id } = req.params;
  const { name, display_name, description, is_active } = req.body;
  const log = req?.log || logger;

  try {
    const permission = await Permission.findByPk(id);
    if (!permission) {
      return res.status(404).json({ message: 'Permission not found' });
    }
    if (typeof name !== 'undefined') permission.name = name;
    if (typeof display_name !== 'undefined') permission.displayName = display_name;
    if (typeof description !== 'undefined') permission.description = description;
    if (typeof is_active !== 'undefined') {
      const nextActive = typeof is_active === 'string' ? (is_active === 'true' || is_active === '1') : Boolean(is_active);
      permission.is_active = nextActive;
    }
    if (req.user && req.user.id) {
      permission.updated_by = req.user.id;
    }
    permission.updated_at = new Date();
    await permission.save();
    log.info({ permissionId: permission.id }, 'Permission updated');
    res.json({ permission });
  } catch (err) {
    log.error({ err }, 'editPermission error');
    return res.status(500).json({ message: 'Failed to update permission', error: err.message });
  }
};

exports.deletepermission = async (req, res) => {
  const { id } = req.params;
  const log = req?.log || logger;

  try {
    const permission = await Permission.findByPk(id);
    if (!permission) {
      return res.status(404).json({ message: 'Permission not found' });
    }
    await permission.destroy();
    log.info({ permissionId: permission.id }, 'Permission deleted');
    res.json({ message: 'Permission deleted successfully' });
  } catch (err) {
    log.error({ err }, 'deletePermission error');
    return res.status(500).json({ message: 'Failed to delete permission', error: err.message });
  }
};

// POST /roles/:roleId/permissions or POST /roles/permissions  (body can include roleId or roleName)
// body: { permissionNames: ['perm.a','perm.b'] }
exports.assignPermissions = async (req, res) => {
  const { permissionNames } = req.body || {};
  const roleIdParam = req.params.roleId;
  const roleNameBody = req.body.roleName;

  // console.log(req.body);


  if (!Array.isArray(permissionNames) || permissionNames.length === 0) {
    return res.status(400).json({ message: 'permissionNames must be a non-empty array' });
  }

  try {
    const role = await findRole({ roleId: roleIdParam, roleName: roleNameBody });
    if (!role) return res.status(404).json({ message: 'Role not found' });

    // fetch permissions by name
    const perms = await Permission.findAll({
      where: { name: { [Op.in]: permissionNames } },
      attributes: ['id', 'name']
    });

    if (!perms.length) {
      return res.status(404).json({ message: 'No matching permissions found' });
    }

    const permIds = perms.map(p => p.id);

    // find existing role_permissions for this role
    const existing = await RolePermission.findAll({
      where: {
        role_id: role.id,
        permission_id: { [Op.in]: permIds }
      },
      attributes: ['permission_id']
    });
    const existingIds = new Set(existing.map(e => e.permission_id));

    // prepare inserts for missing ones
    const now = new Date();
    const toInsert = perms
      .filter(p => !existingIds.has(p.id))
      .map(p => ({
        role_id: role.id,
        permission_id: p.id,
        created_by: req.user ? req.user.id : null,
        updated_by: req.user ? req.user.id : null,
        is_active: true,
        created_at: now,
        updated_at: now
      }));

    if (toInsert.length === 0) {
      return res.status(200).json({ message: 'Permissions already assigned', assigned: [], skipped: permissionNames });
    }

    // Insert in a transaction
    await sequelize.transaction(async (tx) => {
      await RolePermission.bulkCreate(toInsert, { transaction: tx });
    });

    return res.status(201).json({
      message: 'Permissions assigned',
      assigned: toInsert.map(i => i.permission_id)
    });
  } catch (err) {
    console.error('assignPermissions error', err);
    return res.status(500).json({ message: 'Failed to assign permissions', error: err.message });
  }
};

// DELETE /roles/:roleId/permissions
// body: { permissionNames: ['perm.a'] } or send ?perm=name repeated query
exports.removePermissions = async (req, res) => {
  const { permissionNames } = req.body || {};
  const roleIdParam = req.params.roleId;

  if (!Array.isArray(permissionNames) || permissionNames.length === 0) {
    return res.status(400).json({ message: 'permissionNames must be a non-empty array' });
  }

  try {
    const role = await findRole({ roleId: roleIdParam, roleName: req.body.roleName });
    if (!role) return res.status(404).json({ message: 'Role not found' });

    const perms = await Permission.findAll({
      where: { name: { [Op.in]: permissionNames } },
      attributes: ['id', 'name']
    });
    if (!perms.length) return res.status(404).json({ message: 'No matching permissions found' });

    const permIds = perms.map(p => p.id);

    const deleted = await RolePermission.destroy({
      where: {
        role_id: role.id,
        permission_id: { [Op.in]: permIds }
      }
    });

    return res.status(200).json({ message: 'Permissions removed', removedCount: deleted });
  } catch (err) {
    console.error('removePermissions error', err);
    return res.status(500).json({ message: 'Failed to remove permissions', error: err.message });
  }
};

// GET /roles/:roleId/permissions  -> list assigned permission names/ids
exports.listPermissions = async (req, res) => {
  try {
    const roleIdParam = req.params.roleId;
    const role = await findRole({ roleId: roleIdParam, roleName: req.query.roleName });
    if (!role) return res.status(404).json({ message: 'Role not found' });

    const rolePerms = await RolePermission.findAll({
      where: { role_id: role.id },
      include: [{ model: Permission, as: 'permission', attributes: ['id', 'name'] }]
    });

    const result = rolePerms.map(rp => ({
      permission_id: rp.permission_id,
      permission_name: rp.permission ? rp.permission.name : null,
      is_active: rp.is_active
    }));

    return res.status(200).json({ role: { id: role.id, name: role.name }, permissions: result });
  } catch (err) {
    console.error('listPermissions error', err);
    return res.status(500).json({ message: 'Failed to list permissions', error: err.message });
  }
};
// POST /role-permissions/query
// body: { page, limit, query, columnFilters, advancedFilters }
// returns: { meta, data }
exports.queryPermissions = async (req, res) => {
  try {
    let { page, limit, query, columnFilters, advancedFilters } = req.body || {};
    page = parseInt(page, 10) || 1;
    limit = parseInt(limit, 10) || 25;
    if (page < 1) page = 1;
    if (limit < 1) limit = 25;

    const offset = (page - 1) * limit;

    const andConds = [];
    let createdByIncludeWhere = null;
    let updatedByIncludeWhere = null;

    if (query && String(query).trim()) {
      const q = String(query).trim();
      andConds.push({
        [Op.or]: [
          { name: { [Op.iLike]: `%${q}%` } },
          { displayName: { [Op.iLike]: `%${q}%` } },
          { description: { [Op.iLike]: `%${q}%` } },
          Sequelize.where(Sequelize.col('createdBy.name'), { [Op.iLike]: `%${q}%` }),
          Sequelize.where(Sequelize.col('updatedBy.name'), { [Op.iLike]: `%${q}%` })
        ]
      });
    }

    const addFilter = (rawKey, op, value) => {
      const keyIn = String(rawKey);
      const key = keyIn === 'display_name' ? 'displayName' : keyIn; // map
      if (typeof value === 'undefined' || value === null || value === '') {
        if (op === 'isEmpty') {
          andConds.push({ [Op.or]: [{ [key]: null }, { [key]: '' }] });
        }
        return;
      }
      const opNorm = op || 'contains';

      if (key === 'is_active') {
        const b = typeof value === 'boolean' ? value : String(value) === 'true';
        if (opNorm === 'ne') andConds.push({ is_active: { [Op.ne]: b } });
        else andConds.push({ is_active: b });
        return;
      }

      if (key === 'created_at' || key === 'createdAt' || key === 'updated_at' || key === 'updatedAt') {
        const colName = (key === 'created_at' || key === 'createdAt') ? 'created_at' : 'updated_at';
        const col = Sequelize.fn('DATE', Sequelize.col(`Permission.${colName}`));
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

      const valStr = String(value);
      const isCreatedBy = key === 'created_by';
      const isUpdatedBy = key === 'updated_by';

      if (isCreatedBy || isUpdatedBy) {
        if (opNorm === 'isEmpty') {
          andConds.push({ [isCreatedBy ? 'created_by' : 'updated_by']: null });
          return;
        }
        if (opNorm === 'isNotEmpty') {
          andConds.push({ [isCreatedBy ? 'created_by' : 'updated_by']: { [Op.ne]: null } });
          return;
        }
        const buildNameCond = () => {
          if (opNorm === 'eq') return { name: { [Op.iLike]: valStr } };
          if (opNorm === 'ne') return { name: { [Op.notILike]: valStr } };
          if (opNorm === 'startsWith') return { name: { [Op.iLike]: `${valStr}%` } };
          if (opNorm === 'endsWith') return { name: { [Op.iLike]: `%${valStr}` } };
          if (opNorm === 'notContains') return { name: { [Op.notILike]: `%${valStr}%` } };
          if (opNorm === 'in' && Array.isArray(value)) return { name: { [Op.in]: value } };
          return { name: { [Op.iLike]: `%${valStr}%` } };
        };
        const cond = buildNameCond();
        if (isCreatedBy) {
          createdByIncludeWhere = createdByIncludeWhere ? { [Op.and]: [createdByIncludeWhere, cond] } : cond;
        } else {
          updatedByIncludeWhere = updatedByIncludeWhere ? { [Op.and]: [updatedByIncludeWhere, cond] } : cond;
        }
        return;
      }
      if (opNorm === 'eq') andConds.push({ [key]: { [Op.iLike]: valStr } });
      else if (opNorm === 'ne') andConds.push({ [key]: { [Op.notILike]: valStr } });
      else if (opNorm === 'startsWith') andConds.push({ [key]: { [Op.iLike]: `${valStr}%` } });
      else if (opNorm === 'endsWith') andConds.push({ [key]: { [Op.iLike]: `%${valStr}` } });
      else if (opNorm === 'notContains') andConds.push({ [key]: { [Op.notILike]: `%${valStr}%` } });
      else if (opNorm === 'in' && Array.isArray(value)) andConds.push({ [key]: { [Op.in]: value } });
      else if (opNorm === 'isEmpty') andConds.push({ [Op.or]: [{ [key]: null }, { [key]: '' }] });
      else if (opNorm === 'isNotEmpty') andConds.push({ [Op.and]: [{ [key]: { [Op.ne]: null } }, { [key]: { [Op.ne]: '' } }] });
      else andConds.push({ [key]: { [Op.iLike]: `%${valStr}%` } });
    };

    if (columnFilters && typeof columnFilters === 'object') {
      for (const [k, spec] of Object.entries(columnFilters)) {
        if (!spec) continue;
        addFilter(k, spec.op, spec.value);
      }
    }

    if (Array.isArray(advancedFilters)) {
      for (const f of advancedFilters) {
        if (!f) continue;
        const k = f.key || f.field;
        if (!k) continue;
        addFilter(k, f.op || f.operator, f.value);
      }
    }

    const where = andConds.length ? { [Op.and]: andConds } : {};

    const sortSpec = req.body && req.body.sort ? req.body.sort : {};
    const sortKeyRaw = typeof sortSpec.key === 'string' ? sortSpec.key : '';
    const sortDirRaw = typeof sortSpec.dir === 'string' ? sortSpec.dir : '';
    const dir = (sortDirRaw || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const keyMap = {
      name: 'name',
      display_name: 'displayName',
      description: 'description',
      created_at: 'created_at',
      updated_at: 'updated_at',
      is_active: 'is_active',
    };
    const sortCol = keyMap[sortKeyRaw] || null;

    const { rows, count } = await Permission.findAndCountAll({
      where,
      limit,
      offset,
      attributes: ['id','name','displayName','description','is_active','created_at','updated_at','created_by','updated_by'],
      include: [
        { model: Permission.sequelize.models.User, as: 'createdBy', attributes: ['id','name'], where: createdByIncludeWhere || undefined, required: !!createdByIncludeWhere },
        { model: Permission.sequelize.models.User, as: 'updatedBy', attributes: ['id','name'], where: updatedByIncludeWhere || undefined, required: !!updatedByIncludeWhere },
      ],
      order: sortCol ? [[sortCol, dir]] : [['name', 'ASC']],
      distinct: true,
    });

    const total = count || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.status(200).json({
      meta: { page, limit, total, totalPages },
      data: rows.map(r => {
        const plain = r.get ? r.get({ plain: true }) : r;
        plain.display_name = plain.display_name || plain.displayName || null;
        plain.created_by = plain.createdBy?.name || null;
        plain.updated_by = plain.updatedBy?.name || null;
        delete plain.displayName;
        delete plain.createdBy;
        delete plain.updatedBy;
        return plain;
      })
    });
  } catch (err) {
    console.error('queryPermissions error', err);
    return res.status(500).json({ message: 'Failed to query permissions', error: err.message });
  }
};
