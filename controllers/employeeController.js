const { EmployeeDetail, Department, User, Role, CompanySetting, Education, Experience, TableConfig, Draft, Address, SavedFilter, sequelize, Company } = require("../models");
const { Sequelize } = require('sequelize');
const { Op, col, fn, where: sequelizeWhere } = require('sequelize');
const { logger } = require('../utils/logger');
const AppError = require('../middlewares/AppError');
const ExcelJS = require("exceljs");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const address = require("../models/address");
const DEFAULT_TABLE_KEY = 'employees';
const { buildWhereFromFilters, MAX_LIMIT } = require('../services/employeeFilterBuilder');
const { registryByKey, columnRegistry } = require('../config/columnRegistry');

const safeString = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const safeDate = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '' || s.toLowerCase() === 'invalid date') return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) {
    console.warn('safeDate: invalid date received:', v);
    return null;
  }
  // return ISO date-only string YYYY-MM-DD
  return d.toISOString().slice(0, 10);
};

const safeNumber = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function initialsPrefix(rawName, override) {
  const ov = String(override || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (ov) return ov;
  const s = String(rawName || '').trim();
  if (!s) return 'EMP';
  const words = s.split(/\s+/).filter(Boolean);
  const initials = words.map(w => (w[0] || '').toUpperCase().replace(/[^A-Z0-9]/g, '')).join('');
  return initials || 'EMP';
}

async function computeNextPayrollCodeForCompany(companyId, overridePrefix) {
  let companyName = '';
  if (companyId) {
    const company = await Company.findByPk(String(companyId));
    companyName = company && company.name ? company.name : '';
  } else {
    const settings = await CompanySetting.findOne();
    companyName = settings && settings.company_name ? settings.company_name : '';
  }
  const prefix = initialsPrefix(companyName, overridePrefix);
  const like = `${prefix}%`;
  const rows = await EmployeeDetail.findAll({
    where: { payroll_code: { [Op.iLike]: like } },
    attributes: ['payroll_code'],
    order: [['created_at', 'DESC']],
    limit: 500,
  });
  let maxNum = 0;
  const re = new RegExp(`^${prefix}(\\d{6})$`);
  for (const r of rows) {
    const code = String(r.payroll_code || '').trim();
    const m = code.match(re);
    if (m) {
      const num = parseInt(m[1], 10);
      if (Number.isFinite(num) && num > maxNum) maxNum = num;
    }
  }
  const next = maxNum + 1;
  const nextCode = `${prefix}${String(next).padStart(6, '0')}`;
  return { prefix, nextNumber: next, nextCode };
}

exports.nextPayrollCode = async (req, res) => {
  try {
    const companyId = req.query && (req.query.companyId || req.query.company_id);
    const overridePrefix = req.query && req.query.prefix;
    const result = await computeNextPayrollCodeForCompany(companyId, overridePrefix);
    return res.json(result);
  } catch (err) {
    console.error('nextPayrollCode error', err);
    return res.status(500).json({ message: 'Failed to compute next payroll code', error: err && err.message ? err.message : err });
  }
};

/**
 * Add days to a date-only string (YYYY-MM-DD).
 * Uses UTC to avoid timezone shifts. Inclusive logic: adds (days - 1).
 * Example: addDaysToDateString('2025-01-01', 90) -> '2025-03-31'
 */
function addDaysToDateString(dateStr, days) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00.000Z'); // interpret as UTC date-only
  // inclusive: end = start + (days - 1)
  d.setUTCDate(d.getUTCDate() + (Number(days) || 0) - 1);
  return d.toISOString().slice(0, 10);
}

async function getDefaultProbationDays() {
  try {
    const settings = await CompanySetting.findOne();
    const days = settings && Number(settings.default_probation_days);
    if (Number.isFinite(days) && days >= 0) return parseInt(days, 10);
  } catch (err) {
    console.warn('Failed to read CompanySetting.default_probation_days', err);
  }
  return 90; // fallback default
}



/**
 * CREATE employee
 */
exports.createEmployee = async (req, res) => {
  try {
    const body = req.body || {};

    // REQUIRED: only these three
    const { user_id, manager_id, payroll_code } = body;
    if (!user_id) return res.status(400).json({ message: 'user_id is required' });
    if (!manager_id) return res.status(400).json({ message: 'manager_id is required' });
    let payrollCodeFinal = safeString(payroll_code);
    if (!payrollCodeFinal) {
      const companyId = body && body.company_id;
      if (!companyId) return res.status(400).json({ message: 'company_id is required to auto-generate payroll_code' });
      const { nextCode } = await computeNextPayrollCodeForCompany(companyId, null);
      payrollCodeFinal = nextCode;
    }

    // map fields
    const employeePayload = {
      user_id: safeString(user_id),
      client_name: safeString(body.client_name),
      client_code: safeString(body.client_code),
      payroll_code: payrollCodeFinal,
      associates_name: safeString(body.associates_name),
      doj: safeDate(body.doj),
      dob: safeDate(body.dob),
      dol: safeDate(body.dol),
      designation: safeString(body.designation),
      department_name: safeString(body.department_name),
      company_id: safeString(body.company_id),
      gender: safeString(body.gender),
      contact_primary: safeString(body.contact_primary),
      contact_secondary: safeString(body.contact_secondary),
      email: safeString(body.email),
      blood_group: safeString(body.blood_group),
      manager_id: safeString(manager_id),
      department_head_id: safeString(body.department_head_id),
      total_experience: safeNumber(body.total_experience),
      work_location: safeString(body.work_location),
      aadhar_number_encrypted: safeString(body.aadhar_number_encrypted),
      pan_number_encrypted: safeString(body.pan_number_encrypted),
      esi_no: safeString(body.esi_no),
      uan_no: safeString(body.uan_no),
      bank_name: safeString(body.bank_name),
      ifsc_code: safeString(body.ifsc_code),
      account_number_encrypted: safeString(body.account_number_encrypted),
      marital_status: safeString(body.marital_status),
      date_of_marriage: safeDate(body.date_of_marriage),
      nominee_name: safeString(body.nominee_name),
      nominee_dob: safeDate(body.nominee_dob),
      nominee_relation: safeString(body.nominee_relation),
      father_name: safeString(body.father_name),
      father_dob: safeDate(body.father_dob),
      mother_name: safeString(body.mother_name),
      mother_dob: safeDate(body.mother_dob),
      spouse_name: safeString(body.spouse_name),
      spouse_dob: safeDate(body.spouse_dob),
      basic: safeNumber(body.basic),
      hra: safeNumber(body.hra),
      conveyance: safeNumber(body.conveyance),
      other_allowance: safeNumber(body.other_allowance),
      bonus: safeNumber(body.bonus),
      gross: safeNumber(body.gross),
      ctc: safeNumber(body.ctc),
      // probation fields: keep DB defaults but we can set probation_end_date if doj present
      // is_on_probation will default to true in DB; you can override by sending is_on_probation in body
      is_on_probation: typeof body.is_on_probation === 'boolean' ? body.is_on_probation : undefined,
    };

    // compute probation_end_date if DOJ exists and employee will be on probation
    const doj = employeePayload.doj; // already ISO YYYY-MM-DD or null
    const willBeOnProbation = (employeePayload.is_on_probation === undefined) ? true : !!employeePayload.is_on_probation;

    if (doj && willBeOnProbation) {
      const defaultDays = await getDefaultProbationDays();
      employeePayload.probation_end_date = addDaysToDateString(doj, defaultDays);
    } else if (doj && employeePayload.is_on_probation === false) {
      // if explicitly provided is_on_probation=false, we may still want to set probation_end_date (optional)
      const defaultDays = await getDefaultProbationDays();
      employeePayload.probation_end_date = addDaysToDateString(doj, defaultDays);
    }

    // Ensure required fields are present after safing
    if (!employeePayload.user_id) return res.status(400).json({ message: 'user_id is required and must be a non-empty string' });
    if (!employeePayload.manager_id) return res.status(400).json({ message: 'manager_id is required and must be a non-empty string' });
    if (!employeePayload.payroll_code) return res.status(400).json({ message: 'payroll_code is required and must be a non-empty string' });

    // Create
    const employee = await EmployeeDetail.create(employeePayload);
    return res.status(201).json(employee);
  } catch (err) {
    console.error('createEmployee error:', err);
    return res.status(500).json({ message: 'Failed to create employee', error: err.message });
  }
};

/**
 * UPDATE employee details by user_id (params.id)
 * - If DOJ is changed and employee is_on_probation is true -> recompute probation_end_date
 * - If client passes explicit probation_end_date in body it will be used
 */
exports.updateEmployee = async (req, res) => {
  try {
    const user_id = req.params.id;

    const employee = await EmployeeDetail.findOne({ where: { user_id } });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // If DOJ is present in request, sanitize it
    let incomingDoj = undefined;
    if (req.body.hasOwnProperty('doj')) {
      incomingDoj = safeDate(req.body.doj);
      req.body.doj = incomingDoj; // normalized value (or null)
    }

    // If client explicitly sets probation_end_date, accept sanitized date-only string
    if (req.body.hasOwnProperty('probation_end_date')) {
      req.body.probation_end_date = safeDate(req.body.probation_end_date);
    }

    // If DOJ changed (or provided) AND employee is_on_probation (either DB or incoming body true), recompute probation_end_date
    const wasOnProbation = !!employee.is_on_probation;
    const incomingIsOnProbation = req.body.hasOwnProperty('is_on_probation') ? !!req.body.is_on_probation : undefined;
    const willBeOnProbation = (incomingIsOnProbation === undefined) ? wasOnProbation : incomingIsOnProbation;

    if (incomingDoj && willBeOnProbation) {
      // recompute using company settings unless client provided probation_end_date explicitly
      if (!req.body.probation_end_date) {
        const defaultDays = await getDefaultProbationDays();
        req.body.probation_end_date = addDaysToDateString(incomingDoj, defaultDays);
      }
    } else if (incomingDoj && req.body.hasOwnProperty('is_on_probation') && req.body.is_on_probation === false) {
      // optional: still set probation_end_date for audit
      if (!req.body.probation_end_date) {
        const defaultDays = await getDefaultProbationDays();
        req.body.probation_end_date = addDaysToDateString(incomingDoj, defaultDays);
      }
    }

    // Apply update
    const updatedEmployee = await employee.update(req.body);
    res.json(updatedEmployee);
  } catch (err) {
    console.error('updateEmployee error:', err);
    res.status(500).json({ message: 'Error updating employee', error: err.message });
  }
};


exports.getAllEmployees = async (req, res) => {
  const log = (req && req.log) ? req.log : logger;

  // parse paging params
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
  const offset = (page - 1) * limit;

  // sanitize search term for LIKE
  const rawSearch = (req.query.search || '').trim();
  const escapedSearch = rawSearch.replace(/[%_\\]/g, '\\$&');
  const searchWildcard = `%${escapedSearch}%`;

  // parse is_active filter (optional)
  const rawIsActive = typeof req.query.is_active !== 'undefined' ? String(req.query.is_active).toLowerCase() : null;
  let isActiveParam = null;
  if (rawIsActive !== null) {
    if (rawIsActive === 'true' || rawIsActive === '1' || rawIsActive === 'active') isActiveParam = true;
    else if (rawIsActive === 'false' || rawIsActive === '0' || rawIsActive === 'inactive') isActiveParam = false;
    else if (rawIsActive === 'all') isActiveParam = null; // explicit all -> no filter
    // otherwise treat as no filter
  }

  // determine user
  const userId = req.user && req.user.id;
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }

  // load user's config (if exists)
  const tableKey = typeof DEFAULT_TABLE_KEY !== 'undefined' ? DEFAULT_TABLE_KEY : 'employees_table';
  const userConfigRow = await TableConfig.findOne({
    where: { user_id: userId, table_key: tableKey, is_active: true }
  });

  // derive columns array from config or fallback to defaults
  let activeColumns;
  if (userConfigRow && Array.isArray(userConfigRow.config) && userConfigRow.config.length > 0) {
    const filtered = userConfigRow.config
      .filter(c => c && typeof c.key === 'string' && registryByKey[c.key])
      .map(c => ({ key: c.key, visible: !!c.visible, order: Number.isFinite(c.order) ? c.order : 999 }))
      .sort((a, b) => a.order - b.order);

    activeColumns = filtered;
  } else {
    activeColumns = columnRegistry.map((c, idx) => ({ key: c.key, visible: true, order: idx + 1 }));
  }

  // Build the columns meta returned to frontend (key + label)
  const columnsMeta = activeColumns
    .filter(ac => ac.visible)
    .map(ac => ({ key: ac.key, label: registryByKey[ac.key].label, type: registryByKey[ac.key].type }));

  // Build attributes/includes for Sequelize based on columns present
  const employeeAttrs = new Set();
  const userAttrs = new Set();
  const includeRole = activeColumns.some(c => c.key === 'role');

  let includeEducations = false;
  let includeExperiences = false;
  let includeManager = false;
  let includeDepartmentHead = false;
  let includeProbationReviewer = false;

  for (const col of activeColumns) {
    if (!col.visible) continue;
    const reg = registryByKey[col.key];
    if (!reg) continue;
    if (reg.source === 'employee') {
      if (col.key === 'educations_count') includeEducations = true;
      else if (col.key === 'experiences_count') includeExperiences = true;
      else if (col.key === 'manager_name') includeManager = true;
      else if (col.key === 'department_head_name') includeDepartmentHead = true;
      else if (col.key === 'probation_reviewed_by_name') includeProbationReviewer = true;
      else {
        employeeAttrs.add(reg.path);
      }
    } else if (reg.source === 'user') {
      const p = reg.path;
      if (p && p.startsWith('user.')) {
        const userField = p.replace(/^user\./, '');
        if (userField.startsWith('Role')) {
          userAttrs.add('id');
        } else {
          userAttrs.add(userField);
        }
      }
    }
  }

  userAttrs.add('id');

  // detect role alias on User model to include role correctly
  const userRoleAssoc = Object.values(User.associations || {}).find(a => a.target && a.target.name === 'Role');
  const roleAssocAs = userRoleAssoc ? userRoleAssoc.as : null;

  const userInclude = {
    model: User,
    as: 'user',
    attributes: Array.from(userAttrs),
    include: includeRole && roleAssocAs ? [{ model: Role, as: roleAssocAs, attributes: ['id', 'name'] }] : []
  };

  const includes = [userInclude];

  if (includeEducations) {
    includes.push({ model: Education, as: 'educations', attributes: ['id'], required: false });
  }
  if (includeExperiences) {
    includes.push({ model: Experience, as: 'experiences', attributes: ['id'], required: false });
  }

  if (includeManager) {
    includes.push({ model: User, as: 'manager', attributes: ['id', 'name', 'email'], required: false });
  }
  if (includeDepartmentHead) {
    includes.push({ model: User, as: 'department_head', attributes: ['id', 'name', 'email'], required: false });
  }
  if (includeProbationReviewer) {
    includes.push({ model: User, as: 'probation_reviewed_by_user', attributes: ['id', 'name', 'email'], required: false });
  }

  if (employeeAttrs.size === 0) employeeAttrs.add('id');
  const employeeAttributesArray = Array.from(employeeAttrs);

  // Build where clause for search (employee fields only) and apply is_active filter
  const where = {};
  if (rawSearch) {
    where[Op.or] = [
      { client_name: { [Op.iLike]: searchWildcard } },
      { payroll_code: { [Op.iLike]: searchWildcard } },
      { designation: { [Op.iLike]: searchWildcard } },
      { associates_name: { [Op.iLike]: searchWildcard } },
    ];
  }

  if (typeof isActiveParam === 'boolean') {
    where.is_active = isActiveParam;
  }

  // Query DB
  const { rows, count } = await EmployeeDetail.findAndCountAll({
    where,
    attributes: employeeAttributesArray,
    include: includes,
    offset,
    limit,
    distinct: true,
    order: [['created_at', 'DESC']]
  });

  const totalPages = Math.ceil(count / limit);

  // Shape rows according to columnsMeta (map keys -> values)
  const shapedRows = rows.map((r) => {
    const plain = r.get({ plain: true });
    const out = {};
    for (const colCfg of activeColumns) {
      const key = colCfg.key;
      if (!colCfg.visible) continue;
      const reg = registryByKey[key];
      if (!reg) continue;

      switch (key) {
        case 'role':
          out[key] = (plain.user && plain.user.Role && plain.user.Role.name) || null;
          break;
        case 'manager_name':
          out[key] = (plain.manager && plain.manager.name) || null;
          break;
        case 'department_head_name':
          out[key] = (plain.department_head && plain.department_head.name) || null;
          break;
        case 'probation_reviewed_by_name':
          out[key] = (plain.probation_reviewed_by_user && plain.probation_reviewed_by_user.name) || null;
          break;
        case 'educations_count':
          out[key] = Array.isArray(plain.educations) ? plain.educations.length : 0;
          break;
        case 'experiences_count':
          out[key] = Array.isArray(plain.experiences) ? plain.experiences.length : 0;
          break;
        default:
          if (reg.path.startsWith('user.')) {
            const userField = reg.path.replace(/^user\./, '');
            out[key] = plain.user ? plain.user[userField] : null;
          } else {
            out[key] = Object.prototype.hasOwnProperty.call(plain, reg.path) ? plain[reg.path] : null;
          }
          break;
      }
    }
    return out;
  });

  // return meta + columns + rows
  res.json({
    meta: { total: count, page, limit, totalPages },
    columns: columnsMeta,
    rows: shapedRows
  });
};


// get single employee details with id from params
exports.getSingleEmployee = async (req, res) => {
  try {
    const user_id = req.params.id;
    const employee = await EmployeeDetail.findOne({ where: { user_id } });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }
    res.json(employee);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Error fetching employee", error: err.message });
  }
};

exports.getEmployeeProfile = async (req, res) => {
  try {
    // current authenticated user id
    const id = req.user && req.user.id;
    if (!id) return res.status(401).json({ message: "Unauthorized" });

    // ensure user exists
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // fetch employee details with manager and department_head (use exact alias names)
    const employee = await EmployeeDetail.findOne({
      where: { user_id: user.id },
      attributes: [
        "id",
        "user_id",
        "associates_name",
        "payroll_code",
        "designation",
        "manager_id",
        "department_head_id",
        "doj",
        "total_experience",
        "work_location",
        "contact_primary",
        "email",
        "blood_group",
        "profile_picture",
        "employee_edit_enabled",
        "company_id"
      ],
      include: [
        {
          model: User,
          as: "manager", // exact alias from EmployeeDetail.associate
          attributes: ["id", "name", "email"], // DO NOT include password
        },
        {
          model: User,
          as: "department_head", // changed from reporting_to -> department_head
          attributes: ["id", "name", "email"],
        },
        {
          model: Department,
          as: "department",
          attributes: ["id", "name"],
        },
        {
          model: Company,
          as: "company",
          attributes: ["id", "name", "logo_filename"],
        }
      ],
    });

    if (!employee)
      return res.status(404).json({ message: "Employee not found" });

    // convert to plain JS object
    const plain = employee.get({ plain: true });

    return res.json(plain);
  } catch (err) {
    console.error("getSingleEmployee error:", err);
    return res
      .status(500)
      .json({ message: "Error fetching employee", error: err.message });
  }
};





exports.getEmployeeByUserId = async (req, res) => {
  const log = (req && req.log) ? req.log : logger;

  const requestedUserId = req.params.userId || (req.user && req.user.id);
  if (!requestedUserId) {
    // client error -> central error middleware will send 400
    throw new AppError('userId required', 400);
  }

  // authorization placeholder (keep your real RBAC check here)
  // if (String(req.user.id) !== String(requestedUserId) && !isAdmin(req.user)) {
  //   throw new AppError('Forbidden', 403);
  // }

  const user = await User.findOne({
    where: { id: requestedUserId },
    attributes: { exclude: ['password'] },
    include: [
      { model: Role, required: false },

      {
        model: EmployeeDetail,
        as: 'employee_detail',
        required: false,
        include: [
          { model: Education, as: 'educations', required: false },
          { model: Experience, as: 'experiences', required: false },
          { model: Address, as: 'addresses', required: false },

          { model: User, as: 'manager', attributes: ['id', 'name', 'email'], required: false },
          { model: User, as: 'department_head', attributes: ['id', 'name', 'email'], required: false },
          { model: User, as: 'probation_reviewed_by_user', attributes: ['id', 'name', 'email'], required: false },
          { model: Department, as: 'department', attributes: ['id', 'name', 'company_id'], required: false },
        ],
      },
    ],
  });

  if (!user) {
    // not found -> central middleware treats as operational 404
    throw new AppError('User not found', 404);
  }

  // normalize shape for frontend
  const employeeDetail = user.employee_detail ? user.employee_detail.get({ plain: true }) : null;
  if (employeeDetail) {
    if (!Array.isArray(employeeDetail.educations)) employeeDetail.educations = [];
    if (!Array.isArray(employeeDetail.experiences)) employeeDetail.experiences = [];
  }

  const combined = {
    user: user.get({ plain: true }),
    employee: employeeDetail,
  };

  // (optional) log a trace-level or info-level event — by default LOG_LEVEL = warn so this won't persist unless you change level
  // log.info({ requestedUserId, found: !!user }, 'Fetched employee by userId');

  return res.json({ data: combined });
};


/**
 * POST /api/employees/create-or-update
 * body: { user: {...}, employee: {...}, draftId? }
 * Transactionally create or update user & employee detail.
 */
exports.createOrUpdateEmployee = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const authUserId = req.user && req.user.id;
    if (!authUserId) {
      await t.rollback();
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { user: userPayload = {}, employee: empPayload = {}, draftId } = req.body;
    // console.log(req.body);


    // avoid logging full req.body (may contain PII). Optionally log non-sensitive metadata only:
    // console.log('createOrUpdateEmployee ', req.body.employee);

    // basic validation
    if (!userPayload || !userPayload.name || !userPayload.email) {
      await t.rollback();
      return res.status(400).json({ message: 'user.name and user.email are required' });
    }

    let userRecord;

    // -------- User create / update (unchanged except we ensure save before using email) --------
    if (userPayload.id) {
      userRecord = await User.findOne({ where: { id: userPayload.id }, transaction: t, lock: t.LOCK.UPDATE });
      if (!userRecord) {
        await t.rollback();
        return res.status(404).json({ message: 'User not found' });
      }
      userRecord.name = userPayload.name;
      if (userPayload.email) userRecord.email = userPayload.email;
      if (typeof userPayload.is_active !== 'undefined') userRecord.is_active = userPayload.is_active;
      if (userPayload.roleId) userRecord.roleId = userPayload.roleId;
      userRecord.updated_by = authUserId;
      await userRecord.save({ transaction: t });
    } else {

      const finalPassword = userPayload.password ?? "Immortal@2025";

      // Hash it
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(finalPassword, salt);

      // Create user
      userRecord = await User.create(
        {
          name: userPayload.name,
          email: userPayload.email,
          password: hashedPassword,
          roleId: userPayload.roleId || null,
          created_by: authUserId,
          updated_by: authUserId,
        },
        { transaction: t }
      );
    }

    const employeeRoleId = userRecord.roleId || userPayload.roleId || null
    if (empPayload && empPayload.manager_id && employeeRoleId) {
      const empRole = await Role.findByPk(employeeRoleId, { attributes: ['id', 'hierarchy_level'] })
      const mgr = await User.findByPk(empPayload.manager_id, { include: [{ model: Role, attributes: ['id', 'hierarchy_level'] }] })
      if (!mgr || !mgr.Role) {
        await t.rollback()
        return res.status(400).json({ message: 'Invalid manager' })
      }
      const mgrLevel = mgr.Role.hierarchy_level
      const empLevel = empRole ? empRole.hierarchy_level : null
      if (empLevel != null && !(mgrLevel < empLevel)) {
        await t.rollback()
        return res.status(400).json({ message: 'Manager must be senior to selected role' })
      }
    }
    if (empPayload && empPayload.department_head_id) {
      const headUser = await User.findByPk(empPayload.department_head_id, { include: [{ model: Role, attributes: ['id', 'name'] }] })
      const name = headUser && headUser.Role ? String(headUser.Role.name || '').toLowerCase() : ''
      const isDeptHead = name.includes('department') && name.includes('head')
      if (!isDeptHead) {
        await t.rollback()
        return res.status(400).json({ message: 'Selected user is not a department head' })
      }
    }

    // Auto-assign department_head_id to self if the user is a Department Head
    if (employeeRoleId) {
      const assignedRole = await Role.findByPk(employeeRoleId, { attributes: ['id', 'name'] });
      if (assignedRole) {
        const rName = String(assignedRole.name || '').toLowerCase();
        if (rName.includes('department') && rName.includes('head')) {
           empPayload.department_head_id = userRecord.id;
        }
      }
    }

    // derive department_name from department_id when missing
    if (empPayload && empPayload.department_id && (!empPayload.department_name || String(empPayload.department_name).trim() === '')) {
      const dep = await Department.findByPk(empPayload.department_id, { attributes: ['id', 'name', 'company_id'], transaction: t });
      if (dep && dep.name) {
        empPayload.department_name = dep.name;
      }
      if (dep && dep.company_id && (!empPayload.company_id || String(empPayload.company_id).trim() === '')) {
        empPayload.company_id = dep.company_id;
      }
    }

    // -------- EmployeeDetail upsert --------
    let empRecord = await EmployeeDetail.findOne({ where: { user_id: userRecord.id }, transaction: t, lock: t.LOCK.UPDATE });

    const isSelfUpdate = String(authUserId) === String(userRecord.id);
    if (empRecord && isSelfUpdate && empRecord.employee_edit_enabled === false) {
      await t.rollback();
      return res.status(403).json({ message: 'Edit disabled by manager. Contact your manager to enable edits.' });
    }

    // encrypt sensitive fields if present
    const pan_number_encrypted = empPayload.pan_number ? encrypt(empPayload.pan_number) : null;
    const aadhar_number_encrypted = empPayload.aadhar_number ? encrypt(empPayload.aadhar_number) : null;
    const account_number_encrypted = empPayload.account_number ? encrypt(empPayload.account_number) : null;

    // Attach encrypted values into the payload so the later "allowed" copy will pick them up.
    // Also remove the raw plaintext fields to avoid accidental persistence or logs.
    if (pan_number_encrypted) {
      empPayload.pan_number_encrypted = pan_number_encrypted;
    }
    if (aadhar_number_encrypted) {
      empPayload.aadhar_number_encrypted = aadhar_number_encrypted;
    }
    if (account_number_encrypted) {
      empPayload.account_number_encrypted = account_number_encrypted;
    }

    // Remove plaintext PII from the payload object
    delete empPayload.pan_number;
    delete empPayload.aadhar_number;
    delete empPayload.account_number;

    // allowed fields for employee detail
    const allowed = new Set([
      'client_name', 'client_code', 'payroll_code', 'associates_name', 'marital_status',
      'doj', 'dob', 'dol', 'probation_end_date', 'date_of_marriage',
      'designation', 'department_name', 'department_id', 'company_id', 'manager_id', 'department_head_id', 'total_experience', 'work_location',
      'work_mode', 'hybrid_office_days',
      'contact_primary', 'contact_secondary', 'email', 'gender', 'blood_group',
      'aadhar_number_encrypted', 'pan_number_encrypted', 'esi_no', 'uan_no',
      'bank_name', 'ifsc_code', 'account_number_encrypted', 'basic', 'hra', 'conveyance', 'other_allowance', 'bonus', 'gross', 'ctc',
      'nominee_name', 'nominee_dob', 'nominee_relation', 'father_name', 'father_dob', 'mother_name', 'mother_dob', 'spouse_name', 'spouse_dob',
      'profile_picture', 'is_on_probation', 'probation_reviewed_by', 'probation_reviewed_at', 'is_active'
    ]);

    if (empRecord) {
      // update allowed fields from empPayload
      for (const key of Object.keys(empPayload || {})) {
        if (allowed.has(key)) {
          empRecord[key] = empPayload[key];
        }
      }

      // ALWAYS sync employee email with user email
      empRecord.email = userRecord.email;

      // Sync active flag to employee when provided at user level
      if (typeof userPayload.is_active !== 'undefined') {
        empRecord.is_active = !!userPayload.is_active;
      }

      // Ensure encrypted values are applied explicitly (defensive)
      if (pan_number_encrypted) empRecord.pan_number_encrypted = pan_number_encrypted;
      if (aadhar_number_encrypted) empRecord.aadhar_number_encrypted = aadhar_number_encrypted;
      if (account_number_encrypted) empRecord.account_number_encrypted = account_number_encrypted;

      empRecord.updated_by = authUserId;
      await empRecord.save({ transaction: t });

      if (isSelfUpdate && empRecord.employee_edit_enabled === true) {
        empRecord.employee_edit_enabled = false;
        await empRecord.save({ transaction: t });
      }
    } else {
      const createObj = { user_id: userRecord.id, created_by: authUserId, updated_by: authUserId };

      // copy allowed fields from payload (but we'll override email with userRecord.email)
      for (const key of Object.keys(empPayload || {})) {
        if (allowed.has(key)) createObj[key] = empPayload[key];
      }

      // ALWAYS set employee email to user's email
      createObj.email = userRecord.email;

      // Set employee active flag aligned with user/empPayload
      if (typeof empPayload.is_active !== 'undefined') createObj.is_active = !!empPayload.is_active;
      else if (typeof userRecord.is_active !== 'undefined') createObj.is_active = !!userRecord.is_active;

      // Ensure encrypted values are set explicitly (defensive)
      if (pan_number_encrypted) createObj.pan_number_encrypted = pan_number_encrypted;
      if (aadhar_number_encrypted) createObj.aadhar_number_encrypted = aadhar_number_encrypted;
      if (account_number_encrypted) createObj.account_number_encrypted = account_number_encrypted;

      if (!createObj.payroll_code) {
        const companyId = createObj.company_id || empPayload.company_id || null;
        const { nextCode } = await computeNextPayrollCodeForCompany(companyId, null);
        createObj.payroll_code = nextCode;
      }

      let attempts = 0;
      while (true) {
        try {
          empRecord = await EmployeeDetail.create(createObj, { transaction: t });
          break;
        } catch (e) {
          const msg = String(e && e.message || '').toLowerCase();
          const isUnique = (e && e.name === 'SequelizeUniqueConstraintError') || msg.includes('unique');
          if (!isUnique || attempts >= 5) throw e;
          attempts++;
          const companyId = createObj.company_id || empPayload.company_id || null;
          const { nextCode } = await computeNextPayrollCodeForCompany(companyId, null);
          createObj.payroll_code = nextCode;
        }
      }

      if (isSelfUpdate && empRecord && empRecord.employee_edit_enabled === true) {
        empRecord.employee_edit_enabled = false;
        await empRecord.save({ transaction: t });
      }
    }

    // -------- Educations upsert (child table) --------
    if (Array.isArray(empPayload.educations)) {
      // fetch existing educations for this employee
      const existing = await Education.findAll({ where: { employee_id: empRecord.id }, transaction: t });
      const existingById = new Map(existing.map(e => [String(e.id), e]));

      const incoming = empPayload.educations.map((e) => ({
        id: e.id ? String(e.id) : null,
        level: e.level || null,
        board_or_university: e.board_or_university || e.board_university || null,
        institution: e.institution || e.institution_name || null,
        from_year: e.from_year || null,
        to_year: e.to_year || null,
        passing_year: e.passing_year || null,
        percentage: typeof e.percentage !== 'undefined' && e.percentage !== null ? e.percentage : null,
        notes: e.notes || null,
      }));

      const incomingIds = new Set();
      // process updates and creates
      for (const item of incoming) {
        if (item.id) {
          incomingIds.add(item.id);
          const exist = existingById.get(item.id);
          if (exist) {
            // update only allowed fields
            let changed = false;
            for (const k of ['level', 'board_or_university', 'institution', 'from_year', 'to_year', 'passing_year', 'percentage', 'notes']) {
              if (typeof item[k] !== 'undefined' && exist[k] !== item[k]) {
                exist[k] = item[k];
                changed = true;
              }
            }
            if (changed) {
              exist.updated_by = authUserId;
              await exist.save({ transaction: t });
            }
          } else {
            // incoming id provided but not found -> create as fallback
            const created = await Education.create({
              employee_id: empRecord.id,
              level: item.level,
              board_or_university: item.board_or_university,
              institution: item.institution,
              from_year: item.from_year,
              to_year: item.to_year,
              passing_year: item.passing_year,
              percentage: item.percentage,
              notes: item.notes,
              created_by: authUserId,
              updated_by: authUserId,
            }, { transaction: t });
            existingById.set(String(created.id), created);
            incomingIds.add(String(created.id));
          }
        } else {
          // create new row
          const created = await Education.create({
            employee_id: empRecord.id,
            level: item.level,
            board_or_university: item.board_or_university,
            institution: item.institution,
            from_year: item.from_year,
            to_year: item.to_year,
            passing_year: item.passing_year,
            percentage: item.percentage,
            notes: item.notes,
            created_by: authUserId,
            updated_by: authUserId,
          }, { transaction: t });
          incomingIds.add(String(created.id));
          existingById.set(String(created.id), created);
        }
      }

      // delete removed rows
      const toDelete = existing.filter(e => !incomingIds.has(String(e.id)));
      if (toDelete.length) {
        const deleteIds = toDelete.map(d => d.id);
        await Education.destroy({ where: { id: deleteIds }, transaction: t });
      }
    }

    // -------- Experiences upsert (child table) --------
    if (Array.isArray(empPayload.experiences)) {
      const existingExp = await Experience.findAll({ where: { employee_id: empRecord.id }, transaction: t });
      const existingExpById = new Map(existingExp.map(e => [String(e.id), e]));

      const incomingExp = empPayload.experiences.map(e => ({
        id: e.id ? String(e.id) : null,
        company_name: e.company_name || null,
        from_date: e.from_date || null,
        to_date: e.to_date || null,
        designation: e.designation || null,
        responsibilities: e.responsibilities || null,
        is_current: !!e.is_current,
        reason_for_leaving: e.reason_for_leaving || null,
        last_drawn_ctc: (typeof e.last_drawn_ctc !== 'undefined' && e.last_drawn_ctc !== null) ? e.last_drawn_ctc : null,
      }));

      const incomingExpIds = new Set();

      for (const item of incomingExp) {
        if (item.id) {
          incomingExpIds.add(item.id);
          const exist = existingExpById.get(item.id);
          if (exist) {
            let changed = false;
            for (const k of ['company_name', 'from_date', 'to_date', 'designation', 'responsibilities', 'is_current', 'reason_for_leaving', 'last_drawn_ctc']) {
              if (typeof item[k] !== 'undefined' && exist[k] !== item[k]) {
                exist[k] = item[k];
                changed = true;
              }
            }
            if (changed) {
              exist.updated_by = authUserId;
              await exist.save({ transaction: t });
            }
          } else {
            // fallback: create if incoming id not found
            const created = await Experience.create({
              employee_id: empRecord.id,
              company_name: item.company_name,
              from_date: item.from_date,
              to_date: item.to_date,
              designation: item.designation,
              responsibilities: item.responsibilities,
              is_current: item.is_current,
              reason_for_leaving: item.reason_for_leaving,
              last_drawn_ctc: item.last_drawn_ctc,
              created_by: authUserId,
              updated_by: authUserId,
            }, { transaction: t });
            existingExpById.set(String(created.id), created);
            incomingExpIds.add(String(created.id));
          }
        } else {
          // create new
          const created = await Experience.create({
            employee_id: empRecord.id,
            company_name: item.company_name,
            from_date: item.from_date,
            to_date: item.to_date,
            designation: item.designation,
            responsibilities: item.responsibilities,
            is_current: item.is_current,
            reason_for_leaving: item.reason_for_leaving,
            last_drawn_ctc: item.last_drawn_ctc,
            created_by: authUserId,
            updated_by: authUserId,
          }, { transaction: t });
          incomingExpIds.add(String(created.id));
          existingExpById.set(String(created.id), created);
        }
      }

      // delete removed experiences
      const toDeleteExp = existingExp.filter(e => !incomingExpIds.has(String(e.id)));
      if (toDeleteExp.length) {
        const deleteIds = toDeleteExp.map(d => d.id);
        await Experience.destroy({ where: { id: deleteIds }, transaction: t });
      }
    }

    // -------- Addresses upsert (child table) --------
    if (Array.isArray(empPayload.addresses)) {
      const existingAddr = await Address.findAll({ where: { employee_id: empRecord.id }, transaction: t });
      const existingByType = new Map(existingAddr.map(a => [String(a.type), a]));

      const incoming = empPayload.addresses.map(a => ({
        type: a.address_type || a.type || 'other',
        address_1: a.address_1 || a.address_1 || null,
        address_2: a.address_2 || a.address_2 || null,
        landmark: a.landmark || null,
        city: a.city || null,
        state: a.state || null,
        district: a.district || null,
        pin_code: a.pin_code || a.pin_code || null,
        country: a.country || 'India',
        id: a.id || null,
      }));

      const incomingTypes = new Set();

      for (const item of incoming) {
        const atype = String(item.type);
        incomingTypes.add(atype);
        const exist = existingByType.get(atype);

        if (exist) {
          let changed = false;
          for (const k of ['address_1', 'address_2', 'landmark', 'city', 'state', 'district', 'pin_code', 'country']) {
            if (typeof item[k] !== 'undefined' && exist[k] !== item[k]) {
              exist[k] = item[k];
              changed = true;
            }
          }
          if (changed) {
            exist.updated_by = authUserId;
            await exist.save({ transaction: t });
          }
        } else {
          await Address.create({
            employee_id: empRecord.id,
            type: atype,
            address_1: item.address_1,
            address_2: item.address_2,
            landmark: item.landmark,
            city: item.city,
            state: item.state,
            district: item.district,
            pin_code: item.pin_code,
            country: item.country,
            created_by: authUserId,
            updated_by: authUserId,
          }, { transaction: t });
        }
      }

      const toDelete = existingAddr.filter(a => !incomingTypes.has(String(a.type)));
      if (toDelete.length) {
        await Address.destroy({ where: { id: toDelete.map(d => d.id) }, transaction: t });
      }
    }

    // -------- mark draft submitted if provided (optional) --------
    if (draftId) {
      try {
        const draft = await Draft.findOne({ where: { id: draftId, is_active: true }, transaction: t });
        if (draft) {
          draft.status = 'submitted';
          draft.updated_by = authUserId;
          draft.is_active = false;
          await draft.save({ transaction: t });
        }
      } catch (e) {
        console.warn('Failed to mark draft submitted:', e);
      }
    }

    // reload employee with educations & related user info to return
    const employeeWithChildren = await EmployeeDetail.findOne({
      where: { id: empRecord.id },
      include: [
        { model: Education, as: 'educations' },
        { model: Experience, as: 'experiences' },
      ],
      transaction: t,
    });

    await t.commit();
    return res.status(200).json({
      ok: true,
      user: userRecord.get({ plain: true }),
      employee: employeeWithChildren ? employeeWithChildren.get({ plain: true }) : empRecord.get({ plain: true }),
    });
  } catch (err) {
    await t.rollback();
    console.error('createOrUpdateEmployee error', err);

    if (err.name === 'SequelizeUniqueConstraintError') {
      const isEmail = err.errors && err.errors.some(e => e.path === 'email' || e.message.toLowerCase().includes('email'));
      if (isEmail) {
        return res.status(409).json({ message: 'Email already exists' });
      }
      // Handle other unique constraints if necessary, or return a generic unique error
      const fields = err.errors ? err.errors.map(e => e.path).join(', ') : 'unknown field';
      return res.status(409).json({ message: `${fields} already exists` });
    }

    res.status(500).json({ message: 'Failed to create/update employee', error: err.message });
  }
};

// Make employee inactive (and also mark user inactive)
exports.makeEmployeeInactive = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const id = req.params.id;
    if (!id) { await t.rollback(); return res.status(400).json({ message: 'id required' }); }

    const user = await User.findOne({ where: { id }, transaction: t, lock: t.LOCK.UPDATE });
    const employee = await EmployeeDetail.findOne({ where: { user_id: id }, transaction: t, lock: t.LOCK.UPDATE });

    if (!user || !employee) {
      await t.rollback();
      return res.status(404).json({ message: 'Employee not found' });
    }

    user.is_active = false;
    await user.save({ transaction: t });

    employee.is_active = false;
    await employee.save({ transaction: t });

    await t.commit();
    return res.status(200).json({ message: 'Employee made inactive', user: { id: user.id, is_active: user.is_active }, employee: { id: employee.id, is_active: employee.is_active } });
  } catch (err) {
    await t.rollback();
    console.error('makeEmployeeInactive error:', err);
    return res.status(500).json({ message: 'Failed to make employee inactive', error: err.message });
  }
};


// ---------------------------------------------------------------------------------------------------



exports.employeesQuery = async (req, res) => {
  try {
    const payload = req.body || {};
    // console.log('payload', payload);

    const page = Math.max(Number(payload.page) || 1, 1);
    const limit = Math.min(Number(payload.limit) || 20, MAX_LIMIT);
    const offset = (page - 1) * limit;

    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const tableKey = typeof DEFAULT_TABLE_KEY !== 'undefined' ? DEFAULT_TABLE_KEY : 'employees_table';
    const userConfigRow = await TableConfig.findOne({
      where: { user_id: userId, table_key: tableKey, is_active: true }
    });

    let activeColumns;
    if (userConfigRow && Array.isArray(userConfigRow.config) && userConfigRow.config.length > 0) {
      const filtered = userConfigRow.config
        .filter(c => c && typeof c.key === 'string' && registryByKey[c.key])
        .map(c => ({ key: c.key, visible: !!c.visible, order: Number.isFinite(c.order) ? c.order : 999 }))
        .sort((a, b) => a.order - b.order);
      activeColumns = filtered;
    } else {
      activeColumns = columnRegistry.map((c, idx) => ({ key: c.key, visible: true, order: idx + 1 }));
    }

    const columnsMeta = activeColumns
      .filter(ac => ac.visible)
      .map(ac => ({ key: ac.key, label: registryByKey[ac.key].label, type: registryByKey[ac.key].type }));
    const activeKeys = activeColumns.filter(ac => ac.visible).map(ac => ac.key);

    // ---------------------------
    // Filter transformer helpers
    // ---------------------------
    function normalizeOpKey(opRaw = '') {
      if (!opRaw) return 'eq';
      return String(opRaw).trim();
    }

    // Build a single filter for a column (returns { type: 'top'|'include', payload })
    function buildFilterFromSingle({ colKey, filter }) {
      if (!filter || !registryByKey[colKey]) return null;

      // skip empty values (but allow false/0)
      const { value } = filter;
      const opKeyRaw = normalizeOpKey(filter.op || filter.operator || 'eq');
      const specialNoValue = opKeyRaw === 'isEmpty' || opKeyRaw === 'isNotEmpty' || opKeyRaw === 'isAnything' || opKeyRaw === 'isEmptyString';
      if (!specialNoValue) {
        if (value === null || typeof value === 'undefined') return null;
        if (typeof value === 'string' && value.trim() === '') return null;
      }

      const reg = registryByKey[colKey];
      const opKey = opKeyRaw;

      const typeOps = {
        string: new Set(['startsWith', 'endsWith', 'contains', 'notContains', 'eq', 'ne', 'in', 'isEmpty', 'isNotEmpty', 'isAnything', 'isEmptyString', 'same', 'different']),
        number: new Set(['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'between', 'in', 'isEmpty', 'isNotEmpty', 'isAnything', 'same', 'different']),
        date: new Set(['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'between', 'isEmpty', 'isNotEmpty', 'isAnything', 'same', 'different']),
        boolean: new Set(['eq', 'ne', 'isAnything']),
        uuid: new Set(['eq', 'ne', 'in', 'isEmpty', 'isNotEmpty', 'isAnything', 'same', 'different']),
        count: new Set(['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'between', 'isEmpty', 'isNotEmpty', 'isAnything', 'same', 'different']),
      };
      const t = reg.type || 'string';
      const allowed = typeOps[t] || typeOps.string;
      const normalizedOp = (opKey === 'same') ? 'eq' : (opKey === 'different') ? 'ne' : opKey;
      if (!allowed.has(opKey)) return null;

      const OpMap = {
        eq: Op.eq,
        equals: Op.eq,
        ne: Op.ne,
        not: Op.ne,
        iLike: Op.iLike,
        ilike: Op.iLike,
        contains: Op.iLike,
        notContains: Op.notILike,
        startsWith: Op.iLike,
        endsWith: Op.iLike,
        like: Op.like,
        in: Op.in,
        notIn: Op.notIn,
        gt: Op.gt,
        gte: Op.gte,
        lt: Op.lt,
        lte: Op.lte,
        between: Op.between
      };

      const sequelizeOp = OpMap[normalizedOp];
      if (!sequelizeOp) {
        console.warn(`Unknown operator "${normalizedOp}" for column "${colKey}"`);
        return null;
      }

      const path = reg.path || '';
      const segments = path.split('.').filter(Boolean);

      if (normalizedOp === 'isAnything') {
        return null;
      }

      if (normalizedOp === 'isEmpty') {
        const attr = segments[segments.length - 1] || colKey;
        if (t === 'string') {
          const payload = { [Op.or]: [{ [attr]: { [Op.is]: null } }, { [attr]: '' }] };
          if (segments.length > 1) return { type: 'include', payload: { pathSegments: segments, condition: payload } };
          return { type: 'top', payload };
        } else {
          const payload = { [attr]: { [Op.is]: null } };
          if (segments.length > 1) return { type: 'include', payload: { pathSegments: segments, condition: payload } };
          return { type: 'top', payload };
        }
      }

      if (normalizedOp === 'isNotEmpty') {
        const attr = segments[segments.length - 1] || colKey;
        if (t === 'string') {
          const payload = { [Op.and]: [{ [attr]: { [Op.not]: null } }, { [attr]: { [Op.ne]: '' } }] };
          if (segments.length > 1) return { type: 'include', payload: { pathSegments: segments, condition: payload } };
          return { type: 'top', payload };
        } else {
          const payload = { [attr]: { [Op.not]: null } };
          if (segments.length > 1) return { type: 'include', payload: { pathSegments: segments, condition: payload } };
          return { type: 'top', payload };
        }
      }

      if (normalizedOp === 'isEmptyString') {
        const attr = segments[segments.length - 1] || colKey;
        const payload = { [attr]: '' };
        if (segments.length > 1) return { type: 'include', payload: { pathSegments: segments, condition: payload } };
        return { type: 'top', payload };
      }

      let conditionValue = value;
      if (sequelizeOp === Op.iLike || sequelizeOp === Op.notILike) {
        const v = String(value);
        if (normalizedOp === 'contains' || normalizedOp === 'notContains') conditionValue = `%${v}%`;
        else if (normalizedOp === 'startsWith') conditionValue = `${v}%`;
        else if (normalizedOp === 'endsWith') conditionValue = `%${v}`;
        else conditionValue = v;
      } else if (sequelizeOp === Op.in) {
        conditionValue = Array.isArray(value) ? value : [value];
      } else if (sequelizeOp === Op.between) {
        conditionValue = Array.isArray(value) ? value : String(value).split(',');
      } else {
        conditionValue = Array.isArray(value) ? value : value;
      }

      if (segments.length > 1) {
        const leafAttr = segments[segments.length - 1];
        return { type: 'include', payload: { pathSegments: segments, condition: { [leafAttr]: { [sequelizeOp]: conditionValue } } } };
      } else {
        const attr = segments[0] || colKey;
        return { type: 'top', payload: { [attr]: { [sequelizeOp]: conditionValue } } };
      }
    }

    // Transform both columnFilters (object) and advancedFilters (array) into { where, includeFilters }
    function transformFilters(payloadObj) {
      const topWhereClauses = [];
      const includeFilters = [];

      // columnFilters: object { colKey: { op, value } }
      const columnFilters = payloadObj.columnFilters || {};
      for (const [colKey, filter] of Object.entries(columnFilters || {})) {
        const built = buildFilterFromSingle({ colKey, filter });
        if (!built) continue;
        if (built.type === 'top') topWhereClauses.push(built.payload);
        else includeFilters.push(built.payload);
      }

      // advancedFilters: array [{ field, op, value }]
      const adv = Array.isArray(payloadObj.advancedFilters) ? payloadObj.advancedFilters : [];
      for (const f of adv) {
        if (!f || !f.field) continue;
        const colKey = f.field;
        const filter = { op: f.op || f.operator, value: f.value };
        const built = buildFilterFromSingle({ colKey, filter });
        if (!built) continue;
        if (built.type === 'top') topWhereClauses.push(built.payload);
        else includeFilters.push(built.payload);
      }

      const where = topWhereClauses.length === 0 ? {} : { [Op.and]: topWhereClauses };
      return { where, includeFilters };
    }

    // ---------------------------
    // Apply transformer & merge
    // ---------------------------
    const transformed = transformFilters(payload || {});
    let where = transformed.where || {};
    let includeFilters = transformed.includeFilters || [];

    // Ensure company_id filter is applied if present in payload (root or columnFilters)
    // This fixes the scoping issue in Company Detail > Employees tab
    const explicitCompanyId = payload.company_id || payload.companyId || (payload.columnFilters && payload.columnFilters.company_id && payload.columnFilters.company_id.value);
    if (explicitCompanyId) {
      const cIdStr = String(explicitCompanyId);
      // Ensure where is an Op.and structure
      if (!where[Op.and]) {
        if (Object.keys(where).length > 0) where = { [Op.and]: [where] };
        else where = { [Op.and]: [] };
      }
      where[Op.and].push({ company_id: cIdStr });
    }

    // ------------------------
    // SPECIAL CASE: role filter
    // ------------------------
    // If frontend passed a role filter in columnFilters or advancedFilters, resolve it to user ids
    const roleFilterCandidate = (payload.columnFilters && payload.columnFilters.role) ||
      (Array.isArray(payload.advancedFilters) && payload.advancedFilters.find(f => f.field === 'role'));

    if (roleFilterCandidate) {
      // normalise
      const rf = roleFilterCandidate.op ? roleFilterCandidate : { op: roleFilterCandidate.op || roleFilterCandidate.operator, value: roleFilterCandidate.value };
      const op = (rf.op || 'eq');
      const val = rf.value;

      let roleWhere;
      if (op === 'eq') {
        roleWhere = { name: val };
      } else if (op === 'ne') {
        roleWhere = { name: { [Op.ne]: val } };
      } else if (op === 'in') {
        roleWhere = { name: { [Op.in]: Array.isArray(val) ? val : [val] } };
      } else {
        const pattern = (typeof val === 'string' && val.length > 0) ? `%${val}%` : val;
        roleWhere = { name: { [Op.iLike]: pattern } };
      }

      // console.log('role filter -> roleWhere:', JSON.stringify(roleWhere));

      const roles = await Role.findAll({ where: roleWhere, attributes: ['id'] });
      const roleIds = roles.map(r => r.id);
      // console.log('roleIds found:', roleIds);

      if (roleIds.length === 0) {
        return res.json({
          meta: { total: 0, page, limit, totalPages: 0 },
          columns: columnsMeta,
          rows: []
        });
      }

      // find users with those roles
      const users = await User.findAll({ where: { roleId: { [Op.in]: roleIds } }, attributes: ['id'] });
      const userIds = users.map(u => u.id);
      // console.log('userIds for roles:', userIds);

      if (userIds.length === 0) {
        return res.json({
          meta: { total: 0, page, limit, totalPages: 0 },
          columns: columnsMeta,
          rows: []
        });
      }

      // merge into top-level where
      if (where && where.user_id) {
        // attempt intersection if existing uses Op.in
        const existing = where.user_id;
        if (existing[Op.in]) {
          const existingIds = Array.isArray(existing[Op.in]) ? existing[Op.in] : [];
          const intersect = existingIds.filter(id => userIds.includes(id));
          where.user_id = { [Op.in]: intersect };
        } else {
          where.user_id = { [Op.in]: userIds };
        }
      } else {
        where.user_id = { [Op.in]: userIds };
      }
    }

    // --- remove any includeFilters that target user.Role because we already resolved role manually ---
    if (Array.isArray(includeFilters) && includeFilters.length) {
      includeFilters = includeFilters.filter(f => {
        const segs = Array.isArray(f.pathSegments) ? f.pathSegments : [];
        // remove filters whose first two segments are ['user','Role'] (case-sensitive to your registry)
        if (segs.length >= 2 && segs[0] === 'user' && segs[1] === 'Role') return false;
        return true;
      });
    }

    // ------------------------
    // Build includes & attrs
    // ------------------------
    const userAttrs = new Set(['id']);
    const employeeAttrs = new Set();
    let includeRole = false;
    let includeEducations = false;
    let includeExperiences = false;
    let includeManager = false;
    let includeDepartmentHead = false;
    let includeProbationReviewer = false;
    let includeCreatedBy = false;
    let includeUpdatedBy = false;
    let includeCompany = false;

    for (const key of activeKeys) {
      const reg = registryByKey[key];
      if (!reg) continue;
      if (reg.source === 'employee') {
        if (key === 'educations_count') includeEducations = true;
        else if (key === 'experiences_count') includeExperiences = true;
        else if (key === 'manager_name') includeManager = true;
        else if (key === 'department_head_name') includeDepartmentHead = true;
        else if (key === 'probation_reviewed_by_name') includeProbationReviewer = true;
        else if (key === 'created_by') includeCreatedBy = true;
        else if (key === 'updated_by') includeUpdatedBy = true;
        else employeeAttrs.add(reg.path);
      } else if (reg.source === 'user') {
        const userPath = reg.path.replace(/^user\./, '');
        if (userPath.startsWith('Role.')) {
          includeRole = true;
          userAttrs.add('id');
        } else {
          userAttrs.add(userPath);
        }
        if (reg.key === 'role') includeRole = true;
      } else if (reg.source === 'company') {
        includeCompany = true;
      }
    }

    const userRoleAssoc = Object.values(User.associations || {}).find(a => a.target && a.target.name === 'Role');
    const roleAssocAs = userRoleAssoc ? userRoleAssoc.as : 'Role';

    const employeeToUserAssoc = Object.values(EmployeeDetail.associations || {}).find(a => a.target && a.target.name === 'User');
    const userIncludeAs = employeeToUserAssoc ? employeeToUserAssoc.as : 'user';

    const roleInclude = includeRole ? {
      model: Role,
      as: roleAssocAs,
      attributes: ['id', 'name'],
      required: false
    } : null;

    const userInclude = {
      model: User,
      as: userIncludeAs,
      attributes: Array.from(userAttrs),
      include: includeRole ? [roleInclude] : []
    };

    const includes = [userInclude];

    if (includeEducations) includes.push({ model: Education, as: 'educations', attributes: ['id'], required: false });
    if (includeExperiences) includes.push({ model: Experience, as: 'experiences', attributes: ['id'], required: false });
    if (includeManager) includes.push({ model: User, as: 'manager', attributes: ['id', 'name', 'email'], required: false });
    if (includeDepartmentHead) includes.push({ model: User, as: 'department_head', attributes: ['id', 'name', 'email'], required: false });
    if (includeProbationReviewer) includes.push({ model: User, as: 'probation_reviewed_by_user', attributes: ['id', 'name', 'email'], required: false });
    if (includeCreatedBy) includes.push({ model: User, as: 'created_by_user', attributes: ['id', 'name'], required: false });
    if (includeUpdatedBy) includes.push({ model: User, as: 'updated_by_user', attributes: ['id', 'name'], required: false });
    if (includeCompany) includes.push({ model: Company, as: 'company', attributes: ['id', 'name'], required: false });

    // ------------------------
    // apply includeFilters for nested fields
    // ------------------------
    function applyIncludeFilters(includeFiltersArr, includesArr) {
      if (!Array.isArray(includeFiltersArr) || includeFiltersArr.length === 0) return;
      for (const inc of includeFiltersArr) {
        const segs = inc.pathSegments || [];
        if (segs.length === 0) continue;

        const topAlias = segs[0];
        const top = includesArr.find(i => i.as === topAlias);
        if (!top) {
          console.warn('applyIncludeFilters: top include not found', topAlias);
          continue;
        }

        if (segs.length === 1) {
          top.where = top.where ? { [Op.and]: [top.where, inc.condition] } : inc.condition;
          top.required = true;
          continue;
        }

        let current = top;
        let applied = false;
        for (let i = 1; i < segs.length; i++) {
          const segment = segs[i];
          if (i === segs.length - 1) {
            current.where = current.where ? { [Op.and]: [current.where, inc.condition] } : inc.condition;
            current.required = true;
            applied = true;
            break;
          }
          if (!current.include || !Array.isArray(current.include)) { applied = false; break; }
          const next = current.include.find(ci => ci.as === segment);
          if (!next) { applied = false; break; }
          current = next;
        }
        if (!applied) console.warn('applyIncludeFilters: could not apply include filter for', segs);
      }
    }

    // debug logs before applying include filters
    // console.log('where before includeFilters merge:', JSON.stringify(where));
    // console.log('includeFilters:', JSON.stringify(includeFilters));
    // console.log('includes before applyIncludeFilters:', JSON.stringify(includes.map(i => ({ as: i.as, model: i.model && i.model.name }))));

    applyIncludeFilters(includeFilters, includes);

    // run query
    const employeeAttributesArray = Array.from(employeeAttrs.size ? employeeAttrs : new Set(['id']));

    // build order from payload.sort if provided
    let orderArr = [['created_at', 'DESC']];
    if (payload && payload.sort && payload.sort.key && (payload.sort.dir === 'asc' || payload.sort.dir === 'desc')) {
      const dir = String(payload.sort.dir).toUpperCase();
      const sortKey = String(payload.sort.key);
      const reg = registryByKey[sortKey];
      if (reg) {
        if (reg.source === 'employee') {
          orderArr = [[reg.path, dir]];
        } else if (reg.source === 'user') {
          const userField = reg.path.replace(/^user\./, '');
          if (userField.startsWith('Role.')) {
            orderArr = [[{ model: User, as: userIncludeAs }, { model: Role, as: roleAssocAs }, 'name', dir]];
          } else {
            orderArr = [[{ model: User, as: userIncludeAs }, userField, dir]];
          }
        }
      }
    }

    const { rows, count } = await EmployeeDetail.findAndCountAll({
      where,
      attributes: employeeAttributesArray,
      include: includes,
      offset,
      limit,
      distinct: true,
      order: orderArr
    });

    const totalPages = Math.ceil(count / limit);

    const shapedRows = rows.map(r => {
      const plain = r.get({ plain: true });
      const out = {};
      for (const key of activeKeys) {
        const reg = registryByKey[key];
        if (!reg) continue;
        switch (key) {
          case 'role':
            out[key] = (plain.user && plain.user[roleAssocAs] && plain.user[roleAssocAs].name) || null;
            break;
          case 'manager_name':
            out[key] = (plain.manager && plain.manager.name) || null;
            break;
          case 'department_head_name':
            out[key] = (plain.department_head && plain.department_head.name) || null;
            break;
          case 'probation_reviewed_by_name':
            out[key] = (plain.probation_reviewed_by_user && plain.probation_reviewed_by_user.name) || null;
            break;
          case 'created_by':
            out[key] = (plain.created_by_user && plain.created_by_user.name) || null;
            break;
          case 'updated_by':
            out[key] = (plain.updated_by_user && plain.updated_by_user.name) || null;
            break;
          case 'company_name':
            out[key] = (plain.company && plain.company.name) || null;
            break;
          case 'educations_count':
            out[key] = Array.isArray(plain.educations) ? plain.educations.length : 0;
            break;
          case 'experiences_count':
            out[key] = Array.isArray(plain.experiences) ? plain.experiences.length : 0;
            break;
          default:
            if (reg.path.startsWith('user.')) {
              const userField = reg.path.replace(/^user\./, '');
              out[key] = plain.user ? plain.user[userField] : null;
            } else {
              out[key] = Object.prototype.hasOwnProperty.call(plain, reg.path) ? plain[reg.path] : null;
            }
            break;
        }
      }
      return out;
    });

    return res.json({ meta: { total: count, page, limit, totalPages }, columns: columnsMeta, rows: shapedRows });
  } catch (err) {
    console.error('employeesQuery error', err);
    return res.status(400).json({ error: err.message || 'Failed building employee query' });
  }
};

// Saved filters CRUD handlers (simple implementations)
exports.createSavedFilter = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { name, table_key, filter_json, is_shared } = req.body;
    if (!name || !filter_json) return res.status(400).json({ error: 'Missing name or filter_json' });

    // validate filter_json by trying to build where
    try { buildWhereFromFilters(filter_json); } catch (e) { return res.status(400).json({ error: 'Invalid filter_json: ' + e.message }); }

    const sf = await SavedFilter.create({ user_id: userId, name, table_key: table_key || 'employees_table', filter_json, is_shared: !!is_shared });
    return res.json(sf);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed saving filter' });
  }
};

exports.listSavedFilters = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const rows = await SavedFilter.findAll({ where: { user_id: userId } });
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed listing filters' });
  }
};

exports.getSavedFilter = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    const id = Number(req.params.id);
    const row = await SavedFilter.findByPk(id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.user_id !== userId && !row.is_shared) return res.status(403).json({ error: 'Forbidden' });
    return res.json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed fetching filter' });
  }
};

exports.deleteSavedFilter = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    const id = Number(req.params.id);
    const row = await SavedFilter.findByPk(id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.user_id !== userId) return res.status(403).json({ error: 'Forbidden' });
    await row.destroy();
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed deleting filter' });
  }
};

exports.listManagerCandidates = async (req, res) => {
  try {
    const roleId = req.query.roleId;
    const departmentId = req.query.departmentId ? String(req.query.departmentId) : null;
    const companyId = req.query.companyId ? String(req.query.companyId) : null;

    let whereUser = {};
    let whereEmployee = {};
    let roleWhere = {};

    // 1. Hierarchy Filter (if roleId provided)
    if (roleId) {
      const baseRole = await Role.findByPk(roleId, { attributes: ['id', 'hierarchy_level'] });
      if (baseRole) {
        // "same 400 hierarchy or below 300" (User means: same or lower rank, i.e., same or higher hierarchy value?)
        // Wait, earlier I deduced: 
        // 1=SuperAdmin, 400=Manager.
        // "Below 300" (Better Rank) -> < 300.
        // User said: "same 400 or below 300". 
        // User excluded 100/200.
        // This implies: Range is (200, 400]. 
        // Hierarchy <= 400 AND Hierarchy > 200.
        
        let hierarchyOp = { [Op.lte]: baseRole.hierarchy_level }; // Include same level (400)
        
        // "dont fetch 100 or 200" - strictly for admin/super admin
        // We assume 100 and 200 are the high-level admins.
        // If the selected role is NOT an Admin (hierarchy > 200), we exclude Admins.
        if (baseRole.hierarchy_level > 200) {
            hierarchyOp[Op.gt] = 200;
        }
        
        roleWhere.hierarchy_level = hierarchyOp;
      }
    } else {
        // If no role selected, maybe just exclude Admins (100, 200) as safety?
        // User said "strictly for admin". 
        // Let's exclude them by default if no role specified, to be safe.
        roleWhere.hierarchy_level = { [Op.gt]: 200 };
    }

    // 2. Department Filter
    if (departmentId) {
        whereEmployee.department_id = departmentId;
    }

    // 3. Company Filter (if provided)
    // Note: EmployeeDetail has company_id (or we rely on department -> company?)
    // Usually EmployeeDetail has company_id.
    if (companyId) {
        whereEmployee.company_id = companyId;
    }

    // Find Roles first
    const roles = await Role.findAll({ 
        where: roleWhere,
        attributes: ['id']
    });
    const roleIds = roles.map(r => r.id);

    if (roleIds.length === 0) {
        return res.json([]);
    }

    whereUser.roleId = { [Op.in]: roleIds };

    // Find Users
    const users = await User.findAll({
        where: whereUser,
        attributes: ['id', 'name', 'email'],
        include: [
            {
                model: Role,
                attributes: ['id', 'name', 'hierarchy_level'],
            },
            {
                model: EmployeeDetail,
                as: 'employee_detail',
                attributes: [], // We don't need to return full employee details, just filter
                where: Object.keys(whereEmployee).length ? whereEmployee : undefined,
                required: Object.keys(whereEmployee).length > 0 // INNER JOIN if filters exist
            }
        ],
        order: [['name', 'ASC']]
    });

    return res.json(users);
  } catch (error) {
    console.error('listManagerCandidates error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.listDepartmentHeads = async (req, res) => {
  const roleWhere = { [Op.and]: [{ name: { [Op.iLike]: '%head%' } }, { name: { [Op.iLike]: '%depart%' } }] }
  const headRoles = await Role.findAll({ where: roleWhere, attributes: ['id'] })
  const roleIds = headRoles.map(r => r.id)
  const deps = await Department.findAll({ where: { department_head_id: { [Op.ne]: null } }, attributes: ['department_head_id'] })
  const deptHeadIds = Array.from(new Set(deps.map(d => d.department_head_id).filter(Boolean)))
  const where = roleIds.length && deptHeadIds.length ? { [Op.or]: [{ roleId: { [Op.in]: roleIds } }, { id: { [Op.in]: deptHeadIds } }] } : (roleIds.length ? { roleId: { [Op.in]: roleIds } } : { id: { [Op.in]: deptHeadIds } })
  const users = await User.findAll({ where, attributes: ['id', 'name', 'email'], include: [{ model: Role, attributes: ['id', 'name', 'hierarchy_level'] }] })
  return res.json(users)
}

exports.setEmployeeEditEnabled = async (req, res) => {
  try {
    const { userId } = req.params;
    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'enabled must be a boolean' });
    }
    const employee = await EmployeeDetail.findOne({ where: { user_id: userId } });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    employee.employee_edit_enabled = enabled;
    employee.updated_by = req.user && req.user.id ? req.user.id : employee.updated_by;
    await employee.save();
    return res.status(200).json({ ok: true, employee: employee.get({ plain: true }) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Failed to toggle edit mode', error: e.message });
  }
};

exports.setMyEditDisabled = async (req, res) => {
  try {
    const authUserId = req.user && req.user.id;
    if (!authUserId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const employee = await EmployeeDetail.findOne({ where: { user_id: authUserId } });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    employee.employee_edit_enabled = false;
    employee.updated_by = authUserId;
    await employee.save();
    return res.status(200).json({ ok: true, employee: employee.get({ plain: true }) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Failed to disable edit mode', error: e.message });
  }
};








  //-----------------------------------------------------------------------------------
  // Bulk upload employee details from Excel
  let encrypt;
  try {
    encrypt = require("../utils/crypto").encrypt; // optional, must return encrypted string
  } catch (e) {
    encrypt = (v) => v;
  }

  const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || "10", 10);

  /**
   * Bulk import employees (creates users if not present).
   *
   * Excel expectations:
   * - Sheet "employees" (required) -> rows with at least associates_name and email OR payroll_code
   * - Optional sheets: "educations", "experiences"
   *
   * For new users:
   * - name => associates_name
   * - email => email column
   * - password => firstName + '@2025' (hashed)
   * - roleId => Role with name 'employee' OR process.env.DEFAULT_ROLE_ID
   */

  async function resolveUserByIdentifiers({
    sequelize,
    t,
    userId,
    email,
    payrollCode,
  }) {
    // 1. resolve by userId
    if (userId) {
      const u = await User.findOne({ where: { id: userId }, transaction: t });
      if (u) return u;
    }

    // 2. resolve by email
    if (email) {
      const u = await User.findOne({ where: { email }, transaction: t });
      if (u) return u;
    }

    // 3. resolve by payrollCode -> employee_details -> user_id
    if (payrollCode) {
      const emp = await EmployeeDetail.findOne({
        where: { payroll_code: payrollCode },
        transaction: t,
      });
      if (emp && emp.user_id) {
        const u = await User.findOne({
          where: { id: emp.user_id },
          transaction: t,
        });
        if (u) return u;
      }
    }

    return null;
  }

  exports.bulkUploadEmployeeDetails = async (req, res) => {
    try {
      if (!req.file)
        return res
          .status(400)
          .json({ message: "Excel file is required (field name: file)" });

      // read workbook using exceljs
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(req.file.path);

      const readSheet = (name) => {
        const sheet =
          workbook.getWorksheet(name) ||
          workbook.getWorksheet(String(name).toLowerCase()) ||
          workbook.getWorksheet(String(name).toUpperCase());
        if (!sheet) return [];
        const headerRow = sheet.getRow(1);
        const headers = [];
        headerRow.eachCell((cell, colNumber) => {
          const v = cell && cell.value != null ? cell.value : '';
          headers[colNumber] = String(typeof v === 'object' && v.text ? v.text : v).trim();
        });
        const rows = [];
        for (let r = 2; r <= sheet.rowCount; r++) {
          const row = sheet.getRow(r);
          const obj = {};
          for (let c = 1; c <= headers.length; c++) {
            const key = headers[c];
            if (!key) continue;
            let val = row.getCell(c).value;
            if (val && typeof val === 'object') {
              val = val.text != null ? val.text : (val.result != null ? val.result : val.richText ? val.richText.map(t => t.text).join('') : null);
            }
            obj[key] = val == null ? null : (typeof val === 'string' ? val.trim() : val);
          }
          // skip completely empty rows
          if (Object.values(obj).every(v => v == null || String(v).trim() === '')) continue;
          rows.push(obj);
        }
        return rows;
      };

      const employeesRows = readSheet("employees");
      const educationRows = readSheet("educations");
      const experienceRows = readSheet("experiences");

      if (!employeesRows || employeesRows.length === 0) {
        // cleanup file
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) { }
        return res
          .status(400)
          .json({ message: "employees sheet is required and must contain rows" });
      }

      const results = [];
      const errors = [];
      const sequelize = EmployeeDetail.sequelize;

      // resolve roleId to assign to new users
      let defaultRoleId = process.env.DEFAULT_ROLE_ID || null;
      const foundRole = await Role.findOne({
        where: { name: { [Op.iLike]: "employee" } }, // case-insensitive match
      }).catch(() => null);
      if (foundRole) defaultRoleId = foundRole.id;

      // mapping payroll_code -> employee.id for linking child rows later
      const payrollToEmployeeId = {};

      // 1) Process employees (create user if needed, upsert employee_detail) - each row handled in its own transaction
      for (let i = 0; i < employeesRows.length; i++) {
        const row = employeesRows[i];
        const rowNum = i + 2; // header is row 1

        // tolerant field name extraction (common header variants)
        const associatesName =
          row.associates_name ||
          row.associatesName ||
          row["ASSOCIATE'S NAME"] ||
          row["ASSOCIATES NAME"] ||
          null;
        const email =
          (row.email ||
            row.contact_email ||
            row.contactEmail ||
            row.user_email ||
            null) &&
          String(
            row.email || row.contact_email || row.contactEmail || row.user_email
          ).trim();
        const payrollCode =
          (row.payroll_code || row.payrollCode || row["PAYROLL CODE"] || null) &&
          String(
            row.payroll_code || row.payrollCode || row["PAYROLL CODE"]
          ).trim();

        // Manager/reporting identifiers: each may appear in one of several columns in the sheet
        const manager_user_id = row.manager_user_id || row.managerUserId || null;
        const manager_email = row.manager_email || row.managerEmail || null;
        const manager_payroll_code = row.manager_payroll_code || row.managerPayrollCode || null;

        const dept_head_user_id = row.department_head_user_id || row.departmentHeadUserId || null;
        const dept_head_email = row.department_head_email || row.departmentHeadEmail || null;
        const dept_head_payroll_code = row.department_head_payroll_code || row.departmentHeadPayrollCode || null;

        // validation: need at least email or payroll_code to identify/create user+employee
        if (!email && !payrollCode) {
          errors.push({
            row: rowNum,
            message:
              "Either email (to create/find user) or payroll_code is required",
          });
          continue;
        }

        try {
          await sequelize.transaction(async (t) => {
            // -------------------------------------------------------------------
            // 1) create/find associate user
            // -------------------------------------------------------------------
            let user = null;
            if (email) {
              user = await User.findOne({ where: { email }, transaction: t });
            }

            let userId = user ? user.id : null;
            if (!userId) {
              if (!associatesName || !email) {
                throw new Error(
                  "Cannot create user: associates_name and email are required for new user creation"
                );
              }
              if (!defaultRoleId) {
                throw new Error(
                  'No roleId available to assign new users. Create a Role named "employee" or set DEFAULT_ROLE_ID env var.'
                );
              }

              const firstName =
                String(associatesName).trim().split(/\s+/)[0] || "user";
              const rawPassword = `${firstName}@2025`;
              const hashedPassword = await bcrypt.hash(rawPassword, SALT_ROUNDS);

              const newUser = await User.create(
                {
                  name: associatesName,
                  email,
                  password: hashedPassword,
                  roleId: defaultRoleId,
                  created_by: req.user ? req.user.id : null,
                  updated_by: req.user ? req.user.id : null,
                },
                { transaction: t }
              );

              userId = newUser.id;
              results.push({
                row: rowNum,
                action: "user_created",
                userId,
                email,
              });
            } else {
              results.push({ row: rowNum, action: "user_found", userId });
            }

            // -------------------------------------------------------------------
            // 2) accept manager_user_id / reporting_user_id if provided (optional)
            // -------------------------------------------------------------------
            // Prefer explicit IDs in the sheet to avoid accidental matches.
            let managerIdToSet = null;
            let departmentHeadIdToSet = null;

            // If sheet provides manager_user_id, validate it exists and use it.
            // We intentionally *do not* create or resolve by name/email here.
            async function resolveUser({ userId, email, payrollCode }) {
              return await resolveUserByIdentifiers({ sequelize, t, userId, email, payrollCode });
            }

            if (manager_user_id || manager_email || manager_payroll_code) {
              const mgr = await resolveUser({ userId: manager_user_id, email: manager_email, payrollCode: manager_payroll_code });
              if (mgr) managerIdToSet = mgr.id;
            }

            if (dept_head_user_id || dept_head_email || dept_head_payroll_code) {
              const head = await resolveUser({ userId: dept_head_user_id, email: dept_head_email, payrollCode: dept_head_payroll_code });
              if (head) departmentHeadIdToSet = head.id;
            }

            // -------------------------------------------------------------------
            // 3) Build employee payload (map excel columns to model) including manager_id & department_head_id
            // -------------------------------------------------------------------
            const payload = {
              user_id: userId,
              client_name:
                row.client_name || row.clientName || row["CLIENT NAME"] || null,
              client_code:
                row.client_code || row.clientCode || row["CLIENT CODE"] || null,
              payroll_code: payrollCode || null,
              associates_name: associatesName || null,
              doj: row.doj || row.DOJ || null,
              dob: row.dob || row.DOB || null,
              dol: row.dol || row.DOL || null,
              designation: row.designation || row.DESIGATION || null,
              department_name:
                row.department || row.department_name || row.DEPARTMENT || null,
              gender: row.gender || null,
              contact_primary:
                row.contact_primary ||
                row.contactPrimary ||
                row["CONTACT Primary"] ||
                null,
              contact_secondary:
                row.contact_secondary || row.contactSecondary || null,
              email: email || null,
              blood_group: row.blood_group || row["blood_group"] || null,
              manager_id: managerIdToSet,
              department_head_id: departmentHeadIdToSet,
              total_experience:
                row.total_experience || row.totalExperience || null,
              work_location: row.work_location || row.workLocation || null,
              work_mode: (row.work_mode || row.workMode || 'OFFICE'),
              hybrid_office_days: (() => {
                const v = row.hybrid_office_days || row.hybridOfficeDays || null;
                if (!v) return [];
                if (Array.isArray(v)) return v;
                const s = String(v).trim();
                if (!s) return [];
                return s.split(/[,\s]+/).filter(Boolean);
              })(),
              department_id: row.department_id || row.departmentId || null,
              aadhar_number_encrypted:
                row.aadhar_number || row.AADHAR || row.aadhar || null,
              pan_number_encrypted: row.pan_number || row.PAN || row.pan || null,
              esi_no: row.esi_no || row.ESI || null,
              uan_no: row.uan_no || row.UAN || null,
              bank_name: row.bank_name || row.BANK_NAME || null,
              ifsc_code: row.ifsc_code || row.IFSC || null,
              account_number_encrypted:
                row.account_number || row.ACCOUNT_NUMBER || null,
              marital_status: row.marital_status || row.MARITAL_STATUS || null,
              date_of_marriage:
                row.date_of_marriage || row["Date Of Marriage"] || null,
              nominee_name: row.nominee_name || row.NOMINEE_NAME || null,
              nominee_dob: row.nominee_dob || row.NOMINEE_DOB || null,
              nominee_relation:
                row.nominee_relation || row.NOMINEE_RELATION || null,
              father_name: row.father_name || row.Father_Name || null,
              father_dob: row.father_dob || row.Father_DOB || null,
              mother_name: row.mother_name || row.Mother_Name || null,
              mother_dob: row.mother_dob || row.Mother_DOB || null,
              spouse_name: row.spouse_name || row.Spouse_Name || null,
              spouse_dob: row.spouse_dob || row.Spouse_DOB || null,
              basic: row.basic != null ? row.basic : null,
              hra: row.hra != null ? row.hra : null,
              conveyance: row.conveyance != null ? row.conveyance : null,
              other_allowance:
                row.other_allowance != null
                  ? row.other_allowance
                  : row.otherAllowance || null,
              bonus: row.bonus != null ? row.bonus : null,
              gross: row.gross != null ? row.gross : null,
              ctc: row.ctc != null ? row.ctc : null,
              created_by: req.user ? req.user.id : null,
              updated_by: req.user ? req.user.id : null,
            };

            // Encrypt sensitive values if encrypt util exists
            if (payload.aadhar_number_encrypted)
              payload.aadhar_number_encrypted = encrypt(
                payload.aadhar_number_encrypted
              );
            if (payload.pan_number_encrypted)
              payload.pan_number_encrypted = encrypt(
                payload.pan_number_encrypted
              );
            if (payload.account_number_encrypted)
              payload.account_number_encrypted = encrypt(
                payload.account_number_encrypted
              );

            // -------------------------------------------------------------------
            // 4) Upsert EmployeeDetail: prefer match by payroll_code, else by user_id
            // -------------------------------------------------------------------
            let existingEmployee = null;
            if (payrollCode) {
              existingEmployee = await EmployeeDetail.findOne({
                where: { payroll_code: payrollCode },
                transaction: t,
              });
            }
            if (!existingEmployee && userId) {
              existingEmployee = await EmployeeDetail.findOne({
                where: { user_id: userId },
                transaction: t,
              });
            }

            if (existingEmployee) {
              await existingEmployee.update(payload, { transaction: t });
              payrollToEmployeeId[
                existingEmployee.payroll_code ||
                payrollCode ||
                existingEmployee.id
              ] = existingEmployee.id;
              results.push({
                row: rowNum,
                action: "employee_updated",
                employeeId: existingEmployee.id,
              });
            } else {
              const createdEmployee = await EmployeeDetail.create(payload, {
                transaction: t,
              });
              payrollToEmployeeId[
                createdEmployee.payroll_code || payrollCode || createdEmployee.id
              ] = createdEmployee.id;
              results.push({
                row: rowNum,
                action: "employee_created",
                employeeId: createdEmployee.id,
              });
            }
          }); // end per-row transaction
        } catch (rowErr) {
          // capture per-row error and continue processing other rows
          errors.push({ row: rowNum, message: rowErr.message });
          continue;
        }
      } // end for employees

      // cleanup uploaded file
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        /* ignore */
      }

      return res.json({ results, errors });
    } catch (err) {
      console.error("bulkUploadEmployeeDetails error:", err);
      // cleanup uploaded file on error
      try {
        if (req.file && req.file.path) fs.unlinkSync(req.file.path);
      } catch (e) { }
      return res
        .status(500)
        .json({ message: "Failed to process Excel file", error: err.message });
    }
  };

