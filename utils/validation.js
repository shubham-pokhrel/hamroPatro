const Joi = require('joi');
const { logger } = require('./logger');

// Custom validation rules
const customValidation = {
  // Email validation with specific format
  email: Joi.string()
    .email({ minDomainSegments: 2, tlds: { allow: ['com', 'net', 'org', 'edu', 'co', 'io', 'dev'] } })
    .min(5)
    .max(100)
    .lowercase()
    .trim(),
  
  // Phone number validation
  phone: Joi.string()
    .pattern(/^(\+\d{1,3}[- ]?)?\d{10}$/)
    .allow('', null)
    .messages({
      'string.pattern.base': 'Phone number must be in valid international format'
    }),
  
  // Name validation
  name: Joi.string()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-Z\s'-]+$/)
    .trim()
    .messages({
      'string.pattern.base': 'Name can only contain letters, spaces, hyphens, and apostrophes'
    }),
  
  // Price validation
  price: Joi.number()
    .positive()
    .precision(2)
    .min(0.01)
    .max(999999.99)
    .messages({
      'number.positive': 'Price must be a positive number',
      'number.min': 'Price must be at least $0.01',
      'number.max': 'Price cannot exceed $999,999.99'
    }),
  
  // Quantity validation
  quantity: Joi.number()
    .integer()
    .positive()
    .min(1)
    .max(parseInt(process.env.MAX_ORDER_QUANTITY) || 100)
    .messages({
      'number.integer': 'Quantity must be a whole number',
      'number.positive': 'Quantity must be positive',
      'number.min': 'Quantity must be at least 1'
    }),
  
  // SKU validation
  sku: Joi.string()
    .alphanum()
    .min(3)
    .max(20)
    .uppercase()
    .allow('', null),
  
  // Status validations
  userStatus: Joi.string()
    .valid('active', 'inactive', 'suspended')
    .default('active'),
  
  productStatus: Joi.string()
    .valid('available', 'out_of_stock', 'discontinued')
    .default('available'),
  
  orderStatus: Joi.string()
    .valid('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')
    .default('pending')
};

// Schema definitions
const schemas = {
  // User schemas
  createUser: Joi.object({
    name: customValidation.name.required(),
    email: customValidation.email.required(),
    phone: customValidation.phone,
    address: Joi.string().max(200).trim().allow('', null)
  }),
  
  updateUser: Joi.object({
    name: customValidation.name,
    phone: customValidation.phone,
    address: Joi.string().max(200).trim().allow('', null),
    status: customValidation.userStatus
  }).min(1),
  
  // Product schemas
  createProduct: Joi.object({
    name: Joi.string().min(2).max(100).trim().required(),
    description: Joi.string().max(500).trim().allow('', null),
    price: customValidation.price.required(),
    category: Joi.string().min(2).max(50).trim().default('general'),
    stockQuantity: Joi.number().integer().min(0).default(0),
    sku: customValidation.sku
  }),
  
  updateProduct: Joi.object({
    name: Joi.string().min(2).max(100).trim(),
    description: Joi.string().max(500).trim().allow('', null),
    price: customValidation.price,
    category: Joi.string().min(2).max(50).trim(),
    stockQuantity: Joi.number().integer().min(0),
    sku: customValidation.sku,
    status: customValidation.productStatus
  }).min(1),
  
  // Order schemas
  createOrder: Joi.object({
    user_id: Joi.number().integer().positive().required(),
    product_id: Joi.number().integer().positive().required(),
    quantity: customValidation.quantity.required(),
    notes: Joi.string().max(200).trim().allow('', null)
  }),
  
  updateOrderStatus: Joi.object({
    status: customValidation.orderStatus.required(),
    notes: Joi.string().max(200).trim().allow('', null)
  }),
  
  // Query parameter schemas
  paginationQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string().valid('id', 'name', 'email', 'created_at', 'price', 'category', 'status').default('id'),
    order: Joi.string().valid('ASC', 'DESC').default('ASC')
  }),
  
  filterQuery: Joi.object({
    category: Joi.string().max(50),
    status: Joi.string().max(20),
    min_price: Joi.number().positive(),
    max_price: Joi.number().positive(),
    search: Joi.string().max(100)
  }),
  
  // ID parameter schema
  idParam: Joi.object({
    id: Joi.number().integer().positive().required()
  })
};

// Validation middleware factory
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const dataToValidate = req[property];
    
    // Log validation attempt
    logger.debug('Validating request data', {
      property,
      data: dataToValidate,
      endpoint: req.route?.path,
      method: req.method
    });
    
    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false, // Return all validation errors
      stripUnknown: true, // Remove unknown properties
      convert: true
    });
    
    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));
      
      logger.warn('Validation failed', {
        errors: validationErrors,
        endpoint: req.route?.path,
        method: req.method,
        data: dataToValidate
      });
      
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationErrors,
        timestamp: new Date().toISOString()
      });
    }
    
    // Replace the original data with validated and sanitized data
    req[property] = value;
    
    logger.debug('Validation successful', {
      property,
      sanitizedData: value,
      endpoint: req.route?.path
    });
    
    next();
  };
};

// Business logic validators
const businessValidators = {
  // Check if email is unique (for user creation/updates)
  async isEmailUnique(email, excludeUserId = null) {
    try {
      const db = require('../db');
      let query = 'SELECT id FROM users WHERE email = ?';
      let params = [email];
      
      if (excludeUserId) {
        query += ' AND id != ?';
        params.push(excludeUserId);
      }
      
      const existingUser = await db.get(query, params);
      return !existingUser;
    } catch (error) {
      logger.error('Error checking email uniqueness', { email, error: error.message });
      throw new Error('Unable to validate email uniqueness');
    }
  },
  
  // Check if SKU is unique (for products)
  async isSkuUnique(sku, excludeProductId = null) {
    if (!sku) return true;
    
    try {
      const db = require('../db');
      let query = 'SELECT id FROM products WHERE sku = ?';
      let params = [sku];
      
      if (excludeProductId) {
        query += ' AND id != ?';
        params.push(excludeProductId);
      }
      
      const existingProduct = await db.get(query, params);
      return !existingProduct;
    } catch (error) {
      logger.error('Error checking SKU uniqueness', { sku, error: error.message });
      throw new Error('Unable to validate SKU uniqueness');
    }
  },
  
  // Check if user exists
  async userExists(userId) {
    try {
      const db = require('../db');
      const user = await db.get('SELECT id, status FROM users WHERE id = ?', [userId]);
      return user && user.status === 'active';
    } catch (error) {
      logger.error('Error checking user existence', { userId, error: error.message });
      throw new Error('Unable to validate user');
    }
  },
  
  // Check if product exists and has sufficient stock
  async productAvailable(productId, requestedQuantity) {
    try {
      const db = require('../db');
      const product = await db.get(
        'SELECT id, name, price, stockQuantity, status FROM products WHERE id = ?', 
        [productId]
      );
      
      if (!product) {
        return { available: false, reason: 'Product not found' };
      }
      
      if (product.status !== 'available') {
        return { available: false, reason: `Product is ${product.status}` };
      }
      
      if (product.stockQuantity < requestedQuantity) {
        return { 
          available: false, 
          reason: `Insufficient stock. Available: ${product.stockQuantity}, Requested: ${requestedQuantity}` 
        };
      }
      
      return { available: true, product };
    } catch (error) {
      logger.error('Error checking product availability', { productId, requestedQuantity, error: error.message });
      throw new Error('Unable to validate product availability');
    }
  }
};

// Sanitization helpers
const sanitize = {
  // Remove potentially harmful characters
  cleanString: (str) => {
    if (typeof str !== 'string') return str;
    return str.trim().replace(/[<>\"']/g, '');
  },
  
  // Normalize email
  normalizeEmail: (email) => {
    if (typeof email !== 'string') return email;
    return email.toLowerCase().trim();
  },
  
  // Format phone number
  formatPhone: (phone) => {
    if (!phone) return phone;
    return phone.replace(/\D/g, ''); // Remove all non-digits
  }
};

module.exports = {
  schemas,
  validate,
  businessValidators,
  sanitize,
  customValidation
};
