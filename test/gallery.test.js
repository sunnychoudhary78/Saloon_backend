'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Joi = require('joi');
const {
  validateCreateGalleryPost,
  validateUpdateGalleryPost,
  validateConsent,
} = require('../validators/galleryValidator');

test('validateConsent accepts APPROVED and REJECTED', () => {
  const reqOk = { body: { consent: 'APPROVED' } };
  let calledNext = false;
  validateConsent(reqOk, {}, () => {
    calledNext = true;
  });
  assert.equal(calledNext, true);

  const reqBad = { body: { consent: 'INVALID' } };
  let statusSent = 0;
  validateConsent(reqBad, {
    status: (s) => {
      statusSent = s;
      return { json: () => {} };
    },
  }, () => {});
  assert.equal(statusSent, 400);
});

test('validateCreateGalleryPost handles string boolean is_public with required customer_phone', () => {
  const req = {
    body: {
      title: 'Amazing Fade Haircut',
      description: 'Done with razor finish',
      customer_phone: '9876543210',
      is_public: 'true',
      sort_order: 1,
    },
  };
  let calledNext = false;
  validateCreateGalleryPost(req, {}, () => {
    calledNext = true;
  });
  assert.equal(calledNext, true);
  assert.equal(req.body.is_public, true);
  assert.equal(req.body.title, 'Amazing Fade Haircut');
  assert.equal(req.body.customer_phone, '9876543210');
});

test('validateCreateGalleryPost rejects missing or invalid customer_phone', () => {
  const reqMissing = {
    body: {
      title: 'No phone',
      is_public: true,
    },
  };
  let statusSent = 0;
  let bodySent = null;
  validateCreateGalleryPost(reqMissing, {
    status: (s) => {
      statusSent = s;
      return { json: (b) => { bodySent = b; } };
    },
  }, () => {});
  assert.equal(statusSent, 400);
  assert.match(bodySent.details[0], /Customer phone number is required/);

  const reqInvalid = {
    body: {
      customer_phone: '12345',
    },
  };
  statusSent = 0;
  validateCreateGalleryPost(reqInvalid, {
    status: (s) => {
      statusSent = s;
      return { json: (b) => { bodySent = b; } };
    },
  }, () => {});
  assert.equal(statusSent, 400);
  assert.match(bodySent.details[0], /10-digit phone number/);
});

test('validateUpdateGalleryPost strips unknown and allows partial updates', () => {
  const req = {
    body: {
      title: 'New Title',
      is_featured: true,
      random_field: 'strip me',
    },
  };
  let calledNext = false;
  validateUpdateGalleryPost(req, {}, () => {
    calledNext = true;
  });
  assert.equal(calledNext, true);
  assert.equal(req.body.title, 'New Title');
  assert.equal(req.body.is_featured, true);
  assert.equal(req.body.random_field, undefined);
});

