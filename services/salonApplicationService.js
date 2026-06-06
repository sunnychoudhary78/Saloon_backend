const { SalonApplication, Salon, sequelize } = require('../models');
const { logAudit } = require('./auditService');

async function approveApplication(applicationId, reviewerId, req) {
  const t = await sequelize.transaction();
  try {
    const application = await SalonApplication.findByPk(applicationId, { transaction: t });
    if (!application) throw new Error('Application not found');
    if (application.application_status !== 'PENDING_APPROVAL') {
      throw new Error('Application is not pending approval');
    }

    application.application_status = 'APPROVED';
    application.reviewed_by = reviewerId;
    application.reviewed_at = new Date();
    application.updated_by = reviewerId;
    await application.save({ transaction: t });

    const salon = await Salon.create(
      {
        owner_id: application.owner_id,
        application_id: application.id,
        salon_name: application.salon_name,
        description: application.description,
        address: application.address,
        city: application.city,
        state: application.state,
        latitude: application.latitude,
        longitude: application.longitude,
        cover_image: application.cover_image,
        gallery_images: application.gallery_images,
        opening_time: application.opening_time,
        closing_time: application.closing_time,
        status: 'ACTIVE',
        created_by: reviewerId,
        updated_by: reviewerId,
      },
      { transaction: t }
    );

    await t.commit();

    await logAudit({
      userId: reviewerId,
      action: 'salonApplication.approve',
      entityType: 'SalonApplication',
      entityId: applicationId,
      newValues: { salon_id: salon.id },
      req,
    });

    return { application, salon };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function rejectApplication(applicationId, reviewerId, rejectionReason, req) {
  const application = await SalonApplication.findByPk(applicationId);
  if (!application) throw new Error('Application not found');
  if (application.application_status !== 'PENDING_APPROVAL') {
    throw new Error('Application is not pending approval');
  }

  application.application_status = 'REJECTED';
  application.rejection_reason = rejectionReason;
  application.reviewed_by = reviewerId;
  application.reviewed_at = new Date();
  application.updated_by = reviewerId;
  await application.save();

  await logAudit({
    userId: reviewerId,
    action: 'salonApplication.reject',
    entityType: 'SalonApplication',
    entityId: applicationId,
    newValues: { rejection_reason: rejectionReason },
    req,
  });

  return application;
}

module.exports = { approveApplication, rejectApplication };
