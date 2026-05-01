require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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

    // ── Clear existing data ──────────────────────────────────────────────────
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

    // ── VIP Plans ────────────────────────────────────────────────────────────
    const vipPlans = await VIPPlan.insertMany([
      {
        name: 'silver',
        price: 99,
        duration: 30,
        benefits: {
          tasksPerDay: 25,
          earningMultiplier: 1.1,
          withdrawalPriority: false,
          feeDiscount: 0.01,
          cashbackRate: 0.01,
          support: 'standard',
        },
        isActive: true,
      },
      {
        name: 'gold',
        price: 249,
        duration: 30,
        benefits: {
          tasksPerDay: 50,
          earningMultiplier: 1.25,
          withdrawalPriority: true,
          feeDiscount: 0.02,
          cashbackRate: 0.02,
          support: 'priority',
        },
        isActive: true,
      },
      {
        name: 'platinum',
        price: 499,
        duration: 30,
        benefits: {
          tasksPerDay: 100,
          earningMultiplier: 1.5,
          withdrawalPriority: true,
          feeDiscount: 0.03,
          cashbackRate: 0.03,
          support: 'priority',
        },
        isActive: true,
      },
      {
        name: 'diamond',
        price: 999,
        duration: 30,
        benefits: {
          tasksPerDay: 999,
          earningMultiplier: 2.0,
          withdrawalPriority: true,
          feeDiscount: 0.05,
          cashbackRate: 0.05,
          support: 'dedicated',
        },
        isActive: true,
      },
    ]);
    console.log(`✅ Seeded ${vipPlans.length} VIP plans`);

    // ── Admin Users ──────────────────────────────────────────────────────────
    const adminUser = await User.create({
      name: 'ZedEarn Admin',
      email: 'admin@zedearn.zm',
      phone: '0971000001',
      password: 'Admin1234!',
      role: 'admin',
      kycStatus: 'verified',
      balance: 10000,
      lifetimeEarnings: 10000,
    });

    const superAdmin = await User.create({
      name: 'ZedEarn Super Admin',
      email: 'superadmin@zedearn.zm',
      phone: '0971000002',
      password: 'Super1234!',
      role: 'superadmin',
      kycStatus: 'verified',
      balance: 50000,
      lifetimeEarnings: 50000,
    });

    console.log(`✅ Seeded admin users: ${adminUser.email}, ${superAdmin.email}`);

    // ── Regular Users ────────────────────────────────────────────────────────
    const usersData = [
      {
        name: 'Chanda Mutale',
        phone: '0971234567',
        email: 'chanda@gmail.com',
        password: 'Password123!',
        role: 'user',
        balance: 150.5,
        rewardBalance: 50.5,
        lifetimeEarnings: 320.75,
        kycStatus: 'verified',
        xpPoints: 320,
        level: 3,
        streakCount: 5,
      },
      {
        name: 'Mwamba Banda',
        phone: '0761234567',
        email: 'mwamba@yahoo.com',
        password: 'Password123!',
        role: 'vip',
        vipTier: 'gold',
        vipExpiry: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
        balance: 890.0,
        rewardBalance: 340.0,
        lifetimeEarnings: 1250.5,
        kycStatus: 'verified',
        xpPoints: 1250,
        level: 8,
        streakCount: 15,
      },
      {
        name: 'Thandiwe Phiri',
        phone: '0977654321',
        email: 'thandiwe@zedearn.zm',
        password: 'Password123!',
        role: 'merchant',
        balance: 2500.0,
        commissionBalance: 450.0,
        lifetimeEarnings: 5600.0,
        kycStatus: 'verified',
        xpPoints: 5600,
        level: 15,
      },
      {
        name: 'Kelvin Zulu',
        phone: '0767654321',
        email: 'kelvin.zulu@gmail.com',
        password: 'Password123!',
        role: 'user',
        balance: 45.25,
        rewardBalance: 45.25,
        lifetimeEarnings: 98.5,
        kycStatus: 'submitted',
        xpPoints: 98,
        level: 1,
        streakCount: 2,
      },
      {
        name: 'Natasha Kasonde',
        phone: '0974567890',
        email: 'natasha.k@outlook.com',
        password: 'Password123!',
        role: 'vip',
        vipTier: 'silver',
        vipExpiry: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000),
        balance: 312.75,
        rewardBalance: 112.75,
        lifetimeEarnings: 780.0,
        kycStatus: 'verified',
        xpPoints: 780,
        level: 6,
        streakCount: 9,
      },
    ];

    const regularUsers = [];
    for (const data of usersData) {
      const user = await User.create(data);
      regularUsers.push(user);
    }

    // Set up referral chain: chanda referred by mwamba, kelvin referred by chanda
    await User.findByIdAndUpdate(regularUsers[0]._id, { referredBy: regularUsers[1]._id });
    await User.findByIdAndUpdate(regularUsers[3]._id, { referredBy: regularUsers[0]._id });

    await Referral.create({ userId: regularUsers[0]._id, referrerId: regularUsers[1]._id, level: 1 });
    await Referral.create({ userId: regularUsers[3]._id, referrerId: regularUsers[0]._id, level: 1 });
    await Referral.create({ userId: regularUsers[3]._id, referrerId: regularUsers[1]._id, level: 2 });

    console.log(`✅ Seeded ${regularUsers.length} regular users`);

    // ── Tasks ────────────────────────────────────────────────────────────────
    const tasks = await Task.insertMany([
      {
        title: 'Daily Check-In Reward',
        description: 'Check in daily to earn ZMW 0.50. Streak bonuses apply!',
        type: 'daily_checkin',
        reward: 0.5,
        vipRequired: 'none',
        dailyLimit: 1,
        cooldownMinutes: 1380,
        status: 'active',
        tags: ['daily', 'easy'],
      },
      {
        title: 'Watch Airtel Zambia Ad',
        description: 'Watch a 30-second Airtel advertisement and earn instantly.',
        type: 'adwatch',
        reward: 1.5,
        vipRequired: 'none',
        dailyLimit: 10,
        cooldownMinutes: 5,
        status: 'active',
        tags: ['ads', 'airtel'],
      },
      {
        title: 'MTN Zambia Data Bundle Survey',
        description: 'Complete a short survey about MTN data bundle usage in Zambia.',
        type: 'survey',
        reward: 5.0,
        vipRequired: 'none',
        dailyLimit: 3,
        cooldownMinutes: 60,
        status: 'active',
        tags: ['survey', 'mtn', 'data'],
      },
      {
        title: 'Review ZANACO Mobile Banking App',
        description: 'Download and review the ZANACO mobile banking app. Provide honest feedback.',
        type: 'product',
        reward: 12.0,
        vipRequired: 'silver',
        dailyLimit: 1,
        cooldownMinutes: 0,
        status: 'active',
        tags: ['banking', 'review', 'zanaco'],
      },
      {
        title: 'Zambia Tourism Board Survey',
        description: 'Share your travel experiences and opinions about Zambian tourism.',
        type: 'survey',
        reward: 8.0,
        vipRequired: 'none',
        dailyLimit: 1,
        cooldownMinutes: 120,
        status: 'active',
        tags: ['tourism', 'survey'],
      },
      {
        title: 'Watch Shoprite Zambia Promotional Video',
        description: 'Watch the latest Shoprite promotional video and answer 3 questions.',
        type: 'adwatch',
        reward: 2.5,
        vipRequired: 'none',
        dailyLimit: 5,
        cooldownMinutes: 10,
        status: 'active',
        tags: ['shopping', 'shoprite'],
      },
      {
        title: 'VIP Gold Task: Test Zambia Breweries App',
        description: 'Exclusive Gold VIP task. Test the new Zambia Breweries loyalty app and provide feedback.',
        type: 'product',
        reward: 35.0,
        vipRequired: 'gold',
        dailyLimit: 1,
        cooldownMinutes: 0,
        status: 'active',
        tags: ['vip', 'gold', 'product-test'],
      },
      {
        title: 'Weekly Referral Mission',
        description: 'Refer 3 new users this week and complete this mission for a bonus reward.',
        type: 'weekly_mission',
        reward: 50.0,
        vipRequired: 'none',
        dailyLimit: 1,
        cooldownMinutes: 0,
        status: 'active',
        tags: ['weekly', 'referral', 'mission'],
      },
      {
        title: 'Lusaka Traffic & Infrastructure Survey',
        description: 'Help improve Lusaka by completing this infrastructure survey from Road Development Agency.',
        type: 'survey',
        reward: 10.0,
        vipRequired: 'none',
        dailyLimit: 1,
        cooldownMinutes: 0,
        status: 'active',
        tags: ['civic', 'survey', 'lusaka'],
      },
      {
        title: 'Diamond Exclusive: Financial Literacy Assessment',
        description:
          'Diamond VIP exclusive. Complete the Bank of Zambia financial literacy assessment for maximum earnings.',
        type: 'sponsored',
        reward: 100.0,
        vipRequired: 'diamond',
        dailyLimit: 1,
        cooldownMinutes: 0,
        status: 'active',
        tags: ['diamond', 'vip', 'financial', 'exclusive'],
      },
    ]);
    console.log(`✅ Seeded ${tasks.length} tasks`);

    // ── Marketplace Items ────────────────────────────────────────────────────
    const marketplaceItems = await MarketplaceItem.insertMany([
      {
        sellerId: regularUsers[2]._id,
        title: 'Airtel 1GB Data Bundle Voucher',
        description: '1GB Airtel Zambia data bundle valid for 30 days. Instant delivery via SMS.',
        category: 'data',
        price: 25.0,
        originalPrice: 30.0,
        stock: 50,
        status: 'active',
        commissionRate: 0.05,
        purchases: 12,
        tags: ['airtel', 'data', 'bundle'],
      },
      {
        sellerId: regularUsers[2]._id,
        title: 'MTN 500MB Night Owl Bundle',
        description:
          'MTN 500MB data valid 11PM-5AM only. Perfect for late-night browsing. 7-day validity.',
        category: 'data',
        price: 10.0,
        originalPrice: 12.0,
        stock: 100,
        status: 'active',
        commissionRate: 0.05,
        purchases: 45,
        tags: ['mtn', 'data', 'night'],
      },
      {
        sellerId: regularUsers[2]._id,
        title: 'Shoprite Gift Voucher ZMW 50',
        description:
          'ZMW 50 Shoprite Zambia gift voucher redeemable at any Shoprite store nationwide. Valid 90 days.',
        category: 'voucher',
        price: 48.0,
        originalPrice: 50.0,
        stock: 20,
        status: 'active',
        commissionRate: 0.04,
        purchases: 8,
        tags: ['shoprite', 'voucher', 'grocery'],
      },
    ]);
    console.log(`✅ Seeded ${marketplaceItems.length} marketplace items`);

    // ── Sample Transactions ──────────────────────────────────────────────────
    const sampleTransactions = [];

    for (const user of regularUsers) {
      sampleTransactions.push({
        userId: user._id,
        type: 'deposit',
        amount: 200,
        fee: 0,
        method: 'airtel_money',
        status: 'completed',
        description: 'Initial deposit via Airtel Money',
        processedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      });

      sampleTransactions.push({
        userId: user._id,
        type: 'task_reward',
        amount: user.rewardBalance || 5,
        fee: 0,
        status: 'completed',
        description: 'Task rewards accumulated',
        processedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      });
    }

    // Add a withdrawal for Mwamba
    sampleTransactions.push({
      userId: regularUsers[1]._id,
      type: 'withdraw',
      amount: 100,
      fee: 2,
      method: 'mtn_money',
      status: 'completed',
      description: 'Withdrawal to MTN Money',
      processedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });

    // VIP purchase for Natasha
    sampleTransactions.push({
      userId: regularUsers[4]._id,
      type: 'vip_purchase',
      amount: 99,
      fee: 0,
      status: 'completed',
      description: 'VIP Silver plan purchase',
      processedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
    });

    // Referral bonus
    sampleTransactions.push({
      userId: regularUsers[1]._id,
      type: 'referral_bonus',
      amount: 15,
      fee: 0,
      status: 'completed',
      description: 'Referral bonus for inviting Chanda Mutale',
      processedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });

    await Transaction.insertMany(sampleTransactions);
    console.log(`✅ Seeded ${sampleTransactions.length} sample transactions`);

    // ── Welcome Notifications ─────────────────────────────────────────────────
    const welcomeNotifs = regularUsers.map((u) => ({
      userId: u._id,
      title: 'Welcome to ZedEarn! 🎉',
      message:
        'Congratulations on joining Zambia\'s #1 earning platform! Complete your first task to start earning ZMW today.',
      type: 'success',
      link: '/tasks',
    }));
    await Notification.insertMany(welcomeNotifs);
    console.log(`✅ Seeded welcome notifications`);

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════');
    console.log('           SEED COMPLETE! ✅');
    console.log('═══════════════════════════════════════════');
    console.log('\n📋 Seeded Data Summary:');
    console.log(`   VIP Plans       : ${vipPlans.length}`);
    console.log(`   Admin Users     : 2 (admin + superadmin)`);
    console.log(`   Regular Users   : ${regularUsers.length}`);
    console.log(`   Tasks           : ${tasks.length}`);
    console.log(`   Marketplace     : ${marketplaceItems.length} items`);
    console.log(`   Transactions    : ${sampleTransactions.length}`);
    console.log('\n🔐 Login Credentials:');
    console.log('   Admin     : admin@zedearn.zm / Admin1234!');
    console.log('   SuperAdmin: superadmin@zedearn.zm / Super1234!');
    console.log('   User 1    : chanda@gmail.com / Password123!');
    console.log('   User 2    : mwamba@yahoo.com / Password123! (VIP Gold)');
    console.log('   Merchant  : thandiwe@zedearn.zm / Password123!');
    console.log('\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err);
    await mongoose.connection.close();
    process.exit(1);
  }
}

seed();
