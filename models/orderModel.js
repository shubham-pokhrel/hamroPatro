const db = require('../db');
const { logger, dbLogger } = require('../utils/logger');
const { businessValidators } = require('../utils/validation');
const UserModel = require('./userModel');
const ProductModel = require('./productModel');

class OrderModel {
  constructor() {
    this.tableName = 'orders';
  }

  // Create a new order
  async create(orderData) {
    const startTime = Date.now();
    
    try {
      const { user_id, product_id, quantity, notes } = orderData;
      
      // Validate input
      if (!user_id || !product_id || !quantity) {
        throw new Error('User ID, Product ID, and quantity are required');
      }

      const numericQuantity = parseInt(quantity);
      if (isNaN(numericQuantity) || numericQuantity <= 0) {
        throw new Error('Quantity must be a positive integer');
      }

      // Business validation
      const userExists = await businessValidators.userExists(user_id);
      if (!userExists) {
        throw new Error('User not found or inactive');
      }

      const productAvailability = await businessValidators.productAvailable(product_id, numericQuantity);
      if (!productAvailability.available) {
        throw new Error(productAvailability.reason);
      }

      const product = productAvailability.product;
      
      // Start transaction
      await db.beginTransaction();

      try {
        // Calculate prices
        const unit_price = parseFloat(product.price);
        const total_price = unit_price * numericQuantity;

        // Create the order
        const result = await db.run(
          `INSERT INTO orders (user_id, product_id, quantity, unit_price, total_price, notes) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [user_id, product_id, numericQuantity, unit_price, total_price, notes || null]
        );
        
        await db.commitTransaction();

        const duration = Date.now() - startTime;
        dbLogger.logQuery('INSERT', this.tableName, {
          user_id,
          product_id,
          quantity: numericQuantity,
          unit_price,
          total_price
        }, duration);

        logger.info('Order created successfully', {
          orderId: result.id,
          userId: user_id,
          productId: product_id,
          quantity: numericQuantity,
          totalPrice: total_price,
          duration: `${duration}ms`
        });

        return await this.findByIdWithDetails(result.id);

      } catch (error) {
        await db.rollbackTransaction();
        throw error;
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('INSERT', this.tableName, error, orderData);
      
      logger.error('Failed to create order', {
        error: error.message,
        orderData,
        duration: `${duration}ms`
      });
      
      throw error;
    }
  }

  // Find order by ID
  async findById(id) {
    const startTime = Date.now();
    
    try {
      const order = await db.get(
        'SELECT * FROM orders WHERE id = ?',
        [id]
      );
      
      const duration = Date.now() - startTime;
      dbLogger.logQuery('SELECT', this.tableName, { id }, duration);
      
      if (!order) {
        logger.warn('Order not found', { orderId: id });
        return null;
      }
      
      return this.formatOrderResponse(order);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('SELECT', this.tableName, error, { id });
      throw error;
    }
  }

  async findByIdWithDetails(id) {
    const startTime = Date.now();
    
    try {
      const order = await db.get(`
        SELECT 
          o.id,
          o.user_id,
          o.product_id,
          o.quantity,
          o.unit_price,
          o.total_price,
          o.status,
          o.order_date,
          o.notes,
          o.created_at,
          o.updated_at,
          u.name as user_name,
          u.email as user_email,
          u.phone as user_phone,
          p.name as product_name,
          p.description as product_description,
          p.category as product_category,
          p.sku as product_sku
        FROM orders o
        JOIN users u ON o.user_id = u.id
        JOIN products p ON o.product_id = p.id
        WHERE o.id = ?
      `, [id]);
      
      const duration = Date.now() - startTime;
      dbLogger.logQuery('SELECT_WITH_DETAILS', this.tableName, { id }, duration);
      
      if (!order) {
        logger.warn('Order not found', { orderId: id });
        return null;
      }
      
      return this.formatOrderDetailsResponse(order);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('SELECT_WITH_DETAILS', this.tableName, error, { id });
      throw error;
    }
  }

  // Get all orders
  async findAll(options = {}) {
    const startTime = Date.now();
    
    try {
      const {
        page = 1,
        limit = 10,
        sort = 'created_at',
        order = 'DESC',
        status = null,
        user_id = null,
        product_id = null,
        date_from = null,
        date_to = null,
        min_amount = null,
        max_amount = null,
        include_details = false
      } = options;
      
      const offset = (page - 1) * limit;
      let whereClause = '';
      const params = [];
      
      // Build WHERE clause
      const conditions = [];
      
      if (status) {
        conditions.push('o.status = ?');
        params.push(status);
      }
      
      if (user_id) {
        conditions.push('o.user_id = ?');
        params.push(user_id);
      }
      
      if (product_id) {
        conditions.push('o.product_id = ?');
        params.push(product_id);
      }
      
      if (date_from) {
        conditions.push('o.order_date >= ?');
        params.push(date_from);
      }
      
      if (date_to) {
        conditions.push('o.order_date <= ?');
        params.push(date_to);
      }
      
      if (min_amount !== null) {
        conditions.push('o.total_price >= ?');
        params.push(min_amount);
      }
      
      if (max_amount !== null) {
        conditions.push('o.total_price <= ?');
        params.push(max_amount);
      }
      
      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }
      
      // Build base query
      let baseQuery = include_details ? 
        `FROM orders o
         JOIN users u ON o.user_id = u.id
         JOIN products p ON o.product_id = p.id` :
        `FROM orders o`;
      
      // Get total count for pagination
      const countQuery = `SELECT COUNT(*) as total ${baseQuery} ${whereClause}`;
      const countResult = await db.get(countQuery, params);
      const total = countResult.total;
      
      // Get orders with pagination
      let selectClause = include_details ? `
        SELECT 
          o.id,
          o.user_id,
          o.product_id,
          o.quantity,
          o.unit_price,
          o.total_price,
          o.status,
          o.order_date,
          o.notes,
          o.created_at,
          o.updated_at,
          u.name as user_name,
          u.email as user_email,
          p.name as product_name,
          p.category as product_category,
          p.sku as product_sku
      ` : 'SELECT o.*';
      
      const query = `
        ${selectClause}
        ${baseQuery}
        ${whereClause}
        ORDER BY o.${sort} ${order}
        LIMIT ? OFFSET ?
      `;
      
      const orders = await db.all(query, [...params, limit, offset]);
      
      const duration = Date.now() - startTime;
      dbLogger.logQuery('SELECT_ALL', this.tableName, options, duration);
      
      logger.info('Orders retrieved', {
        count: orders.length,
        total,
        page,
        limit,
        filters: { status, user_id, product_id, date_from, date_to, min_amount, max_amount },
        duration: `${duration}ms`
      });
      
      return {
        orders: orders.map(order => 
          include_details ? this.formatOrderDetailsResponse(order) : this.formatOrderResponse(order)
        ),
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

  // Update order status
  async updateStatus(id, status, notes = null) {
    const startTime = Date.now();
    
    try {
      // Check if order exists
      const existingOrder = await this.findById(id);
      if (!existingOrder) {
        throw new Error(`Order with ID ${id} not found`);
      }
      
      // Validate status transition
      const validTransitions = {
        'pending': ['confirmed', 'cancelled'],
        'confirmed': ['shipped', 'cancelled'],
        'shipped': ['delivered', 'cancelled'],
        'delivered': [],
        'cancelled': []
      };
      
      const currentStatus = existingOrder.status;
      if (!validTransitions[currentStatus].includes(status)) {
        throw new Error(`Cannot change status from ${currentStatus} to ${status}`);
      }
      
      const result = await db.run(
        'UPDATE orders SET status = ?, notes = ? WHERE id = ?',
        [status, notes, id]
      );
      
      if (result.changes === 0) {
        throw new Error(`Failed to update order status for ID ${id}`);
      }
      
      const duration = Date.now() - startTime;
      dbLogger.logQuery('UPDATE_STATUS', this.tableName, { id, status, notes }, duration);
      
      logger.info('Order status updated', {
        orderId: id,
        oldStatus: currentStatus,
        newStatus: status,
        notes,
        duration: `${duration}ms`
      });
      
      return await this.findByIdWithDetails(id);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('UPDATE_STATUS', this.tableName, error, { id, status, notes });
      throw error;
    }
  }

  // Cancel order
  async cancel(id, reason = null) {
    const startTime = Date.now();
    
    try {
      const order = await this.findById(id);
      if (!order) {
        throw new Error(`Order with ID ${id} not found`);
      }
      
      if (order.status === 'cancelled') {
        throw new Error('Order is already cancelled');
      }
      
      if (order.status === 'delivered') {
        throw new Error('Cannot cancel delivered order');
      }
      
      await db.beginTransaction();
      
      try {
        // Update order status
        await db.run(
          'UPDATE orders SET status = ?, notes = ? WHERE id = ?',
          ['cancelled', reason, id]
        );
        
        // Restore stock
        await db.run(
          `UPDATE products 
           SET stockQuantity = stockQuantity + ?,
               status = CASE 
                 WHEN status = 'out_of_stock' AND stockQuantity + ? > 0 THEN 'available'
                 ELSE status 
               END
           WHERE id = ?`,
          [order.quantity, order.quantity, order.productId]
        );
        
        await db.commitTransaction();
        
        const duration = Date.now() - startTime;
        dbLogger.logQuery('CANCEL', this.tableName, { id, reason }, duration);
        
        logger.info('Order cancelled successfully', {
          orderId: id,
          reason,
          restoredQuantity: order.quantity,
          duration: `${duration}ms`
        });
        
        return await this.findByIdWithDetails(id);
        
      } catch (error) {
        await db.rollbackTransaction();
        throw error;
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('CANCEL', this.tableName, error, { id, reason });
      throw error;
    }
  }

  // Get order analytics
  async getAnalytics(options = {}) {
    const startTime = Date.now();
    
    try {
      const {
        date_from = null,
        date_to = null,
        user_id = null
      } = options;
      
      let whereClause = '';
      const params = [];
      
      const conditions = [];
      
      if (date_from) {
        conditions.push('order_date >= ?');
        params.push(date_from);
      }
      
      if (date_to) {
        conditions.push('order_date <= ?');
        params.push(date_to);
      }
      
      if (user_id) {
        conditions.push('user_id = ?');
        params.push(user_id);
      }
      
      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }
      
      const analytics = await db.get(`
        SELECT 
          COUNT(*) as total_orders,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
          COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_orders,
          COUNT(CASE WHEN status = 'shipped' THEN 1 END) as shipped_orders,
          COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
          COALESCE(SUM(total_price), 0) as total_revenue,
          COALESCE(AVG(total_price), 0) as avg_order_value,
          COALESCE(SUM(CASE WHEN status = 'delivered' THEN total_price ELSE 0 END), 0) as delivered_revenue
        FROM orders
        ${whereClause}
      `, params);
      
      const duration = Date.now() - startTime;
      dbLogger.logQuery('SELECT_ANALYTICS', this.tableName, options, duration);
      
      return {
        totalOrders: analytics.total_orders,
        pendingOrders: analytics.pending_orders,
        confirmedOrders: analytics.confirmed_orders,
        shippedOrders: analytics.shipped_orders,
        deliveredOrders: analytics.delivered_orders,
        cancelledOrders: analytics.cancelled_orders,
        totalRevenue: parseFloat(analytics.total_revenue),
        averageOrderValue: parseFloat(analytics.avg_order_value),
        deliveredRevenue: parseFloat(analytics.delivered_revenue),
        cancellationRate: analytics.total_orders > 0 ? 
          (analytics.cancelled_orders / analytics.total_orders * 100).toFixed(2) : 0
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('SELECT_ANALYTICS', this.tableName, error, options);
      throw error;
    }
  }

  // Format basic order response
  formatOrderResponse(order) {
    return {
      id: order.id,
      userId: order.user_id,
      productId: order.product_id,
      quantity: order.quantity,
      unitPrice: parseFloat(order.unit_price),
      totalPrice: parseFloat(order.total_price),
      status: order.status,
      orderDate: order.order_date,
      notes: order.notes,
      createdAt: order.created_at,
      updatedAt: order.updated_at
    };
  }

  formatOrderDetailsResponse(order) {
    return {
      id: order.id,
      userId: order.user_id,
      productId: order.product_id,
      quantity: order.quantity,
      unitPrice: parseFloat(order.unit_price),
      totalPrice: parseFloat(order.total_price),
      status: order.status,
      orderDate: order.order_date,
      notes: order.notes,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      user: {
        name: order.user_name,
        email: order.user_email,
        phone: order.user_phone
      },
      product: {
        name: order.product_name,
        description: order.product_description,
        category: order.product_category,
        sku: order.product_sku
      }
    };
  }
}

module.exports = new OrderModel();
