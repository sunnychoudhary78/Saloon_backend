const { Role, Permission, sequelize, Sequelize } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../middlewares/AppError'); // adjust path if needed
const logger = require('../utils/logger'); // adjust if you have a logger helper

const DEFAULT_HIERARCHY_LEVEL = 500;
const DEFAULT_SPACING = 100; // spacing used during rebalance

// helpers
const computeMidpoint = (lower, upper) => {
  // ensure lower < upper
  if (lower === upper) return null;
  const low = Math.min(lower, upper);
  const high = Math.max(lower, upper);
  // floor midpoint
  return Math.floor((low + high) / 2);
};

const ensureUniqueHierarchyLevel = async (level, transaction) => {
  const existing = await Role.findOne({ where: { hierarchy_level: level }, transaction });
  return !existing;
};

const rebalanceHierarchyLevels = async (transaction, spacing = DEFAULT_SPACING, start = 100) => {
  // fetch roles ordered by current hierarchy_level ascending (highest privilege first)
  const roles = await Role.findAll({
    order: [['hierarchy_level', 'ASC'], ['created_at', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE // ensure we lock rows
  });

  let next = start;
  for (const r of roles) {
    // only update when different (to reduce writes)
    if (r.hierarchy_level !== next) {
      r.hierarchy_level = next;
      await r.save({ transaction });
    }
    next += spacing;
  }
  return true;
};

/**
 * GET /roles
 * optional query: ?active=true
 * returns: { roles: [...] }
 */
exports.getAllRoles = async (req, res, next) => {
  const log = req && req.log ? req.log : logger;

  try {
    const where = {};

    if (req.query.active === 'true') {
      where.is_active = true;
    } else if (req.query.active === 'false') {
      where.is_active = false;
    }

    log.info({ query: req.query, where }, 'Fetching roles');

    const roles = await Role.findAll({
      where,
      attributes: ['id', 'name', 'created_at', 'updated_at', 'is_active', 'hierarchy_level', 'created_by', 'updated_by'],
      include: [
        {
          model: Permission,
          as: 'permissions',
          attributes: ['id', 'name', 'display_name', 'description'],
          through: { attributes: [] },
          required: false
        },
        { model: Role.sequelize.models.User, as: 'createdBy', attributes: ['id', 'name'] },
        { model: Role.sequelize.models.User, as: 'updatedBy', attributes: ['id', 'name'] },
      ],
      order: [['hierarchy_level', 'ASC'], ['created_at', 'DESC']]
    });

    log.info({ count: roles.length }, 'Roles fetched');

    const shaped = roles.map(r => {
      const plain = r.get ? r.get({ plain: true }) : r;
      plain.created_by = plain.createdBy?.name || null;
      plain.updated_by = plain.updatedBy?.name || null;
      delete plain.createdBy;
      delete plain.updatedBy;
      return plain;
    });

    res.json({ roles: shaped });
  } catch (err) {
    log.error({ err }, 'getAllRoles error');
    return next(err);
  }
};

/**
 * POST /roles/query
 * body: { page, limit, query, columnFilters, advancedFilters }
 * returns: { meta: { page, limit, total, totalPages }, rows: [...] }
 */
exports.queryRoles = async (req, res, next) => {
  const log = req && req.log ? req.log : logger;

  try {
    let { page, limit, query, columnFilters, advancedFilters } = req.body || {};
    page = parseInt(page, 10) || 1;
    limit = parseInt(limit, 10) || 10;
    if (page < 1) page = 1;
    if (limit < 1) limit = 10;

    const andConds = [];
    let createdByIncludeWhere = null;
    let updatedByIncludeWhere = null;

    if (query && String(query).trim()) {
      const q = String(query).trim();
      andConds.push({
        [Op.or]: [
          { name: { [Op.iLike]: `%${q}%` } },
          Sequelize.where(Sequelize.col('createdBy.name'), { [Op.iLike]: `%${q}%` }),
          Sequelize.where(Sequelize.col('updatedBy.name'), { [Op.iLike]: `%${q}%` })
        ]
      });
    }

    const addFilter = (rawKey, op, value) => {
      const key = String(rawKey);
      if (typeof value === 'undefined' || value === null || value === '') {
        if (op === 'isEmpty') {
          andConds.push({ [Op.or]: [{ [key]: null }, { [key]: '' }] });
        }
        return;
      }
      const opNorm = op || 'contains';
      const isCreatedBy = key === 'created_by';
      const isUpdatedBy = key === 'updated_by';

      // boolean
      if (key === 'is_active') {
        const b = typeof value === 'boolean' ? value : String(value) === 'true';
        if (opNorm === 'ne') andConds.push({ is_active: { [Op.ne]: b } });
        else andConds.push({ is_active: b });
        return;
      }

      // number
      if (key === 'hierarchy_level') {
        const num = Array.isArray(value) ? value.map(v => Number(v)) : Number(value);
        if (opNorm === 'eq') andConds.push({ hierarchy_level: { [Op.eq]: num } });
        else if (opNorm === 'ne') andConds.push({ hierarchy_level: { [Op.ne]: num } });
        else if (opNorm === 'lt') andConds.push({ hierarchy_level: { [Op.lt]: num } });
        else if (opNorm === 'lte') andConds.push({ hierarchy_level: { [Op.lte]: num } });
        else if (opNorm === 'gt') andConds.push({ hierarchy_level: { [Op.gt]: num } });
        else if (opNorm === 'gte') andConds.push({ hierarchy_level: { [Op.gte]: num } });
        else if (opNorm === 'between' && Array.isArray(value)) {
          andConds.push({ hierarchy_level: { [Op.between]: value.map(v => Number(v)) } });
        } else {
          andConds.push({ hierarchy_level: { [Op.eq]: num } });
        }
        return;
      }

      // date
      if (key === 'created_at' || key === 'createdAt' || key === 'updated_at' || key === 'updatedAt') {
        const colName = (key === 'created_at' || key === 'createdAt') ? 'created_at' : 'updated_at';
        const col = Sequelize.fn('DATE', Sequelize.col(`Role.${colName}`));
        const valStr = Array.isArray(value) ? value.map(v => String(v)) : String(value);
        if (opNorm === 'between' && Array.isArray(value)) {
          const [from, to] = value;
          if (from && to) andConds.push(Sequelize.where(col, { [Op.between]: [from, to] }));
          else if (from) andConds.push(Sequelize.where(col, { [Op.gte]: from }));
          else if (to) andConds.push(Sequelize.where(col, { [Op.lte]: to }));
        } else if (opNorm === 'eq') andConds.push(Sequelize.where(col, { [Op.eq]: String(valStr) }));
        else if (opNorm === 'ne') andConds.push(Sequelize.where(col, { [Op.ne]: String(valStr) }));
        else if (opNorm === 'lt') andConds.push(Sequelize.where(col, { [Op.lt]: String(valStr) }));
        else if (opNorm === 'lte') andConds.push(Sequelize.where(col, { [Op.lte]: String(valStr) }));
        else if (opNorm === 'gt') andConds.push(Sequelize.where(col, { [Op.gt]: String(valStr) }));
        else if (opNorm === 'gte') andConds.push(Sequelize.where(col, { [Op.gte]: String(valStr) }));
        else andConds.push(Sequelize.where(col, { [Op.eq]: String(valStr) }));
        return;
      }

      const valStr = String(value);

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

    // columnFilters
    if (columnFilters && typeof columnFilters === 'object') {
      for (const [k, spec] of Object.entries(columnFilters)) {
        if (!spec) continue;
        addFilter(k, spec.op, spec.value);
      }
    }

    // advancedFilters
    if (Array.isArray(advancedFilters)) {
      for (const f of advancedFilters) {
        if (!f) continue;
        const k = f.key || f.field;
        if (!k) continue;
        addFilter(k, f.op || f.operator, f.value);
      }
    }

    const where = andConds.length ? { [Op.and]: andConds } : {};

    const offset = (page - 1) * limit;
    const sortSpec = req.body && req.body.sort ? req.body.sort : {};
    const sortKeyRaw = typeof sortSpec.key === 'string' ? sortSpec.key : '';
    const sortDirRaw = typeof sortSpec.dir === 'string' ? sortSpec.dir : '';
    const dir = (sortDirRaw || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const keyMap = {
      name: 'name',
      created_at: 'created_at',
      updated_at: 'updated_at',
      is_active: 'is_active',
      hierarchy_level: 'hierarchy_level',
    };
    const sortCol = keyMap[sortKeyRaw] || null;

    const { rows, count } = await Role.findAndCountAll({
      where,
      limit,
      offset,
      attributes: ['id', 'name', 'created_at', 'updated_at', 'is_active', 'hierarchy_level', 'created_by', 'updated_by'],
      include: [
        {
          model: Permission,
          as: 'permissions',
          attributes: ['id', 'name', 'display_name', 'description'],
          through: { attributes: [] }
        },
        { model: Role.sequelize.models.User, as: 'createdBy', attributes: ['id','name'], where: createdByIncludeWhere || undefined, required: !!createdByIncludeWhere },
        { model: Role.sequelize.models.User, as: 'updatedBy', attributes: ['id','name'], where: updatedByIncludeWhere || undefined, required: !!updatedByIncludeWhere }
      ],
      order: sortCol ? [[sortCol, dir]] : [['hierarchy_level', 'ASC'], ['created_at', 'DESC']]
    });

    const total = count || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const shaped = rows.map(r => {
      const plain = r.get ? r.get({ plain: true }) : r;
      plain.created_by = plain.createdBy?.name || null;
      plain.updated_by = plain.updatedBy?.name || null;
      delete plain.createdBy;
      delete plain.updatedBy;
      return plain;
    });

    res.json({ meta: { page, limit, total, totalPages }, rows: shaped });
  } catch (err) {
    log.error({ err }, 'queryRoles error');
    return next(err);
  }
};

/**
 * POST /roles
 * body: { name, hierarchy_level? } OR { name, insert_between: { lowerId, upperId } }
 */
exports.addRole = async (req, res, next) => {
  const log = req && req.log ? req.log : logger;

  const t = await sequelize.transaction();
  try {
    const { name, hierarchy_level, insert_between } = req.body;

    if (!name || !String(name).trim()) {
      await t.rollback();
      throw new AppError('Role name is required', 400);
    }

    // helper: find first free integer between (exclusive) low and high
    const findFreeBetween = async (low, high, transaction) => {
      const lowNum = Math.min(low, high);
      const highNum = Math.max(low, high);

      // scan linearly from low+1 to high-1
      for (let candidate = lowNum + 1; candidate < highNum; candidate++) {
        // small optimization: skip if candidate equals low/high (shouldn't)
        const ok = await ensureUniqueHierarchyLevel(candidate, transaction);
        if (ok) return candidate;
      }
      return null;
    };

    // determine hierarchy_level to assign
    let assignedLevel = null;

    if (typeof hierarchy_level !== 'undefined' && hierarchy_level !== null) {
      const parsed = parseInt(hierarchy_level, 10);
      if (Number.isNaN(parsed) || parsed < 0) {
        await t.rollback();
        throw new AppError('hierarchy_level must be a non-negative integer', 400);
      }
      assignedLevel = parsed;
      const ok = await ensureUniqueHierarchyLevel(assignedLevel, t);
      if (!ok) {
        await t.rollback();
        throw new AppError(`hierarchy_level ${assignedLevel} already in use`, 400);
      }
    } else if (insert_between && (insert_between.lowerId || insert_between.upperId)) {
      // Insert between two existing roles provided by id(s).
      const lowerRole = insert_between.lowerId ? await Role.findByPk(insert_between.lowerId, { transaction: t, lock: t.LOCK.UPDATE }) : null;
      const upperRole = insert_between.upperId ? await Role.findByPk(insert_between.upperId, { transaction: t, lock: t.LOCK.UPDATE }) : null;

      if (!lowerRole || !upperRole) {
        await t.rollback();
        throw new AppError('Both lowerId and upperId must refer to existing roles', 400);
      }

      // 1) try simple midpoint first
      const midpoint = computeMidpoint(lowerRole.hierarchy_level, upperRole.hierarchy_level);
      if (midpoint === null) {
        await t.rollback();
        throw new AppError('Cannot compute midpoint for identical hierarchy levels', 400);
      }

      const free = await ensureUniqueHierarchyLevel(midpoint, t);
      if (free) {
        assignedLevel = midpoint;
      } else {
        // 2) rebalance & then scan for any integer between them
        // We'll retry with increasing spacing up to a few attempts
        let spacing = DEFAULT_SPACING;
        let attempts = 0;
        const maxAttempts = 4;
        let found = null;

        while (attempts < maxAttempts && !found) {
          attempts += 1;
          // rebalance using current spacing
          await rebalanceHierarchyLevels(t, spacing, 100);

          // reload lower & upper (they may have new levels)
          const newLower = await Role.findByPk(lowerRole.id, { transaction: t, lock: t.LOCK.UPDATE });
          const newUpper = await Role.findByPk(upperRole.id, { transaction: t, lock: t.LOCK.UPDATE });

          // scan the whole integer range for first free slot
          found = await findFreeBetween(newLower.hierarchy_level, newUpper.hierarchy_level, t);
          if (found) {
            assignedLevel = found;
            break;
          }

          // if not found, increase spacing and try again
          spacing = spacing * 2; // double spacing (100 -> 200 -> 400...)
        }

        if (!assignedLevel) {
          // as a last-resort attempt, try to take a value just below the upper or above the lower
          // (safe only if it is unique)
          const safeCandidates = [
            lowerRole.hierarchy_level + 1,
            upperRole.hierarchy_level - 1
          ];

          for (const cand of safeCandidates) {
            if (Number.isInteger(cand) && cand >= 0 && (await ensureUniqueHierarchyLevel(cand, t))) {
              assignedLevel = cand;
              break;
            }
          }
        }

        if (!assignedLevel) {
          await t.rollback();
          throw new AppError('Unable to allocate hierarchy level between the provided roles', 500);
        }
      }
    } else {
      // default flow
      assignedLevel = DEFAULT_HIERARCHY_LEVEL;
      let tries = 0;
      while (!(await ensureUniqueHierarchyLevel(assignedLevel, t)) && tries < 1000) {
        assignedLevel += 1;
        tries += 1;
      }
      if (tries >= 1000) {
        await t.rollback();
        throw new AppError('Failed to find a free default hierarchy level', 500);
      }
    }

    // create the role with assigned hierarchy_level and audit fields
    const createPayload = { name: String(name).trim(), hierarchy_level: assignedLevel };
    if (req.user && req.user.id) {
      createPayload.created_by = req.user.id;
      createPayload.updated_by = req.user.id;
    }
    const role = await Role.create(createPayload, { transaction: t });
    await t.commit();

    log.info({ RoleId: role.id, name: role.name, hierarchy_level: role.hierarchy_level }, 'Role created');

    const roleWithPerms = await Role.findByPk(role.id, {
      attributes: ['id', 'name', 'created_at', 'updated_at', 'is_active', 'hierarchy_level'],
      include: [{ model: Permission, as: 'permissions', attributes: ['id', 'name', 'display_name'], through: { attributes: [] } }]
    });

    res.status(201).json({ role: roleWithPerms });
  } catch (err) {
    await t.rollback().catch(() => { });
    log.error({ err }, 'addRole error');
    return next(err);
  }
};

/**
 * PUT /roles/:roleId
 * body: { name, permissions?, hierarchy_level?, insert_between?: { lowerId, upperId } }
 */
exports.updateRole = async (req, res, next) => {
  const log = req && req.log ? req.log : logger;
  const t = await sequelize.transaction();
  try {
    const id = req.params.roleId;
    const { name, permissions, hierarchy_level, insert_between } = req.body;

    const role = await Role.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!role) {
      await t.rollback();
      throw new AppError('Role not found', 404);
    }

    // update name
    if (name && String(name).trim()) {
      role.name = String(name).trim();
      await role.save({ transaction: t });
      log.info({ RoleId: role.id }, 'Role name updated');
    }

    // update hierarchy_level if provided directly
    if (typeof hierarchy_level !== 'undefined' && hierarchy_level !== null) {
      const parsed = parseInt(hierarchy_level, 10);
      if (Number.isNaN(parsed) || parsed < 0) {
        await t.rollback();
        throw new AppError('hierarchy_level must be a non-negative integer', 400);
      }
      // ensure uniqueness (unless it's same as current)
      if (parsed !== role.hierarchy_level) {
        const ok = await ensureUniqueHierarchyLevel(parsed, t);
        if (!ok) {
          await t.rollback();
          throw new AppError(`hierarchy_level ${parsed} already in use`, 400);
        }
      }
      role.hierarchy_level = parsed;
      await role.save({ transaction: t });
      log.info({ RoleId: role.id, hierarchy_level: role.hierarchy_level }, 'Role hierarchy_level updated (direct)');
    }

    // update via insert_between
    if (insert_between && (insert_between.lowerId || insert_between.upperId)) {
      const lowerRole = insert_between.lowerId ? await Role.findByPk(insert_between.lowerId, { transaction: t }) : null;
      const upperRole = insert_between.upperId ? await Role.findByPk(insert_between.upperId, { transaction: t }) : null;

      if (!lowerRole || !upperRole) {
        await t.rollback();
        throw new AppError('Both lowerId and upperId must refer to existing roles', 400);
      }

      const midpoint = computeMidpoint(lowerRole.hierarchy_level, upperRole.hierarchy_level);
      if (midpoint === null) {
        await t.rollback();
        throw new AppError('Cannot compute midpoint for identical hierarchy levels', 400);
      }

      const free = await ensureUniqueHierarchyLevel(midpoint, t);
      if (free) {
        role.hierarchy_level = midpoint;
        await role.save({ transaction: t });
        log.info({ RoleId: role.id, hierarchy_level: role.hierarchy_level }, 'Role hierarchy_level updated (midpoint)');
      } else {
        // rebalance and try again
        await rebalanceHierarchyLevels(t, DEFAULT_SPACING, 100);
        const newLower = await Role.findByPk(lowerRole.id, { transaction: t });
        const newUpper = await Role.findByPk(upperRole.id, { transaction: t });
        const newMid = computeMidpoint(newLower.hierarchy_level, newUpper.hierarchy_level);
        if (newMid === null) {
          await t.rollback();
          throw new AppError('Failed to compute new midpoint after rebalance', 500);
        }
        const freeAfter = await ensureUniqueHierarchyLevel(newMid, t);
        if (!freeAfter) {
          await t.rollback();
          throw new AppError('Unable to allocate hierarchy level between the provided roles', 500);
        }
        role.hierarchy_level = newMid;
        await role.save({ transaction: t });
        log.info({ RoleId: role.id, hierarchy_level: role.hierarchy_level }, 'Role hierarchy_level updated (midpoint after rebalance)');
      }
    }

    // If caller provided permissions array, sync them (replace existing)
    if (Array.isArray(permissions)) {
      // Validate permission ids exist
      const perms = await Permission.findAll({
        where: { id: permissions },
        attributes: ['id'],
        transaction: t
      });
      const foundIds = perms.map(p => p.id);
      const missing = permissions.filter(pid => !foundIds.includes(pid));
      if (missing.length > 0) {
        await t.rollback();
        throw new AppError(`Permissions not found: ${missing.join(', ')}`, 400);
      }

      await role.setPermissions(foundIds, { transaction: t });
      log.info({ RoleId: role.id, permissionsCount: foundIds.length }, 'Role permissions synced');
    }

    if (req.user && req.user.id) {
      role.updated_by = req.user.id;
    }
    role.updated_at = new Date();
    await role.save({ transaction: t });
    await t.commit();

    // return updated role with permissions
    const updated = await Role.findByPk(role.id, {
      attributes: ['id', 'name', 'created_at', 'updated_at', 'is_active', 'hierarchy_level'],
      include: [{ model: Permission, as: 'permissions', attributes: ['id', 'name', 'display_name'], through: { attributes: [] } }]
    });

    res.json({ role: updated });
  } catch (err) {
    await t.rollback().catch(() => { });
    log.error({ err }, 'updateRole error');
    return next(err);
  }
};

/**
 * PATCH /roles/:id/inactive
 * body: { is_active: boolean }  // to mark active/inactive (soft-delete pattern)
 */
exports.makeRoleInactive = async (req, res, next) => {
  const log = req && req.log ? req.log : logger;

  try {
    const id = req.params.roleId;
    const { is_active } = req.body;

    const role = await Role.findByPk(id);
    if (!role) throw new AppError('Role not found', 404);


    role.is_active = typeof is_active === 'boolean' ? is_active : false;
    if (req.user && req.user.id) {
      role.updated_by = req.user.id;
    }
    role.updated_at = new Date();
    await role.save();

    log.info({ RoleId: role.id, is_active: role.is_active }, 'Role active flag updated');

    res.json({ role: { id: role.id, name: role.name, is_active: role.is_active } });
  } catch (err) {
    log.error({ err }, 'makeRoleInactive error');
    return next(err);
  }
};

/**
 * POST /roles/:id/permissions
 * body: { permissionId }  OR { permissionIds: [id, ...] }
 * Adds one or many permissions to a role (without removing existing)
 */
exports.addPermissionToRole = async (req, res, next) => {
  const log = req && req.log ? req.log : logger;

  // Expecting route params: /roles/:roleId/permissions/:permissionId
  const { roleId, permissionId } = req.params;

  // basic input validation
  if (!roleId) return res.status(400).json({ message: 'roleId param missing' });
  if (!permissionId) return res.status(400).json({ message: 'permissionId param missing' });

  let t;
  try {
    t = await sequelize.transaction();

    // load role
    const role = await Role.findByPk(roleId, { transaction: t });
    if (!role) {
      await t.rollback();
      return res.status(404).json({ message: 'Role not found' });
    }

    // load permission
    const permission = await Permission.findByPk(permissionId, { transaction: t });
    if (!permission) {
      await t.rollback();
      return res.status(404).json({ message: 'Permission not found' });
    }

    // check if already assigned - use the semantic sequelize helper if available
    // role.hasPermission(permission) will be present if you have belongsToMany defined
    let alreadyAssigned = false;
    if (typeof role.hasPermission === 'function') {
      alreadyAssigned = await role.hasPermission(permission, { transaction: t });
    } else {
      // fallback: fetch existing permissions and check
      const existing = await role.getPermissions({ where: { id: permission.id }, transaction: t, attributes: ['id'] });
      alreadyAssigned = Array.isArray(existing) && existing.length > 0;
    }

    if (alreadyAssigned) {
      await t.commit();
      log.info({ roleId: role.id, permissionId: permission.id }, 'Permission already assigned to role - no-op');
      // return current role with permissions
      const updated = await Role.findByPk(role.id, {
        attributes: ['id', 'name'],
        include: [{ model: Permission, as: 'permissions', attributes: ['id', 'name', 'display_name'], through: { attributes: [] } }]
      });
      return res.status(200).json({ message: 'Permission already assigned to role', role: updated });
    }

    // add permission
    // prefer the generated addPermissions / addPermission helper
    if (typeof role.addPermission === 'function') {
      await role.addPermission(permission, { transaction: t });
    } else if (typeof role.addPermissions === 'function') {
      await role.addPermissions([permission.id], { transaction: t });
    } else {
      // fallback - insert into join table directly (assumes join table name/cols - prefer not to use this)
      throw new Error('Role-Permission association helper not available');
    }

    await t.commit();
    log.info({ RoleId: role.id, addedPermission: permission.id }, 'Permission added to role');

    // return updated role with its permissions
    const updatedRole = await Role.findByPk(role.id, {
      attributes: ['id', 'name'],
      include: [{ model: Permission, as: 'permissions', attributes: ['id', 'name', 'display_name'], through: { attributes: [] } }]
    });

    return res.status(200).json({ message: 'Permission added', role: updatedRole });
  } catch (err) {
    if (t) {
      try { await t.rollback(); } catch (_) { /* ignore rollback error */ }
    }
    log.error({ err, roleId, permissionId }, 'addPermissionToRole error');
    return next(err);
  }
};

/**
 * DELETE /roles/:id/permissions/:permissionId
 * Removes a single permission from the role
 */
exports.removePermissionFromRole = async (req, res, next) => {
  const log = req && req.log ? req.log : logger;

  const t = await sequelize.transaction();
  try {
    const { id, permissionId } = req.params; // role id and permission id

    const role = await Role.findByPk(id, { transaction: t });
    if (!role) {
      await t.rollback();
      throw new AppError('Role not found', 404);
    }

    const perm = await Permission.findByPk(permissionId, { transaction: t });
    if (!perm) {
      await t.rollback();
      throw new AppError('Permission not found', 404);
    }

    await role.removePermission(perm, { transaction: t });
    await t.commit();

    log.info({ RoleId: role.id, removedPermission: permissionId }, 'Permission removed from role');

    // return updated role with permissions
    const updated = await Role.findByPk(role.id, {
      attributes: ['id', 'name'],
      include: [{ model: Permission, as: 'permissions', attributes: ['id', 'name', 'display_name'], through: { attributes: [] } }]
    });

    res.json({ role: updated });
  } catch (err) {
    await t.rollback().catch(() => { });
    log.error({ err }, 'removePermissionFromRole error');
    return next(err);
  }
};
