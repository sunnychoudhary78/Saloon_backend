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

async function getTokenRowsForUser(userId) {
  const rows = await DeviceToken.findAll({
    where: { user_id: userId },
    attributes: ['token', 'platform'],
  });
  return rows.map((r) => ({
    token: r.token,
    platform: String(r.platform || 'android').toLowerCase(),
  }));
}

async function getTokensForUser(userId) {
  const rows = await getTokenRowsForUser(userId);
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

function toStringData(payload) {
  const { notification, data } = payload;
  return Object.fromEntries(
    Object.entries({
      ...(data || {}),
      title: notification?.title || '',
      body: notification?.body || '',
    }).map(([k, v]) => [k, v == null ? '' : String(v)]),
  );
}

function collectInvalidTokens(response, tokens) {
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
  return invalidTokens;
}

async function sendAndroidDataOnly(msg, tokens, stringData, collapseKey) {
  if (!tokens.length) return { successCount: 0, failureCount: 0, invalidTokens: [] };
  const response = await msg.sendEachForMulticast({
    tokens,
    data: stringData,
    android: {
      priority: 'high',
      collapseKey: collapseKey || undefined,
      ttl: 3600 * 1000,
    },
  });
  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidTokens: collectInvalidTokens(response, tokens),
  };
}

async function sendIosAlert(msg, tokens, payload, stringData, collapseId) {
  if (!tokens.length) return { successCount: 0, failureCount: 0, invalidTokens: [] };
  const title = payload.notification?.title || 'CATCHY';
  const body = payload.notification?.body || '';
  const isUrgentBooking = payload.data?.type === 'new_booking';
  const sound = isUrgentBooking ? 'booking_urgent.wav' : 'default';
  const category = isUrgentBooking ? 'BOOKING_REQUEST' : undefined;

  const response = await msg.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: stringData,
    apns: {
      headers: {
        'apns-priority': '10',
        ...(collapseId ? { 'apns-collapse-id': String(collapseId).slice(0, 64) } : {}),
      },
      payload: {
        aps: {
          alert: { title, body },
          sound,
          category,
          'interruption-level': isUrgentBooking ? 'time-sensitive' : 'active',
        },
      },
    },
  });
  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidTokens: collectInvalidTokens(response, tokens),
  };
}

async function sendToTokens(tokensOrRows, payload) {
  const msg = getMessaging();
  if (!msg) return { successCount: 0, failureCount: 0 };

  const rows = (tokensOrRows || []).map((item) =>
    typeof item === 'string' ? { token: item, platform: 'android' } : item
  );
  if (!rows.length) return { successCount: 0, failureCount: 0 };

  const stringData = toStringData(payload);
  const collapseKey =
    payload.data?.bookingGroupId ||
    payload.data?.bookingId ||
    undefined;

  const androidTokens = rows
    .filter((r) => r.platform !== 'ios')
    .map((r) => r.token);
  const iosTokens = rows
    .filter((r) => r.platform === 'ios')
    .map((r) => r.token);

  const [androidResult, iosResult] = await Promise.all([
    sendAndroidDataOnly(msg, androidTokens, stringData, collapseKey),
    sendIosAlert(msg, iosTokens, payload, stringData, collapseKey),
  ]);

  const invalidTokens = [
    ...(androidResult.invalidTokens || []),
    ...(iosResult.invalidTokens || []),
  ];
  await removeInvalidTokens(invalidTokens);

  return {
    successCount: (androidResult.successCount || 0) + (iosResult.successCount || 0),
    failureCount: (androidResult.failureCount || 0) + (iosResult.failureCount || 0),
  };
}

async function sendToUser(userId, payload) {
  await persistNotification(userId, payload);
  const tokenRows = await getTokenRowsForUser(userId);
  if (!tokenRows.length) return { successCount: 0, failureCount: 0 };
  return sendToTokens(tokenRows, payload);
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
