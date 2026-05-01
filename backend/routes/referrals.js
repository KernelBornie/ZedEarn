const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Referral = require('../models/Referral');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');

// GET /api/referrals - user's referrals by level
router.get('/', protect, async (req, res) => {
  try {
    const { level } = req.query;
    const query = { referrerId: req.user._id };
    if (level) query.level = Number(level);

    const referrals = await Referral.find(query)
      .populate('userId', 'name phone email profilePhoto vipTier createdAt')
      .sort({ createdAt: -1 });

    const grouped = { l1: [], l2: [], l3: [] };
    referrals.forEach((r) => {
      if (r.level === 1) grouped.l1.push(r);
      else if (r.level === 2) grouped.l2.push(r);
      else if (r.level === 3) grouped.l3.push(r);
    });

    res.json({
      success: true,
      total: referrals.length,
      referrals: level ? referrals : grouped,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/referrals/earnings - referral earnings history
router.get('/earnings', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const total = await Transaction.countDocuments({
      userId: req.user._id,
      type: 'referral_bonus',
    });

    const earnings = await Transaction.find({
      userId: req.user._id,
      type: 'referral_bonus',
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const totalEarned = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          type: 'referral_bonus',
          status: 'completed',
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    res.json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      totalEarned: totalEarned[0]?.total || 0,
      earnings,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/referrals/leaderboard - top referrers
router.get('/leaderboard', protect, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const leaderboard = await Referral.aggregate([
      { $match: { level: 1 } },
      {
        $group: {
          _id: '$referrerId',
          totalReferrals: { $sum: 1 },
          totalEarnings: { $sum: '$earnings' },
        },
      },
      { $sort: { totalReferrals: -1 } },
      { $limit: Number(limit) },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          name: '$user.name',
          profilePhoto: '$user.profilePhoto',
          vipTier: '$user.vipTier',
          totalReferrals: 1,
          totalEarnings: 1,
        },
      },
    ]);

    res.json({ success: true, leaderboard });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/referrals/link - referral link + stats
router.get('/link', protect, async (req, res) => {
  try {
    const [l1Count, l2Count, l3Count] = await Promise.all([
      Referral.countDocuments({ referrerId: req.user._id, level: 1 }),
      Referral.countDocuments({ referrerId: req.user._id, level: 2 }),
      Referral.countDocuments({ referrerId: req.user._id, level: 3 }),
    ]);

    const earningsAgg = await Referral.aggregate([
      { $match: { referrerId: req.user._id } },
      { $group: { _id: '$level', total: { $sum: '$earnings' } } },
    ]);

    const earningsByLevel = { l1: 0, l2: 0, l3: 0 };
    earningsAgg.forEach((e) => {
      earningsByLevel[`l${e._id}`] = e.total;
    });

    res.json({
      success: true,
      referralCode: req.user.referralCode,
      referralLink: req.user.fullReferralLink,
      stats: {
        l1Count,
        l2Count,
        l3Count,
        total: l1Count + l2Count + l3Count,
        earningsByLevel,
        totalEarnings: earningsByLevel.l1 + earningsByLevel.l2 + earningsByLevel.l3,
      },
      shareText: `Join ZedEarn and start earning in Zambia! Use my referral link: ${req.user.fullReferralLink}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
