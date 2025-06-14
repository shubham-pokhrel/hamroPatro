const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { validate, schemas } = require('../utils/validation');
const OrderModel = require('../models/orderModel');

// Middleware for request logging
router.use((req, res, next) => {
  logger.info('Order route accessed', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// POST /orders - Create a new order
router.post('/', validate(schemas.createOrder), async (req, res) => {
  try {
    const orderData = req.body;
    
    logger.info('Creating new order', { 
      userId: orderData.user_id, 
      productId: orderData.product_id, 
      quantity: orderData.quantity 
    });
    
    const order = await OrderModel.create(orderData);
    
    logger.info('Order created successfully', { 
      orderId: order.id, 
      totalPrice: order.totalPrice 
    });
    
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: order,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error creating order', { 
      error: error.message, 
      orderData: req.body 
    });
    
    // Handle specific error cases
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
    
    if (error.message.includes('inactive') || error.message.includes('stock') || error.message.includes('out_of_stock')) {
      return res.status(400).json({
        success: false,
        message: 'Order validation failed',
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
      error: 'Failed to create order',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /orders - Get all orders with advanced filtering
router.get('/', async (req, res) => {
  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10,
      sort: req.query.sort || 'created_at',
      order: req.query.order || 'DESC',
      status: req.query.status,
      user_id: req.query.user_id ? parseInt(req.query.user_id) : null,
      product_id: req.query.product_id ? parseInt(req.query.product_id) : null,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      min_amount: req.query.min_amount ? parseFloat(req.query.min_amount) : null,
      max_amount: req.query.max_amount ? parseFloat(req.query.max_amount) : null,
      include_details: req.query.include_details === 'true'
    };
    
    logger.info('Retrieving orders', { options });
    
    const result = await OrderModel.findAll(options);
    
    logger.info('Orders retrieved successfully', { 
      count: result.orders.length,
      total: result.pagination.total
    });
    
    res.json({
      success: true,
      message: 'Orders retrieved successfully',
      data: result.orders,
      pagination: result.pagination,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error retrieving orders', { 
      error: error.message, 
      query: req.query 
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: 'Failed to retrieve orders',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /orders/:id - Get order by ID with full details
router.get('/:id', validate(schemas.idParam, 'params'), async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    
    logger.info('Retrieving order by ID', { orderId });
    
    const order = await OrderModel.findByIdWithDetails(orderId);
    
    if (!order) {
      logger.warn('Order not found', { orderId });
      return res.status(404).json({
        success: false,
        message: 'Order not found',
        error: `Order with ID ${orderId} does not exist`,
        timestamp: new Date().toISOString()
      });
    }
    
    logger.info('Order retrieved successfully', { orderId: order.id });
    
    res.json({
      success: true,
      message: 'Order retrieved successfully',
      data: order,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error retrieving order', { 
      error: error.message, 
      orderId: req.params.id 
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: 'Failed to retrieve order',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;

// POST /orders - Create a new order
router.post('/', async (req, res) => {
    try {
        const { user_id, product_id, quantity } = req.body;

        // Create order (total_price is calculated automatically)
        const order = await OrderModel.create(user_id, product_id, quantity);
        
        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            data: order
        });

    } catch (error) {
        console.error('Error creating order:', error.message);
        
        // Handle specific error cases
        if (error.message === 'User ID, Product ID, and quantity are required') {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                error: error.message
            });
        }
        
        if (error.message === 'Quantity must be a positive integer') {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                error: error.message
            });
        }
        
        if (error.message === 'User not found') {
            return res.status(404).json({
                success: false,
                message: 'Not found',
                error: error.message
            });
        }
        
        if (error.message === 'Product not found') {
            return res.status(404).json({
                success: false,
                message: 'Not found',
                error: error.message
            });
        }

        // Generic server error
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: 'Failed to create order'
        });
    }
});

// GET /orders/:id - Get full order details (including product name and user name)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate ID is a number
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                error: 'Order ID must be a number'
            });
        }

        const order = await OrderModel.findByIdWithDetails(id);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Not found',
                error: 'Order not found'
            });
        }
        
        // Format the response to include all details
        const formattedOrder = {
            id: order.id,
            user: {
                id: order.user_id,
                name: order.user_name,
                email: order.user_email
            },
            product: {
                id: order.product_id,
                name: order.product_name,
                price: order.product_price
            },
            quantity: order.quantity,
            total_price: order.total_price,
            created_at: order.created_at
        };
        
        res.status(200).json({
            success: true,
            message: 'Order retrieved successfully',
            data: formattedOrder
        });

    } catch (error) {
        console.error('Error fetching order:', error.message);
        
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: 'Failed to fetch order'
        });
    }
});

// GET /orders - Get all orders with full details (optional endpoint for testing)
router.get('/', async (req, res) => {
    try {
        const orders = await OrderModel.findAllWithDetails();
        
        // Format the response to include all details
        const formattedOrders = orders.map(order => ({
            id: order.id,
            user: {
                id: order.user_id,
                name: order.user_name,
                email: order.user_email
            },
            product: {
                id: order.product_id,
                name: order.product_name,
                price: order.product_price
            },
            quantity: order.quantity,
            total_price: order.total_price,
            created_at: order.created_at
        }));
        
        res.status(200).json({
            success: true,
            message: 'Orders retrieved successfully',
            data: formattedOrders,
            count: formattedOrders.length
        });

    } catch (error) {
        console.error('Error fetching orders:', error.message);
        
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: 'Failed to fetch orders'
        });
    }
});

// GET /orders/user/:user_id - Get orders by user ID (optional endpoint for testing)
router.get('/user/:user_id', async (req, res) => {
    try {
        const { user_id } = req.params;
        
        // Validate user_id is a number
        if (isNaN(user_id)) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                error: 'User ID must be a number'
            });
        }

        const orders = await OrderModel.findByUserId(user_id);
        
        // Format the response to include all details
        const formattedOrders = orders.map(order => ({
            id: order.id,
            user: {
                id: order.user_id,
                name: order.user_name,
                email: order.user_email
            },
            product: {
                id: order.product_id,
                name: order.product_name,
                price: order.product_price
            },
            quantity: order.quantity,
            total_price: order.total_price,
            created_at: order.created_at
        }));
        
        res.status(200).json({
            success: true,
            message: 'User orders retrieved successfully',
            data: formattedOrders,
            count: formattedOrders.length
        });

    } catch (error) {
        console.error('Error fetching user orders:', error.message);
        
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: 'Failed to fetch user orders'
        });
    }
});

module.exports = router;
