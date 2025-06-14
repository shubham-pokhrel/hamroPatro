# Order Management API

A simple REST API for managing users, products, and orders. Built with Node.js, Express, and SQLite.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/shubham-pokhrel/hamroPatro.git
cd order-management-api

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Start the server
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

## Setup Postman Instructions

### 1. Import the Postman Collection

#### Method A: Import from File

1. Open Postman Desktop App or Postman Web
2. Click **"Import"** button (top left)
3. Select **"Upload Files"**
4. Choose the `Order_Management_API.postman_collection.json` file
5. Click **"Import"**

### 2. Environment Setup (Optional but Recommended)

Create a Postman Environment for better variable management:

1. Click **"Environments"** in the left sidebar
2. Click **"Create Environment"**
3. Name it: `Order Management Local`
4. Add these variables:

| Variable    | Initial Value           | Current Value           |
| ----------- | ----------------------- | ----------------------- |
| `baseUrl`   | `http://localhost:3000` | `http://localhost:3000` |
| `userId`    | `1`                     | `1`                     |
| `productId` | `1`                     | `1`                     |
| `orderId`   | `1`                     | `1`                     |

5. Click **"Save"**
6. Select this environment from the dropdown (top right)

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
