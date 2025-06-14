const winston = require('winston');
const path = require('path');
const fs = require('fs');

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...metadata }) => {
    let logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    
    if (stack) {
      logMessage += `\n${stack}`;
    }
    
    if (Object.keys(metadata).length > 0) {
      logMessage += `\nMetadata: ${JSON.stringify(metadata, null, 2)}`;
    }
    
    return logMessage;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  defaultMeta: { service: 'order-management-api' },
  transports: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
      tailable: true
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'app.log'),
      maxsize: 5242880,
      maxFiles: 10,
      tailable: true
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      customFormat
    )
  }));
}

const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    body: req.method === 'POST' || req.method === 'PUT' ? req.body : undefined
  });

  const originalSend = res.send;
  res.send = function(body) {
    const duration = Date.now() - start;
    
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: body ? body.length : 0
    });
    
    originalSend.call(this, body);
  };

  next();
};

const errorLogger = (err, req, res, next) => {
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    body: req.body,
    ip: req.ip || req.connection.remoteAddress
  });
  
  next(err);
};

const dbLogger = {
  logQuery: (operation, table, params = {}, duration = null) => {
    logger.debug('Database operation', {
      operation,
      table,
      params,
      duration: duration ? `${duration}ms` : undefined
    });
  },
  
  logError: (operation, table, error, params = {}) => {
    logger.error('Database error', {
      operation,
      table,
      error: error.message,
      params,
      stack: error.stack
    });
  }
};

const metricsLogger = {
  logEndpointUsage: (endpoint, method, responseTime, statusCode) => {
    logger.info('API metrics', {
      endpoint,
      method,
      responseTime: `${responseTime}ms`,
      statusCode,
      timestamp: new Date().toISOString()
    });
  },
  
  logSystemStats: (stats) => {
    logger.info('System statistics', stats);
  }
};

module.exports = {
  logger,
  requestLogger,
  errorLogger,
  dbLogger,
  metricsLogger
};
