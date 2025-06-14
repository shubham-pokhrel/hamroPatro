const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { validate, schemas } = require('../utils/validation');
const UserModel = require('../models/userModel');

// Middleware for request logging
router.use((req, res, next) => {
  logger.info('User route accessed', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// POST /users - Create a new user
router.post('/', validate(schemas.createUser), async (req, res) => {
  try {
    const userData = req.body;
    
    logger.info('Creating new user', { email: userData.email });
    
    const user = await UserModel.create(userData);
    
    logger.info('User created successfully', { 
      userId: user.id, 
      email: user.email 
    });
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error creating user', { 
      error: error.message, 
      userData: req.body 
    });
    
    // Handle specific error cases
    if (error.message.includes('already registered')) {
      return res.status(409).json({
        success: false,
        message: 'Email already exists',
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

    // Generic server error
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: 'Failed to create user',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /users - Get all users with pagination and filtering
router.get('/', validate(schemas.paginationQuery, 'query'), async (req, res) => {
  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10,
      sort: req.query.sort || 'id',
      order: req.query.order || 'ASC',
      status: req.query.status,
      search: req.query.search
    };
    
    logger.info('Retrieving users', { options });
    
    const result = await UserModel.findAll(options);
    
    logger.info('Users retrieved successfully', { 
      count: result.users.length,
      total: result.pagination.total
    });
    
    res.json({
      success: true,
      message: 'Users retrieved successfully',
      data: result.users,
      pagination: result.pagination,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error retrieving users', { 
      error: error.message, 
      query: req.query 
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: 'Failed to retrieve users',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /users/:id - Get user by ID
router.get('/:id', validate(schemas.idParam, 'params'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    logger.info('Retrieving user by ID', { userId });
    
    const user = await UserModel.findById(userId);
    
    if (!user) {
      logger.warn('User not found', { userId });
      return res.status(404).json({
        success: false,
        message: 'User not found',
        error: `User with ID ${userId} does not exist`,
        timestamp: new Date().toISOString()
      });
    }
    
    logger.info('User retrieved successfully', { userId: user.id });
    
    res.json({
      success: true,
      message: 'User retrieved successfully',
      data: user,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error retrieving user', { 
      error: error.message, 
      userId: req.params.id 
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: 'Failed to retrieve user',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
        

// GET /users - Get all users (optional endpoint for testing)
router.get('/', async (req, res) => {
    try {
        const users = await UserModel.findAll();
        
        res.status(200).json({
            success: true,
            message: 'Users retrieved successfully',
            data: users,
            count: users.length
        });

    } catch (error) {
        console.error('Error fetching users:', error.message);
        
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: 'Failed to fetch users'
        });
    }
});

// GET /users/:id - Get user by ID (optional endpoint for testing)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate ID is a number
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                error: 'User ID must be a number'
            });
        }

        const user = await UserModel.findById(id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Not found',
                error: 'User not found'
            });
        }
        
        res.status(200).json({
            success: true,
            message: 'User retrieved successfully',
            data: user
        });

    } catch (error) {
        console.error('Error fetching user:', error.message);
        
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: 'Failed to fetch user'
        });
    }
});

module.exports = router;
