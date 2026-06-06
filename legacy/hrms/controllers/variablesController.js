'use strict';

const { CommonVariable } = require('../models');
const { v4: uuidv4 } = require('uuid');

function validType(t) {
  const map = {
    'blood-groups': 'blood_group',
    'marital-statuses': 'marital_status',
    'genders': 'gender',
  };
  return map[t] || null;
}

exports.list = async (req, res) => {
  const typeKey = validType(String(req.params.type || '').trim());
  if (!typeKey) return res.status(400).json({ message: 'invalid type' });
  const rows = await CommonVariable.findAll({ where: { type: typeKey, is_active: true }, order: [['name', 'ASC']] });
  res.json(rows.map(r => r.get({ plain: true })));
};

exports.create = async (req, res) => {
  const typeKey = validType(String(req.params.type || '').trim());
  if (!typeKey) return res.status(400).json({ message: 'invalid type' });
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ message: 'name is required' });
  const existing = await CommonVariable.findOne({ where: { type: typeKey, name } });
  if (existing) return res.status(409).json({ message: 'Already exists' });
  const payload = {
    id: uuidv4(),
    type: typeKey,
    name,
    is_active: true,
    created_by: req.user && req.user.id ? req.user.id : null,
    updated_by: req.user && req.user.id ? req.user.id : null,
  };
  const row = await CommonVariable.create(payload);
  res.status(201).json(row.get({ plain: true }));
};

exports.update = async (req, res) => {
  const id = String(req.params.id || '').trim();
  const name = String((req.body || {}).name || '').trim();
  if (!id) return res.status(400).json({ message: 'id required' });
  const row = await CommonVariable.findByPk(id);
  if (!row) return res.status(404).json({ message: 'Not found' });
  if (name) row.name = name;
  row.updated_by = req.user && req.user.id ? req.user.id : row.updated_by;
  await row.save();
  res.json(row.get({ plain: true }));
};

exports.remove = async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ message: 'id required' });
  const row = await CommonVariable.findByPk(id);
  if (!row) return res.status(404).json({ message: 'Not found' });
  await row.destroy();
  res.json({ success: true });
};
