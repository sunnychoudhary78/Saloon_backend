const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { DeviceToken, UserNotification } = require('../models');
const { promotionalOffer } = require('./pushNotificationTemplates');

let messaging = null;
let initialized = false;

function initFirebaseAdmin() {
  if (initialized) return messaging;

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!serviceAccountPath) {
    console.warn('[push] FIREBASE_SERVICE_ACCOUNT_PATH not set — push notifications disabled');
    initialized = true;
    return null;
  }

  const resolved = path.resolve(serviceAccountPath);
  if (!fs.existsSync(resolved)) {
    console.warn(`[push] Service account file not found: ${resolved}`);
    initialized = true;
    return null;
  }

  try {
    const serviceAccount = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    messaging = admin.messaging();
    console.log('[push] Firebase Admin initialized');
  } catch (err) {
    console.error('[push] Failed to initialize Firebase Admin:', err.message);
  }

  initialized = true;
  return messaging;
}

function getMessaging() {
  if (!initialized) initFirebaseAdmin();
  return messaging;
}

async function getTokensForUser(userId) {
  const rows = await DeviceToken.findAll({
    where: { user_id: userId },
    attributes: ['token'],
  });
  return rows.map((r) => r.token);
}

async function removeInvalidTokens(tokens) {
  if (!tokens.length) return;
  await DeviceToken.destroy({ where: { token: tokens } });
}

async function persistNotification(userId, payload) {
  const { notification, data } = payload;
  if (!notification?.title) return null;

  try {
    return await UserNotification.create({
      user_id: userId,
      type: data?.type || 'general',
      title: notification.title,
      body: notification.body || '',
      data: data || {},
    });
  } catch (err) {
    console.error(`[push] persistNotification failed for ${userId}:`, err.message);
    return null;
  }
}

async function sendToTokens(tokens, payload) {
  const msg = getMessaging();
  if (!msg || !tokens.length) return { successCount: 0, failureCount: 0 };

  const { notification, data } = payload;
  const stringData = Object.fromEntries(
    Object.entries(data || {}).map(([k, v]) => [k, String(v)]),
  );

  const response = await msg.sendEachForMulticast({
    tokens,
    notification,
    data: stringData,
    android: {
      priority: 'high',
      notification: {
        channelId: 'catchy_bookings',
      },
    },
  });

  const invalidTokens = [];
  response.responses.forEach((res, i) => {
    if (!res.success) {
      const code = res.error?.code;
      if (
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered'
      ) {
        invalidTokens.push(tokens[i]);
      }
    }
  });
  await removeInvalidTokens(invalidTokens);

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
  };
}

async function sendToUser(userId, payload) {
  await persistNotification(userId, payload);
  const tokens = await getTokensForUser(userId);
  if (!tokens.length) return { successCount: 0, failureCount: 0 };
  return sendToTokens(tokens, payload);
}

function sendToUserAsync(userId, payload) {
  sendToUser(userId, payload).catch((err) => {
    console.error(`[push] sendToUser failed for ${userId}:`, err.message);
  });
}

async function sendPromotionalOffer(userIds, title, body) {
  const payload = promotionalOffer(title, body);
  await Promise.all(userIds.map((userId) => sendToUser(userId, payload)));
}

module.exports = {
  initFirebaseAdmin,
  sendToUser,
  sendToUserAsync,
  sendToTokens,
  sendPromotionalOffer,
  getTokensForUser,
};
