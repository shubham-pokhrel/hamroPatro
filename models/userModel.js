const db = require('../db');
const { logger, dbLogger } = require('../utils/logger');
const { businessValidators, sanitize } = require('../utils/validation');

class UserModel {
  constructor() {
    this.tableName = 'users';
  }

  // Create a new user with comprehensive validation
  async create(userData) {
    const startTime = Date.now();
    
    try {
      const { name, email, phone, address } = userData;
      
      // Sanitize input data
      const sanitizedData = {
        name: sanitize.cleanString(name),
        email: sanitize.normalizeEmail(email),
        phone: sanitize.formatPhone(phone),
        address: sanitize.cleanString(address)
      };
      
      // Business validation
      const isEmailUnique = await businessValidators.isEmailUnique(sanitizedData.email);
      if (!isEmailUnique) {
        throw new Error(`Email ${sanitizedData.email} is already registered`);
      }
      
      const result = await db.run(
        `INSERT INTO users (name, email, phone, address) 
         VALUES (?, ?, ?, ?)`,
        [sanitizedData.name, sanitizedData.email, sanitizedData.phone, sanitizedData.address]
      );
      
      const duration = Date.now() - startTime;
      dbLogger.logQuery('INSERT', this.tableName, sanitizedData, duration);
      
      logger.info('User created successfully', {
        userId: result.id,
        email: sanitizedData.email,
        duration: `${duration}ms`
      });
      
      // Return the created user
      return await this.findById(result.id);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('INSERT', this.tableName, error, userData);
      
      // Handle specific database errors
      if (error.message.includes('UNIQUE constraint failed')) {
        throw new Error('Email address is already registered');
      }
      
      logger.error('Failed to create user', {
        error: error.message,
        userData,
        duration: `${duration}ms`
      });
      
      throw error;
    }
  }

  // Find user by ID with detailed logging
  async findById(id) {
    const startTime = Date.now();
    
    try {
      const user = await db.get(
        'SELECT * FROM users WHERE id = ?',
        [id]
      );
      
      const duration = Date.now() - startTime;
      dbLogger.logQuery('SELECT', this.tableName, { id }, duration);
      
      if (!user) {
        logger.warn('User not found', { userId: id });
        return null;
      }
      
      return this.formatUserResponse(user);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('SELECT', this.tableName, error, { id });
      throw error;
    }
  }

  // Find user by email
  async findByEmail(email) {
    const startTime = Date.now();
    
    try {
      const normalizedEmail = sanitize.normalizeEmail(email);
      const user = await db.get(
        'SELECT * FROM users WHERE email = ?',
        [normalizedEmail]
      );
      
      const duration = Date.now() - startTime;
      dbLogger.logQuery('SELECT', this.tableName, { email: normalizedEmail }, duration);
      
      return user ? this.formatUserResponse(user) : null;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('SELECT', this.tableName, error, { email });
      throw error;
    }
  }

  // Get all users with pagination and filtering
  async findAll(options = {}) {
    const startTime = Date.now();
    
    try {
      const {
        page = 1,
        limit = 10,
        sort = 'id',
        order = 'ASC',
        status = null,
        search = null
      } = options;
      
      const offset = (page - 1) * limit;
      let whereClause = '';
      const params = [];
      
      // Build WHERE clause
      const conditions = [];
      
      if (status) {
        conditions.push('status = ?');
        params.push(status);
      }
      
      if (search) {
        conditions.push('(name LIKE ? OR email LIKE ?)');
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern);
      }
      
      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }
      
      // Get total count for pagination
      const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
      const countResult = await db.get(countQuery, params);
      const total = countResult.total;
      
      // Get users with pagination
      const query = `
        SELECT * FROM users 
        ${whereClause}
        ORDER BY ${sort} ${order}
        LIMIT ? OFFSET ?
      `;
      
      const users = await db.all(query, [...params, limit, offset]);
      
      const duration = Date.now() - startTime;
      dbLogger.logQuery('SELECT_ALL', this.tableName, options, duration);
      
      logger.info('Users retrieved', {
        count: users.length,
        total,
        page,
        limit,
        duration: `${duration}ms`
      });
      
      return {
        users: users.map(user => this.formatUserResponse(user)),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('SELECT_ALL', this.tableName, error, options);
      throw error;
    }
  }

  // Update user information
  async update(id, updateData) {
    const startTime = Date.now();
    
    try {
      // Check if user exists
      const existingUser = await this.findById(id);
      if (!existingUser) {
        throw new Error(`User with ID ${id} not found`);
      }
      
      // Sanitize update data
      const sanitizedData = {};
      if (updateData.name) sanitizedData.name = sanitize.cleanString(updateData.name);
      if (updateData.phone) sanitizedData.phone = sanitize.formatPhone(updateData.phone);
      if (updateData.address) sanitizedData.address = sanitize.cleanString(updateData.address);
      if (updateData.status) sanitizedData.status = updateData.status;
      
      // Build dynamic update query
      const updateFields = Object.keys(sanitizedData);
      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }
      
      const setClause = updateFields.map(field => `${field} = ?`).join(', ');
      const values = updateFields.map(field => sanitizedData[field]);
      values.push(id);
      
      const result = await db.run(
        `UPDATE users SET ${setClause} WHERE id = ?`,
        values
      );
      
      if (result.changes === 0) {
        throw new Error(`Failed to update user with ID ${id}`);
      }
      
      const duration = Date.now() - startTime;
      dbLogger.logQuery('UPDATE', this.tableName, { id, ...sanitizedData }, duration);
      
      logger.info('User updated successfully', {
        userId: id,
        updatedFields: updateFields,
        duration: `${duration}ms`
      });
      
      // Return updated user
      return await this.findById(id);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('UPDATE', this.tableName, error, { id, updateData });
      throw error;
    }
  }

  // Soft delete user (deactivate)
  async deactivate(id) {
    const startTime = Date.now();
    
    try {
      const result = await db.run(
        'UPDATE users SET status = ? WHERE id = ?',
        ['inactive', id]
      );
      
      if (result.changes === 0) {
        throw new Error(`User with ID ${id} not found`);
      }
      
      const duration = Date.now() - startTime;
      dbLogger.logQuery('UPDATE', this.tableName, { id, status: 'inactive' }, duration);
      
      logger.info('User deactivated', { userId: id, duration: `${duration}ms` });
      
      return { success: true, message: 'User deactivated successfully' };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('UPDATE', this.tableName, error, { id });
      throw error;
    }
  }

  // Get user statistics
  async getUserStats(id) {
    const startTime = Date.now();
    
    try {
      const stats = await db.get(`
        SELECT 
          COUNT(o.id) as total_orders,
          COALESCE(SUM(o.total_price), 0) as total_spent,
          COALESCE(AVG(o.total_price), 0) as avg_order_value,
          MAX(o.created_at) as last_order_date,
          COUNT(CASE WHEN o.status = 'delivered' THEN 1 END) as completed_orders
        FROM users u
        LEFT JOIN orders o ON u.id = o.user_id
        WHERE u.id = ?
        GROUP BY u.id
      `, [id]);
      
      const duration = Date.now() - startTime;
      dbLogger.logQuery('SELECT_STATS', this.tableName, { id }, duration);
      
      return {
        totalOrders: stats?.total_orders || 0,
        totalSpent: parseFloat(stats?.total_spent || 0),
        averageOrderValue: parseFloat(stats?.avg_order_value || 0),
        lastOrderDate: stats?.last_order_date,
        completedOrders: stats?.completed_orders || 0
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('SELECT_STATS', this.tableName, error, { id });
      throw error;
    }
  }

  // Format user response (remove sensitive data, format dates)
  formatUserResponse(user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      status: user.status,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    };
  }

  // Check if user has any active orders (for deletion validation)
  async hasActiveOrders(id) {
    try {
      const result = await db.get(
        `SELECT COUNT(*) as count FROM orders 
         WHERE user_id = ? AND status IN ('pending', 'confirmed', 'shipped')`,
        [id]
      );
      
      return result.count > 0;
    } catch (error) {
      logger.error('Error checking active orders', { userId: id, error: error.message });
      throw error;
    }
  }
}

module.exports = new UserModel();
