const crypto = require('crypto');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function resolveServicePrice(service) {
  if (!service) return 0;
  const price = Number(service.price);
  const discount = Number(service.discount_price);
  if (Number.isFinite(discount) && discount > 0 && Number.isFinite(price) && discount < price) {
    return round2(discount);
  }
  return Number.isFinite(price) && price > 0 ? round2(price) : 0;
}

/**
 * Computes the total spend for a completed visit (supports multi-service groups & extra cash).
 */
function computeVisitAmount(bookings = [], payments = []) {
  const paidSalonPayments = (payments || []).filter(
    (p) =>
      p &&
      (p.status === 'PAID' || p.cash_confirmed === true) &&
      (p.checkout_kind === 'SALON_FEE' ||
        p.checkout_kind === 'COMBINED' ||
        p.payment_type === 'SALON_FEE' ||
        !p.checkout_kind)
  );

  if (paidSalonPayments.length > 0) {
    const totalPaid = paidSalonPayments.reduce((sum, p) => {
      const base = Number(p.amount) || 0;
      const confirmed = Number(p.cash_confirmed_amount) || 0;
      return sum + Math.max(base, confirmed);
    }, 0);
    if (totalPaid > 0) return round2(totalPaid);
  }

  const bookingTotal = (bookings || []).reduce((sum, b) => {
    return sum + resolveServicePrice(b?.service);
  }, 0);
  return round2(bookingTotal);
}

function isRewardInStock(reward) {
  if (!reward) return false;
  if (reward.total_quantity == null || reward.total_quantity === '') return true;
  const limit = Number(reward.total_quantity);
  if (!Number.isFinite(limit) || limit <= 0) return false;
  const issued = Number(reward.issued_count || 0);
  return issued < limit;
}

function isCustomerEligibleForReward(reward, customerClaimCounts = {}, customerClaimedCodes = new Set()) {
  if (!reward) return false;

  const claimedByReward = Number(customerClaimCounts[reward.id] || 0);
  const maxPerCustomer =
    reward.max_claims_per_customer != null && reward.max_claims_per_customer !== ''
      ? Number(reward.max_claims_per_customer)
      : null;

  if (maxPerCustomer !== null && Number.isFinite(maxPerCustomer)) {
    if (claimedByReward >= maxPerCustomer) return false;
  }

  // Extra safeguard for one-time external partner vouchers (e.g. Zomato/Swiggy):
  // never issue the same partner reward_code twice to the same customer even across templates.
  if (
    reward.reward_type === 'PARTNER_OFFER' &&
    maxPerCustomer === 1 &&
    reward.reward_code
  ) {
    const normalizedCode = String(reward.reward_code).trim().toUpperCase();
    if (customerClaimedCodes && customerClaimedCodes.has(normalizedCode)) {
      return false;
    }
  }

  return true;
}

/**
 * Matches eligible rewards to the customer's booking spend slab.
 * 1) Primary: exact slab match (min_booking_amount <= visitAmount <= max_booking_amount)
 * 2) Fallback: if exact slab has no eligible rewards left (e.g., gap between slabs or all
 *    1-time vouchers in that slab are already claimed), pick the highest lower slab where
 *    min_booking_amount <= visitAmount.
 * Never promotes a low-spend booking into a higher spend slab.
 */
function matchSpendSlab(eligibleRewards, visitAmount) {
  const spend = Number(visitAmount);
  if (!Number.isFinite(spend) || spend < 0) return [];

  const exactMatches = eligibleRewards.filter((r) => {
    const min = Number(r.min_booking_amount || 0);
    const hasMax = r.max_booking_amount != null && r.max_booking_amount !== '';
    const max = hasMax ? Number(r.max_booking_amount) : Infinity;
    return spend >= min && spend <= max;
  });

  if (exactMatches.length > 0) return exactMatches;

  // Fallback to the highest qualifying lower slab (min <= spend)
  const qualifying = eligibleRewards.filter((r) => spend >= Number(r.min_booking_amount || 0));
  if (qualifying.length === 0) return [];

  const highestMin = qualifying.reduce(
    (best, r) => Math.max(best, Number(r.min_booking_amount || 0)),
    -Infinity
  );

  return qualifying.filter((r) => Number(r.min_booking_amount || 0) === highestMin);
}

/**
 * Picks one reward uniformly at random from the remaining eligible slab-matched candidates.
 */
function pickRandomCandidate(candidates, randomFn = Math.random) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const idx = Math.min(candidates.length - 1, Math.floor(randomFn() * candidates.length));
  return candidates[idx];
}

/**
 * Full reward selection pipeline for a completed booking visit:
 * 1) Active & in-stock (`issued_count < total_quantity`)
 * 2) Within per-user cap (`max_claims_per_customer`) & no duplicate partner code
 * 3) Matched to booking spend slab (with graceful lower-slab fallback)
 * 4) Randomly picked from remaining eligible vouchers
 */
function selectRewardForVisit({
  rewards = [],
  visitAmount = 0,
  customerClaimCounts = {},
  customerClaimedCodes = new Set(),
  randomFn = Math.random,
}) {
  const activeInStock = rewards.filter(
    (r) => r && r.status === 'ACTIVE' && r.is_active !== false && isRewardInStock(r)
  );
  if (activeInStock.length === 0) return null;

  const eligibleForCustomer = activeInStock.filter((r) =>
    isCustomerEligibleForReward(r, customerClaimCounts, customerClaimedCodes)
  );
  if (eligibleForCustomer.length === 0) return null;

  const slabMatches = matchSpendSlab(eligibleForCustomer, visitAmount);
  if (slabMatches.length === 0) return null;

  return pickRandomCandidate(slabMatches, randomFn);
}

/**
 * Generates the code stored on CustomerReward:
 * - PARTNER_OFFER: uses the partner's reward_code directly
 * - SALON_DISCOUNT: generates a unique personal single-use code (e.g. SALON50-7K4M9P)
 */
function generateIssuedCode(reward) {
  const base = String(reward?.reward_code || 'REWARD')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12) || 'REWARD';

  if (reward?.reward_type !== 'SALON_DISCOUNT') {
    return String(reward?.reward_code || '').trim().toUpperCase();
  }

  const bytes = crypto.randomBytes(6);
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `${base}-${suffix}`;
}

/**
 * Shared discount calculator for both public Coupons and internal SALON_DISCOUNT Rewards.
 */
function calculateVoucherDiscount({
  discountType,
  discountValue,
  orderAmount,
  minOrderValue = 0,
  maxDiscountAmount = null,
}) {
  const orderTotal = orderAmount != null ? Number(orderAmount) : null;
  const minOrder = Number(minOrderValue || 0);
  const val = Number(discountValue || 0);

  if (orderTotal !== null && minOrder > 0 && orderTotal < minOrder) {
    return {
      eligible: false,
      reason: `Minimum order value of ₹${minOrder.toFixed(2)} required to apply this voucher`,
      discountAmount: 0,
      finalTotal: round2(orderTotal),
    };
  }

  let discountAmount = 0;
  if (orderTotal !== null && val > 0) {
    if (String(discountType).toUpperCase() === 'PERCENT') {
      const rawDiscount = (orderTotal * val) / 100;
      const cap = maxDiscountAmount != null && maxDiscountAmount !== '' ? Number(maxDiscountAmount) : null;
      discountAmount = cap && cap > 0 ? Math.min(rawDiscount, cap) : rawDiscount;
      discountAmount = Math.min(orderTotal, discountAmount);
    } else {
      discountAmount = Math.min(orderTotal, val);
    }
  }

  discountAmount = round2(discountAmount);
  const finalTotal = orderTotal !== null ? Math.max(0, round2(orderTotal - discountAmount)) : null;

  return {
    eligible: true,
    reason: null,
    discountAmount,
    finalTotal,
  };
}

module.exports = {
  round2,
  computeVisitAmount,
  isRewardInStock,
  isCustomerEligibleForReward,
  matchSpendSlab,
  pickRandomCandidate,
  selectRewardForVisit,
  generateIssuedCode,
  calculateVoucherDiscount,
};
