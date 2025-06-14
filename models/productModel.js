const db = require('../db');
const { logger, dbLogger } = require('../utils/logger');
const { businessValidators, sanitize } = require('../utils/validation');

class ProductModel {
  constructor() {
    this.tableName = 'products';
  }

  // Create a new product
  async create(productData) {
    const startTime = Date.now();

    try {
      const { name, description, price, category, stockQuantity, sku } = productData;

      // Sanitize input data
      const sanitizedData = {
        name: sanitize.cleanString(name),
        description: sanitize.cleanString(description),
        price: parseFloat(price),
        category: sanitize.cleanString(category || 'general'),
        stockQuantity: parseInt(stockQuantity || 0),
        sku: sku ? sku.toUpperCase().trim() : null
      };

      // Business validation
      if (sanitizedData.sku) {
        const isSkuUnique = await businessValidators.isSkuUnique(sanitizedData.sku);
        if (!isSkuUnique) {
          throw new Error(`SKU ${sanitizedData.sku} is already in use`);
        }
      }

      const result = await db.run(
        `INSERT INTO products (name, description, price, category, stockQuantity, sku) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          sanitizedData.name,
          sanitizedData.description,
          sanitizedData.price,
          sanitizedData.category,
          sanitizedData.stockQuantity,
          sanitizedData.sku
        ]
      );

      const duration = Date.now() - startTime;
      dbLogger.logQuery('INSERT', this.tableName, sanitizedData, duration);

      logger.info('Product created successfully', {
        productId: result.id,
        name: sanitizedData.name,
        price: sanitizedData.price,
        duration: `${duration}ms`
      });

      // Return the created product
      return await this.findById(result.id);

    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('INSERT', this.tableName, error, productData);

      // Handle database errors
      if (error.message.includes('UNIQUE constraint failed')) {
        throw new Error('Product SKU is already in use');
      }

      logger.error('Failed to create product', {
        error: error.message,
        productData,
        duration: `${duration}ms`
      });

      throw error;
    }
  }

  // Find product by ID
  async findById(id) {
    const startTime = Date.now();

    try {
      const product = await db.get(
        'SELECT * FROM products WHERE id = ?',
        [id]
      );

      const duration = Date.now() - startTime;
      dbLogger.logQuery('SELECT', this.tableName, { id }, duration);

      if (!product) {
        logger.warn('Product not found', { productId: id });
        return null;
      }

      return this.formatProductResponse(product);

    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('SELECT', this.tableName, error, { id });
      throw error;
    }
  }

  // Find product by SKU
  async findBySku(sku) {
    const startTime = Date.now();

    try {
      const normalizedSku = sku.toUpperCase().trim();
      const product = await db.get(
        'SELECT * FROM products WHERE sku = ?',
        [normalizedSku]
      );

      const duration = Date.now() - startTime;
      dbLogger.logQuery('SELECT', this.tableName, { sku: normalizedSku }, duration);

      return product ? this.formatProductResponse(product) : null;

    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('SELECT', this.tableName, error, { sku });
      throw error;
    }
  }

  // Get all products
  async findAll(options = {}) {
    const startTime = Date.now();

    try {
      const {
        page = 1,
        limit = 10,
        sort = 'id',
        order = 'ASC',
        category = null,
        status = null,
        min_price = null,
        max_price = null,
        search = null,
        in_stock_only = false
      } = options;

      const offset = (page - 1) * limit;
      let whereClause = '';
      const params = [];

      // Build WHERE clause
      const conditions = [];

      if (category) {
        conditions.push('category = ?');
        params.push(category);
      }

      if (status) {
        conditions.push('status = ?');
        params.push(status);
      }

      if (min_price !== null) {
        conditions.push('price >= ?');
        params.push(min_price);
      }

      if (max_price !== null) {
        conditions.push('price <= ?');
        params.push(max_price);
      }

      if (search) {
        conditions.push('(name LIKE ? OR description LIKE ? OR sku LIKE ?)');
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }

      if (in_stock_only) {
        conditions.push('stockQuantity > 0');
      }

      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }
      const countQuery = `SELECT COUNT(*) as total FROM products ${whereClause}`;
      const countResult = await db.get(countQuery, params);
      const total = countResult.total;

      const query = `
        SELECT * FROM products 
        ${whereClause}
        ORDER BY ${sort} ${order}
        LIMIT ? OFFSET ?
      `;

      const products = await db.all(query, [...params, limit, offset]);

      const duration = Date.now() - startTime;
      dbLogger.logQuery('SELECT_ALL', this.tableName, options, duration);

      logger.info('Products retrieved', {
        count: products.length,
        total,
        page,
        limit,
        filters: { category, status, min_price, max_price, search, in_stock_only },
        duration: `${duration}ms`
      });

      return {
        products: products.map(product => this.formatProductResponse(product)),
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

  async update(id, updateData) {
    const startTime = Date.now();

    try {
      const existingProduct = await this.findById(id);
      if (!existingProduct) {
        throw new Error(`Product with ID ${id} not found`);
      }

      const sanitizedData = {};
      if (updateData.name) sanitizedData.name = sanitize.cleanString(updateData.name);
      if (updateData.description !== undefined) sanitizedData.description = sanitize.cleanString(updateData.description);
      if (updateData.price !== undefined) sanitizedData.price = parseFloat(updateData.price);
      if (updateData.category) sanitizedData.category = sanitize.cleanString(updateData.category);
      if (updateData.stockQuantity !== undefined) sanitizedData.stockQuantity = parseInt(updateData.stockQuantity);
      if (updateData.status) sanitizedData.status = updateData.status;
      if (updateData.sku !== undefined) {
        sanitizedData.sku = updateData.sku ? updateData.sku.toUpperCase().trim() : null;

        if (sanitizedData.sku) {
          const isSkuUnique = await businessValidators.isSkuUnique(sanitizedData.sku, id);
          if (!isSkuUnique) {
            throw new Error(`SKU ${sanitizedData.sku} is already in use`);
          }
        }
      }

      const updateFields = Object.keys(sanitizedData);
      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      const setClause = updateFields.map(field => `${field} = ?`).join(', ');
      const values = updateFields.map(field => sanitizedData[field]);
      values.push(id);

      const result = await db.run(
        `UPDATE products SET ${setClause} WHERE id = ?`,
        values
      );

      if (result.changes === 0) {
        throw new Error(`Failed to update product with ID ${id}`);
      }

      const duration = Date.now() - startTime;
      dbLogger.logQuery('UPDATE', this.tableName, { id, ...sanitizedData }, duration);

      logger.info('Product updated successfully', {
        productId: id,
        updatedFields: updateFields,
        duration: `${duration}ms`
      });

      // Return updated product
      return await this.findById(id);

    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('UPDATE', this.tableName, error, { id, updateData });
      throw error;
    }
  }

  // Update stock quantity
  async updateStock(id, quantityChange, operation = 'subtract') {
    const startTime = Date.now();

    try {
      await db.beginTransaction();

      const product = await this.findById(id);
      if (!product) {
        throw new Error(`Product with ID ${id} not found`);
      }

      let newQuantity;
      if (operation === 'add') {
        newQuantity = product.stockQuantity + quantityChange;
      } else if (operation === 'subtract') {
        newQuantity = product.stockQuantity - quantityChange;
        if (newQuantity < 0) {
          throw new Error(`Insufficient stock. Available: ${product.stockQuantity}, Requested: ${quantityChange}`);
        }
      } else {
        throw new Error('Invalid operation. Use "add" or "subtract"');
      }

      const newStatus = newQuantity === 0 ? 'out_of_stock' : 'available';

      const result = await db.run(
        'UPDATE products SET stockQuantity = ?, status = ? WHERE id = ?',
        [newQuantity, newStatus, id]
      );

      if (result.changes === 0) {
        throw new Error(`Failed to update stock for product ID ${id}`);
      }

      await db.commitTransaction();

      const duration = Date.now() - startTime;
      dbLogger.logQuery('UPDATE_STOCK', this.tableName, {
        id,
        operation,
        quantityChange,
        oldQuantity: product.stockQuantity,
        newQuantity
      }, duration);

      logger.info('Product stock updated', {
        productId: id,
        operation,
        quantityChange,
        oldQuantity: product.stockQuantity,
        newQuantity,
        newStatus,
        duration: `${duration}ms`
      });

      return await this.findById(id);

    } catch (error) {
      await db.rollbackTransaction();
      const duration = Date.now() - startTime;
      dbLogger.logError('UPDATE_STOCK', this.tableName, error, { id, quantityChange, operation });
      throw error;
    }
  }

  // Get product categories with counts
  async getCategories() {
    const startTime = Date.now();

    try {
      const categories = await db.all(`
        SELECT 
          category,
          COUNT(*) as product_count,
          SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_count,
          AVG(price) as avg_price
        FROM products 
        GROUP BY category 
        ORDER BY category
      `);

      const duration = Date.now() - startTime;
      dbLogger.logQuery('SELECT_CATEGORIES', this.tableName, {}, duration);

      return categories.map(cat => ({
        category: cat.category,
        productCount: cat.product_count,
        availableCount: cat.available_count,
        averagePrice: parseFloat(cat.avg_price || 0)
      }));

    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('SELECT_CATEGORIES', this.tableName, error, {});
      throw error;
    }
  }

  // Get low stock products
  async getLowStockProducts(threshold = 10) {
    const startTime = Date.now();

    try {
      const products = await db.all(
        'SELECT * FROM products WHERE stockQuantity <= ? AND status != ? ORDER BY stockQuantity ASC',
        [threshold, 'discontinued']
      );

      const duration = Date.now() - startTime;
      dbLogger.logQuery('SELECT_LOW_STOCK', this.tableName, { threshold }, duration);

      return products.map(product => this.formatProductResponse(product));

    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('SELECT_LOW_STOCK', this.tableName, error, { threshold });
      throw error;
    }
  }

  // Discontinue product
  async discontinue(id) {
    const startTime = Date.now();

    try {
      const result = await db.run(
        'UPDATE products SET status = ? WHERE id = ?',
        ['discontinued', id]
      );

      if (result.changes === 0) {
        throw new Error(`Product with ID ${id} not found`);
      }

      const duration = Date.now() - startTime;
      dbLogger.logQuery('UPDATE', this.tableName, { id, status: 'discontinued' }, duration);

      logger.info('Product discontinued', { productId: id, duration: `${duration}ms` });

      return { success: true, message: 'Product discontinued successfully' };

    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.logError('UPDATE', this.tableName, error, { id });
      throw error;
    }
  }

  // Format product response
  formatProductResponse(product) {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      price: parseFloat(product.price),
      category: product.category,
      stockQuantity: product.stockQuantity,
      sku: product.sku,
      status: product.status,
      createdAt: product.created_at,
      updatedAt: product.updated_at
    };
  }

  async hasPendingOrders(id) {
    try {
      const result = await db.get(
        `SELECT COUNT(*) as count FROM orders 
         WHERE product_id = ? AND status IN ('pending', 'confirmed')`,
        [id]
      );

      return result.count > 0;
    } catch (error) {
      logger.error('Error checking pending orders', { productId: id, error: error.message });
      throw error;
    }
  }
}

module.exports = new ProductModel();
