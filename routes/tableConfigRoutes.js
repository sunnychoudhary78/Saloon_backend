// routes/tableConfigRoutes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/tableConfigController');
const authMiddleware = require('../middlewares/authMiddleware');

router.get('/', authMiddleware, controller.getTableConfig);
router.post('/', authMiddleware, controller.upsertTableConfig);

module.exports = router;
