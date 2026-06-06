const express = require('express');
const router = express.Router();
const passport = require('passport');
const { login, getPermissions, getMe, changePassword, adminChangePassword } = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
const { validateLogin } = require('../validators/authValidator');

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile','email'] }));
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/' }), (req,res)=>{
  const token = require('../controllers/authController').generateToken(req.user);
  res.json({ token, user: req.user });
});

// Email/password login
router.post('/login', validateLogin, login);

// Return permissions for currently authenticated user
router.get('/permissions', authMiddleware, getPermissions);

// Return current user's profile
router.get('/me', authMiddleware, getMe);

router.post('/change-password', authMiddleware, changePassword)
router.post('/admin-change-password', authMiddleware, adminChangePassword)

module.exports = router;
