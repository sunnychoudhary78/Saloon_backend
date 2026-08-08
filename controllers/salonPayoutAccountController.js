const { SalonPayoutAccount, SalonOwner, Salon, User } = require('../models');
const AppError = require('../middlewares/AppError');
const { maskAccountNumber, decryptAccountNumber } = require('../utils/payoutEncryption');
const { ilikeOr } = require('../utils/adminSearch');

const defaultColumns = [
  { key: 'owner_name', label: 'Owner', type: 'string' },
  { key: 'salon_name', label: 'Salon', type: 'string' },
  { key: 'account_holder_name', label: 'Holder', type: 'string' },
  { key: 'ifsc_code', label: 'IFSC', type: 'string' },
  { key: 'account_number_masked', label: 'Account', type: 'string' },
  { key: 'upi_id', label: 'UPI', type: 'string' },
  { key: 'verification_status', label: 'Status', type: 'string' },
  { key: 'created_at', label: 'Submitted', type: 'datetime' },
];

function shapeAccount(row) {
  const plain = row.get({ plain: true });
  return {
    ...plain,
    owner_name: plain.owner?.user?.name || null,
    salon_name: plain.salon?.salon_name || null,
    account_number_masked: maskAccountNumber(decryptAccountNumber(plain.account_number_encrypted)),
    account_number_encrypted: undefined,
  };
}

async function findAccountOrThrow(id) {
  const account = await SalonPayoutAccount.findByPk(id);
  if (!account || !account.is_active) {
    throw new AppError('Payout account not found', 404);
  }
  return account;
}

exports.query = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.body.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.body.limit, 10) || 20, 1);
    const offset = (page - 1) * limit;
    const where = { is_active: true };
    if (req.body.verification_status) where.verification_status = req.body.verification_status;
    if (req.body.salon_owner_id) where.salon_owner_id = req.body.salon_owner_id;

    const searchOr = ilikeOr(
      [
        'account_holder_name',
        'ifsc_code',
        'upi_id',
        '$owner.user.name$',
        '$salon.salon_name$',
      ],
      req.body.search,
    );
    if (searchOr) Object.assign(where, searchOr);

    const { count, rows } = await SalonPayoutAccount.findAndCountAll({
      where,
      include: [
        { model: SalonOwner, as: 'owner', include: [{ model: User, as: 'user', attributes: ['name', 'email'] }] },
        { model: Salon, as: 'salon', attributes: ['id', 'salon_name'] },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
      distinct: true,
      subQuery: false,
    });

    res.json({
      rows: rows.map(shapeAccount),
      meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
      columns: defaultColumns,
    });
  } catch (err) {
    next(err);
  }
};

exports.approve = async (req, res, next) => {
  try {
    const account = await findAccountOrThrow(req.params.id);
    if (account.verification_status !== 'PENDING') {
      throw new AppError('Only pending payout accounts can be approved', 400);
    }

    account.verification_status = 'VERIFIED';
    account.updated_by = req.user.id;
    await account.save();

    res.json({
      message: 'Payout account approved',
      data: {
        id: account.id,
        verification_status: account.verification_status,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.reject = async (req, res, next) => {
  try {
    const account = await findAccountOrThrow(req.params.id);
    if (account.verification_status !== 'PENDING') {
      throw new AppError('Only pending payout accounts can be rejected', 400);
    }

    account.verification_status = 'REJECTED';
    account.updated_by = req.user.id;
    await account.save();

    res.json({
      message: 'Payout account rejected',
      data: {
        id: account.id,
        verification_status: account.verification_status,
      },
    });
  } catch (err) {
    next(err);
  }
};
