const express = require('express');
const router = express.Router();
const { getAllCompanies, getCompanyById, createCompany, updateCompany, inactivateCompany, activateCompany, companiesQuery, reorderCompanies } = require('../controllers/companyController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const upload = require('../middlewares/upload');

router.get('/', authMiddleware, asyncHandler(getAllCompanies));
router.post('/query', authMiddleware, asyncHandler(companiesQuery));
router.get('/:id', authMiddleware, asyncHandler(getCompanyById));
router.post('/', authMiddleware, upload.uploadCompanyLogo.single('logo'), asyncHandler(createCompany));
router.put('/:id', authMiddleware, upload.uploadCompanyLogo.single('logo'), asyncHandler(updateCompany));
router.patch('/:id/inactivate',  asyncHandler(inactivateCompany));
router.patch('/:id/activate', asyncHandler(activateCompany));
router.post('/reorder', authMiddleware, asyncHandler(reorderCompanies));

module.exports = router;
