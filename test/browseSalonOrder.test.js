'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildBrowseOrder,
  filterAndSortSalonsByAvailability,
} = require('../services/salonBrowseService');

const distanceLiteral = { val: 'distance_expression' };

test('default order leads with featured salons and ends on a stable tiebreaker', () => {
  const order = buildBrowseOrder({});

  assert.deepEqual(order, [
    ['is_featured', 'DESC'],
    ['featured_sort_order', 'ASC'],
    ['salon_name', 'ASC'],
    ['id', 'ASC'],
  ]);
});

test('sorts by distance instead of name when coordinates are known', () => {
  const order = buildBrowseOrder({ distanceLiteral });

  assert.deepEqual(order, [
    ['is_featured', 'DESC'],
    ['featured_sort_order', 'ASC'],
    [distanceLiteral, 'ASC NULLS LAST'],
    ['id', 'ASC'],
  ]);
});

test('featured-only queries drop the redundant featured flag sort', () => {
  const order = buildBrowseOrder({ featuredOnly: true, distanceLiteral });

  assert.deepEqual(order, [
    ['featured_sort_order', 'ASC'],
    [distanceLiteral, 'ASC NULLS LAST'],
    ['id', 'ASC'],
  ]);
});

test('discounted-only queries keep the default featured-first order', () => {
  assert.deepEqual(buildBrowseOrder({}), buildBrowseOrder({ featuredOnly: false }));
});

test('every order ends with id so pagination cannot repeat or skip a salon', () => {
  const variants = [
    buildBrowseOrder({}),
    buildBrowseOrder({ distanceLiteral }),
    buildBrowseOrder({ featuredOnly: true }),
    buildBrowseOrder({ featuredOnly: true, distanceLiteral }),
  ];

  for (const order of variants) {
    assert.deepEqual(order[order.length - 1], ['id', 'ASC']);
  }
});

test('availability sort mirrors the SQL order: featured first, then open slots', () => {
  const salons = [
    { id: 'c', salon_name: 'Calm Cuts', is_featured: false, featured_sort_order: 0, distance_km: 1 },
    { id: 'a', salon_name: 'Aura', is_featured: true, featured_sort_order: 2, distance_km: 9 },
    { id: 'b', salon_name: 'Blaze', is_featured: true, featured_sort_order: 1, distance_km: 8 },
    { id: 'd', salon_name: 'Dazzle', is_featured: false, featured_sort_order: 0, distance_km: 4 },
  ];
  const slotsMap = new Map([
    ['a', { available: 1, status: 'open' }],
    ['b', { available: 2, status: 'open' }],
    ['c', { available: 3, status: 'open' }],
    ['d', { available: 5, status: 'open' }],
  ]);

  const sorted = filterAndSortSalonsByAvailability(salons, slotsMap, { userCoords: true });

  assert.deepEqual(sorted.map((salon) => salon.id), ['b', 'a', 'd', 'c']);
});

test('availability sort drops fully booked salons', () => {
  const salons = [
    { id: 'a', salon_name: 'Aura', is_featured: false, featured_sort_order: 0 },
    { id: 'b', salon_name: 'Blaze', is_featured: false, featured_sort_order: 0 },
    { id: 'c', salon_name: 'Calm', is_featured: false, featured_sort_order: 0 },
  ];
  const slotsMap = new Map([
    ['a', { available: 0, status: 'full' }],
    ['b', { available: 4, status: 'open' }],
    ['c', { available: 2, status: 'full' }],
  ]);

  const sorted = filterAndSortSalonsByAvailability(salons, slotsMap, {});

  assert.deepEqual(sorted.map((salon) => salon.id), ['b']);
});

test('availability sort falls back to id when every other key ties', () => {
  const salons = [
    { id: 'z', salon_name: 'Same', is_featured: false, featured_sort_order: 0, distance_km: 2 },
    { id: 'a', salon_name: 'Same', is_featured: false, featured_sort_order: 0, distance_km: 2 },
  ];
  const slotsMap = new Map([
    ['z', { available: 3, status: 'open' }],
    ['a', { available: 3, status: 'open' }],
  ]);

  const sorted = filterAndSortSalonsByAvailability(salons, slotsMap, { userCoords: true });

  assert.deepEqual(sorted.map((salon) => salon.id), ['a', 'z']);
});
