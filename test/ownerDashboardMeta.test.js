'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOwnerDashboardMeta } = require('../services/ownerDashboard/ownerDashboardMeta');

test('includes available_salons even when dashboard is scoped to one salon', () => {
  const meta = buildOwnerDashboardMeta({
    salonIds: ['s1'],
    scopedSalonId: 's1',
    availableSalons: [
      { salon_id: 's1', salon_name: 'Glow Studio Koramangala' },
      { salon_id: 's2', salon_name: 'Glow Studio Indiranagar' },
    ],
    date: '2026-08-13',
    timezone: 'Asia/Kolkata',
  });

  assert.deepEqual(meta.salon_ids, ['s1']);
  assert.equal(meta.salon_count, 1);
  assert.equal(meta.scoped_salon_id, 's1');
  assert.equal(meta.available_salons.length, 2);
  assert.equal(meta.available_salons[1].salon_id, 's2');
  assert.equal(meta.available_salons[1].salon_name, 'Glow Studio Indiranagar');
});

test('defaults available_salons to an empty list when the catalog is missing', () => {
  const meta = buildOwnerDashboardMeta({
    salonIds: ['s1'],
    scopedSalonId: 's1',
    date: '2026-08-13',
    timezone: 'Asia/Kolkata',
  });

  assert.deepEqual(meta.available_salons, []);
});
