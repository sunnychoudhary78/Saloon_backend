const express = require('express');
const router = express.Router();
const { getAllDepartments, createDepartment, updateDepartment, inactivateDepartment, departmentsQuery } = require('../controllers/departmentController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');

// GET /api/departments (requires 'department.read')
router.get(
  '/',
  authMiddleware,
  asyncHandler(getAllDepartments)
);

// POST /api/departments/query
router.post(
  '/query',
  authMiddleware,
  permissionMiddleware('department.read'),
  asyncHandler(departmentsQuery)
);

// POST /api/departments (requires 'department.create')
router.post(
  '/',
  authMiddleware,
  permissionMiddleware('department.create'),
  asyncHandler(createDepartment)
);

// PUT /api/departments/:id (requires 'department.update')
router.put(
  '/:id',
  authMiddleware,
  permissionMiddleware('department.update'),
  asyncHandler(updateDepartment)
);

// PATCH /api/departments/:id/inactivate (requires 'department.inactivate')
router.patch(
  '/:id/inactivate',
  authMiddleware,
  permissionMiddleware('department.makeInactive'),
  asyncHandler(inactivateDepartment)
);

module.exports = router;
