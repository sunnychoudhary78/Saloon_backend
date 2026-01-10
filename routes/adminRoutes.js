const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const authMiddleware = require('../middlewares/authMiddleware');
const asyncHandler = require('../middlewares/asyncHandler'); // <-- added

// Create a new employee profile
router.post(
    '/add-emp-details',
    authMiddleware,
    asyncHandler(employeeController.createEmployee)
);

// Update an employee profile
router.put(
    '/update-emp-details/:id',
    authMiddleware,
    asyncHandler(employeeController.updateEmployee)
);

// Get single employee details
router.get(
    '/get-single-emp-details/:id',
    authMiddleware,
    asyncHandler(employeeController.getSingleEmployee)
);

// Get all employees
router.get(
    '/get-all-emp-details',
    authMiddleware,
    asyncHandler(employeeController.getAllEmployees)
);


// Bulk upload employee details
router.post(
    '/bulk-upload',
    authMiddleware,
    upload.single('file'),
    asyncHandler(employeeController.bulkUploadEmployeeDetails)
);

module.exports = router;
