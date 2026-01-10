const express = require('express');
const router = express.Router();

const {
    getAllRoles,
    queryRoles,
    addRole,
    updateRole,
    makeRoleInactive,
    addPermissionToRole,
    removePermissionFromRole
} = require('../controllers/roleController');

const authMiddleware = require('../middlewares/authMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const permissionMiddleware = require('../middlewares/permissionMiddleware');

// ----------------------
// GET ALL ROLES + PERMISSIONS
// ----------------------
router.get(
    '/',
    authMiddleware,
    permissionMiddleware('role.read'),
    asyncHandler(getAllRoles)
);

// ----------------------
// QUERY ROLES (server-side filters + pagination)
// ----------------------
router.post(
    '/query',
    authMiddleware,
    permissionMiddleware('role.read'),
    asyncHandler(queryRoles)
);

// ----------------------
// ADD ROLE
// ----------------------
router.post(
    '/',
    authMiddleware,
    permissionMiddleware('role.create'),
    asyncHandler(addRole)
);

// ----------------------
// UPDATE ROLE
// ----------------------
router.put(
    '/:roleId',
    authMiddleware,
    permissionMiddleware('role.update'),
    asyncHandler(updateRole)
);

// ----------------------
// DEACTIVATE ROLE
// ----------------------
router.patch(
    '/:roleId/inactivate',
    authMiddleware,
    permissionMiddleware('role.makeInactive'),
    asyncHandler(makeRoleInactive)
);

// ----------------------
// ADD PERMISSION TO ROLE
// ----------------------
router.post(
    '/:roleId/permissions/:permissionId',
    authMiddleware,
    permissionMiddleware('role.assign'),
    asyncHandler(addPermissionToRole)
);

// ----------------------
// REMOVE PERMISSION FROM ROLE
// ----------------------
router.delete(
    '/:roleId/permissions/:permissionId',
    authMiddleware,
    permissionMiddleware('role.assign'),
    asyncHandler(removePermissionFromRole)
);

module.exports = router;
