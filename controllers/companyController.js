const { Company, Department, EmployeeDetail, User, sequelize } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../middlewares/AppError');

exports.getAllCompanies = async (req, res) => {
  const where = {};
  if (req.query.active === 'true') where.is_active = true;
  else if (req.query.active === 'false') where.is_active = false;
  const companies = await Company.findAll({
    where,
    attributes: ['id', 'name', 'description', 'address', 'logo_filename', 'is_active', 'created_at', 'updated_at', 'created_by', 'updated_by'],
    order: [['created_at', 'DESC']],
  });
  res.json({ companies });
};

exports.getCompanyById = async (req, res) => {
  const id = req.params.id;
  if (!id) throw new AppError('Company id is required', 400);
  const company = await Company.findByPk(id);
  if (!company) throw new AppError('Company not found', 404);
  res.json({ company });
};

const path = require('path');
const { safeUnlink } = require('../utils/fileUtils');

exports.createCompany = async (req, res) => {
  const { name, description, address } = req.body;
  if (!name || !String(name).trim()) throw new AppError('Company name is required', 400);
  const payload = { name: String(name).trim() };
  if (typeof description !== 'undefined') payload.description = description;
  if (typeof address !== 'undefined') payload.address = address;
  if (req.file && req.file.filename) {
    payload.logo_filename = req.file.filename;
  }
  if (req.user?.id) { payload.created_by = req.user.id; payload.updated_by = req.user.id; }
  const company = await Company.create(payload);
  res.status(201).json({ company });
};

exports.updateCompany = async (req, res) => {
  const id = req.params.id;
  if (!id) throw new AppError('Company id is required', 400);
  const { name, is_active, active, description, address } = req.body;
  const company = await Company.findByPk(id);
  if (!company) throw new AppError('Company not found', 404);
  if (typeof name !== 'undefined') {
    const nm = String(name).trim();
    if (!nm) throw new AppError('Company name is required', 400);
    company.name = nm;
  }
  if (typeof description !== 'undefined') {
    company.description = description;
  }
  if (typeof address !== 'undefined') {
    company.address = address;
  }
  if (typeof is_active !== 'undefined' || typeof active !== 'undefined') {
    const newActive = typeof is_active !== 'undefined'
      ? (typeof is_active === 'string' ? (is_active === 'true' || is_active === '1') : Boolean(is_active))
      : (typeof active === 'string' ? (active === 'true' || active === '1') : Boolean(active));
    company.is_active = newActive;
  }
  if (req.file && req.file.filename) {
    try {
      const uploadDir = path.join(__dirname, '..', 'uploads', 'company');
      await safeUnlink(uploadDir, company.logo_filename);
    } catch (_) {}
    company.logo_filename = req.file.filename;
  }
  if (req.user?.id) company.updated_by = req.user.id;
  company.updated_at = new Date();
  await company.save();
  res.json({ company });
};

exports.inactivateCompany = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const id = req.params.id;
    if (!id) throw new AppError('Company id is required', 400);
    
    const company = await Company.findByPk(id, { transaction: t });
    if (!company) throw new AppError('Company not found', 404);
    
    // 1. Deactivate Company
    company.is_active = false;
    if (req.user?.id) company.updated_by = req.user.id;
    company.updated_at = new Date();
    await company.save({ transaction: t });

    // 2. Deactivate Departments
    await Department.update(
      { is_active: false, updated_by: req.user?.id, updated_at: new Date() },
      { where: { company_id: id }, transaction: t }
    );

    // 3. Find Employees to Deactivate
    const employees = await EmployeeDetail.findAll({
      where: { company_id: id },
      attributes: ['id', 'user_id'],
      transaction: t
    });

    const userIds = employees.map(e => e.user_id).filter(uid => uid);
    const employeeIds = employees.map(e => e.id);

    // 4. Deactivate EmployeeDetails
    if (employeeIds.length > 0) {
      // Assuming EmployeeDetail has is_active via baseFields
      await EmployeeDetail.update(
        { is_active: false }, 
        { where: { id: employeeIds }, transaction: t }
      );
    }

    // 5. Deactivate Users (Login Access)
    if (userIds.length > 0) {
      await User.update(
        { is_active: false, updated_by: req.user?.id, updated_at: new Date() },
        { where: { id: userIds }, transaction: t }
      );
    }

    await t.commit();
    res.json({ company });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

exports.activateCompany = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const id = req.params.id;
    if (!id) throw new AppError('Company id is required', 400);
    
    const company = await Company.findByPk(id, { transaction: t });
    if (!company) throw new AppError('Company not found', 404);
    
    // 1. Activate Company
    company.is_active = true;
    if (req.user?.id) company.updated_by = req.user.id;
    company.updated_at = new Date();
    await company.save({ transaction: t });

    // 2. Activate Departments
    await Department.update(
      { is_active: true, updated_by: req.user?.id, updated_at: new Date() },
      { where: { company_id: id }, transaction: t }
    );

    // 3. Find Employees to Activate
    const employees = await EmployeeDetail.findAll({
      where: { company_id: id },
      attributes: ['id', 'user_id'],
      transaction: t
    });

    const userIds = employees.map(e => e.user_id).filter(uid => uid);
    const employeeIds = employees.map(e => e.id);

    // 4. Activate EmployeeDetails
    if (employeeIds.length > 0) {
      await EmployeeDetail.update(
        { is_active: true }, 
        { where: { id: employeeIds }, transaction: t }
      );
    }

    // 5. Activate Users (Restore Login Access)
    if (userIds.length > 0) {
      await User.update(
        { is_active: true, updated_by: req.user?.id, updated_at: new Date() },
        { where: { id: userIds }, transaction: t }
      );
    }

    await t.commit();
    res.json({ company });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

exports.companiesQuery = async (req, res) => {
  const payload = req.body || {};
  const page = Math.max(parseInt(payload.page, 10) || 1, 1);
  const limit = Math.min(parseInt(payload.limit, 10) || 10, 500);
  const offset = (page - 1) * limit;
  const query = typeof payload.query === 'string' ? payload.query.trim() : '';
  const statusFilter = String(payload.statusFilter || '').toLowerCase();
  const and = [];
  if (statusFilter === 'active') and.push({ is_active: true });
  else if (statusFilter === 'inactive') and.push({ is_active: false });
  if (query) and.push({ name: { [Op.iLike]: `%${query}%` } });
  const where = and.length ? { [Op.and]: and } : {};
  const { rows, count } = await Company.findAndCountAll({
    where,
    attributes: ['id', 'name', 'description', 'address', 'logo_filename', 'is_active', 'created_at', 'updated_at'],
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });
  res.json({
    meta: { page, limit, total: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / limit)) },
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'is_active', label: 'Active', type: 'boolean' },
      { key: 'created_at', label: 'Created At', type: 'date' },
      { key: 'updated_at', label: 'Updated At', type: 'date' },
    ],
    rows,
  });
};
