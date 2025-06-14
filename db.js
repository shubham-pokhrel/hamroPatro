const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class DatabaseManager {
  constructor() {
    this.db = null;
    this.isConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = 3;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const dbPath = process.env.DB_PATH || path.join(__dirname, 'order_management.db');
      
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
          console.error('❌ Database connection failed:', err.message);
          
          if (this.connectionRetries < this.maxRetries) {
            this.connectionRetries++;
            console.log(`Retrying database connection (${this.connectionRetries}/${this.maxRetries})...`);
            setTimeout(() => this.connect().then(resolve).catch(reject), 2000);
            return;
          }
          
          reject(err);
          return;
        }
        
        this.isConnected = true;
        console.log('Connected to SQLite database successfully');
        console.log(`Database location: ${dbPath}`);
        
        this.configurePragmas()
          .then(() => resolve(this.db))
          .catch(reject);
      });

      this.db.on('error', (err) => {
        console.error('Database error:', err.message);
        this.isConnected = false;
      });
    });
  }

  async configurePragmas() {
    return new Promise((resolve, reject) => {
      const pragmas = [
        'PRAGMA foreign_keys = ON',
        'PRAGMA journal_mode = WAL',
        'PRAGMA synchronous = NORMAL',
        'PRAGMA cache_size = 1000',
        'PRAGMA temp_store = MEMORY'
      ];

      let completed = 0;
      pragmas.forEach(pragma => {
        this.db.run(pragma, (err) => {
          if (err) {
            console.warn(`⚠️  Warning: Failed to set ${pragma}:`, err.message);
          } else {
            console.log(`${pragma}`);
          }
          
          completed++;
          if (completed === pragmas.length) {
            resolve();
          }
        });
      });
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.run(sql, params, function(err) {
        if (err) {
          console.error('❌ Query execution failed:', err.message);
          console.error('SQL:', sql);
          console.error('Params:', params);
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.get(sql, params, (err, row) => {
        if (err) {
          console.error('❌ Query execution failed:', err.message);
          console.error('SQL:', sql);
          console.error('Params:', params);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          console.error('❌ Query execution failed:', err.message);
          console.error('SQL:', sql);
          console.error('Params:', params);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async beginTransaction() {
    return this.run('BEGIN TRANSACTION');
  }

  async commitTransaction() {
    return this.run('COMMIT');
  }

  async rollbackTransaction() {
    return this.run('ROLLBACK');
  }

  async healthCheck() {
    try {
      await this.get('SELECT 1 as test');
      return { status: 'healthy', connected: this.isConnected };
    } catch (error) {
      return { status: 'unhealthy', error: error.message, connected: false };
    }
  }

  async getStats() {
    try {
      const userCount = await this.get('SELECT COUNT(*) as count FROM users');
      const productCount = await this.get('SELECT COUNT(*) as count FROM products');
      const orderCount = await this.get('SELECT COUNT(*) as count FROM orders');
      const dbSize = await this.get("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()");
      
      return {
        users: userCount.count,
        products: productCount.count,
        orders: orderCount.count,
        dbSizeBytes: dbSize.size,
        dbSizeMB: (dbSize.size / 1024 / 1024).toFixed(2)
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            console.error('❌ Error closing database:', err.message);
          } else {
            console.log('✅ Database connection closed');
          }
          this.isConnected = false;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async initDatabase() {
    try {
      console.log('Initializing database schema...');

      await this.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL CHECK(length(name) > 0),
          email TEXT UNIQUE NOT NULL CHECK(email LIKE '%_@_%._%'),
          phone TEXT,
          address TEXT,
          status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.run(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL CHECK(length(name) > 0),
          description TEXT,
          price DECIMAL(10, 2) NOT NULL CHECK(price >= 0.01),
          category TEXT DEFAULT 'general',
          stockQuantity INTEGER DEFAULT 0 CHECK(stockQuantity >= 0),
          sku TEXT UNIQUE,
          status TEXT DEFAULT 'available' CHECK(status IN ('available', 'out_of_stock', 'discontinued')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.run(`
        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          product_id INTEGER NOT NULL,
          quantity INTEGER NOT NULL CHECK(quantity > 0),
          unit_price DECIMAL(10, 2) NOT NULL,
          total_price DECIMAL(10, 2) NOT NULL,
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
          order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
          FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT
        )
      `);

      await this.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_orders_product_id ON orders(product_id)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date)');

      await this.run(`
        CREATE TRIGGER IF NOT EXISTS users_updated_at 
        AFTER UPDATE ON users FOR EACH ROW 
        BEGIN 
          UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; 
        END
      `);

      await this.run(`
        CREATE TRIGGER IF NOT EXISTS products_updated_at 
        AFTER UPDATE ON products FOR EACH ROW 
        BEGIN 
          UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; 
        END
      `);

      await this.run(`
        CREATE TRIGGER IF NOT EXISTS orders_updated_at 
        AFTER UPDATE ON orders FOR EACH ROW 
        BEGIN 
          UPDATE orders SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; 
        END
      `);

      await this.run(`
        CREATE TRIGGER IF NOT EXISTS update_stock_on_order 
        AFTER INSERT ON orders FOR EACH ROW 
        BEGIN 
          UPDATE products 
          SET stockQuantity = stockQuantity - NEW.quantity,
              status = CASE 
                WHEN stockQuantity - NEW.quantity <= 0 THEN 'out_of_stock'
                ELSE status 
              END
          WHERE id = NEW.product_id; 
        END
      `);

      console.log('✅ Database schema initialized successfully');
      console.log('Schema includes: users, products, orders with full constraints and triggers');
      
    } catch (error) {
      console.error('❌ Database initialization failed:', error.message);
      throw error;
    }
  }
}

// Create singleton instance
const dbManager = new DatabaseManager();

module.exports = dbManager;
