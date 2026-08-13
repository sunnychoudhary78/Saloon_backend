'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { Service } = require('../models');
const {
  DUPLICATE_MESSAGE,
  assertUniqueServiceIdentity,
  mapServiceIdentityConflict,
  serviceIdentityConflict,
} = require('../services/serviceIdentityService');

function mockFindAll(t, rows) {
  const originalFindAll = Service.findAll;
  t.after(() => {
    Service.findAll = originalFindAll;
  });
  let capturedWhere;
  Service.findAll = async ({ where }) => {
    capturedWhere = where;
    return typeof rows === 'function' ? rows() : rows;
  };
  return () => capturedWhere;
}

test('allows a service identity when no same-name sibling exists', async (t) => {
  mockFindAll(t, []);

  await assert.doesNotReject(() =>
    assertUniqueServiceIdentity({
      salonId: 'salon-1',
      serviceName: 'Haircut',
      serviceFor: 'MEN',
    })
  );
});

test('rejects the same name and gender even when price or description differ', async (t) => {
  const capturedWhere = mockFindAll(t, [{ id: 'existing-service', service_for: 'MEN' }]);

  await assert.rejects(
    assertUniqueServiceIdentity({
      salonId: 'salon-1',
      serviceName: ' Haircut ',
      serviceFor: 'MEN',
    }),
    (error) =>
      error.statusCode === 409 &&
      error.message === 'Haircut is already added for Men'
  );

  const where = capturedWhere();
  assert.equal(where.salon_id, 'salon-1');
  assert.equal(where.service_for, undefined);
  assert.equal(where.price, undefined);
  assert.equal(where.description, undefined);
});

test('excludes the current service while validating an update', async (t) => {
  const capturedWhere = mockFindAll(t, []);

  await assertUniqueServiceIdentity({
    salonId: 'salon-1',
    serviceName: 'Haircut',
    serviceFor: 'WOMEN',
    excludeId: 'service-1',
  });

  const where = capturedWhere();
  assert.deepEqual(where.id, { [Op.ne]: 'service-1' });
  assert.equal(where.service_for, undefined);
});

test('allows Men and Women versions of the same service name', async (t) => {
  mockFindAll(t, [{ id: 'men-cut', service_for: 'MEN' }]);

  await assert.doesNotReject(() =>
    assertUniqueServiceIdentity({
      salonId: 'salon-1',
      serviceName: 'Haircut',
      serviceFor: 'WOMEN',
    })
  );
});

test('allows editing Unisex to Men when no other Haircut exists', async (t) => {
  mockFindAll(t, []);

  await assert.doesNotReject(() =>
    assertUniqueServiceIdentity({
      salonId: 'salon-1',
      serviceName: 'Haircut',
      serviceFor: 'MEN',
      excludeId: 'unisex-cut',
    })
  );
});

test('rejects Unisex when a Men version already exists', async (t) => {
  mockFindAll(t, [{ id: 'men-cut', service_for: 'MEN' }]);

  await assert.rejects(
    assertUniqueServiceIdentity({
      salonId: 'salon-1',
      serviceName: 'Haircut',
      serviceFor: 'UNISEX',
    }),
    (error) =>
      error.statusCode === 409 &&
      error.message ===
        'Haircut is already added for Men. You can add it for Women, but not as a unisex service.'
  );
});

test('rejects Men when a Unisex version already exists', async (t) => {
  mockFindAll(t, [{ id: 'unisex-cut', service_for: 'UNISEX' }]);

  await assert.rejects(
    assertUniqueServiceIdentity({
      salonId: 'salon-1',
      serviceName: 'Haircut',
      serviceFor: 'MEN',
    }),
    (error) =>
      error.statusCode === 409 &&
      error.message ===
        'Haircut is already added for Everyone. Edit that service, or remove it before adding separate Men and Women versions.'
  );
});

test('serviceIdentityConflict allows Men plus Women and blocks unisex mixes', () => {
  assert.equal(
    serviceIdentityConflict({
      serviceName: 'Haircut',
      serviceFor: 'WOMEN',
      existingServiceFors: ['MEN'],
    }),
    null
  );
  assert.equal(
    serviceIdentityConflict({
      serviceName: 'Haircut',
      serviceFor: 'UNISEX',
      existingServiceFors: ['MEN', 'WOMEN'],
    }),
    'Haircut is already added for Men and Women. You cannot also add it as a unisex service.'
  );
  assert.equal(
    serviceIdentityConflict({
      serviceName: 'Haircut',
      serviceFor: 'MEN',
      existingServiceFors: ['UNISEX'],
    }),
    'Haircut is already added for Everyone. Edit that service, or remove it before adding separate Men and Women versions.'
  );
  assert.equal(
    serviceIdentityConflict({
      serviceName: 'Haircut',
      serviceFor: 'UNISEX',
      existingServiceFors: [],
    }),
    null
  );
});

test('maps database uniqueness races to a conflict response', () => {
  const mapped = mapServiceIdentityConflict({
    name: 'SequelizeUniqueConstraintError',
  });

  assert.equal(mapped.statusCode, 409);
  assert.equal(mapped.message, DUPLICATE_MESSAGE);
});
