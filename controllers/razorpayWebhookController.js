const { sequelize } = require('../models');
const AppError = require('../middlewares/AppError');
const { logger } = require('../utils/logger');
const { verifyWebhookSignature } = require('../services/razorpayService');
const {
  dispatchPaymentNotifications,
  fulfillRazorpayPayment,
  markRazorpayPaymentFailed,
} = require('../services/paymentFulfillmentService');

function parseWebhookEvent(rawBody) {
  try {
    const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    return JSON.parse(body);
  } catch {
    throw new AppError('Invalid webhook payload', 400);
  }
}

function paymentEntityFromEvent(event) {
  return event?.payload?.payment?.entity || null;
}

async function handlePaymentCaptured(event) {
  const paymentEntity = paymentEntityFromEvent(event);
  if (!paymentEntity?.order_id || !paymentEntity?.id) {
    logger.warn(
      { event: event?.event, eventId: event?.id },
      '[razorpay-webhook] payment.captured missing order_id or payment id',
    );
    return;
  }

  const t = await sequelize.transaction();
  let committed = false;
  try {
    const result = await fulfillRazorpayPayment({
      orderId: paymentEntity.order_id,
      paymentId: paymentEntity.id,
      transaction: t,
      requireSignature: false,
      allowExpiredFulfillment: true,
      razorpayAmountPaise: paymentEntity.amount,
      updatedByUserId: null,
    });

    if (!result.found) {
      await t.commit();
      committed = true;
      logger.warn(
        { orderId: paymentEntity.order_id, paymentId: paymentEntity.id },
        '[razorpay-webhook] payment.captured for unknown order',
      );
      return;
    }

    await t.commit();
    committed = true;

    if (!result.alreadyPaid && result.notifications) {
      dispatchPaymentNotifications(result.notifications);
    }
  } catch (err) {
    if (!committed) await t.rollback();
    if (err.isOperational) {
      logger.warn(
        {
          err,
          orderId: paymentEntity.order_id,
          paymentId: paymentEntity.id,
          eventId: event?.id,
        },
        '[razorpay-webhook] payment.captured not fulfilled',
      );
      return;
    }
    throw err;
  }
}

async function handlePaymentFailed(event) {
  const paymentEntity = paymentEntityFromEvent(event);
  if (!paymentEntity?.order_id) {
    logger.warn(
      { event: event?.event, eventId: event?.id },
      '[razorpay-webhook] payment.failed missing order_id',
    );
    return;
  }

  const t = await sequelize.transaction();
  let committed = false;
  try {
    await markRazorpayPaymentFailed({
      orderId: paymentEntity.order_id,
      paymentId: paymentEntity.id || null,
      failureReason:
        paymentEntity.error_description
        || paymentEntity.error_reason
        || 'Razorpay payment failed',
      transaction: t,
    });
    await t.commit();
    committed = true;
  } catch (err) {
    if (!committed) await t.rollback();
    if (err.isOperational) {
      logger.warn(
        { err, orderId: paymentEntity.order_id, eventId: event?.id },
        '[razorpay-webhook] payment.failed not recorded',
      );
      return;
    }
    throw err;
  }
}

exports.handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.body;

    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      throw new AppError('Webhook body is required', 400);
    }

    if (!verifyWebhookSignature(rawBody, signature)) {
      throw new AppError('Invalid webhook signature', 400);
    }

    const event = parseWebhookEvent(rawBody);
    const eventType = event?.event;

    switch (eventType) {
      case 'payment.captured':
        await handlePaymentCaptured(event);
        break;
      case 'payment.failed':
        await handlePaymentFailed(event);
        break;
      default:
        logger.info(
          { eventType, eventId: event?.id },
          '[razorpay-webhook] unhandled event acknowledged',
        );
        break;
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
};
