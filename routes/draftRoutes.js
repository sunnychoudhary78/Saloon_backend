const express = require('express');
const router = express.Router();
const controller = require('../controllers/draftController');
const authMiddleware = require('../middlewares/authMiddleware');


router.get('/', authMiddleware, controller.getDraft); // query by formKey + targetId (for current user)
router.get('/:id', authMiddleware, controller.getDraft);
router.post('/', authMiddleware, controller.createDraft);
router.patch('/:id', authMiddleware, controller.updateDraft);
router.delete('/:id', authMiddleware, controller.deleteDraft);

module.exports = router;
