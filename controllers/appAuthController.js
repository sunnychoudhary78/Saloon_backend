const { Op } = require('sequelize');
const {
  User,
  Role,
  UserRole,
  Customer,
  PhoneOtpSession,
  sequelize,
} = require('../models');
const AppError = require('../middlewares/AppError');
const {
  generateToken,
  generateSignupToken,
  verifySignupToken,
  loadUserWithRoles,
  shapeUserResponse,
  hasMobileAccess,
} = require('../utils/authHelpers');
const {
  normalizePhone,
  generateOtp,
  getOtpExpiryDate,
  isOtpExpired,
  checkRequestCooldown,
  markOtpRequested,
  sanitizeOtpDeliveryError,
  MAX_VERIFY_ATTEMPTS,
} = require('../utils/otpHelpers');
const { sendOtpSms } = require('../utils/smsService');

async function assignCustomerRole(userId, transaction) {
  const role = await Role.findOne({ where: { name: 'CUSTOMER' }, transaction });
  if (!role) throw new AppError('CUSTOMER role not found', 500);
  await UserRole.findOrCreate({
    where: { user_id: userId, role_id: role.id },
    defaults: { assigned_at: new Date() },
    transaction,
  });
}

exports.otpRequest = async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body.phone);
    if (!phone) throw new AppError('Invalid phone number. Enter exactly 10 digits.', 400);

    const cooldown = checkRequestCooldown(phone);
    if (!cooldown.allowed) {
      throw new AppError(`Please wait ${cooldown.waitSec} seconds before requesting another OTP`, 429);
    }

    const otp = generateOtp();
    const otpExpiresAt = getOtpExpiryDate();

    await PhoneOtpSession.upsert(
      {
        phone,
        otp,
        otp_expires_at: otpExpiresAt,
        attempt_count: 0,
        updated_at: new Date(),
      },
      { returning: true }
    );

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[OTP] phone=${phone} otp=${otp} expires=${otpExpiresAt.toISOString()}`);
    }

    try {
      await sendOtpSms(phone, otp);
    } catch (smsErr) {
      await PhoneOtpSession.destroy({ where: { phone } });
      throw new AppError(sanitizeOtpDeliveryError(smsErr), 500);
    }

    markOtpRequested(phone);

    res.json({ message: 'OTP sent successfully' });
  } catch (err) {
    next(err);
  }
};

exports.otpVerify = async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const { otp } = req.body;

    if (!phone) throw new AppError('Invalid phone number', 400);

    const session = await PhoneOtpSession.findOne({ where: { phone } });
    if (!session) throw new AppError('OTP expired or not found. Please request a new OTP.', 400);

    if (session.attempt_count >= MAX_VERIFY_ATTEMPTS) {
      await PhoneOtpSession.destroy({ where: { phone } });
      throw new AppError('Too many failed attempts. Please request a new OTP.', 429);
    }

    if (isOtpExpired(session.otp_expires_at)) {
      await PhoneOtpSession.destroy({ where: { phone } });
      throw new AppError('OTP has expired. Please request a new OTP.', 400);
    }

    if (String(session.otp) !== String(otp)) {
      session.attempt_count += 1;
      await session.save();
      throw new AppError('Invalid OTP', 400);
    }

    await PhoneOtpSession.destroy({ where: { phone } });

    const user = await User.findOne({
      where: { phone },
      include: [{ model: Role, as: 'Roles', through: { attributes: [] } }],
    });

    if (user) {
      if (!user.is_active || user.status === 'BLOCKED') {
        throw new AppError('Account is blocked. Please contact support.', 403);
      }

      const fullUser = await loadUserWithRoles(user.id);
      if (!hasMobileAccess(fullUser)) {
        throw new AppError('This account cannot be used with the mobile app.', 403);
      }

      const token = generateToken(fullUser);
      return res.json({
        isNewUser: false,
        token,
        user: shapeUserResponse(fullUser),
      });
    }

    const signupToken = generateSignupToken(phone);
    return res.json({
      isNewUser: true,
      signupToken,
      phone,
    });
  } catch (err) {
    next(err);
  }
};

exports.completeProfile = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new AppError('Authorization header missing', 401);

    const token = authHeader.split(' ')[1];
    if (!token) throw new AppError('Token missing', 401);

    let decoded;
    try {
      decoded = verifySignupToken(token);
    } catch {
      throw new AppError('Invalid or expired signup session. Please verify OTP again.', 401);
    }

    const phone = decoded.phone;
    const { name, email } = req.body;
    const normalizedEmail = email && String(email).trim() ? String(email).trim().toLowerCase() : null;

    const existingPhone = await User.findOne({ where: { phone }, transaction: t });
    if (existingPhone) {
      throw new AppError('An account with this phone already exists. Please log in.', 409);
    }

    if (normalizedEmail) {
      const existingEmail = await User.findOne({
        where: { email: normalizedEmail },
        transaction: t,
      });
      if (existingEmail) throw new AppError('Email already registered', 409);
    }

    const user = await User.create(
      {
        name: name.trim(),
        phone,
        email: normalizedEmail,
        password: null,
        status: 'ACTIVE',
      },
      { transaction: t }
    );

    await assignCustomerRole(user.id, t);
    await Customer.create({ user_id: user.id, status: 'ACTIVE' }, { transaction: t });

    await t.commit();

    const fullUser = await loadUserWithRoles(user.id);
    const jwtToken = generateToken(fullUser);

    res.status(201).json({
      isNewUser: false,
      token: jwtToken,
      user: shapeUserResponse(fullUser),
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};
