const { getCurrentSettings } = require('./financeSettingsService');
const { servicePayableAmount } = require('./paymentService');

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function computeServiceLineSnapshot(grossAmount, serviceCommissionPercent) {
  const gross = round2(grossAmount);
  const commissionPercent = round2(serviceCommissionPercent);
  const commissionAmount = round2(gross * commissionPercent / 100);
  const salonNetAmount = round2(gross - commissionAmount);
  return {
    gross_amount: gross,
    commission_percent: commissionPercent,
    commission_amount: commissionAmount,
    platform_amount: commissionAmount,
    salon_net_amount: salonNetAmount,
  };
}

function computePremiumFeeSnapshot(premiumFeeAmount, platformPercent, salonPercent) {
  const fee = round2(premiumFeeAmount);
  if (fee <= 0) {
    return {
      premium_fee_amount: 0,
      premium_platform_amount: 0,
      premium_salon_amount: 0,
    };
  }
  const premiumPlatformAmount = round2(fee * platformPercent / 100);
  const premiumSalonAmount = round2(fee - premiumPlatformAmount);
  return {
    premium_fee_amount: fee,
    premium_platform_amount: premiumPlatformAmount,
    premium_salon_amount: premiumSalonAmount,
  };
}

/**
 * Reads live finance settings and builds immutable snapshot payload for checkout.
 * This is the ONLY service that should read live settings for payment creation.
 */
async function buildCheckoutSnapshot({ bookings, checkoutKind, premiumFeeAmount = null }) {
  const settings = await getCurrentSettings();
  const serviceCommissionPercent = settings.service_commission_percent;
  const premiumFeePlatformPercent = settings.premium_fee_platform_percent;
  const premiumFeeSalonPercent = settings.premium_fee_salon_percent;

  const lineItems = [];
  let totalServiceGross = 0;
  let totalCommission = 0;
  let totalServiceSalonNet = 0;

  const includeServiceLines = checkoutKind === 'SALON_FEE' || checkoutKind === 'COMBINED';

  if (includeServiceLines) {
    for (const booking of bookings) {
      const gross = servicePayableAmount(booking.service);
      const line = computeServiceLineSnapshot(gross, serviceCommissionPercent);
      lineItems.push({
        booking_id: booking.id,
        service_id: booking.service.id,
        service_name_snapshot: booking.service.service_name,
        ...line,
      });
      totalServiceGross += line.gross_amount;
      totalCommission += line.commission_amount;
      totalServiceSalonNet += line.salon_net_amount;
    }
  }

  let premiumSnapshot = {
    premium_fee_amount: null,
    premium_platform_amount: null,
    premium_salon_amount: null,
  };

  if (checkoutKind === 'PREMIUM_ONLY' || checkoutKind === 'COMBINED') {
    const fee = premiumFeeAmount != null ? Number(premiumFeeAmount) : 0;
    premiumSnapshot = computePremiumFeeSnapshot(
      fee,
      premiumFeePlatformPercent,
      premiumFeeSalonPercent,
    );
  }

  const premiumPlatform = premiumSnapshot.premium_platform_amount || 0;
  const premiumSalon = premiumSnapshot.premium_salon_amount || 0;
  const totalAmount = round2(totalServiceGross + (premiumSnapshot.premium_fee_amount || 0));

  return {
    settings_version: settings.current_version,
    service_commission_percent: serviceCommissionPercent,
    premium_fee_platform_percent: premiumFeePlatformPercent,
    premium_fee_salon_percent: premiumFeeSalonPercent,
    ...premiumSnapshot,
    commission_amount: round2(totalCommission),
    platform_amount: round2(totalCommission + premiumPlatform),
    salon_net_amount: round2(totalServiceSalonNet + premiumSalon),
    amount: totalAmount,
    line_items: lineItems,
  };
}

module.exports = {
  buildCheckoutSnapshot,
  computeServiceLineSnapshot,
  computePremiumFeeSnapshot,
  round2,
};
