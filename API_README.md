# API Endpoints Documentation

This document provides a comprehensive overview of all API endpoints available in the SBR Server application.

## Base URL
All endpoints are prefixed with `/api`

## Authentication
Most endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

Some endpoints use `optionalAuth` which means authentication is optional but may provide additional features if authenticated.

---

## 🔐 Authentication (`/api/auth`)

### Register User
- **POST** `/api/auth/register`
- **Description**: Register a new user account
- **Body**: `{ full_name, email, phone, password }`
- **Response**: User object with verification requirements

### Register Admin
- **POST** `/api/auth/register-admin`
- **Description**: Register a new admin account
- **Body**: `{ full_name, email, phone, password }`
- **Response**: Admin user object

### Verify Account
- **POST** `/api/auth/verify`
- **Description**: Verify user account with verification code
- **Body**: `{ email, verification_code }`
- **Response**: Success message

### Login
- **POST** `/api/auth/login`
- **Description**: Login as regular user
- **Body**: `{ email, password }`
- **Response**: JWT token and user object

### Login Admin
- **POST** `/api/auth/login-admin`
- **Description**: Login as admin user
- **Body**: `{ email, password }`
- **Response**: JWT token and admin user object

### Request Password Reset
- **POST** `/api/auth/request-password-reset`
- **Description**: Request password reset code
- **Body**: `{ email }`
- **Response**: Success message

### Reset Password
- **POST** `/api/auth/reset-password`
- **Description**: Reset password using verification code
- **Body**: `{ email, verification_code, new_password }`
- **Response**: Success message

---

## 👤 Users (`/api/users`)

### Get Profile
- **GET** `/api/users/profile`
- **Auth**: Required
- **Description**: Get authenticated user's profile information
- **Response**: User profile object

### Update Profile
- **PUT** `/api/users/profile`
- **Auth**: Required
- **Description**: Update user profile (name, phone)
- **Body**: `{ full_name?, phone? }`
- **Response**: Updated user object

### Change Password
- **PUT** `/api/users/change-password`
- **Auth**: Required
- **Description**: Change user password
- **Body**: `{ current_password, new_password }`
- **Response**: Success message

### Get Addresses
- **GET** `/api/users/addresses`
- **Auth**: Required
- **Description**: Get all user addresses
- **Response**: Array of address objects

### Add Address
- **POST** `/api/users/addresses`
- **Auth**: Required, Verified
- **Description**: Add a new shipping address
- **Body**: `{ label, country, city, street, postal_code?, is_default? }`
- **Response**: Created address object

### Update Address
- **PUT** `/api/users/addresses/:id`
- **Auth**: Required
- **Description**: Update an existing address
- **Body**: `{ label?, country?, city?, street?, postal_code?, is_default? }`
- **Response**: Updated address object

### Delete Address
- **DELETE** `/api/users/addresses/:id`
- **Auth**: Required
- **Description**: Delete an address
- **Response**: Success message

### Get User Orders
- **GET** `/api/users/orders`
- **Auth**: Required
- **Description**: Get authenticated user's orders
- **Query**: `{ page?, limit? }`
- **Response**: Orders array with pagination

---

## 🛒 Cart (`/api/cart`)

### Get Cart
- **GET** `/api/cart`
- **Auth**: Required
- **Description**: Get user's cart with all items and summary
- **Response**: Cart items array and summary (subtotal, discount, total)

### Add to Cart
- **POST** `/api/cart/add`
- **Auth**: Required, Verified
- **Description**: Add item to cart
- **Body**: `{ product_type: 'part' | 'merch', product_id, quantity }`
- **Response**: Success message

### Update Cart Item
- **PUT** `/api/cart/update/:id`
- **Auth**: Required, Verified
- **Description**: Update cart item quantity
- **Body**: `{ quantity }`
- **Response**: Success message with quantity

### Remove from Cart
- **DELETE** `/api/cart/remove/:id`
- **Auth**: Required
- **Description**: Remove item from cart
- **Response**: Success message

### Clear Cart
- **DELETE** `/api/cart/clear`
- **Auth**: Required
- **Description**: Clear entire cart
- **Response**: Success message

### Get Checkout Summary
- **GET** `/api/cart/checkout-summary`
- **Auth**: Required, Verified
- **Description**: Get cart summary for checkout with validation
- **Response**: Cart items with totals, shipping cost, points earned

---

## 📦 Orders (`/api/orders`)

### Create Order
- **POST** `/api/orders/create`
- **Auth**: Required, Verified
- **Description**: Create order from cart items
- **Body**: `{ shipping_address_id, payment_method, notes? }`
- **Response**: Order and payment objects

### Get Orders
- **GET** `/api/orders`
- **Auth**: Required
- **Description**: Get user's orders
- **Query**: `{ page?, limit?, status? }`
- **Response**: Orders array with pagination

### Get Order Details
- **GET** `/api/orders/:id`
- **Auth**: Required
- **Description**: Get detailed order information
- **Response**: Order, items, payments, shipping address

### Cancel Order
- **PUT** `/api/orders/:id/cancel`
- **Auth**: Required
- **Description**: Cancel an order (only if not shipped)
- **Response**: Success message

### Track Order
- **GET** `/api/orders/:id/track`
- **Auth**: Required
- **Description**: Get order tracking information
- **Response**: Order status timeline and tracking details

---

## 💳 Payments (`/api/payments`)

### Process Payment
- **POST** `/api/payments/process`
- **Auth**: Required, Verified
- **Description**: Process payment for an order
- **Body**: `{ order_id, payment_method, payment_data? }`
- **Payment Methods**: `stripe`, `sadad`, `paypal`, `cash`, `pay_later`
- **Response**: Payment and order status

### Get Payment Methods
- **GET** `/api/payments/methods`
- **Description**: Get available payment methods
- **Response**: Array of payment method objects

### Get Payment History
- **GET** `/api/payments/history`
- **Auth**: Required
- **Description**: Get user's payment history
- **Query**: `{ page?, limit?, status? }`
- **Response**: Payments array with pagination

### Refund Payment
- **POST** `/api/payments/refund`
- **Auth**: Required (Admin)
- **Description**: Process payment refund
- **Body**: `{ payment_id, amount?, reason? }`
- **Response**: Refund details

---

## 🛍️ Products (`/api/products`)

### Get Categories
- **GET** `/api/products/categories`
- **Description**: Get all product categories
- **Query**: `{ include_children?: 'true' }`
- **Response**: Categories array (optionally hierarchical)

### Get Category Details
- **GET** `/api/products/categories/:id`
- **Description**: Get category with products
- **Query**: `{ page?, limit?, sort?, order? }`
- **Response**: Category and parts array with pagination

### Get Brands
- **GET** `/api/products/brands`
- **Description**: Get all brands
- **Query**: `{ page?, limit? }`
- **Response**: Brands array with pagination

### Get Brand Details
- **GET** `/api/products/brands/:id`
- **Description**: Get brand with products
- **Query**: `{ page?, limit?, sort?, order? }`
- **Response**: Brand and parts array with pagination

### Search Parts
- **GET** `/api/products/parts`
- **Auth**: Optional
- **Description**: Search and filter parts
- **Query**: `{ page?, limit?, search?, category_id?, brand_id?, min_price?, max_price?, color?, sort?, order?, in_stock? }`
- **Response**: Parts array with pagination and filters

### Get Part Details
- **GET** `/api/products/parts/:id`
- **Auth**: Optional
- **Description**: Get detailed part information with related parts
- **Response**: Part object and related parts array

### Get Merchandise
- **GET** `/api/products/merchandise`
- **Auth**: Optional
- **Description**: Get all merchandise with filtering
- **Query**: `{ page?, limit?, search?, min_price?, max_price?, color?, size?, sort?, order?, in_stock? }`
- **Response**: Merchandise array with pagination and filters

### Get Merchandise Details
- **GET** `/api/products/merchandise/:id`
- **Auth**: Optional
- **Description**: Get detailed merchandise information with related items
- **Response**: Merchandise object and related merchandise array

---

## 💬 Feedback (`/api/feedback`)

### Submit Feedback
- **POST** `/api/feedback/feedback`
- **Auth**: Required
- **Description**: Submit user feedback
- **Body**: `{ message, rating?, feedback_type?, is_public? }`
- **Response**: Created feedback object

### Get Public Feedback
- **GET** `/api/feedback/feedback/public`
- **Auth**: Optional
- **Description**: Get public feedback (reviews)
- **Query**: `{ page?, limit?, rating? }`
- **Response**: Feedback array with pagination

### Get My Feedback
- **GET** `/api/feedback/feedback/my`
- **Auth**: Required
- **Description**: Get authenticated user's feedback
- **Query**: `{ page?, limit? }`
- **Response**: Feedback array with pagination

### Apply as Ambassador
- **POST** `/api/feedback/ambassadors/apply`
- **Auth**: Required
- **Description**: Apply to become an ambassador
- **Body**: `{ social_links, follower_count, bike_brands, application_notes? }`
- **Response**: Application object

### Get My Ambassador Application
- **GET** `/api/feedback/ambassadors/my`
- **Auth**: Required
- **Description**: Get user's ambassador application
- **Response**: Application object

### Update Ambassador Application
- **PUT** `/api/feedback/ambassadors/my`
- **Auth**: Required
- **Description**: Update pending ambassador application
- **Body**: `{ social_links?, follower_count?, bike_brands?, application_notes? }`
- **Response**: Updated application object

### Get Approved Ambassadors
- **GET** `/api/feedback/ambassadors/approved`
- **Auth**: Optional
- **Description**: Get list of approved ambassadors
- **Query**: `{ page?, limit? }`
- **Response**: Ambassadors array with pagination

---

## 👥 Partners (`/api/partners`)

### Get Partners
- **GET** `/api/partners`
- **Auth**: Optional
- **Description**: Get all active partners
- **Query**: `{ page?, limit?, search? }`
- **Response**: Partners array with pagination

### Get Partner Details
- **GET** `/api/partners/:id`
- **Auth**: Optional
- **Description**: Get partner details
- **Response**: Partner object

---

## 🌟 Ambassadors (`/api/ambassadors`)

### Get Ambassadors
- **GET** `/api/ambassadors`
- **Auth**: Optional
- **Description**: Get approved ambassadors
- **Query**: `{ page?, limit? }`
- **Response**: Ambassadors array with pagination

### Get Ambassador Details
- **GET** `/api/ambassadors/:id`
- **Auth**: Optional
- **Description**: Get ambassador details
- **Response**: Ambassador object

---

## 🔧 Admin (`/api/admin`)

### Dashboard Statistics
- **GET** `/api/admin/dashboard`
- **Auth**: Required, Admin
- **Description**: Get admin dashboard statistics with revenue trends, order/payment distributions, and growth metrics
- **Response**: 
  - `statistics`: Total users, orders, revenue, products
  - `recent_orders`: Last 10 orders
  - `top_products`: Top selling products
  - `membership_distribution`: Membership type breakdown
  - `revenue_trends`: Time-based revenue trends (daily - last 30 days, weekly - last 12 weeks, monthly - last 12 months)
  - `order_status_distribution`: Order status breakdown with counts and percentages
  - `payment_status_distribution`: Payment status breakdown with counts and amounts
  - `growth_metrics`: Period-over-period growth metrics (users, orders, revenue) with change percentages and trends

### Get Users
- **GET** `/api/admin/users`
- **Auth**: Required, Admin
- **Description**: Get all users with filters
- **Query**: `{ page?, limit?, search?, membership_type?, email_verified? }`
- **Response**: Users array with pagination

### Get User Details
- **GET** `/api/admin/users/:id`
- **Auth**: Required, Admin
- **Description**: Get detailed user information with orders, order items, and payments
- **Response**: User, orders, orderItems, payments objects

### Update User Membership
- **PUT** `/api/admin/users/:id/membership`
- **Auth**: Required, Admin
- **Description**: Update user membership type and points
- **Body**: `{ membership_type, membership_points? }`
- **Response**: Updated user object

### Get Orders
- **GET** `/api/admin/orders`
- **Auth**: Required, Admin
- **Description**: Get all orders with filters
- **Query**: `{ page?, limit?, status?, payment_status?, user_id? }`
- **Response**: Orders array with pagination

### Get Order Details
- **GET** `/api/admin/orders/:id`
- **Auth**: Required, Admin
- **Description**: Get detailed order information for admin
- **Response**: Order, orderItems, payments, shippingAddress objects

### Update Order Status
- **PUT** `/api/admin/orders/:id/status`
- **Auth**: Required, Admin
- **Description**: Update order status and tracking number
- **Body**: `{ status, tracking_number? }`
- **Response**: Updated order object

### Get Products
- **GET** `/api/admin/products`
- **Auth**: Required, Admin
- **Description**: Get all products (both parts and merchandise) with filters
- **Query**: `{ page?, limit?, search?, category_id?, brand_id?, min_price?, max_price?, color?, size?, sort?, order?, in_stock? }`
- **Response**: Parts and merchandise arrays with separate pagination

### Create Part
- **POST** `/api/admin/parts`
- **Auth**: Required, Admin
- **Description**: Create new part
- **Body**: `{ brand_id, category_id, name, description?, original_price, selling_price, quantity, sku?, weight?, images?, color_options?, compatibility? }`
- **Response**: Created part object

### Get Part Details
- **GET** `/api/admin/parts/:id`
- **Auth**: Required, Admin
- **Description**: Get part details
- **Response**: Part object

### Update Part
- **PUT** `/api/admin/parts/:id`
- **Auth**: Required, Admin
- **Description**: Update part information
- **Body**: `{ name?, description?, original_price?, selling_price?, quantity?, sku?, weight?, images?, color_options?, compatibility? }`
- **Response**: Success message

### Delete Part
- **DELETE** `/api/admin/parts/:id`
- **Auth**: Required, Admin
- **Description**: Delete a part
- **Response**: Success message

### Create Merchandise
- **POST** `/api/admin/merchandise`
- **Auth**: Required, Admin
- **Description**: Create new merchandise
- **Body**: `{ name, description?, price, quantity, sku?, weight?, images?, size_options?, color_options? }`
- **Response**: Created merchandise object

### Get Merchandise Details
- **GET** `/api/admin/merchandise/:id`
- **Auth**: Required, Admin
- **Description**: Get merchandise details
- **Response**: Merchandise object

### Update Merchandise
- **PUT** `/api/admin/merchandise/:id`
- **Auth**: Required, Admin
- **Description**: Update merchandise information
- **Body**: `{ name?, description?, price?, quantity?, sku?, weight?, images?, size_options?, color_options? }`
- **Response**: Success message

### Delete Merchandise
- **DELETE** `/api/admin/merchandise/:id`
- **Auth**: Required, Admin
- **Description**: Delete merchandise
- **Response**: Success message

### Create Brand
- **POST** `/api/admin/brands`
- **Auth**: Required, Admin
- **Description**: Create new brand
- **Body**: `{ name, description?, logo_url? }`
- **Response**: Created brand object

### Update Brand
- **PUT** `/api/admin/brands/:id`
- **Auth**: Required, Admin
- **Description**: Update brand information
- **Body**: `{ name?, description?, logo_url? }`
- **Response**: Updated brand object

### Delete Brand
- **DELETE** `/api/admin/brands/:id`
- **Auth**: Required, Admin
- **Description**: Delete brand (only if no associated parts)
- **Response**: Success message

### Create Category
- **POST** `/api/admin/categories`
- **Auth**: Required, Admin
- **Description**: Create new category
- **Body**: `{ name, description?, parent_id?, image_url? }`
- **Response**: Created category object

### Update Category
- **PUT** `/api/admin/categories/:id`
- **Auth**: Required, Admin
- **Description**: Update category information
- **Body**: `{ name?, description?, parent_id?, image_url? }`
- **Response**: Updated category object

### Delete Category
- **DELETE** `/api/admin/categories/:id`
- **Auth**: Required, Admin
- **Description**: Delete category (only if no associated parts or subcategories)
- **Response**: Success message

### Get Feedback
- **GET** `/api/admin/feedback`
- **Auth**: Required, Admin
- **Description**: Get all feedback with filters
- **Query**: `{ page?, limit?, feedback_type? }`
- **Response**: Feedback array with pagination

### Get Ambassador Applications
- **GET** `/api/admin/ambassadors`
- **Auth**: Required, Admin
- **Description**: Get all ambassador applications
- **Query**: `{ page?, limit?, status? }`
- **Response**: Applications array with pagination

### Update Ambassador Status
- **PUT** `/api/admin/ambassadors/:id/status`
- **Auth**: Required, Admin
- **Description**: Update ambassador application status
- **Body**: `{ status: 'pending' | 'approved' | 'rejected', admin_notes? }`
- **Response**: Updated application object

---

## Health Check

### Health Check
- **GET** `/health`
- **Description**: Check server health and uptime
- **Response**: Server status, timestamp, uptime

---

## Notes

- All pagination parameters default to `page=1` and `limit=20` unless specified
- All date/timestamp fields are in ISO 8601 format
- All UUID fields use standard UUID v4 format
- Error responses follow the format: `{ error: "Error message", details?: {...} }`
- Successful responses typically include the requested data or a success message

---

## Response Format

### Success Response
```json
{
  "data": {...},
  "message": "Success message"
}
```

### Error Response
```json
{
  "error": "Error message",
  "details": {...}
}
```

### Pagination Response
```json
{
  "items": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

