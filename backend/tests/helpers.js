/**
 * helpers.js
 *
 * Shared test utilities for ZedEarn integration tests.
 * Uses mongodb-memory-server to spin up an isolated in-memory MongoDB instance.
 */

'use strict';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongod;

/**
 * Connect to the in-memory MongoDB instance.
 * Call this in beforeAll().
 */
async function connectTestDB() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
}

/**
 * Drop all collections and disconnect.
 * Call this in afterAll().
 */
async function disconnectTestDB() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongod) await mongod.stop();
}

/**
 * Clear all collections between tests.
 * Call this in afterEach() to ensure test isolation.
 */
async function clearTestDB() {
  const collections = mongoose.connection.collections;
  await Promise.all(
    Object.values(collections).map((c) => c.deleteMany({}))
  );
}

/**
 * Create a test user and return { user, token }.
 */
async function createTestUser(app, overrides = {}) {
  const supertest = require('supertest');
  const defaults = {
    name: 'Test User',
    email: `test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@zedearn.zm`,
    password: 'Password123!',
    ...overrides,
  };

  const res = await supertest(app).post('/api/auth/register').send(defaults);
  return { user: res.body.user, token: res.body.token };
}

/**
 * Create an admin user directly in the database (bypasses the register route
 * which only creates regular users).
 */
async function createAdminUser(app) {
  const User = require('../models/User');
  const admin = await User.create({
    name: 'Admin',
    email: `admin_${Date.now()}@zedearn.zm`,
    password: 'Admin123!',
    role: 'admin',
    balance: 100000,
  });

  const token = admin.getSignedJwtToken();
  return { user: admin, token };
}

module.exports = {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
  createTestUser,
  createAdminUser,
};
