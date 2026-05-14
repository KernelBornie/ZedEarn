require('dotenv').config();
const mongoose = require('mongoose');

const User = require('./models/User');
const VIPPlan = require('./models/VIPPlan');
const Task = require('./models/Task');
// Intentionally only import models needed for idempotent seeding

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/zedearn';

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for seeding...');

    // VIP PLANS (idempotent upserts)
    const vipPlanData = [
      { name: 'silver', price: 99, duration: 30, benefits: { tasksPerDay: 25 }, isActive: true },
      { name: 'gold', price: 249, duration: 30, benefits: { tasksPerDay: 50 }, isActive: true },
      { name: 'platinum', price: 499, duration: 30, benefits: { tasksPerDay: 100 }, isActive: true },
      { name: 'diamond', price: 999, duration: 30, benefits: { tasksPerDay: 999 }, isActive: true },
    ];

    const vipPlans = await Promise.all(
      vipPlanData.map((plan) =>
        VIPPlan.findOneAndUpdate({ name: plan.name }, { $set: plan }, { upsert: true, new: true })
      )
    );

    console.log(`VIP Plans seeded: ${vipPlans.length}`);

    // USERS — keep password hashing hooks intact
    const adminSeed = {
      name: 'Admin',
      email: 'admin@zedearn.zm',
      password: 'Admin1234!',
      role: 'admin',
      balance: 10000,
    };
    const superAdminSeed = {
      name: 'Super Admin',
      email: 'superadmin@zedearn.zm',
      password: 'Super1234!',
      role: 'superadmin',
      balance: 50000,
    };

    const adminUser = await User.findOne({ email: adminSeed.email });
    if (!adminUser) {
      await User.create(adminSeed);
    } else {
      adminUser.name = adminSeed.name;
      adminUser.role = adminSeed.role;
      adminUser.balance = adminSeed.balance;
      adminUser.password = adminSeed.password;
      await adminUser.save();
    }

    const superAdminUser = await User.findOne({ email: superAdminSeed.email });
    if (!superAdminUser) {
      await User.create(superAdminSeed);
    } else {
      superAdminUser.name = superAdminSeed.name;
      superAdminUser.role = superAdminSeed.role;
      superAdminUser.balance = superAdminSeed.balance;
      superAdminUser.password = superAdminSeed.password;
      await superAdminUser.save();
    }

    console.log('Users seeded: 2');

    const taskSeeds = [
      {
        title: 'Daily Check-In',
        description: 'Check in once every day to earn a reward.',
        type: 'daily_checkin',
        reward: 1,
        maxCompletionsPerUser: 1,
        isActive: true,
        vipOnly: false,
        cooldownHours: 24,
      },
      {
        title: 'Watch Ad',
        description: 'Watch a sponsored ad to earn a quick reward.',
        type: 'ad_watch',
        reward: 2,
        maxCompletionsPerUser: 10,
        isActive: true,
        vipOnly: false,
        cooldownHours: 1,
      },
      {
        title: 'Survey',
        description: 'Complete a short survey and get paid instantly.',
        type: 'survey',
        reward: 5,
        maxCompletionsPerUser: 1,
        isActive: true,
        vipOnly: false,
        cooldownHours: 24,
      },
      {
        title: 'Weekly Mission',
        description: 'Finish the weekly mission for a bigger payout.',
        type: 'mission',
        reward: 20,
        maxCompletionsPerUser: 1,
        isActive: true,
        vipOnly: false,
        cooldownHours: 168,
      },
      {
        title: 'Referral Bonus',
        description: 'Earn a bonus for completing a referral.',
        type: 'referral',
        reward: 10,
        maxCompletionsPerUser: 1,
        isActive: true,
        vipOnly: false,
        cooldownHours: 0,
      },
    ];

    const tasks = await Promise.all(
      taskSeeds.map((task) =>
        Task.findOneAndUpdate({ type: task.type }, { $set: task }, { upsert: true, new: true })
      )
    );

    console.log(`Tasks seeded: ${tasks.length}`);

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
