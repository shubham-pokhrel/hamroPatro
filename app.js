require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const { logger, requestLogger, errorLogger } = require('./utils/logger');
const db = require('./db');

const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));

app.use(compression());

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    message: 'Too many requests',
    error: 'Rate limit exceeded. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(requestLogger);

app.get('/', async (req, res) => {
  try {
    const dbHealth = await db.healthCheck();
    const dbStats = await db.getStats();
    
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.2.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100,
        external: Math.round(process.memoryUsage().external / 1024 / 1024 * 100) / 100,
      },
      database: dbHealth,
      statistics: dbStats
    };
    
    logger.info('Health check performed', { 
      status: healthStatus.status,
      dbStatus: dbHealth.status
    });
    
    res.json({
      success: true,
      message: 'Order Management API is running successfully',
      data: healthStatus
    });
    
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    
    res.status(503).json({
      success: false,
      message: 'Service temporarily unavailable',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api-info', (req, res) => {
  const apiInfo = {
    name: 'Order Management API',
    version: '1.0.0',
    description: 'Basic order management REST API',
    endpoints: {
      users: {
        'POST /users': 'Create a new user',
        'GET /users': 'Get all users',
        'GET /users/:id': 'Get user by ID'
      },
      products: {
        'POST /products': 'Create a new product',
        'GET /products': 'Get all products',
        'GET /products/:id': 'Get product by ID'
      },
      orders: {
        'POST /orders': 'Create a new order',
        'GET /orders': 'Get all orders',
        'GET /orders/:id': 'Get order details by ID'
      }
    }
  };
  
  res.json({
    success: true,
    message: 'API Information',
    data: apiInfo,
    timestamp: new Date().toISOString()
  });
});

app.use('/users', userRoutes);
app.use('/products', productRoutes);
app.use('/orders', orderRoutes);

app.use('*', (req, res) => {
  logger.warn('Route not found', { 
    method: req.method, 
    url: req.originalUrl,
    ip: req.ip 
  });
  
  res.status(404).json({
    success: false,
    message: 'Route not found',
    error: `Cannot ${req.method} ${req.originalUrl}`,
    suggestion: 'Check the API documentation at GET /',
    timestamp: new Date().toISOString()
  });
});

app.use(errorLogger);

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { 
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    ip: req.ip
  });

  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(err.status || 500).json({
    success: false,
    message: 'Internal server error',
    error: isDevelopment ? err.message : 'Something went wrong',
    ...(isDevelopment && { stack: err.stack }),
    timestamp: new Date().toISOString()
  });
});

const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  try {
    await db.close();
    
    server.close(() => {
      logger.info('Server closed successfully');
      process.exit(0);
    });
    
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    logger.error('Error during graceful shutdown', { error: error.message });
    process.exit(1);
  }
};

const initializeServer = async () => {
  try {
    logger.info('Starting Order Management API...');
    
    await db.connect();
    await db.initDatabase();
    
    // Start server
    const server = app.listen(PORT, () => {
      logger.info(`✅ Server is running successfully`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        timestamp: new Date().toISOString()
      });
      
      console.log(`
╔═════════════════════════════════════════════════════════════╗
║                   🛒 ORDER MANAGEMENT API                   ║
║                                                             ║
║     Server running at: http://localhost:${PORT.toString().padEnd(4)}                ║
║     API docs: http://localhost:${PORT}/api-info                ║
║     Health check: http://localhost:${PORT}                     ║
║                                                             ║
║     Basic endpoints: Users, Products, Orders                ║
║     Security: Helmet, CORS, Rate limiting enabled           ║
╚═════════════════════════════════════════════════════════════╝
      `);
    });

    global.server = server;
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    logger.error('Failed to initialize server', { 
      error: error.message,
      stack: error.stack 
    });
    process.exit(1);
  }
};

// Start the application
initializeServer();

module.exports = app;
