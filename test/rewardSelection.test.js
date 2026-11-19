const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeVisitAmount,
  selectRewardForVisit,
  generateIssuedCode,
  calculateVoucherDiscount,
} = require('../services/rewardSelectionService');

const sampleRewards = [
  {
    id: 'r-100-internal',
    brand_name: 'Salon App',
    title: 'Flat ₹25 Off Next Booking',
    reward_code: 'NEXT25',
    reward_type: 'SALON_DISCOUNT',
    min_booking_amount: 100,
    max_booking_amount: 299,
    max_claims_per_customer: null, // repeatable evergreen fallback
    total_quantity: null,
    issued_count: 5,
    status: 'ACTIVE',
    is_active: true,
  },
  {
    id: 'r-300-zomato',
    brand_name: 'Zomato',
    title: 'Flat ₹100 Off on Zomato',
    reward_code: 'ZOMATO100',
    reward_type: 'PARTNER_OFFER',
    min_booking_amount: 300,
    max_booking_amount: 500,
    max_claims_per_customer: 1,
    total_quantity: 100,
    issued_count: 10,
    status: 'ACTIVE',
    is_active: true,
  },
  {
    id: 'r-300-internal',
    brand_name: 'Salon App',
    title: 'Flat ₹60 Off Next Booking',
    reward_code: 'NEXT60',
    reward_type: 'SALON_DISCOUNT',
    min_booking_amount: 300,
    max_booking_amount: 500,
    max_claims_per_customer: null,
    total_quantity: null,
    issued_count: 0,
    status: 'ACTIVE',
    is_active: true,
  },
  {
    id: 'r-600-myntra',
    brand_name: 'Myntra',
    title: '₹250 Off on Myntra',
    reward_code: 'MYNTRA250',
    reward_type: 'PARTNER_OFFER',
    min_booking_amount: 600,
    max_booking_amount: 1000,
    max_claims_per_customer: 1,
    total_quantity: 50,
    issued_count: 2,
    status: 'ACTIVE',
    is_active: true,
  },
];

test('matches exact spend slabs: 150 -> 100-299, 400 -> 300-500, 750 -> 600-1000', () => {
  const r1 = selectRewardForVisit({ rewards: sampleRewards, visitAmount: 150 });
  assert.equal(r1.id, 'r-100-internal');

  const r2 = selectRewardForVisit({ rewards: sampleRewards, visitAmount: 400, randomFn: () => 0.0 });
  assert.equal(r2.id, 'r-300-zomato');

  const r2b = selectRewardForVisit({ rewards: sampleRewards, visitAmount: 400, randomFn: () => 0.9 });
  assert.equal(r2b.id, 'r-300-internal');

  const r3 = selectRewardForVisit({ rewards: sampleRewards, visitAmount: 750 });
  assert.equal(r3.id, 'r-600-myntra');
});

test('never promotes a low-spend booking below minimum slab threshold', () => {
  const r = selectRewardForVisit({ rewards: sampleRewards, visitAmount: 50 });
  assert.equal(r, null);
});

test('falls back gracefully to highest qualifying lower slab for gap spend (e.g. ₹550)', () => {
  const r = selectRewardForVisit({ rewards: sampleRewards, visitAmount: 550, randomFn: () => 0.0 });
  assert.equal(r.id, 'r-300-zomato');
});

test('never gives the same one-time Zomato voucher twice to the same customer', () => {
  const selected = selectRewardForVisit({
    rewards: sampleRewards,
    visitAmount: 420,
    customerClaimCounts: { 'r-300-zomato': 1 },
    customerClaimedCodes: new Set(['ZOMATO100']),
    randomFn: () => 0.0,
  });
  // Zomato is excluded; remaining eligible voucher in 300-500 slab is picked
  assert.equal(selected.id, 'r-300-internal');
});

test('prevents duplicate partner reward_code even across two different reward templates', () => {
  const dupRewards = [
    ...sampleRewards,
    {
      ...sampleRewards[1],
      id: 'r-300-zomato-copy',
    },
  ];
  const selected = selectRewardForVisit({
    rewards: dupRewards,
    visitAmount: 420,
    customerClaimCounts: { 'r-300-zomato': 1 },
    customerClaimedCodes: new Set(['ZOMATO100']),
    randomFn: () => 0.0,
  });
  assert.equal(selected.id, 'r-300-internal');
});

test('falls back to lower slab repeatable internal voucher when higher slab unique vouchers are exhausted', () => {
  const selected = selectRewardForVisit({
    rewards: sampleRewards,
    visitAmount: 800,
    customerClaimCounts: { 'r-600-myntra': 1, 'r-300-zomato': 1 },
    customerClaimedCodes: new Set(['MYNTRA250', 'ZOMATO100']),
  });
  assert.equal(selected.id, 'r-300-internal');
});

test('excludes rewards that have reached total_quantity stock cap', () => {
  const outOfStock = sampleRewards.map((r) =>
    r.id === 'r-300-zomato' ? { ...r, issued_count: 100, total_quantity: 100 } : r
  );
  const selected = selectRewardForVisit({ rewards: outOfStock, visitAmount: 400, randomFn: () => 0.0 });
  assert.equal(selected.id, 'r-300-internal');
});

test('picks uniformly at random from all remaining eligible vouchers in the matched slab', () => {
  const pool = [
    { ...sampleRewards[1] },
    { ...sampleRewards[2] },
  ];
  assert.equal(
    selectRewardForVisit({ rewards: pool, visitAmount: 400, randomFn: () => 0.25 }).id,
    'r-300-zomato'
  );
  assert.equal(
    selectRewardForVisit({ rewards: pool, visitAmount: 400, randomFn: () => 0.75 }).id,
    'r-300-internal'
  );
});

test('computeVisitAmount prefers paid payment amount (and extra cash) and sums multi-service fallback', () => {
  assert.equal(
    computeVisitAmount(
      [{ service: { price: 300 } }, { service: { price: 200 } }],
      [{ status: 'PAID', checkout_kind: 'SALON_FEE', amount: 500, cash_confirmed_amount: 650 }]
    ),
    650
  );
  assert.equal(
    computeVisitAmount(
      [{ service: { price: 300, discount_price: 250 } }, { service: { price: 200 } }],
      []
    ),
    450
  );
});

test('generateIssuedCode creates personal unique codes for SALON_DISCOUNT and keeps partner code for PARTNER_OFFER', () => {
  const extCode = generateIssuedCode({ reward_type: 'PARTNER_OFFER', reward_code: 'zomato100' });
  assert.equal(extCode, 'ZOMATO100');

  const intCode1 = generateIssuedCode({ reward_type: 'SALON_DISCOUNT', reward_code: 'NEXT60' });
  const intCode2 = generateIssuedCode({ reward_type: 'SALON_DISCOUNT', reward_code: 'NEXT60' });
  assert.match(intCode1, /^NEXT60-[A-Z0-9]{6}$/);
  assert.notEqual(intCode1, intCode2);
});

test('calculateVoucherDiscount enforces minOrderValue, FLAT cap, and PERCENT max cap', () => {
  const belowMin = calculateVoucherDiscount({
    discountType: 'FLAT',
    discountValue: 60,
    orderAmount: 250,
    minOrderValue: 300,
  });
  assert.equal(belowMin.eligible, false);

  const flat = calculateVoucherDiscount({
    discountType: 'FLAT',
    discountValue: 60,
    orderAmount: 400,
    minOrderValue: 300,
  });
  assert.equal(flat.eligible, true);
  assert.equal(flat.discountAmount, 60);
  assert.equal(flat.finalTotal, 340);

  const pctCapped = calculateVoucherDiscount({
    discountType: 'PERCENT',
    discountValue: 20,
    orderAmount: 1000,
    minOrderValue: 500,
    maxDiscountAmount: 150,
  });
  assert.equal(pctCapped.eligible, true);
  assert.equal(pctCapped.discountAmount, 150);
  assert.equal(pctCapped.finalTotal, 850);
});
