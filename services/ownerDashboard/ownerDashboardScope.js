const { Op, fn, col } = require('sequelize');
const { Salon, Service } = require('../../models');
const AppError = require('../../middlewares/AppError');
const { getSalonOwnerForUser, assertSalonOwnership } = require('../../utils/ownershipGuard');
const {
  DEFAULT_TIMEZONE,
  localDateString,
  localTimeString,
  parseDateOnly,
  dayUtcBounds,
} = require('./dateWindow');

const SALON_ATTRIBUTES = [
  'id',
  'salon_name',
  'opening_time',
  'closing_time',
  'cover_image',
  'description',
  'gallery_images',
  'phone',
  'status',
  'premium_booking_fee',
];

async function resolveOwnerDashboardScope(userId, options = {}) {
  const timezone = options.timezone || DEFAULT_TIMEZONE;
  const date = parseDateOnly(options.date, timezone);
  const nowTime = localTimeString(timezone);
  const scopedSalonId = options.salonId || null;

  const owner = await getSalonOwnerForUser(userId);
  if (!owner) throw new AppError('Salon owner profile not found', 404);

  if (scopedSalonId) {
    await assertSalonOwnership(userId, scopedSalonId);
  }

  const salonWhere = { owner_id: owner.id };
  if (scopedSalonId) salonWhere.id = scopedSalonId;

  const salons = await Salon.findAll({
    where: salonWhere,
    attributes: SALON_ATTRIBUTES,
    order: [['salon_name', 'ASC']],
  });

  const salonIds = salons.map((s) => s.id);

  let salonsWithServices = salons.map((s) => s.get({ plain: true }));
  if (salonIds.length > 0) {
    const serviceCounts = await Service.findAll({
      where: { salon_id: { [Op.in]: salonIds }, status: 'ACTIVE' },
      attributes: ['salon_id', [fn('COUNT', col('id')), 'active_services']],
      group: ['salon_id'],
      raw: true,
    });
    const countBySalon = new Map(
      serviceCounts.map((row) => [row.salon_id, parseInt(row.active_services, 10) || 0]),
    );
    salonsWithServices = salonsWithServices.map((salon) => ({
      ...salon,
      active_services: countBySalon.get(salon.id) || 0,
    }));
  }

  const dayBounds = dayUtcBounds(date, timezone);
  const isToday = date === localDateString(timezone);

  return {
    owner,
    userId,
    salons: salonsWithServices,
    salonIds,
    scopedSalonId,
    date,
    timezone,
    nowTime,
    dayBounds,
    isToday,
  };
}

module.exports = {
  resolveOwnerDashboardScope,
  SALON_ATTRIBUTES,
};
