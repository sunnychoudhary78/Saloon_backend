const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/appController');
const appAuthCtrl = require('../controllers/appAuthController');
const { validateBooking, validateSalonApplication, validateSlotBlock } = require('../validators/authValidator');
const {
  validateOtpRequest,
  validateOtpVerify,
  validateCompleteProfile,
} = require('../validators/appAuthValidator');
const {
  validateRegisterDeviceToken,
  validateUnregisterDeviceToken,
} = require('../validators/deviceTokenValidator');
const deviceTokenCtrl = require('../controllers/deviceTokenController');
const notificationCtrl = require('../controllers/notificationController');
const { validateListNotifications } = require('../validators/notificationValidator');
const { uploadSalonImages } = require('../middlewares/upload');

// Public
router.post('/auth/otp-request', validateOtpRequest, asyncHandler(appAuthCtrl.otpRequest));
router.post('/auth/otp-verify', validateOtpVerify, asyncHandler(appAuthCtrl.otpVerify));
router.post('/auth/complete-profile', validateCompleteProfile, asyncHandler(appAuthCtrl.completeProfile));

// Authenticated
router.get('/profile', authMiddleware, asyncHandler(ctrl.getProfile));
router.patch('/profile', authMiddleware, asyncHandler(ctrl.updateProfile));
router.post('/device-token', authMiddleware, validateRegisterDeviceToken, asyncHandler(deviceTokenCtrl.registerDeviceToken));
router.delete('/device-token', authMiddleware, validateUnregisterDeviceToken, asyncHandler(deviceTokenCtrl.unregisterDeviceToken));
router.get('/notifications', authMiddleware, validateListNotifications, asyncHandler(notificationCtrl.listNotifications));
router.get('/notifications/unread-count', authMiddleware, asyncHandler(notificationCtrl.getUnreadCount));
router.patch('/notifications/read-all', authMiddleware, asyncHandler(notificationCtrl.markAllRead));
router.patch('/notifications/:id/read', authMiddleware, asyncHandler(notificationCtrl.markRead));
router.get('/banners', authMiddleware, asyncHandler(ctrl.getBanners));
router.post('/coupons/validate', authMiddleware, asyncHandler(ctrl.validateCoupon));
router.get('/service-categories', authMiddleware, roleMiddleware(['SALON_OWNER']), asyncHandler(ctrl.getServiceCategories));
router.get('/places/search', authMiddleware, roleMiddleware(['SALON_OWNER']), asyncHandler(ctrl.searchPlaces));

// Customer
router.get('/salons', authMiddleware, roleMiddleware(['CUSTOMER', 'SALON_OWNER']), asyncHandler(ctrl.browseSalons));
router.get('/salons/:id/slots', authMiddleware, roleMiddleware(['CUSTOMER', 'SALON_OWNER']), asyncHandler(ctrl.getSalonSlots));
router.get('/salons/:id/reviews', authMiddleware, roleMiddleware(['CUSTOMER', 'SALON_OWNER']), asyncHandler(ctrl.getSalonReviews));
router.get('/salons/:id', authMiddleware, roleMiddleware(['CUSTOMER', 'SALON_OWNER']), asyncHandler(ctrl.getSalon));
router.get('/premium-booking/config', authMiddleware, roleMiddleware(['CUSTOMER']), asyncHandler(ctrl.getPremiumBookingConfig));
router.post('/bookings', authMiddleware, roleMiddleware(['CUSTOMER']), validateBooking, asyncHandler(ctrl.createBooking));
router.get('/bookings', authMiddleware, roleMiddleware(['CUSTOMER']), asyncHandler(ctrl.getMyBookings));
router.patch('/bookings/:id/cancel', authMiddleware, roleMiddleware(['CUSTOMER']), asyncHandler(ctrl.cancelBooking));
router.post('/payments/razorpay/order', authMiddleware, roleMiddleware(['CUSTOMER']), asyncHandler(ctrl.createRazorpayOrder));
router.post('/payments/razorpay/verify', authMiddleware, roleMiddleware(['CUSTOMER']), asyncHandler(ctrl.verifyRazorpayPayment));
router.post('/payments/pay-at-shop', authMiddleware, roleMiddleware(['CUSTOMER']), asyncHandler(ctrl.selectPayAtShop));
router.post('/reviews', authMiddleware, roleMiddleware(['CUSTOMER']), asyncHandler(ctrl.createReview));

// Salon owner registration & applications
router.post('/salon-owner/register', authMiddleware, asyncHandler(ctrl.registerSalonOwner));
router.post(
  '/uploads/salon-images',
  authMiddleware,
  roleMiddleware(['SALON_OWNER']),
  uploadSalonImages.array('images', 10),
  asyncHandler(ctrl.uploadSalonImages),
);
router.post('/salon-applications', authMiddleware, roleMiddleware(['SALON_OWNER']), validateSalonApplication, asyncHandler(ctrl.submitSalonApplication));

// Owner management
router.get('/owner/salons', authMiddleware, roleMiddleware(['SALON_OWNER']), asyncHandler(ctrl.getOwnerSalons));
router.get('/owner/salon-applications', authMiddleware, roleMiddleware(['SALON_OWNER']), asyncHandler(ctrl.getOwnerSalonApplications));
router.get('/owner/salons/:salonId/slots', authMiddleware, roleMiddleware(['SALON_OWNER']), asyncHandler(ctrl.getOwnerSalonSlots));
router.put('/owner/salons/:salonId/slots/block', authMiddleware, roleMiddleware(['SALON_OWNER']), validateSlotBlock, asyncHandler(ctrl.setOwnerSalonSlotBlock));
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
