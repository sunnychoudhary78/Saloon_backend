const { SalonApplication, Salon, sequelize } = require('../models');
const { logAudit } = require('./auditService');
const { ensureApplicationCoordinates } = require('./geocodingService');
const {
  notifySalonApplicationApproved,
  notifySalonApplicationRejected,
} = require('./salonApplicationNotificationHelper');

function addImageUrl(urls, url) {
  if (typeof url !== 'string' || url.length === 0 || urls.includes(url)) return;
  urls.push(url);
}

function imageFieldsFromApplication(application, existingSalon = null) {
  const applicationGallery = Array.isArray(application.gallery_images)
    ? application.gallery_images
    : [];
  const existingGallery = Array.isArray(existingSalon?.gallery_images)
    ? existingSalon.gallery_images
    : [];
  const coverImage = application.cover_image || existingSalon?.cover_image || null;
  const gallerySource = applicationGallery.length > 0
    ? applicationGallery
    : existingGallery;

  const galleryImages = [];
  addImageUrl(galleryImages, coverImage);
  for (const url of gallerySource) addImageUrl(galleryImages, url);

  return {
    cover_image: coverImage,
    gallery_images: galleryImages,
  };
}

const salonFieldsFromApplication = (application, coordsOverride = null, existingSalon = null) => ({
  salon_name: application.salon_name,
  salon_type: application.salon_type || existingSalon?.salon_type || 'UNISEX',
  description: application.description,
  address: application.address,
  formatted_address: application.formatted_address ?? existingSalon?.formatted_address ?? null,
  locality: application.locality ?? existingSalon?.locality ?? null,
  city: application.city,
  state: application.state,
  postal_code: application.postal_code ?? existingSalon?.postal_code ?? null,
  latitude: coordsOverride?.latitude ?? application.latitude,
  longitude: coordsOverride?.longitude ?? application.longitude,
  ...imageFieldsFromApplication(application, existingSalon),
  phone: application.phone,
  opening_time: application.opening_time,
  closing_time: application.closing_time,
  premium_booking_fee: application.premium_booking_fee != null
    ? application.premium_booking_fee
    : (existingSalon?.premium_booking_fee ?? null),
});


function normalizeApplicationType(type) {
  if (type === 'CLOSE') return 'DEACTIVATE';
  return type || 'CREATE';
}

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

    const type = normalizeApplicationType(application.application_type);
    let salon;
    let salonCoords = null;

    if (type === 'CREATE' || type === 'UPDATE') {
      salonCoords = await ensureApplicationCoordinates(application);
      if (!salonCoords) {
        throw new Error('Salon location is required — set coordinates or use a valid address');
      }
    }

    if (type === 'CREATE') {
      salon = await Salon.create(
        {
          owner_id: application.owner_id,
          application_id: application.id,
          ...salonFieldsFromApplication(application, salonCoords),
          status: 'ACTIVE',
          is_active: true,
          created_by: reviewerId,
          updated_by: reviewerId,
        },
        { transaction: t }
      );
    } else if (type === 'UPDATE') {
      salon = await Salon.findByPk(application.salon_id, { transaction: t });
      if (!salon) throw new Error('Target salon not found');
      if (salon.owner_id !== application.owner_id) {
        throw new Error('Application does not match salon owner');
      }
      await salon.update(
        {
          ...salonFieldsFromApplication(application, salonCoords, salon),
          updated_by: reviewerId,
        },
        { transaction: t }
      );
    } else if (type === 'DEACTIVATE') {
      salon = await Salon.findByPk(application.salon_id, { transaction: t });
      if (!salon) throw new Error('Target salon not found');
      if (salon.owner_id !== application.owner_id) {
        throw new Error('Application does not match salon owner');
      }
      await salon.update(
        {
          status: 'CLOSED',
          is_active: false,
          updated_by: reviewerId,
        },
        { transaction: t }
      );
    } else if (type === 'ACTIVATE') {
      salon = await Salon.findByPk(application.salon_id, { transaction: t });
      if (!salon) throw new Error('Target salon not found');
      if (salon.owner_id !== application.owner_id) {
        throw new Error('Application does not match salon owner');
      }
      await salon.update(
        {
          status: 'ACTIVE',
          is_active: true,
          updated_by: reviewerId,
        },
        { transaction: t }
      );
    } else {
      throw new Error(`Unknown application type: ${type}`);
    }

    await t.commit();

    await logAudit({
      userId: reviewerId,
      action: 'salonApplication.approve',
      entityType: 'SalonApplication',
      entityId: applicationId,
      newValues: { salon_id: salon.id, application_type: type },
      req,
    });

    notifySalonApplicationApproved(applicationId);

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

  notifySalonApplicationRejected(applicationId);

  return application;
}

module.exports = { approveApplication, rejectApplication, normalizeApplicationType };
