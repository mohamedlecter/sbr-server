# SBR Bike E-commerce Server

A comprehensive Node.js server with PostgreSQL for a bike e-commerce platform featuring parts, merchandise, custom bike building, and membership system.

## Features

### 🔐 Authentication & User Management
- User registration with email/SMS verification
- Secure login with JWT tokens
- Password reset functionality
- Profile management
- Multiple shipping addresses
- Membership system (Silver, Gold, Diamond, Platinum, Garage)

### 🛍️ Product Management
- Browse parts by category and brand
- Advanced search and filtering
- Product details with images and specifications
- Merchandise catalog
- Stock management

### 🛒 Shopping & Orders
- Shopping cart functionality
- Checkout process with multiple payment methods
- Order tracking and status updates
- Order history
- Membership discounts

### 💳 Payment Processing
- Multiple payment gateways (Stripe, Sadad, PayPal)
- Cash on delivery
- Pay later option
- Payment history
- Refund processing

### 🏗️ Custom Bike Builder
- Build custom bikes by selecting compatible parts
- Save bike configurations
- Unpainted and painted body kit options

### 👥 Community Features
- User feedback system
- Brand ambassador applications
- Partner directory
- Public feedback display

### 🔧 Admin Panel
- Dashboard with analytics
- User management
- Product management
- Order management
- Payment tracking
- Feedback and ambassador management

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MySQL
- **Authentication**: JWT, bcryptjs
- **Payment**: Stripe, Sadad, PayPal
- **Email**: Nodemailer
- **SMS**: Twilio
- **Validation**: express-validator, Joi
- **Security**: Helmet, CORS, Rate limiting

## Prerequisites

- Node.js (v14 or higher)
- MySQL (v8.0 or higher)
- npm or yarn

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd sbr-server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` file with your configuration:
   ```env
   NODE_ENV=development
   PORT=3000
   
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=sbr_ecommerce
   DB_USER=root
   DB_PASSWORD=your_password
   
   # JWT Configuration
   JWT_SECRET=your_super_secret_jwt_key_here
   JWT_EXPIRES_IN=7d
   
   # Email Configuration
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_app_password
   
   # SMS Configuration (Twilio)
   TWILIO_ACCOUNT_SID=your_twilio_account_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_PHONE_NUMBER=your_twilio_phone_number
   
   # Payment Gateway Configuration
   STRIPE_SECRET_KEY=your_stripe_secret_key
   STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
   ```

4. **Set up MySQL database**
   ```sql
   -- Create database in MySQL Workbench
   CREATE DATABASE sbr_ecommerce;
   
   -- Run migrations
   npm run migrate
   
   -- Seed sample data
   npm run seed
   ```

5. **Start the server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/verify` - Verify account
- `POST /api/auth/login` - User login
- `POST /api/auth/request-password-reset` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `PUT /api/users/change-password` - Change password
- `GET /api/users/addresses` - Get user addresses
- `POST /api/users/addresses` - Add new address
- `PUT /api/users/addresses/:id` - Update address
- `DELETE /api/users/addresses/:id` - Delete address
- `GET /api/users/orders` - Get user orders

### Products
- `GET /api/products/categories` - Get all categories
- `GET /api/products/categories/:id` - Get category with products
- `GET /api/products/brands` - Get all brands
- `GET /api/products/brands/:id` - Get brand with products
- `GET /api/products/parts` - Search and filter parts
- `GET /api/products/parts/:id` - Get part details
- `GET /api/products/merchandise` - Get merchandise
- `GET /api/products/merchandise/:id` - Get merchandise details

### Cart & Orders
- `GET /api/cart` - Get user's cart
- `POST /api/cart/add` - Add item to cart
- `PUT /api/cart/update/:id` - Update cart item
- `DELETE /api/cart/remove/:id` - Remove from cart
- `DELETE /api/cart/clear` - Clear cart
- `GET /api/cart/checkout-summary` - Get checkout summary
- `POST /api/orders/create` - Create new order
- `GET /api/orders` - Get user orders
- `GET /api/orders/:id` - Get order details
- `PUT /api/orders/:id/cancel` - Cancel order
- `GET /api/orders/:id/track` - Track order

### Payments
- `POST /api/payments/process` - Process payment
- `GET /api/payments/methods` - Get payment methods
- `GET /api/payments/history` - Get payment history
- `POST /api/payments/refund` - Refund payment

### Admin
- `GET /api/admin/dashboard` - Get dashboard statistics
- `GET /api/admin/users` - Get all users
- `PUT /api/admin/users/:id/membership` - Update user membership
- `GET /api/admin/orders` - Get all orders
- `PUT /api/admin/orders/:id/status` - Update order status
- `GET /api/admin/products` - Get all products
- `POST /api/admin/parts` - Create new part
- `POST /api/admin/merchandise` - Create new merchandise
- `GET /api/admin/feedback` - Get all feedback
- `GET /api/admin/ambassadors` - Get ambassador applications
- `PUT /api/admin/ambassadors/:id/status` - Update ambassador status

### Feedback & Community
- `POST /api/feedback/feedback` - Submit feedback
- `GET /api/feedback/public` - Get public feedback
- `GET /api/feedback/my` - Get user's feedback
- `POST /api/feedback/ambassadors/apply` - Apply as ambassador
- `GET /api/feedback/ambassadors/my` - Get user's ambassador application
- `PUT /api/feedback/ambassadors/my` - Update ambassador application
- `GET /api/feedback/ambassadors/approved` - Get approved ambassadors

### Partners
- `GET /api/partners` - Get all partners
- `GET /api/partners/:id` - Get partner details

### Ambassadors
- `GET /api/ambassadors` - Get approved ambassadors
- `GET /api/ambassadors/:id` - Get ambassador details

## Database Schema

The database includes the following main tables:

- **users** - User accounts and membership information
- **addresses** - User shipping addresses
- **brands** - Product brands
- **categories** - Product categories (with hierarchical support)
- **parts** - Bike parts and components
- **merchandise** - Apparel and accessories
- **orders** - Customer orders
- **order_items** - Items within orders
- **payments** - Payment records
- **feedbacks** - User feedback and reviews
- **partners** - Business partners
- **ambassadors** - Brand ambassador applications
- **cart_items** - Shopping cart items
- **custom_builds** - Custom bike configurations

## Membership System

The platform features a tiered membership system:

- **Silver** - Basic membership (0% discount)
- **Gold** - 5% discount, 1.2x points
- **Diamond** - 10% discount, 1.5x points
- **Platinum** - 15% discount, 2x points
- **Garage** - 20% discount, 2.5x points

Users earn points with each purchase and can upgrade their membership based on accumulated points.

## Payment Methods

The platform supports multiple payment methods:

- **Stripe** - Credit/Debit cards
- **Sadad** - Saudi payment gateway
- **PayPal** - PayPal payments
- **Cash on Delivery** - Pay when delivered
- **Pay Later** - Pay after delivery

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting
- CORS protection
- Helmet security headers
- Input validation and sanitization
- SQL injection prevention

## Development

### Running Tests
```bash
npm test
```

### Database Migrations
```bash
npm run migrate
```

### Seeding Database
```bash
npm run seed
```

### Code Linting
```bash
npm run lint
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License.

## Support

For support and questions, please contact the development team or create an issue in the repository.
