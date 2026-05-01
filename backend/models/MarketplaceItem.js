const mongoose = require('mongoose');

const MarketplaceItemSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: '',
    },

    category: {
      type: String,
      enum: ['airtime', 'data', 'voucher', 'service', 'product'],
      required: true,
      default: 'product',
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    originalPrice: {
      type: Number,
      default: null,
    },

    stock: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ['active', 'inactive', 'sold'],
      default: 'active',
    },

    purchases: {
      type: Number,
      default: 0,
    },

    commissionRate: {
      type: Number,
      default: 0.05,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MarketplaceItem', MarketplaceItemSchema);