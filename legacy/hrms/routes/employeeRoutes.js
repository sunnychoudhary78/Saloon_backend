const express = require('express');
const router = express.Router();

const employeeController = require('../controllers/employeeController');
// ^ This is the controller that contains employeesQuery + saved filter CRUD

const authMiddleware = require('../middlewares/authMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const permissionMiddleware = require('../middlewares/permissionMiddleware');

// ------------------------------
// Employee personal routes
// ------------------------------

// Get employee based on id
router.get('/single', authMiddleware, asyncHandler(employeeController.getEmployeeProfile));

// Get employee by userId
router.get('/by-user/:userId', authMiddleware, asyncHandler(employeeController.getEmployeeByUserId));

// Create or update employee
router.post('/create-or-update', authMiddleware, asyncHandler(employeeController.createOrUpdateEmployee));

// Toggle edit mode for an employee (manager/admin)
router.patch('/:userId/edit-enabled', authMiddleware, permissionMiddleware('user.update'), asyncHandler(employeeController.setEmployeeEditEnabled));

// Employee self: disable their own edit mode after submission
router.patch('/me/edit-enabled-off', authMiddleware, asyncHandler(employeeController.setMyEditDisabled));

// Get next payroll code suggestion
router.get('/next-payroll-code', authMiddleware, asyncHandler(employeeController.nextPayrollCode));

// Make employee inactive (updates both user and employee)
router.post(
    '/make-inactive/:id',
    authMiddleware,
    permissionMiddleware('user.makeInactive'),
    asyncHandler(employeeController.makeEmployeeInactive)
);


// ======================================================================
//                     EMPLOYEES TABLE – NEW FILTER ENGINE
// ======================================================================

// ▶ Get filtered employees (MAIN TABLE API)
// POST /employees/query
router.post(
    '/query',
    authMiddleware,
    asyncHandler(employeeController.employeesQuery)
);


// ======================================================================
//                     SAVED FILTERS CRUD ROUTES
// ======================================================================

// ▶ Create or Update saved filter
router.post(
    '/filters/save',
    authMiddleware,
    asyncHandler(employeeController.createSavedFilter)
);

// ▶ Get all saved filters for logged-in user
router.get(
    '/filters',
    authMiddleware,
    asyncHandler(employeeController.listSavedFilters)
);

// ▶ Get a single saved filter
router.get(
    '/filters/:id',
    authMiddleware,
    asyncHandler(employeeController.getSavedFilter)
);

router.post(
    '/filters/:id',
    authMiddleware,
    asyncHandler(employeeController.deleteSavedFilter)
);

// Manager candidates based on selected role
router.get('/manager-candidates', authMiddleware, asyncHandler(employeeController.listManagerCandidates))

// Department heads list
router.get('/department-heads', authMiddleware, asyncHandler(employeeController.listDepartmentHeads))





module.exports = router;
