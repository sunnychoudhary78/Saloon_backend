// routes/hrRoutes.js
const express = require('express');
const router = express.Router();
const { getProbationEndingEmployees, confirmEmployeeProbation, getEmployeesByStatus, probationQuery } = require('../controllers/hrController');
const authMiddleware = require('../middlewares/authMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');


// GET all employees whose probation is ending
router.get('/probation/pending-confirmation', authMiddleware, getProbationEndingEmployees);

router.post('/probation/confirm/:userId', authMiddleware, confirmEmployeeProbation);

router.get('/status', authMiddleware, getEmployeesByStatus);

// New: unified probation table query with filters and column search
router.post('/probation/query', authMiddleware, asyncHandler(probationQuery));

module.exports = router;
