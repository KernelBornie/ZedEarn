const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error('❌ MONGO_URI is undefined. Cannot connect to MongoDB.');
    console.error('   Check that .env is present and MONGO_URI is set.');
    process.exit(1);
  }

  try {
    console.log('🔌 Connecting to MongoDB...');
    const conn = await mongoose.connect(uri);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    console.error('   URI used:', uri.replace(/:\/\/[^@]+@/, '://***@'));
    process.exit(1);
  }
};

module.exports = connectDB;
