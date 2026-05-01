require('dotenv').config();
const mongoose = require('mongoose');

const User = require('./models/User');
const VIPPlan = require('./models/VIPPlan');
const Task = require('./models/Task');
const Transaction = require('./models/Transaction');
const MarketplaceItem = require('./models/MarketplaceItem');
const Referral = require('./models/Referral');
const Notification = require('./models/Notification');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/zedearn';

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for seeding...');

    // SAFE RESET (avoid index corruption)
    await Promise.all([
      User.deleteMany({}),
      VIPPlan.deleteMany({}),
      Task.deleteMany({}),
      Transaction.deleteMany({}),
      MarketplaceItem.deleteMany({}),
      Referral.deleteMany({}),
      Notification.deleteMany({}),
    ]);

    console.log('Cleared existing data.');

    // VIP PLANS
    const vipPlans = await VIPPlan.insertMany([
      { name: 'silver', price: 99, duration: 30, benefits: { tasksPerDay: 25 }, isActive: true },
      { name: 'gold', price: 249, duration: 30, benefits: { tasksPerDay: 50 }, isActive: true },
      { name: 'platinum', price: 499, duration: 30, benefits: { tasksPerDay: 100 }, isActive: true },
      { name: 'diamond', price: 999, duration: 30, benefits: { tasksPerDay: 999 }, isActive: true },
    ]);

    console.log(`VIP Plans seeded: ${vipPlans.length}`);

    // USERS (IMPORTANT FIX: referralCode auto generated, no null issue)
    const users = await User.insertMany([
      {
        name: 'Admin',
        email: 'admin@zedearn.zm',
        password: 'Admin1234!',
        role: 'admin',
        balance: 10000,
      },
      {
        name: 'Super Admin',
        email: 'superadmin@zedearn.zm',
        password: 'Super1234!',
        role: 'superadmin',
        balance: 50000,
      },
    ]);

    console.log(`Users seeded: ${users.length}`);

    console.log('\n✅ SEED COMPLETE (STABLE VERSION)\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seed();