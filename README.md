# Order Management API

A simple REST API for managing users, products, and orders. Built with Node.js, Express, and SQLite.

## Quick Start

```bash
npm install
npm start
```

Server runs on `http://localhost:3000`

## API Endpoints

**Users**
- `POST /users` - Create user
- `GET /users` - List all users  
- `GET /users/:id` - Get user by ID

**Products**
- `POST /products` - Create product
- `GET /products` - List all products
- `GET /products/:id` - Get product by ID

**Orders**
- `POST /orders` - Create order
- `GET /orders` - List all orders
- `GET /orders/:id` - Get order details

## Examples

**Create a user:**
```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "email": "john@example.com", "phone": "+1234567890", "address": "123 Main St"}'
```

**Create a product:**
```bash
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"name": "Laptop", "price": 999.99, "stockQuantity": 10, "category": "electronics"}'
```

**Create an order:**
```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "product_id": 1, "quantity": 2}'
```