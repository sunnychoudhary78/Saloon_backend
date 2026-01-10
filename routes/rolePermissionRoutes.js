// routes/rolePermissionRoutes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/rolePermissionController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');



// optional: middleware to require admin auth can be added here

//add new permission
router.post('/add', authMiddleware, asyncHandler(controller.addPermission));

router.get('/', authMiddleware, asyncHandler(controller.getAllPermissions));

// server-side query for permissions with pagination and filters
router.post('/query', authMiddleware, asyncHandler(controller.queryPermissions));

router.put('/edit/:id', authMiddleware, asyncHandler(controller.editPermission));

router.delete('/delete/:id', authMiddleware, asyncHandler(controller.deletepermission));

// Assign permissions to a role
// POST /roles/:roleId/permissions
// Body: { permissionNames: ['user.create', 'user.read'] }
// If you want to identify by role name instead, send body: { roleName: 'SuperAdmin', permissionNames: [...] } to POST /roles/permissions
router.post('/:roleId/permissions', authMiddleware, controller.assignPermissions);

// Remove permissions from a role
// DELETE /roles/:roleId/permissions
// Body: { permissionNames: ['user.create'] }
router.delete('/:roleId/permissions', authMiddleware, controller.removePermissions);

// List permissions assigned to a role
// GET /roles/:roleId/permissions
router.get('/:roleId/permissions', authMiddleware, controller.listPermissions);

// Optional: allow identifying role by name via query/body
// Example: POST /roles/permissions with body { roleName: 'SuperAdmin', permissionNames: [...] }
// You can add:
router.post('/permissions', authMiddleware, controller.assignPermissions);

module.exports = router;
