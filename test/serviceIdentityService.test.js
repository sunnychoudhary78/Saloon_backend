'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { Service } = require('../models');
const {
  DUPLICATE_MESSAGE,
  assertUniqueServiceIdentity,
  mapServiceIdentityConflict,
} = require('../services/serviceIdentityService');

test('allows a service identity when no name+gender duplicate exists', async (t) => {
  const originalFindOne = Service.findOne;
  t.after(() => {
    Service.findOne = originalFindOne;
  });
  Service.findOne = async () => null;

  await assert.doesNotReject(() =>
    assertUniqueServiceIdentity({
      salonId: 'salon-1',
      serviceName: 'Haircut',
      serviceFor: 'MEN',
    })
  );
});

test('rejects the same name and gender even when price or description differ', async (t) => {
  const originalFindOne = Service.findOne;
  t.after(() => {
    Service.findOne = originalFindOne;
  });
  let capturedWhere;
  Service.findOne = async ({ where }) => {
    capturedWhere = where;
    return { id: 'existing-service' };
  };

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

  assert.equal(capturedWhere.salon_id, 'salon-1');
  assert.equal(capturedWhere.service_for, 'MEN');
  assert.equal(capturedWhere.price, undefined);
  assert.equal(capturedWhere.description, undefined);
});

test('excludes the current service while validating an update', async (t) => {
  const originalFindOne = Service.findOne;
  t.after(() => {
    Service.findOne = originalFindOne;
  });
  let capturedWhere;
  Service.findOne = async ({ where }) => {
    capturedWhere = where;
    return null;
  };

  await assertUniqueServiceIdentity({
    salonId: 'salon-1',
    serviceName: 'Haircut',
    serviceFor: 'WOMEN',
    excludeId: 'service-1',
  });

  assert.deepEqual(capturedWhere.id, { [Op.ne]: 'service-1' });
  assert.equal(capturedWhere.service_for, 'WOMEN');
});

test('allows same name for different service_for values', async (t) => {
  const originalFindOne = Service.findOne;
  t.after(() => {
    Service.findOne = originalFindOne;
  });
  let capturedWhere;
  Service.findOne = async ({ where }) => {
    capturedWhere = where;
    return null;
  };

  await assertUniqueServiceIdentity({
    salonId: 'salon-1',
    serviceName: 'Haircut',
    serviceFor: 'WOMEN',
  });

  assert.equal(capturedWhere.service_for, 'WOMEN');
});

test('maps database uniqueness races to a conflict response', () => {
  const mapped = mapServiceIdentityConflict({
    name: 'SequelizeUniqueConstraintError',
  });

  assert.equal(mapped.statusCode, 409);
  assert.equal(mapped.message, DUPLICATE_MESSAGE);
});
