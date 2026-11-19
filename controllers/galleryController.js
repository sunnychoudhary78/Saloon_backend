'use strict';

const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const {
  SalonGalleryPost,
  SalonGalleryLike,
  Salon,
  SalonStaff,
  Service,
  User,
  Booking,
} = require('../models');
const AppError = require('../middlewares/AppError');
const { assertSalonOwnership } = require('../utils/ownershipGuard');
const { sendToUserAsync } = require('../services/pushNotificationService');
const pushTemplates = require('../services/pushNotificationTemplates');

function deleteDiskFile(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return;
  const relativePath = fileUrl.replace(/^\/api\/uploads\//, '');
  const filePath = path.join(__dirname, '../uploads', relativePath);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {
    // Ignore file cleanup error
  }
}

// -------------------------------------------------------------
// OWNER APIS
// -------------------------------------------------------------

exports.ownerCreatePost = async (req, res) => {
  const { salonId } = req.params;
  const { salon } = await assertSalonOwnership(req.user.id, salonId);

  const beforeFile = req.files?.before_image?.[0];
  const afterFile = req.files?.after_image?.[0];

  if (!beforeFile || !afterFile) {
    if (beforeFile) deleteDiskFile(`/api/uploads/gallery/${beforeFile.filename}`);
    if (afterFile) deleteDiskFile(`/api/uploads/gallery/${afterFile.filename}`);
    throw new AppError('Both before_image and after_image are required', 400);
  }

  const before_image_url = `/api/uploads/gallery/${beforeFile.filename}`;
  const after_image_url = `/api/uploads/gallery/${afterFile.filename}`;

  const {
    title,
    description,
    staff_id,
    service_id,
    booking_id,
    customer_id,
    customer_phone,
    is_public = true,
    sort_order = 0,
  } = req.body;

  if (!customer_phone) {
    if (beforeFile) deleteDiskFile(`/api/uploads/gallery/${beforeFile.filename}`);
    if (afterFile) deleteDiskFile(`/api/uploads/gallery/${afterFile.filename}`);
    throw new AppError('Customer phone number is required', 400);
  }

  let resolvedCustomerId = customer_id || null;
  if (!resolvedCustomerId && customer_phone) {
    const rawPhone = String(customer_phone).trim();
    const tenDigits = rawPhone.slice(-10);
    const customerUser = await User.findOne({
      where: {
        phone: {
          [Op.or]: [rawPhone, tenDigits, `+91${tenDigits}`],
        },
      },
    });
    if (customerUser) resolvedCustomerId = customerUser.id;
  }

  // Validate staff belongs to salon if passed
  if (staff_id) {
    const staff = await SalonStaff.findOne({ where: { id: staff_id, salon_id: salonId } });
    if (!staff) throw new AppError('Staff member does not belong to this salon', 400);
  }

  // Validate service belongs to salon if passed
  if (service_id) {
    const service = await Service.findOne({ where: { id: service_id, salon_id: salonId } });
    if (!service) throw new AppError('Service does not belong to this salon', 400);
  }

  const post = await SalonGalleryPost.create({
    salon_id: salonId,
    staff_id: staff_id || null,
    service_id: service_id || null,
    booking_id: booking_id || null,
    customer_id: resolvedCustomerId,
    title: title || null,
    description: description || null,
    before_image_url,
    after_image_url,
    is_public,
    customer_consent: resolvedCustomerId ? 'PENDING' : 'APPROVED',
    sort_order,
  });

  if (resolvedCustomerId) {
    const salonName = salon?.salon_name || 'Your salon';
    sendToUserAsync(
      resolvedCustomerId,
      pushTemplates.transformationUploaded(salonName, post.id)
    );
  }

  const created = await SalonGalleryPost.findByPk(post.id, {
    include: [
      { model: SalonStaff, as: 'staff', attributes: ['id', 'name', 'title', 'specializations', 'profile_image'] },
      { model: Service, as: 'service', attributes: ['id', 'service_name', 'price', 'duration_minutes'] },
      { model: User, as: 'customer', attributes: ['id', 'name', 'phone'] },
    ],
  });

  res.status(201).json({
    message: 'Gallery post created successfully',
    data: created,
  });
};

exports.ownerListPosts = async (req, res) => {
  const { salonId } = req.params;
  await assertSalonOwnership(req.user.id, salonId);

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const where = { salon_id: salonId, is_active: true };

  const { count, rows } = await SalonGalleryPost.findAndCountAll({
    where,
    limit,
    offset,
    order: [
      ['is_featured', 'DESC'],
      ['sort_order', 'ASC'],
      ['created_at', 'DESC'],
    ],
    include: [
      { model: SalonStaff, as: 'staff', attributes: ['id', 'name', 'title', 'specializations', 'profile_image'] },
      { model: Service, as: 'service', attributes: ['id', 'service_name', 'price', 'duration_minutes'] },
      { model: User, as: 'customer', attributes: ['id', 'name', 'phone'] },
    ],
  });

  res.json({
    rows,
    data: rows,
    meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    },
  });
};

exports.ownerUpdatePost = async (req, res) => {
  const { postId } = req.params;
  const post = await SalonGalleryPost.findOne({ where: { id: postId, is_active: true } });
  if (!post) throw new AppError('Gallery post not found', 404);

  await assertSalonOwnership(req.user.id, post.salon_id);

  const { title, description, staff_id, service_id, is_public, is_featured, sort_order } = req.body;

  if (title !== undefined) post.title = title || null;
  if (description !== undefined) post.description = description || null;
  if (staff_id !== undefined) post.staff_id = staff_id || null;
  if (service_id !== undefined) post.service_id = service_id || null;
  if (is_public !== undefined) post.is_public = is_public;
  if (is_featured !== undefined) post.is_featured = is_featured;
  if (sort_order !== undefined) post.sort_order = sort_order;

  await post.save();

  const updated = await SalonGalleryPost.findByPk(post.id, {
    include: [
      { model: SalonStaff, as: 'staff', attributes: ['id', 'name', 'title', 'specializations', 'profile_image'] },
      { model: Service, as: 'service', attributes: ['id', 'service_name', 'price', 'duration_minutes'] },
    ],
  });

  res.json({
    message: 'Gallery post updated successfully',
    data: updated,
  });
};

exports.ownerDeletePost = async (req, res) => {
  const { postId } = req.params;
  const post = await SalonGalleryPost.findByPk(postId);
  if (!post) throw new AppError('Gallery post not found', 404);

  await assertSalonOwnership(req.user.id, post.salon_id);

  deleteDiskFile(post.before_image_url);
  deleteDiskFile(post.after_image_url);

  await post.destroy();

  res.json({ message: 'Gallery post deleted successfully' });
};

// -------------------------------------------------------------
// CUSTOMER / PUBLIC APIS
// -------------------------------------------------------------

exports.publicListSalonGallery = async (req, res) => {
  const { salonId } = req.params;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const where = {
    salon_id: salonId,
    is_public: true,
    is_active: true,
    customer_consent: 'APPROVED',
  };

  if (req.query.staff_id) where.staff_id = req.query.staff_id;
  if (req.query.service_id) where.service_id = req.query.service_id;

  const { count, rows } = await SalonGalleryPost.findAndCountAll({
    where,
    limit,
    offset,
    order: [
      ['is_featured', 'DESC'],
      ['sort_order', 'ASC'],
      ['created_at', 'DESC'],
    ],
    include: [
      { model: SalonStaff, as: 'staff', attributes: ['id', 'name', 'title', 'specializations', 'profile_image'] },
      { model: Service, as: 'service', attributes: ['id', 'service_name', 'price', 'duration_minutes'] },
    ],
  });

  // Check likes if user is authenticated
  let likedMap = {};
  if (req.user?.id && rows.length > 0) {
    const postIds = rows.map((r) => r.id);
    const userLikes = await SalonGalleryLike.findAll({
      where: { user_id: req.user.id, post_id: postIds },
      attributes: ['post_id'],
    });
    likedMap = userLikes.reduce((acc, curr) => {
      acc[curr.post_id] = true;
      return acc;
    }, {});
  }

  const shaped = rows.map((post) => {
    const json = post.toJSON();
    json.is_liked_by_me = !!likedMap[post.id];
    return json;
  });

  res.json({
    data: shaped,
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    },
  });
};

exports.publicListStaffPortfolio = async (req, res) => {
  const { staffId } = req.params;
  const staff = await SalonStaff.findByPk(staffId, {
    attributes: ['id', 'name', 'title', 'specializations', 'profile_image', 'salon_id', 'status'],
  });
  if (!staff) throw new AppError('Stylist not found', 404);

  const posts = await SalonGalleryPost.findAll({
    where: {
      staff_id: staffId,
      is_public: true,
      is_active: true,
      customer_consent: 'APPROVED',
    },
    order: [
      ['is_featured', 'DESC'],
      ['created_at', 'DESC'],
    ],
    include: [
      { model: Service, as: 'service', attributes: ['id', 'service_name', 'price', 'duration_minutes'] },
      { model: Salon, as: 'salon', attributes: ['id', 'salon_name', 'address', 'city'] },
    ],
  });

  let likedMap = {};
  if (req.user?.id && posts.length > 0) {
    const postIds = posts.map((p) => p.id);
    const userLikes = await SalonGalleryLike.findAll({
      where: { user_id: req.user.id, post_id: postIds },
      attributes: ['post_id'],
    });
    likedMap = userLikes.reduce((acc, curr) => {
      acc[curr.post_id] = true;
      return acc;
    }, {});
  }

  const shapedPosts = posts.map((p) => {
    const json = p.toJSON();
    json.is_liked_by_me = !!likedMap[p.id];
    return json;
  });

  res.json({
    staff,
    portfolio: shapedPosts,
    total: posts.length,
  });
};

exports.toggleLikePost = async (req, res) => {
  const { postId } = req.params;
  const userId = req.user.id;

  const post = await SalonGalleryPost.findOne({ where: { id: postId, is_active: true } });
  if (!post) throw new AppError('Gallery post not found', 404);

  const existingLike = await SalonGalleryLike.findOne({
    where: { post_id: postId, user_id: userId },
  });

  if (existingLike) {
    await existingLike.destroy();
    await post.decrement('likes_count');
    await post.reload();
    return res.json({
      liked: false,
      likes_count: Math.max(0, post.likes_count),
    });
  }

  await SalonGalleryLike.create({ post_id: postId, user_id: userId });
  await post.increment('likes_count');
  await post.reload();
  return res.json({
    liked: true,
    likes_count: post.likes_count,
  });
};

exports.customerMyTransformations = async (req, res) => {
  const userId = req.user.id;

  const posts = await SalonGalleryPost.findAll({
    where: {
      customer_id: userId,
      is_active: true,
    },
    order: [['created_at', 'DESC']],
    include: [
      { model: Salon, as: 'salon', attributes: ['id', 'salon_name', 'address', 'city'] },
      { model: SalonStaff, as: 'staff', attributes: ['id', 'name', 'title', 'specializations', 'profile_image'] },
      { model: Service, as: 'service', attributes: ['id', 'service_name', 'price', 'duration_minutes'] },
    ],
  });

  res.json({
    data: posts,
    total: posts.length,
  });
};

exports.customerUpdateConsent = async (req, res) => {
  const { postId } = req.params;
  const userId = req.user.id;
  const { consent } = req.body; // 'APPROVED' or 'REJECTED'

  const post = await SalonGalleryPost.findOne({
    where: { id: postId, customer_id: userId, is_active: true },
  });
  if (!post) throw new AppError('Transformation post not found', 404);

  post.customer_consent = consent;
  if (consent === 'APPROVED') {
    post.is_public = true;
  } else if (consent === 'REJECTED') {
    post.is_public = false;
  }
  await post.save();

  res.json({
    message: `Transformation consent updated to ${consent}`,
    data: post,
  });
};

// -------------------------------------------------------------
// ADMIN APIS
// -------------------------------------------------------------

exports.adminQueryPosts = async (req, res) => {
  const page = Math.max(1, parseInt(req.body.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.body.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const where = {};
  if (req.body.salon_id) where.salon_id = req.body.salon_id;
  if (req.body.staff_id) where.staff_id = req.body.staff_id;
  if (req.body.is_public !== undefined) where.is_public = req.body.is_public;
  if (req.body.is_featured !== undefined) where.is_featured = req.body.is_featured;

  const { count, rows } = await SalonGalleryPost.findAndCountAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC']],
    include: [
      { model: Salon, as: 'salon', attributes: ['id', 'salon_name', 'city'] },
      { model: SalonStaff, as: 'staff', attributes: ['id', 'name', 'title'] },
      { model: Service, as: 'service', attributes: ['id', 'service_name'] },
    ],
  });

  res.json({
    rows,
    data: rows,
    meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    },
  });
};

exports.adminDeletePost = async (req, res) => {
  const { postId } = req.params;
  const post = await SalonGalleryPost.findByPk(postId);
  if (!post) throw new AppError('Gallery post not found', 404);

  deleteDiskFile(post.before_image_url);
  deleteDiskFile(post.after_image_url);
  await post.destroy();

  res.json({ message: 'Gallery post removed by admin' });
};

exports.adminToggleFeature = async (req, res) => {
  const { postId } = req.params;
  const post = await SalonGalleryPost.findByPk(postId);
  if (!post) throw new AppError('Gallery post not found', 404);

  post.is_featured = !post.is_featured;
  await post.save();

  res.json({
    message: `Post ${post.is_featured ? 'featured' : 'unfeatured'} successfully`,
    data: post,
  });
};

