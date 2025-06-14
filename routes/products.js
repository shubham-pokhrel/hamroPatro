const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { validate, schemas } = require('../utils/validation');
const ProductModel = require('../models/productModel');

// Middleware for request logging
router.use((req, res, next) => {
  logger.info('Product route accessed', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// POST /products - Create a new product
router.post('/', validate(schemas.createProduct), async (req, res) => {
  try {
    const productData = req.body;
    
    logger.info('Creating new product', { name: productData.name, price: productData.price });
    
    const product = await ProductModel.create(productData);
    
    logger.info('Product created successfully', { 
      productId: product.id, 
      name: product.name,
      price: product.price
    });
    
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error creating product', { 
      error: error.message, 
      productData: req.body 
    });
    
    // Handle error cases
    if (error.message.includes('SKU') && error.message.includes('already in use')) {
      return res.status(409).json({
        success: false,
        message: 'SKU conflict',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
    
    if (error.message.includes('validation') || error.message.includes('required')) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: 'Failed to create product',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /products - Get all products
router.get('/', async (req, res) => {
  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10,
      sort: req.query.sort || 'id',
      order: req.query.order || 'ASC',
      category: req.query.category,
      status: req.query.status,
      min_price: req.query.min_price ? parseFloat(req.query.min_price) : null,
      max_price: req.query.max_price ? parseFloat(req.query.max_price) : null,
      search: req.query.search,
      in_stock_only: req.query.in_stock_only === 'true'
    };
    
    logger.info('Retrieving products', { options });
    
    const result = await ProductModel.findAll(options);
    
    logger.info('Products retrieved successfully', { 
      count: result.products.length,
      total: result.pagination.total
    });
    
    res.json({
      success: true,
      message: 'Products retrieved successfully',
      data: result.products,
      pagination: result.pagination,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error retrieving products', { 
      error: error.message, 
      query: req.query 
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: 'Failed to retrieve products',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /products/:id - Get product by ID
router.get('/:id', validate(schemas.idParam, 'params'), async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    
    logger.info('Retrieving product by ID', { productId });
    
    const product = await ProductModel.findById(productId);
    
    if (!product) {
      logger.warn('Product not found', { productId });
      return res.status(404).json({
        success: false,
        message: 'Product not found',
        error: `Product with ID ${productId} does not exist`,
        timestamp: new Date().toISOString()
      });
    }
    
    logger.info('Product retrieved successfully', { productId: product.id });
    
    res.json({
      success: true,
      message: 'Product retrieved successfully',
      data: product,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error retrieving product', { 
      error: error.message, 
      productId: req.params.id 
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: 'Failed to retrieve product',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;

// POST /products - Create a new product
router.post('/', async (req, res) => {
    try {
        const { name, price } = req.body;

        // Create product
        const product = await ProductModel.create(name, price);
        
        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: product
        });

    } catch (error) {
        console.error('Error creating product:', error.message);
        
        // Handle specific error cases
        if (error.message === 'Name and price are required') {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                error: error.message
            });
        }
        
        if (error.message === 'Price must be a positive number') {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                error: error.message
            });
        }

        // Generic server error
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: 'Failed to create product'
        });
    }
});

// GET /products - Get all products
router.get('/', async (req, res) => {
    try {
        const products = await ProductModel.findAll();
        
        res.status(200).json({
            success: true,
            message: 'Products retrieved successfully',
            data: products,
            count: products.length
        });

    } catch (error) {
        console.error('Error fetching products:', error.message);
        
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: 'Failed to fetch products'
        });
    }
});

// GET /products/:id - Get product by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate ID is a number
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                error: 'Product ID must be a number'
            });
        }

        const product = await ProductModel.findById(id);
        
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Not found',
                error: 'Product not found'
            });
        }
        
        res.status(200).json({
            success: true,
            message: 'Product retrieved successfully',
            data: product
        });

    } catch (error) {
        console.error('Error fetching product:', error.message);
        
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: 'Failed to fetch product'
        });
    }
});

module.exports = router;
