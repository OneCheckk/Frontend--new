const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const requestIdMiddleware = require('./middleware/requestId');
const errorHandler = require('./middleware/errorHandler');
const notFoundHandler = require('./middleware/notFound');
const apiRoutes = require('./routes');

const app = express();

// Security headers
app.use(helmet());

// CORS configuration
app.use(cors({
    origin: 'http://localhost:5174',
    credentials: true
}));

// Standard JSON and URL-encoded body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request ID tracking
app.use(requestIdMiddleware);

// Mount canonical /api routes
app.use('/api', apiRoutes);

// 404 and Error handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
