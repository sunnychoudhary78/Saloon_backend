const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload");
const photoController = require("../controllers/photoController");
const authMiddleware = require('../middlewares/authMiddleware');

router.post("/:id/photo", authMiddleware, upload.single("photo"), photoController.uploadPhoto);
router.post("/photo", authMiddleware, upload.single("photo"), photoController.uploadMyPhoto);
router.get("/", authMiddleware, photoController.getPhoto);

module.exports = router;
