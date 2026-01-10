// controllers/draftController.js
const { sequelize } = require('../models');
const Draft = sequelize.models.Draft;

/**
 * GET /api/drafts?formKey=employees&targetId=... -> find draft for current user
 * GET /api/drafts/:id -> get by id
 */
exports.getDraft = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    const { id } = req.params;
    const { formKey, targetId } = req.query;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    let draft;
    if (id) {
      draft = await Draft.findOne({ where: { id, is_active: true } });
    } else {
      draft = await Draft.findOne({
        where: { user_id: userId, form_key: formKey || 'employees', target_id: targetId || null, is_active: true }
      });
    }

    if (!draft) return res.status(404).json({ message: 'Draft not found' });
    if (String(draft.user_id) !== String(userId)) return res.status(403).json({ message: 'Forbidden' });

    return res.json({ draft });
  } catch (err) {
    console.error('getDraft error', err);
    res.status(500).json({ message: 'Failed to fetch draft', error: err.message });
  }
};

/**
 * POST /api/drafts
 * body: { form_key, target_id?, data? }
 */
exports.createDraft = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { form_key = 'employees', target_id = null, data = {} } = req.body;

    const created = await Draft.create({
      user_id: userId,
      form_key,
      target_id,
      data,
      created_by: userId,
      updated_by: userId,
      last_saved_at: new Date(),
    });

    return res.status(201).json({ draft: created });
  } catch (err) {
    console.error('createDraft error', err);
    res.status(500).json({ message: 'Failed to create draft', error: err.message });
  }
};

/**
 * PATCH /api/drafts/:id
 * body: { data?, changes? (array of {key, value}), version? }
 */
exports.updateDraft = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const userId = req.user && req.user.id;
    if (!userId) {
      await t.rollback();
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    const { data, changes, version } = req.body;

    const draft = await Draft.findOne({ where: { id, is_active: true }, transaction: t, lock: t.LOCK.UPDATE });
    if (!draft) {
      await t.rollback();
      return res.status(404).json({ message: 'Draft not found' });
    }
    if (String(draft.user_id) !== String(userId)) {
      await t.rollback();
      return res.status(403).json({ message: 'Forbidden' });
    }

    // optimistic lock
    if (typeof version === 'number' && version !== draft.version) {
      await t.rollback();
      return res.status(409).json({ message: 'Draft is stale', currentVersion: draft.version, draft });
    }

    let nextData = draft.data || {};

    if (Array.isArray(changes) && changes.length > 0) {
      // apply shallow changes by key
      for (const c of changes) {
        if (!c || typeof c.key !== 'string') continue;
        nextData[c.key] = c.value;
      }
    }

    if (data && typeof data === 'object') {
      // shallow merge; for deep merge, use a deep merge library
      nextData = { ...nextData, ...data };
    }

    draft.data = nextData;
    draft.version = (draft.version || 1) + 1;
    draft.last_saved_at = new Date();
    draft.updated_by = userId;

    await draft.save({ transaction: t });
    await t.commit();

    return res.json({ draft });
  } catch (err) {
    await t.rollback();
    console.error('updateDraft error', err);
    res.status(500).json({ message: 'Failed to update draft', error: err.message });
  }
};

/**
 * DELETE /api/drafts/:id  (soft delete)
 */
exports.deleteDraft = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    const draft = await Draft.findOne({ where: { id, is_active: true } });
    if (!draft) return res.status(404).json({ message: 'Draft not found' });
    if (String(draft.user_id) !== String(userId)) return res.status(403).json({ message: 'Forbidden' });

    draft.is_active = false;
    draft.updated_by = userId;
    await draft.save();

    return res.json({ ok: true });
  } catch (err) {
    console.error('deleteDraft error', err);
    res.status(500).json({ message: 'Failed to delete draft', error: err.message });
  }
};
