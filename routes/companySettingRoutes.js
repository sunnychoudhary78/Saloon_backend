const express = require('express');
const router = express.Router();
const controller = require('../controllers/companySettingController');
const authMiddleware = require('../middlewares/authMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');

router.get('/', authMiddleware, asyncHandler(controller.getSettings));
router.get('/my', authMiddleware, asyncHandler(controller.getMySettings));
router.patch('/', authMiddleware, asyncHandler(controller.updateSettings));

router.get('/designations', authMiddleware, asyncHandler(controller.getDesignations));
router.post('/designations', authMiddleware, asyncHandler(controller.createDesignation));
router.patch('/designations/:id', authMiddleware, asyncHandler(controller.updateDesignation));
router.delete('/designations/:id', authMiddleware, asyncHandler(controller.deleteDesignation));



// Blood groups
router.get('/blood-groups', authMiddleware, asyncHandler(controller.getBloodGroups));
router.post('/blood-groups', authMiddleware, asyncHandler(controller.createBloodGroup));
router.patch('/blood-groups/:id', authMiddleware, asyncHandler(controller.updateBloodGroup));
router.delete('/blood-groups/:id', authMiddleware, asyncHandler(controller.deleteBloodGroup));

// Marital statuses
router.get('/marital-statuses', authMiddleware, asyncHandler(controller.getMaritalStatuses));
router.post('/marital-statuses', authMiddleware, asyncHandler(controller.createMaritalStatus));
router.patch('/marital-statuses/:id', authMiddleware, asyncHandler(controller.updateMaritalStatus));
router.delete('/marital-statuses/:id', authMiddleware, asyncHandler(controller.deleteMaritalStatus));

// Genders
router.get('/genders', authMiddleware, asyncHandler(controller.getGenders));
router.post('/genders', authMiddleware, asyncHandler(controller.createGender));
router.patch('/genders/:id', authMiddleware, asyncHandler(controller.updateGender));
router.delete('/genders/:id', authMiddleware, asyncHandler(controller.deleteGender));

module.exports = router;
