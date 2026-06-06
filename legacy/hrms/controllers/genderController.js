const { Gender } = require('../models');
const AppError = require('../middlewares/AppError');
const { genericQuery } = require('../services/genericQueryService');
const { genderRegistryByKey } = require('../config/columnRegistry');

exports.query = async (req, res) => {
  const defaultColumns = ['code', 'label', 'description', 'is_active', 'created_at'];
  const result = await genericQuery(Gender, req, 'genders', defaultColumns, genderRegistryByKey);
  res.json(result);
};

exports.getAll = async (req, res) => {
  const list = await Gender.findAll({ order: [['label', 'ASC']] });
  res.json(list);
};

exports.create = async (req, res) => {
  const { code, label, description } = req.body;
  if (!code || !label) throw new AppError('Code and Label are required', 400);

  const exists = await Gender.findOne({ where: { code } });
  if (exists) throw new AppError('Code already exists', 400);

  const item = await Gender.create({
    code,
    label,
    description,
    created_by: req.user.id,
    updated_by: req.user.id,
  });
  res.status(201).json(item);
};

exports.update = async (req, res) => {
  const { id } = req.params;
  const { code, label, description, is_active } = req.body;

  const item = await Gender.findByPk(id);
  if (!item) throw new AppError('Gender not found', 404);

  if (code && code !== item.code) {
    const exists = await Gender.findOne({ where: { code } });
    if (exists) throw new AppError('Code already exists', 400);
    item.code = code;
  }
  if (label) item.label = label;
  if (description !== undefined) item.description = description;
  if (is_active !== undefined) item.is_active = is_active;
  
  item.updated_by = req.user.id;
  await item.save();
  res.json(item);
};

exports.remove = async (req, res) => {
  const { id } = req.params;
  const item = await Gender.findByPk(id);
  if (!item) throw new AppError('Gender not found', 404);
  await item.destroy();
  res.json({ message: 'Deleted' });
};
