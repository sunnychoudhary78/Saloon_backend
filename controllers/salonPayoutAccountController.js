const { Op } = require('sequelize');
const { SalonPayoutAccount, SalonOwner, Salon, User } = require('../models');
const { maskAccountNumber, decryptAccountNumber } = require('../utils/payoutEncryption');

exports.query = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.body.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.body.limit, 10) || 20, 1);
    const offset = (page - 1) * limit;
    const where = { is_active: true };
    if (req.body.verification_status) where.verification_status = req.body.verification_status;
    if (req.body.salon_owner_id) where.salon_owner_id = req.body.salon_owner_id;

    const { count, rows } = await SalonPayoutAccount.findAndCountAll({
      where,
      include: [
        { model: SalonOwner, as: 'owner', include: [{ model: User, as: 'user', attributes: ['name', 'email'] }] },
        { model: Salon, as: 'salon', attributes: ['id', 'salon_name'] },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    res.json({
      rows: rows.map((row) => {
        const plain = row.get({ plain: true });
        return {
          ...plain,
          account_number_masked: maskAccountNumber(decryptAccountNumber(plain.account_number_encrypted)),
          account_number_encrypted: undefined,
        };
      }),
      meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
    });
  } catch (err) {
    next(err);
  }
};
