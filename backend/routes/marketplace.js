const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const MarketplaceItem = require('../models/MarketplaceItem');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const { protect, authorize } = require('../middleware/auth');
const { escapeRegex, safeEnum } = require('../utils/sanitize');

const ITEM_CATEGORIES = ['airtime', 'data', 'voucher', 'service', 'product'];

// GET /api/marketplace - list active items
router.get('/', protect, async (req, res) => {
  try {
    const { category, page = 1, limit = 20, search = '' } = req.query;
    const query = { status: 'active' };
    const safeCategory = safeEnum(category, ITEM_CATEGORIES);
    if (safeCategory) query.category = safeCategory;
    if (search) {
      const safeSearch = escapeRegex(String(search).substring(0, 100));
      query.$or = [
        { title: { $regex: safeSearch, $options: 'i' } },
        { description: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const total = await MarketplaceItem.countDocuments(query);
    const items = await MarketplaceItem.find(query)
      .populate('sellerId', 'name profilePhoto vipTier')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      items,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/marketplace/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const item = await MarketplaceItem.findById(req.params.id).populate(
      'sellerId',
      'name profilePhoto vipTier'
    );
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/marketplace - merchant create listing
router.post(
  '/',
  protect,
  authorize('merchant', 'admin', 'superadmin'),
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('category')
      .isIn(['airtime', 'data', 'voucher', 'service', 'product'])
      .withMessage('Invalid category'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const item = await MarketplaceItem.create({
        ...req.body,
        sellerId: req.user._id,
      });
      res.status(201).json({ success: true, item });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// PUT /api/marketplace/:id
router.put('/:id', protect, authorize('merchant', 'admin', 'superadmin'), async (req, res) => {
  try {
    const item = await MarketplaceItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    // Merchant can only update their own listings
    if (
      req.user.role === 'merchant' &&
      item.sellerId.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const updated = await MarketplaceItem.findByIdAndUpdate(req.params.id, { $set: {
      ...(req.body.title !== undefined && { title: req.body.title }),
      ...(req.body.description !== undefined && { description: req.body.description }),
      ...(req.body.category !== undefined && { category: req.body.category }),
      ...(req.body.price !== undefined && { price: req.body.price }),
      ...(req.body.originalPrice !== undefined && { originalPrice: req.body.originalPrice }),
      ...(req.body.stock !== undefined && { stock: req.body.stock }),
      ...(req.body.status !== undefined && { status: req.body.status }),
      ...(req.body.image !== undefined && { image: req.body.image }),
      ...(req.body.commissionRate !== undefined && { commissionRate: req.body.commissionRate }),
    } }, {
      new: true,
      runValidators: true,
    });
    res.json({ success: true, item: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/marketplace/:id
router.delete('/:id', protect, authorize('merchant', 'admin', 'superadmin'), async (req, res) => {
  try {
    const item = await MarketplaceItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    if (
      req.user.role === 'merchant' &&
      item.sellerId.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await MarketplaceItem.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/marketplace/:id/purchase
router.post('/:id/purchase', protect, async (req, res) => {
  try {
    const item = await MarketplaceItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    if (item.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Item is not available' });
    }
    if (item.stock <= 0) {
      return res.status(400).json({ success: false, message: 'Item is out of stock' });
    }

    const buyer = await User.findById(req.user._id);
    if (buyer.balance < item.price) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. Item costs ZMW ${item.price.toFixed(2)}`,
      });
    }

    // Prevent buying own item
    if (item.sellerId.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot purchase your own item' });
    }

    const commission = parseFloat((item.price * item.commissionRate).toFixed(2));
    const sellerReceives = parseFloat((item.price - commission).toFixed(2));

    // Deduct buyer balance
    await User.findByIdAndUpdate(req.user._id, { $inc: { balance: -item.price } });

    // Add to seller balance + commission
    await User.findByIdAndUpdate(item.sellerId, {
      $inc: {
        balance: sellerReceives,
        commissionBalance: commission,
        lifetimeEarnings: sellerReceives,
      },
    });

    // Update item stock
    const newStock = item.stock - 1;
    await MarketplaceItem.findByIdAndUpdate(item._id, {
      $inc: { purchases: 1 },
      $set: { stock: newStock, status: newStock === 0 ? 'sold' : 'active' },
    });

    // Create transactions
    const [buyerTx, sellerTx] = await Promise.all([
      Transaction.create({
        userId: req.user._id,
        type: 'marketplace_sale',
        amount: item.price,
        fee: 0,
        status: 'completed',
        description: `Purchase: ${item.title}`,
        meta: { itemId: item._id, sellerId: item.sellerId },
        processedAt: new Date(),
      }),
      Transaction.create({
        userId: item.sellerId,
        type: 'marketplace_sale',
        amount: sellerReceives,
        fee: commission,
        status: 'completed',
        description: `Sale: ${item.title}`,
        meta: { itemId: item._id, buyerId: req.user._id },
        processedAt: new Date(),
      }),
    ]);

    // Notifications
    await Promise.all([
      Notification.create({
        userId: req.user._id,
        title: 'Purchase Successful',
        message: `You purchased "${item.title}" for ZMW ${item.price.toFixed(2)}`,
        type: 'success',
        link: '/marketplace',
      }),
      Notification.create({
        userId: item.sellerId,
        title: 'Item Sold!',
        message: `Your item "${item.title}" was sold. ZMW ${sellerReceives.toFixed(2)} added to your balance.`,
        type: 'reward',
        link: '/wallet',
      }),
    ]);

    const io = req.app.get('io');
    if (io) {
      const updatedBuyer = await User.findById(req.user._id);
      io.to(`user:${req.user._id}`).emit('balanceUpdate', { balance: updatedBuyer.balance });
      const updatedSeller = await User.findById(item.sellerId);
      io.to(`user:${item.sellerId}`).emit('balanceUpdate', { balance: updatedSeller.balance });
    }

    res.json({
      success: true,
      message: `Successfully purchased "${item.title}"`,
      reference: buyerTx.reference,
      amountPaid: item.price,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
