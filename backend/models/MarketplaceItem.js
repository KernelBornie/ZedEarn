const mongoose = require('mongoose');

const MarketplaceItemSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Seller ID is required'],
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: ['airtime', 'data', 'voucher', 'service', 'product'],
      required: [true, 'Category is required'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: 0,
    },
    originalPrice: {
      type: Number,
      default: null,
    },
    image: {
      type: String,
      default: null,
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
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
      min: 0,
      max: 1,
    },
  },
  { timestamps: true }
);

MarketplaceItemSchema.index({ sellerId: 1 });
MarketplaceItemSchema.index({ status: 1, category: 1 });

module.exports = mongoose.model('MarketplaceItem', MarketplaceItemSchema);
