const { SalonOwner, Salon } = require('../models');
const AppError = require('../middlewares/AppError');

async function getSalonOwnerForUser(userId) {
  return SalonOwner.findOne({ where: { user_id: userId } });
}

async function assertSalonOwnership(userId, salonId) {
  const owner = await getSalonOwnerForUser(userId);
  if (!owner) throw new AppError('Salon owner profile not found', 404);

  const salon = await Salon.findOne({ where: { id: salonId, owner_id: owner.id } });
  if (!salon) throw new AppError('Salon not found or access denied', 403);

  return { owner, salon };
}

module.exports = { getSalonOwnerForUser, assertSalonOwnership };
