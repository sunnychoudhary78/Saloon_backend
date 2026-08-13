'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  Booking,
  Salon,
  SalonSlotOverride,
  PlatformSetting,
} = require('../models');
const {
  assertCustomerServiceSlotFree,
  assertSlotBookable,
  classifyAcceptedSlotGroups,
  isPremiumBookingGroup,
  autoRejectCompetingPendingGroups,
  evaluateCustomerSlotRequest,
  invalidatePremiumConfigCache,
  PREMIUM_ALREADY_ACCEPTED_MESSAGE,
  SLOT_ALREADY_BOOKED_MESSAGE,
  PREMIUM_ONLY_OCCUPIED_MESSAGE,
  SLOT_CONFLICT_CODES,
} = require('../services/slotService');

const FUTURE_DATE = '2026-12-15';
const SLOT_TIME = '10:00';

function activeSalon() {
  return {
    id: 'salon-1',
    status: 'ACTIVE',
    is_active: true,
    opening_time: '09:00:00',
    closing_time: '18:00:00',
    premium_booking_fee: null,
  };
}

function installSlotMocks(t, { bookings = [], override = null, premiumEnabled = true } = {}) {
  const original = {
    salonFindByPk: Salon.findByPk,
    bookingFindAll: Booking.findAll,
    overrideFindOne: SalonSlotOverride.findOne,
    settingFindOne: PlatformSetting.findOne,
  };
  t.after(() => {
    Salon.findByPk = original.salonFindByPk;
    Booking.findAll = original.bookingFindAll;
    SalonSlotOverride.findOne = original.overrideFindOne;
    PlatformSetting.findOne = original.settingFindOne;
    invalidatePremiumConfigCache();
  });

  Salon.findByPk = async () => activeSalon();
  Booking.findAll = async () => bookings;
  SalonSlotOverride.findOne = async () => override;
  PlatformSetting.findOne = async () => ({
    setting_value: { enabled: premiumEnabled, fee: 199, currency: 'INR' },
  });
  invalidatePremiumConfigCache();
}

test('allows booking when customer has no active booking for service+slot', async (t) => {
  const originalFindOne = Booking.findOne;
  t.after(() => {
    Booking.findOne = originalFindOne;
  });
  Booking.findOne = async () => null;

  await assert.doesNotReject(() =>
    assertCustomerServiceSlotFree(
      'salon-1',
      '2026-08-10',
      '10:00',
      'service-1',
      'customer-1',
    )
  );
});

test('rejects duplicate customer service+slot for PENDING/ACCEPTED', async (t) => {
  const originalFindOne = Booking.findOne;
  t.after(() => {
    Booking.findOne = originalFindOne;
  });
  Booking.findOne = async () => ({ id: 'existing-booking' });

  await assert.rejects(
    () =>
      assertCustomerServiceSlotFree(
        'salon-1',
        '2026-08-10',
        '10:00',
        'service-1',
        'customer-1',
      ),
    (error) =>
      error.statusCode === 409 &&
      error.message === 'You already booked this service for the selected slot',
  );
});

test('classifies a premium group even when sibling rows are STANDARD', () => {
  const rows = [
    { booking_group_id: 'g1', booking_type: 'PREMIUM', booking_status: 'ACCEPTED' },
    { booking_group_id: 'g1', booking_type: 'STANDARD', booking_status: 'ACCEPTED' },
  ];
  assert.equal(isPremiumBookingGroup(rows), true);
  const occupancy = classifyAcceptedSlotGroups(rows);
  assert.equal(occupancy.hasAcceptedPremium, true);
  assert.equal(occupancy.hasAcceptedStandard, false);
});

test('classifies an accepted STANDARD group separately from a pending premium', () => {
  const occupancy = classifyAcceptedSlotGroups([
    { id: 'a', booking_group_id: 'std', booking_type: 'STANDARD', booking_status: 'ACCEPTED' },
    { id: 'b', booking_group_id: 'prem', booking_type: 'PREMIUM', booking_status: 'PENDING' },
  ]);
  assert.equal(occupancy.hasAcceptedStandard, true);
  assert.equal(occupancy.hasAcceptedPremium, false);
});

test('allows a second PENDING STANDARD when none is accepted', async (t) => {
  installSlotMocks(t, {
    bookings: [{
      id: 'b1',
      booking_group_id: 'g1',
      booking_type: 'STANDARD',
      booking_status: 'PENDING',
    }],
  });

  const result = await assertSlotBookable('salon-1', FUTURE_DATE, SLOT_TIME, { isPremium: false });
  assert.equal(result.bookingType, 'STANDARD');
});

test('rejects STANDARD after one STANDARD group is accepted', async (t) => {
  installSlotMocks(t, {
    bookings: [{
      id: 'b1',
      booking_group_id: 'g1',
      booking_type: 'STANDARD',
      booking_status: 'ACCEPTED',
    }],
  });

  await assert.rejects(
    () => assertSlotBookable('salon-1', FUTURE_DATE, SLOT_TIME, { isPremium: false }),
    (error) => error.statusCode === 409 && error.message === SLOT_ALREADY_BOOKED_MESSAGE,
  );
});

test('rejects PREMIUM on an empty or pending-only slot', async (t) => {
  installSlotMocks(t, {
    bookings: [{
      id: 'b1',
      booking_group_id: 'g1',
      booking_type: 'STANDARD',
      booking_status: 'PENDING',
    }],
  });

  await assert.rejects(
    () => assertSlotBookable('salon-1', FUTURE_DATE, SLOT_TIME, { isPremium: true }),
    (error) => error.statusCode === 400 && error.message === PREMIUM_ONLY_OCCUPIED_MESSAGE,
  );
});

test('allows PREMIUM after a STANDARD booking is accepted', async (t) => {
  installSlotMocks(t, {
    bookings: [{
      id: 'b1',
      booking_group_id: 'g1',
      booking_type: 'STANDARD',
      booking_status: 'ACCEPTED',
    }],
  });

  const result = await assertSlotBookable('salon-1', FUTURE_DATE, SLOT_TIME, { isPremium: true });
  assert.equal(result.bookingType, 'PREMIUM');
  assert.equal(result.premiumAmount, 199);
});

test('allows PREMIUM on an owner-blocked slot', async (t) => {
  installSlotMocks(t, {
    bookings: [],
    override: { id: 'block-1', is_blocked: true },
  });

  const result = await assertSlotBookable('salon-1', FUTURE_DATE, SLOT_TIME, { isPremium: true });
  assert.equal(result.bookingType, 'PREMIUM');
});

test('rejects a second PREMIUM after one is accepted', async (t) => {
  installSlotMocks(t, {
    bookings: [{
      id: 'b1',
      booking_group_id: 'g1',
      booking_type: 'PREMIUM',
      booking_status: 'ACCEPTED',
    }],
  });

  await assert.rejects(
    () => assertSlotBookable('salon-1', FUTURE_DATE, SLOT_TIME, { isPremium: true }),
    (error) => error.statusCode === 409 && error.message === PREMIUM_ALREADY_ACCEPTED_MESSAGE,
  );
});

test('auto-rejects other PENDING groups of the same type only', async (t) => {
  const saved = [];
  const originalFindAll = Booking.findAll;
  t.after(() => {
    Booking.findAll = originalFindAll;
  });

  const makeRow = (id, groupId, type) => ({
    id,
    booking_group_id: groupId,
    booking_type: type,
    booking_status: 'PENDING',
    async save() {
      saved.push({ id: this.id, status: this.booking_status, reason: this.rejection_reason });
    },
  });

  Booking.findAll = async () => [
    makeRow('keep-std', 'accepted-std', 'STANDARD'),
    makeRow('reject-std', 'other-std', 'STANDARD'),
    makeRow('keep-prem', 'pending-prem', 'PREMIUM'),
  ];

  const rejected = await autoRejectCompetingPendingGroups({
    salonId: 'salon-1',
    bookingDate: FUTURE_DATE,
    bookingTime: SLOT_TIME,
    currentGroup: [{
      id: 'keep-std',
      booking_group_id: 'accepted-std',
      booking_type: 'STANDARD',
    }],
    userId: 'owner-1',
  });

  assert.deepEqual(rejected, ['reject-std']);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, 'reject-std');
  assert.equal(saved[0].status, 'REJECTED');
});

test('same customer + same service is a duplicate even when pending', () => {
  const decision = evaluateCustomerSlotRequest(
    [{
      id: 'b1',
      booking_group_id: 'g1',
      service_id: 'svc-cut',
      booking_status: 'PENDING',
      booking_type: 'STANDARD',
    }],
    ['svc-cut'],
  );
  assert.equal(decision.type, SLOT_CONFLICT_CODES.DUPLICATE_SERVICE);
});

test('PENDING different service is upgrade-available, not a new group', () => {
  const decision = evaluateCustomerSlotRequest(
    [{
      id: 'b1',
      booking_group_id: 'g1',
      service_id: 'svc-cut',
      booking_status: 'PENDING',
      booking_type: 'STANDARD',
      created_at: '2026-12-15T09:00:00.000Z',
      service: { service_name: 'Haircut' },
    }],
    ['svc-cut', 'svc-beard'],
  );
  assert.equal(decision.type, SLOT_CONFLICT_CODES.UPGRADE_AVAILABLE);
  assert.equal(decision.groupId, 'g1');
  assert.deepEqual(decision.newServiceIds, ['svc-beard']);
});

test('ACCEPTED different service is OWN_SLOT_BOOKED, not a slot conflict for others', () => {
  const decision = evaluateCustomerSlotRequest(
    [{
      id: 'b1',
      booking_group_id: 'g1',
      service_id: 'svc-cut',
      booking_status: 'ACCEPTED',
      booking_type: 'STANDARD',
    }],
    ['svc-beard'],
  );
  assert.equal(decision.type, SLOT_CONFLICT_CODES.OWN_SLOT_BOOKED);
});

test('merges into the newest PENDING group when several exist', () => {
  const decision = evaluateCustomerSlotRequest(
    [
      {
        id: 'old',
        booking_group_id: 'g-old',
        service_id: 'svc-cut',
        booking_status: 'PENDING',
        created_at: '2026-12-15T08:00:00.000Z',
      },
      {
        id: 'new',
        booking_group_id: 'g-new',
        service_id: 'svc-color',
        booking_status: 'PENDING',
        created_at: '2026-12-15T09:00:00.000Z',
      },
    ],
    ['svc-beard'],
  );
  assert.equal(decision.type, SLOT_CONFLICT_CODES.UPGRADE_AVAILABLE);
  assert.equal(decision.groupId, 'g-new');
});

test('no active own booking is clear to create a new group', () => {
  const decision = evaluateCustomerSlotRequest([], ['svc-cut']);
  assert.equal(decision.type, 'CLEAR');
});
