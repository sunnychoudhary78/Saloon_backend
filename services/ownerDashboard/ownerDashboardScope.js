const { Op, fn, col } = require('sequelize');
const { Salon, Service, SalonApplication } = require('../../models');
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

  const allSalons = await Salon.findAll({
    where: { owner_id: owner.id },
    attributes: SALON_ATTRIBUTES,
    order: [['salon_name', 'ASC']],
  });

  const availableSalons = allSalons.map((s) => ({
    salon_id: s.id,
    salon_name: s.salon_name,
  }));

  const salons = scopedSalonId
    ? allSalons.filter((s) => String(s.id) === String(scopedSalonId))
    : allSalons;

  const salonIds = salons.map((s) => s.id);

  let salonsWithServices = salons.map((s) => s.get({ plain: true }));
  if (salonIds.length > 0) {
    const [serviceCounts, pendingUpdates] = await Promise.all([
      Service.findAll({
        where: { salon_id: { [Op.in]: salonIds }, status: 'ACTIVE' },
        attributes: [
          'salon_id',
          [fn('COUNT', col('Service.id')), 'active_services'],
        ],
        group: ['salon_id'],
        raw: true,
      }),
      SalonApplication.findAll({
        where: {
          owner_id: owner.id,
          salon_id: { [Op.in]: salonIds },
          application_type: 'UPDATE',
          application_status: 'PENDING_APPROVAL',
        },
        attributes: [
          'salon_id',
          'cover_image',
          'description',
          'gallery_images',
          'phone',
          'opening_time',
          'closing_time',
        ],
        order: [['created_at', 'DESC']],
      }),
    ]);

    const countBySalon = new Map(
      serviceCounts.map((row) => [
        String(row.salon_id),
        parseInt(row.active_services, 10) || 0,
      ]),
    );
    const pendingBySalon = new Map();
    for (const app of pendingUpdates) {
      const plain = app.get({ plain: true });
      const salonId = String(plain.salon_id);
      if (!pendingBySalon.has(salonId)) {
        pendingBySalon.set(salonId, plain);
      }
    }

    salonsWithServices = salonsWithServices.map((salon) => ({
      ...salon,
      active_services: countBySalon.get(String(salon.id)) || 0,
      pending_update: pendingBySalon.get(String(salon.id)) || null,
    }));
  }

  const dayBounds = dayUtcBounds(date, timezone);
  const isToday = date === localDateString(timezone);

  return {
    owner,
    userId,
    salons: salonsWithServices,
    salonIds,
    availableSalons,
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
