'use strict';

const { CompanySetting, EmployeeDetail } = require('../models');
const { v4: uuidv4 } = require('uuid');

function getCompanyId(req) {
  const q = req.query?.companyId;
  const p = req.params?.companyId;
  const id = (q || p || '').toString().trim();
  return id || null;
}

async function ensureSettings(companyId) {
  const where = companyId ? { company_id: companyId } : undefined;
  let settings = await CompanySetting.findOne({ where });
  if (!settings) {
    settings = await CompanySetting.create({
      company_id: companyId || null,
      company_name: 'Default Company',
      calendar_year_start: '2025-01-01',
      calendar_year_end: '2025-12-31',
      default_probation_days: 90,
      default_notice_period_days: 30,
      timezone: 'UTC',
      notes: null,
      designations: [],
      gmail_config: {},
      company_email_config: {}
    });
  }
  return settings;
}

const normalizeName = v => String(v || '').trim().toLowerCase();

exports.getSettings = async (req, res) => {
  const companyId = getCompanyId(req);
  const settings = await ensureSettings(companyId);
  res.json(settings);
};

exports.getMySettings = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  // Try to find employee record to get company_id
  const emp = await EmployeeDetail.findOne({ where: { user_id: userId } });
  const companyId = emp ? emp.company_id : null;

  const settings = await ensureSettings(companyId);

  // Return only requested fields
  const filtered = {
    id: settings.id,
    company_name: settings.company_name,
    calendar_year_start: settings.calendar_year_start,
    calendar_year_end: settings.calendar_year_end
  };

  res.json(filtered);
};

exports.updateSettings = async (req, res) => {
  const companyId = getCompanyId(req);
  const settings = await ensureSettings(companyId);
  const payload = req.body || {};
  const allowed = [
    'company_name',
    'calendar_year_start',
    'calendar_year_end',
    'default_probation_days',
    'default_notice_period_days',
    'timezone',
    'notes',
    'gmail_config',
    'company_email_config'
  ];
  const updates = {};
  for (const k of allowed) {
    if (payload[k] !== undefined) updates[k] = payload[k];
  }
  await settings.update(updates);
  res.json(settings);
};

exports.getDesignations = async (req, res) => {
  const companyId = getCompanyId(req);
  const settings = await ensureSettings(companyId);
  res.json(settings.designations || []);
};

exports.createDesignation = async (req, res) => {
  const companyId = getCompanyId(req);
  const settings = await ensureSettings(companyId);

  const payload = req.body || {};
  const name = String(payload.name || '').trim();
  if (!name) {
    return res.status(400).json({ message: 'name is required' });
  }

  const list = Array.isArray(settings.designations)
    ? settings.designations.slice()
    : [];

  // 🔒 Duplicate check (case-insensitive)
  const exists = list.some(
    d => normalizeName(d.name) === normalizeName(name)
  );

  if (exists) {
    return res.status(409).json({ message: 'Designation already exists' });
  }

  const item = {
    id: uuidv4(),
    name
  };

  const allowed = ['level', 'code', 'description'];
  for (const k of allowed) {
    if (payload[k] !== undefined) item[k] = payload[k];
  }

  list.push(item);
  await settings.update({ designations: list });

  res.status(201).json(item);
};

exports.updateDesignation = async (req, res) => {
  const companyId = getCompanyId(req);
  const settings = await ensureSettings(companyId);

  const id = String(req.params.id || '').trim();
  const payload = req.body || {};

  const list = Array.isArray(settings.designations)
    ? settings.designations.slice()
    : [];

  const idx = list.findIndex(d => String(d.id) === id);
  if (idx === -1) {
    return res.status(404).json({ message: 'Not found' });
  }

  const current = list[idx];

  // 🔒 Duplicate check ONLY if name is being changed
  if (payload.name !== undefined) {
    const newName = String(payload.name || '').trim();

    if (!newName) {
      return res.status(400).json({ message: 'name cannot be empty' });
    }

    const exists = list.some(
      d =>
        d.id !== id &&
        normalizeName(d.name) === normalizeName(newName)
    );

    if (exists) {
      return res.status(409).json({ message: 'Designation already exists' });
    }
  }

  const updates = {};
  if (payload.name !== undefined) updates.name = String(payload.name || '').trim();
  if (payload.level !== undefined) updates.level = payload.level;
  if (payload.code !== undefined) updates.code = payload.code;
  if (payload.description !== undefined) updates.description = payload.description;

  const next = { ...current, ...updates };
  list[idx] = next;

  await settings.update({ designations: list });
  res.json(next);
};

exports.deleteDesignation = async (req, res) => {
  const companyId = getCompanyId(req);
  const settings = await ensureSettings(companyId);
  const id = String(req.params.id || '').trim();
  const list = Array.isArray(settings.designations) ? settings.designations.slice() : [];
  const next = list.filter(d => String(d.id) !== id);
  if (next.length === list.length) return res.status(404).json({ message: 'Not found' });
  await settings.update({ designations: next });
  res.json({ success: true });
};

exports.getBloodGroups = async (req, res) => {
  const companyId = getCompanyId(req);
  const settings = await ensureSettings(companyId);
  res.json(settings.blood_groups || []);
};
exports.createBloodGroup = async (req, res) => {
  const companyId = getCompanyId(req);
  const settings = await ensureSettings(companyId);
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ message: 'name is required' });
  const item = { id: uuidv4(), name };
  const list = Array.isArray(settings.blood_groups) ? settings.blood_groups.slice() : [];
  list.push(item);
  await settings.update({ blood_groups: list });
  res.status(201).json(item);
};
exports.updateBloodGroup = async (req, res) => {
  const companyId = getCompanyId(req);
  const settings = await ensureSettings(companyId);
  const id = String(req.params.id || '').trim();
  const list = Array.isArray(settings.blood_groups) ? settings.blood_groups.slice() : [];
  const idx = list.findIndex(d => String(d.id) === id);
  if (idx === -1) return res.status(404).json({ message: 'Not found' });
  const next = { ...list[idx], name: String(((req.body || {}).name || '').trim()) };
  list[idx] = next;
  await settings.update({ blood_groups: list });
  res.json(next);
};
exports.deleteBloodGroup = async (req, res) => {
  const companyId = getCompanyId(req);
  const settings = await ensureSettings(companyId);
  const id = String(req.params.id || '').trim();
  const list = Array.isArray(settings.blood_groups) ? settings.blood_groups.slice() : [];
  const next = list.filter(d => String(d.id) !== id);
  if (next.length === list.length) return res.status(404).json({ message: 'Not found' });
  await settings.update({ blood_groups: next });
  res.json({ success: true });
};

exports.getMaritalStatuses = async (req, res) => {
  const companyId = getCompanyId(req);
  const settings = await ensureSettings(companyId);
  res.json(settings.marital_statuses || []);
};
exports.createMaritalStatus = async (req, res) => {
  const companyId = getCompanyId(req);
  const settings = await ensureSettings(companyId);
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ message: 'name is required' });
  const item = { id: uuidv4(), name };
  const list = Array.isArray(settings.marital_statuses) ? settings.marital_statuses.slice() : [];
  list.push(item);
  await settings.update({ marital_statuses: list });
  res.status(201).json(item);
};
exports.updateMaritalStatus = async (req, res) => {
  const companyId = getCompanyId(req);
  const settings = await ensureSettings(companyId);
  const id = String(req.params.id || '').trim();
  const list = Array.isArray(settings.marital_statuses) ? settings.marital_statuses.slice() : [];
  const idx = list.findIndex(d => String(d.id) === id);
  if (idx === -1) return res.status(404).json({ message: 'Not found' });
  const next = { ...list[idx], name: String(((req.body || {}).name || '').trim()) };
  list[idx] = next;
  await settings.update({ marital_statuses: list });
  res.json(next);
};
exports.deleteMaritalStatus = async (req, res) => {
  const companyId = getCompanyId(req);
  const settings = await ensureSettings(companyId);
  const id = String(req.params.id || '').trim();
  const list = Array.isArray(settings.marital_statuses) ? settings.marital_statuses.slice() : [];
  const next = list.filter(d => String(d.id) !== id);
  if (next.length === list.length) return res.status(404).json({ message: 'Not found' });
  await settings.update({ marital_statuses: next });
  res.json({ success: true });
};

exports.getGenders = async (req, res) => {
  const companyId = getCompanyId(req);
  const settings = await ensureSettings(companyId);
  res.json(settings.genders || []);
};
exports.createGender = async (req, res) => {
  const companyId = getCompanyId(req);
  const settings = await ensureSettings(companyId);
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ message: 'name is required' });
  const item = { id: uuidv4(), name };
  const list = Array.isArray(settings.genders) ? settings.genders.slice() : [];
  list.push(item);
  await settings.update({ genders: list });
  res.status(201).json(item);
};
exports.updateGender = async (req, res) => {
  const companyId = getCompanyId(req);
  const settings = await ensureSettings(companyId);
  const id = String(req.params.id || '').trim();
  const list = Array.isArray(settings.genders) ? settings.genders.slice() : [];
  const idx = list.findIndex(d => String(d.id) === id);
  if (idx === -1) return res.status(404).json({ message: 'Not found' });
  const next = { ...list[idx], name: String(((req.body || {}).name || '').trim()) };
  list[idx] = next;
  await settings.update({ genders: list });
  res.json(next);
};
exports.deleteGender = async (req, res) => {
  const companyId = getCompanyId(req);
  const settings = await ensureSettings(companyId);
  const id = String(req.params.id || '').trim();
  const list = Array.isArray(settings.genders) ? settings.genders.slice() : [];
  const next = list.filter(d => String(d.id) !== id);
  if (next.length === list.length) return res.status(404).json({ message: 'Not found' });
  await settings.update({ genders: next });
  res.json({ success: true });
};
