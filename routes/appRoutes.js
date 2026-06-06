const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/appController');
const { validateRegister, validateBooking, validateSalonApplication } = require('../validators/authValidator');

// Public
router.post('/auth/register', validateRegister, asyncHandler(ctrl.register));

// Authenticated
router.get('/profile', authMiddleware, asyncHandler(ctrl.getProfile));
router.patch('/profile', authMiddleware, asyncHandler(ctrl.updateProfile));
router.get('/banners', authMiddleware, asyncHandler(ctrl.getBanners));
router.post('/coupons/validate', authMiddleware, asyncHandler(ctrl.validateCoupon));
router.get('/service-categories', authMiddleware, roleMiddleware(['SALON_OWNER']), asyncHandler(ctrl.getServiceCategories));

// Customer
router.get('/salons', authMiddleware, roleMiddleware(['CUSTOMER', 'SALON_OWNER']), asyncHandler(ctrl.browseSalons));
router.get('/salons/:id', authMiddleware, roleMiddleware(['CUSTOMER', 'SALON_OWNER']), asyncHandler(ctrl.getSalon));
router.post('/bookings', authMiddleware, roleMiddleware(['CUSTOMER']), validateBooking, asyncHandler(ctrl.createBooking));
router.get('/bookings', authMiddleware, roleMiddleware(['CUSTOMER']), asyncHandler(ctrl.getMyBookings));
router.patch('/bookings/:id/cancel', authMiddleware, roleMiddleware(['CUSTOMER']), asyncHandler(ctrl.cancelBooking));
router.post('/reviews', authMiddleware, roleMiddleware(['CUSTOMER']), asyncHandler(ctrl.createReview));

// Salon owner registration & applications
router.post('/salon-owner/register', authMiddleware, asyncHandler(ctrl.registerSalonOwner));
router.post('/salon-applications', authMiddleware, roleMiddleware(['SALON_OWNER']), validateSalonApplication, asyncHandler(ctrl.submitSalonApplication));

// Owner management
router.get('/owner/salons', authMiddleware, roleMiddleware(['SALON_OWNER']), asyncHandler(ctrl.getOwnerSalons));
router.get('/owner/salons/:salonId/services', authMiddleware, roleMiddleware(['SALON_OWNER']), asyncHandler(ctrl.getOwnerServices));
router.post('/owner/salons/:salonId/services', authMiddleware, roleMiddleware(['SALON_OWNER']), asyncHandler(ctrl.createOwnerService));
router.put('/owner/salons/:salonId/services/:serviceId', authMiddleware, roleMiddleware(['SALON_OWNER']), asyncHandler(ctrl.updateOwnerService));
router.get('/owner/bookings', authMiddleware, roleMiddleware(['SALON_OWNER']), asyncHandler(ctrl.getOwnerBookings));
router.patch('/owner/bookings/:id/accept', authMiddleware, roleMiddleware(['SALON_OWNER']), asyncHandler(ctrl.acceptBooking));
router.patch('/owner/bookings/:id/reject', authMiddleware, roleMiddleware(['SALON_OWNER']), asyncHandler(ctrl.rejectBooking));
router.patch('/owner/bookings/:id/complete', authMiddleware, roleMiddleware(['SALON_OWNER']), asyncHandler(ctrl.completeBooking));
router.get('/owner/dashboard', authMiddleware, roleMiddleware(['SALON_OWNER']), asyncHandler(ctrl.getOwnerDashboard));
router.get('/owner/reviews', authMiddleware, roleMiddleware(['SALON_OWNER']), asyncHandler(ctrl.getOwnerReviews));

module.exports = router;
