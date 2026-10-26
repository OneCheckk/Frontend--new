const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

let isConnected = false;

async function connectDB(uri = env.MONGODB_URI) {
  try {
    if (isConnected) {
      return mongoose.connection;
    }

    mongoose.connection.on('connected', () => {
      isConnected = true;
      logger.info('MongoDB connection established');
    });

    mongoose.connection.on('error', (err) => {
      isConnected = false;
      logger.error('MongoDB connection error', { error: err.message, suppressInTest: true });
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('MongoDB connection lost');
    });

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true
    });

    // Test a basic query command to verify read authentication
    await mongoose.connection.db.collection('_health_check').findOne({});

    isConnected = true;
    return mongoose.connection;
  } catch (error) {
    if (env.NODE_ENV !== 'production') {
      try {
        await mongoose.disconnect();
        logger.warn(`Local MongoDB connection failed (${error.message}). Starting embedded MongoMemoryServer for zero-setup execution...`);
        const { MongoMemoryServer } = require('mongodb-memory-server');
        if (!global.__onecheckMongoMemoryServer) {
          global.__onecheckMongoMemoryServer = await MongoMemoryServer.create();
        }
        const memoryUri = global.__onecheckMongoMemoryServer.getUri();
        await mongoose.connect(memoryUri);
        isConnected = true;
        logger.info(`Connected to embedded MongoMemoryServer at ${memoryUri}`);
        return mongoose.connection;
      } catch (memErr) {
        logger.error('Failed to start MongoMemoryServer fallback', { error: memErr.message });
      }
    }
    isConnected = false;
    logger.error('Failed to connect to MongoDB', { error: error.message, suppressInTest: true });
    throw error;
  }
}

async function disconnectDB() {
  if (isConnected || mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    if (global.__onecheckMongoMemoryServer) {
      await global.__onecheckMongoMemoryServer.stop();
      global.__onecheckMongoMemoryServer = null;
    }
    logger.info('MongoDB disconnected');
  }
}

function isReady() {
  return mongoose.connection.readyState === 1;
}

module.exports = {
  connectDB,
  disconnectDB,
  isReady
};
