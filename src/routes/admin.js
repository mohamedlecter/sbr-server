const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../database/connection');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { paginate, sanitizeString } = require('../utils/helpers');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Get admin dashboard statistics
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Get various statistics
    const [
      totalUsers,
      totalOrders,
      totalRevenue,
      totalProducts,
      recentOrders,
      topProducts,
      membershipStats
    ] = await Promise.all([
      query('SELECT COUNT(*) as count FROM users'),
      query('SELECT COUNT(*) as count FROM orders'),
      query('SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE payment_status = ?', ['paid']),
      query('SELECT COUNT(*) as count FROM parts WHERE is_active = true'),
      query(`
        SELECT o.*, u.full_name, u.email
        FROM orders o
        JOIN users u ON o.user_id = u.id
        ORDER BY o.created_at DESC
        LIMIT 10
      `),
      query(`
        SELECT p.name, b.name as brand_name, SUM(oi.quantity) as total_sold
        FROM order_items oi
        JOIN parts p ON oi.product_type = 'part' AND oi.product_id = p.id
        JOIN brands b ON p.brand_id = b.id
        GROUP BY p.id, p.name, b.name
        ORDER BY total_sold DESC
        LIMIT 10
      `),
      query(`
        SELECT membership_type, COUNT(*) as count
        FROM users
        GROUP BY membership_type
        ORDER BY count DESC
      `)
    ]);

    res.json({
      statistics: {
        total_users: parseInt(totalUsers.rows[0].count),
        total_orders: parseInt(totalOrders.rows[0].count),
        total_revenue: parseFloat(totalRevenue.rows[0].total),
        total_products: parseInt(totalProducts.rows[0].count)
      },
      recent_orders: recentOrders.rows,
      top_products: topProducts.rows,
      membership_distribution: membershipStats.rows
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users with pagination and filters
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, membership_type, email_verified } = req.query;
    const { offset, limit: queryLimit } = paginate(page, limit);

    let whereConditions = [];
    let queryParams = [];

    if (search) {
      whereConditions.push(`(LOWER(u.full_name) LIKE ? OR LOWER(u.email) LIKE ?)`);
      queryParams.push(`%${sanitizeString(search).toLowerCase()}%`);
      queryParams.push(`%${sanitizeString(search).toLowerCase()}%`);
    }

    if (membership_type) {
      whereConditions.push(`u.membership_type = ?`);
      queryParams.push(membership_type);
    }

    if (email_verified !== undefined) {
      whereConditions.push(`u.email_verified = ?`);
      queryParams.push(email_verified === 'true' ? 1 : 0);
    }

    const whereClause = whereConditions.length > 0 ? `AND ${whereConditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT 
          u.*, 
          COUNT(o.id) AS order_count, 
          COALESCE(SUM(o.total_amount), 0) AS total_spent
        FROM users u
        LEFT JOIN orders o ON u.id = o.user_id
        WHERE u.is_admin = false
        ${whereClause}
        GROUP BY u.id
        ORDER BY u.created_at DESC
        LIMIT ${queryLimit} OFFSET ${offset}`,
      queryParams
    );

    const users = result.rows.map(user => {
      const { password_hash, ...otherFields } = user;
      return otherFields;
    });

    const countResult = await query(
      `SELECT COUNT(*) as total FROM users u WHERE u.is_admin = false ${whereClause}`,
      queryParams
    );

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM users WHERE id = ?', [id]);
    const user = result.rows[0];
    const ordersResult = await query('SELECT * FROM orders WHERE user_id = ?', [id]);
    const orders = ordersResult.rows;
    const orderItemsResult = await query('SELECT oi.*, p.name as part_name, m.name as merchandise_name FROM order_items oi LEFT JOIN parts p ON oi.product_type = "part" AND oi.product_id = p.id LEFT JOIN merchandise m ON oi.product_type = "merch" AND oi.product_id = m.id WHERE oi.order_id IN (SELECT id FROM orders WHERE user_id = ?)', [id]);
    const orderItems = orderItemsResult.rows;
    const paymentsResult = await query('SELECT * FROM payments WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)', [id]);
    const payments = paymentsResult.rows;
    res.json({ user, orders, orderItems, payments });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user membership
router.put('/users/:id/membership', authenticateToken, requireAdmin, [
  body('membership_type').isIn(['silver', 'gold', 'diamond', 'platinum', 'garage']).withMessage('Valid membership type is required'),
  body('membership_points').optional().isInt({ min: 0 }).withMessage('Membership points must be non-negative')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { membership_type, membership_points } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    updates.push(`membership_type = $${paramCount}`);
    values.push(membership_type);
    paramCount++;

    if (membership_points !== undefined) {
      updates.push(`membership_points = $${paramCount}`);
      values.push(membership_points);
      paramCount++;
    }

    values.push(id);
    const queryText = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

    const result = await query(queryText, values);
    console.log("result", result);
    res.json({
      message: 'User membership updated successfully',
      user: result
    });
  } catch (error) {
    console.error('Update user membership error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all orders with filters
router.get('/orders', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, payment_status, user_id } = req.query;
    const { offset, limit: queryLimit } = paginate(page, limit);

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 1;

    if (status) {
      whereConditions.push(`o.status = ?`);
      queryParams.push(status);
      paramCount++;
    }

    if (payment_status) {
      whereConditions.push(`o.payment_status = ?`);
      queryParams.push(payment_status);
      paramCount++;
    }

    if (user_id) {
      whereConditions.push(`o.user_id = ?`);
      queryParams.push(user_id);
      paramCount++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT o.*, u.full_name, u.email, a.label as shipping_address_label, a.city, a.country
       FROM orders o
       JOIN users u ON o.user_id = u.id
       JOIN addresses a ON o.shipping_address_id = a.id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT ${queryLimit} OFFSET ${offset}`,
      queryParams
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM orders o ${whereClause}`,
      queryParams
    );

    res.json({
      orders: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/orders/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const orderResult = await query('SELECT * FROM orders WHERE id = ?', [id]);
    const order = orderResult.rows[0];
    
    const orderItemsResult = await query('SELECT oi.*, p.name as part_name, m.name as merchandise_name FROM order_items oi LEFT JOIN parts p ON oi.product_type = "part" AND oi.product_id = p.id LEFT JOIN merchandise m ON oi.product_type = "merch" AND oi.product_id = m.id WHERE oi.order_id = ?', [id]);
    const orderItems = orderItemsResult.rows;
    
    
    const paymentsResult = await query('SELECT * FROM payments WHERE order_id = ?', [id]);
    const payments = paymentsResult.rows;
    
    const shippingAddressResult = await query('SELECT * FROM addresses WHERE id = ?', [order.shipping_address_id]);
    const shippingAddress = shippingAddressResult.rows[0];
    
    res.json({ order, orderItems, payments, shippingAddress });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Update order status
router.put('/orders/:id/status', authenticateToken, requireAdmin, [
  body('status').isIn(['pending', 'paid', 'shipped', 'delivered', 'cancelled']).withMessage('Valid order status is required'),
  body('tracking_number').optional().isString().withMessage('Tracking number must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status, tracking_number } = req.body;

    const updates = [`status = ?`];
    const values = [status];
    let paramCount = 2;

    if (tracking_number) {
      updates.push(`tracking_number = $${paramCount}`);
      values.push(tracking_number);
      paramCount++;
    }

    values.push(id);
    const queryText = `UPDATE orders SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

    const result = await query(queryText, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      message: 'Order status updated successfully',
      order: result.rows[0]
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Get all products (parts and merchandise)
router.get('/products', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Shared query params
    const { 
      page = 1, 
      limit = 20, 
      search, 
      category_id, 
      brand_id, 
      min_price, 
      max_price, 
      color, 
      size,
      sort = 'name', 
      order = 'asc',
      in_stock = false 
    } = req.query;

    // Parts query setup
    const { offset: partsOffset, limit: partsQueryLimit } = paginate(page, limit);
    let partsWhere = ['p.is_active = true'];
    let partsParams = [];

    if (search) {
      partsWhere.push(`(LOWER(p.name) LIKE ? OR LOWER(p.description) LIKE ?)`);
      partsParams.push(`%${sanitizeString(search).toLowerCase()}%`);
      partsParams.push(`%${sanitizeString(search).toLowerCase()}%`);
    }
    if (category_id) {
      partsWhere.push(`p.category_id = ?`);
      partsParams.push(parseInt(category_id, 10));
    }
    if (brand_id) {
      partsWhere.push(`p.brand_id = ?`);
      partsParams.push(parseInt(brand_id, 10));
    }
    if (min_price) {
      partsWhere.push(`p.selling_price >= ?`);
      partsParams.push(parseFloat(min_price));
    }
    if (max_price) {
      partsWhere.push(`p.selling_price <= ?`);
      partsParams.push(parseFloat(max_price));
    }
    if (color) {
      partsWhere.push(`JSON_SEARCH(color_options, 'one', ?) IS NOT NULL`);
      partsParams.push(color);
    }
    const partsValidSort = ['name', 'selling_price', 'created_at', 'original_price'];
    const partsSortField = partsValidSort.includes(sort) ? sort : 'name';
    const partsSortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const partsWhereClause = partsWhere.length > 0 ? `WHERE ${partsWhere.join(' AND ')}` : '';
    const partsSql = `
      SELECT p.*, b.name as brand_name, b.logo_url as brand_logo, c.name as category_name
      FROM parts p
      JOIN brands b ON p.brand_id = b.id
      JOIN categories c ON p.category_id = c.id
      ${partsWhereClause}
      ORDER BY p.${partsSortField} ${partsSortOrder}
      LIMIT ${partsQueryLimit} OFFSET ${partsOffset}
    `;
    const partsCountSql = `
      SELECT COUNT(*)
      FROM parts p
      JOIN brands b ON p.brand_id = b.id
      JOIN categories c ON p.category_id = c.id
      ${partsWhereClause}
    `;

    // Merchandise query setup
    const { offset: merchOffset, limit: merchQueryLimit } = paginate(page, limit);
    let merchWhere = ['m.is_active = 1'];
    let merchParams = [];
    
    if (search) {
      merchWhere.push(`(LOWER(m.name) LIKE ? OR LOWER(m.description) LIKE ?)`);
      merchParams.push(`%${sanitizeString(search).toLowerCase()}%`);
      merchParams.push(`%${sanitizeString(search).toLowerCase()}%`);
    }
    if (min_price) {
      merchWhere.push(`m.price >= ?`);
      merchParams.push(parseFloat(min_price));
    }
    if (max_price) {
      merchWhere.push(`m.price <= ?`);
      merchParams.push(parseFloat(max_price));
    }
    if (color) {
      merchWhere.push(`JSON_SEARCH(color_options, 'one', ?) IS NOT NULL`);
      merchParams.push(color);
    }
    if (size) {
      merchWhere.push(`JSON_SEARCH(size_options, 'one', ?) IS NOT NULL`);
      merchParams.push(size);
    }
    if (in_stock === 'true') {
      merchWhere.push(`m.quantity > 0`);
    }
    
    const merchWhereClause = merchWhere.length ? `WHERE ${merchWhere.join(' AND ')}` : '';
    const validSortFields = ['name', 'price', 'created_at'];
    const sortField = validSortFields.includes(sort) ? sort : 'name';
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const merchSql = `
    SELECT m.*
    FROM merchandise m
    ${merchWhereClause}
    ORDER BY m.${sortField} ${sortOrder}
    LIMIT ${merchQueryLimit} OFFSET ${merchOffset}  
    `;
    const merchCountSql = `
SELECT COUNT(*) AS count FROM merchandise m ${merchWhereClause}
    `;

    const [partsRows, partsCountResult, merchRows, merchCountResult] = await Promise.all([
      query(partsSql),
      query(partsCountSql, partsParams),
      query(merchSql),
      query(merchCountSql, merchParams)
    ]);
    

    res.json({
      parts: partsRows.rows,
      merchandise: merchRows.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(partsCountResult.rows[0]['COUNT(*)']),
        pages: Math.ceil(partsCountResult.rows[0]['COUNT(*)'] / limit)
      },
      merchandise_pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(merchCountResult.rows[0]['COUNT(*)']),
        pages: Math.ceil(merchCountResult.rows[0]['COUNT(*)'] / limit)
      },
      filters: { search, category_id, brand_id, min_price, max_price, color, size, in_stock, sort, order }
    });
    
  } catch (error) {
    console.error('Get products (unified) error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Create new part
router.post('/parts', authenticateToken, requireAdmin, [
  body('brand_id').isUUID().withMessage('Valid brand ID is required'),
  body('category_id').isUUID().withMessage('Valid category ID is required'),
  body('name').trim().notEmpty().withMessage('Part name is required'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('original_price').isFloat({ min: 0 }).withMessage('Original price must be positive'),
  body('selling_price').isFloat({ min: 0 }).withMessage('Selling price must be positive'),
  body('quantity').isInt({ min: 0 }).withMessage('Quantity must be non-negative'),
  body('sku').optional().isString().withMessage('SKU must be a string'),
  body('weight').optional().isFloat({ min: 0 }).withMessage('Weight must be positive'),
  body('images').optional().isArray().withMessage('Images must be an array'),
  body('color_options').optional().isArray().withMessage('Color options must be an array'),
  body('compatibility').optional().isArray().withMessage('Compatibility must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      brand_id, category_id, name, description, original_price, selling_price,
      quantity, sku, weight, images = [], color_options = [], compatibility = []
    } = req.body;

    const id = uuidv4();

    // Verify brand and category exist
    const [brandResult, categoryResult] = await Promise.all([
      query('SELECT id FROM brands WHERE id = ?', [brand_id]),
      query('SELECT id FROM categories WHERE id = ?', [category_id])
    ]);

    if (brandResult.rows.length === 0) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

     await query(
      `INSERT INTO parts (id, brand_id, category_id, name, description, original_price, selling_price, 
                         quantity, sku, weight, images, color_options, compatibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       `,
      [id, brand_id, category_id, sanitizeString(name), description, original_price, selling_price,
       quantity, sku, weight, JSON.stringify(images), JSON.stringify(color_options), JSON.stringify(compatibility)]
    );

    const partResult = await query('SELECT * FROM parts WHERE id = ?', [id]);

    res.status(201).json({
      message: 'Part created successfully',
      part: partResult.rows[0]
    });
  } catch (error) {
    console.error('Create part error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Create new merchandise
router.post('/merchandise', authenticateToken, requireAdmin, [
  body('name').trim().notEmpty().withMessage('Merchandise name is required'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be positive'),
  body('quantity').isInt({ min: 0 }).withMessage('Quantity must be non-negative'),
  body('sku').optional().isString().withMessage('SKU must be a string'),
  body('weight').optional().isFloat({ min: 0 }).withMessage('Weight must be positive'),
  body('images').optional().isArray().withMessage('Images must be an array'),
  body('size_options').optional().isArray().withMessage('Size options must be an array'),
  body('color_options').optional().isArray().withMessage('Color options must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name, description, price, quantity, sku, weight,
      images = [], size_options = [], color_options = []
    } = req.body;

    const result = await query(
      `INSERT INTO merchandise (name, description, price, quantity, sku, weight, images, size_options, color_options)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [sanitizeString(name), description, price, quantity, sku, weight,
       JSON.stringify(images), JSON.stringify(size_options), JSON.stringify(color_options)]
    );

    res.status(201).json({
      message: 'Merchandise created successfully',
      merchandise: result.rows[0]
    });
  } catch (error) {
    console.error('Create merchandise error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/parts/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM parts WHERE id = ?', [id]);
    res.json({ part: result.rows[0] });
  } catch (error) {
    console.error('Get part error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/merchandise/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM merchandise WHERE id = ?', [id]);
    res.json({ merchandise: result.rows[0] });
  } catch (error) {
    console.error('Get merchandise error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/parts/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ['name','description','original_price','selling_price','quantity','sku','weight','images','color_options','compatibility'];
    const updates = [];
    const params = [];

    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        if (['images','color_options','compatibility'].includes(field)) {
          params.push(JSON.stringify(req.body[field]));
        } else {
          params.push(req.body[field]);
        }
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields provided for update' });
    }

    params.push(id); // for WHERE clause
    const sql = `UPDATE parts SET ${updates.join(', ')} WHERE id = ?`;

    await query(sql, params);

    res.json({ message: 'Part updated successfully' });

  } catch (error) {
    console.error('Update part error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/merchandise/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ['name','description','price','quantity','sku','weight','images','size_options','color_options'];
    const updates = [];
    const params = [];

    // Build update query dynamically based on provided fields
    fields.forEach(field => {
      if (req.body.hasOwnProperty(field)) {
        updates.push(`${field} = ?`);
        let value = req.body[field];

        // If arrays, stringify
        if (['images','size_options','color_options'].includes(field)) {
          value = value ? JSON.stringify(value) : null;
        }

        // Convert undefined to null for SQL
        params.push(value !== undefined ? value : null);
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields provided for update' });
    }

    params.push(id); // for WHERE clause
    const sql = `UPDATE merchandise SET ${updates.join(', ')} WHERE id = ?`;

    await query(sql, params);

    res.json({
      message: 'Merchandise updated successfully',
    });

  } catch (error) {
    console.error('Update merchandise error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/parts/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM parts WHERE id = ?', [id]);
    res.json({ message: 'Part deleted successfully' });
  } catch (error) {
    console.error('Delete part error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/merchandise/:id', authenticateToken, requireAdmin, async (req, res) => {

  try {
    const { id } = req.params;
    await query('DELETE FROM merchandise WHERE id = ?', [id]);
    res.json({ message: 'Merchandise deleted successfully' });
  } catch (error) {
    console.error('Delete merchandise error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new brand
router.post('/brands',
  authenticateToken,
  requireAdmin,
  body('name').trim().notEmpty().withMessage('Brand name is required'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('logo_url').optional().isURL().withMessage('Logo URL must be a valid URL'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, description, logo_url } = req.body;

      // Generate a UUID manually since your table uses UUIDs
      const id = uuidv4();

      // Insert the new brand
      await query(
        'INSERT INTO brands (id, name, description, logo_url) VALUES (?, ?, ?, ?)',
        [id, sanitizeString(name), description ?? null, logo_url ?? null]
      );

      // Retrieve the newly created brand
      const brandResult = await query('SELECT * FROM brands WHERE id = ?', [id]);

      res.status(201).json({
        message: 'Brand created successfully',
        brand: brandResult.rows[0],
      });
    } catch (error) {
      console.error('Create brand error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Update brand
router.put('/brands/:id', authenticateToken, requireAdmin, [
  body('name').optional().trim().notEmpty().withMessage('Brand name cannot be empty'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('logo_url').optional().isURL().withMessage('Logo URL must be a valid URL')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, description, logo_url } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount}`);
      values.push(sanitizeString(name));
      paramCount++;
    }

    if (description !== undefined) {
      updates.push(`description = $${paramCount}`);
      values.push(description);
      paramCount++;
    }

    if (logo_url !== undefined) {
      updates.push(`logo_url = $${paramCount}`);
      values.push(logo_url);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const queryText = `UPDATE brands SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

    const result = await query(queryText, values);

    res.json({
      message: 'Brand updated successfully',
      brand: result
    });
  } catch (error) {
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ error: 'Brand with this name already exists' });
    }
    console.error('Update brand error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete brand
router.delete('/brands/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if brand has associated parts
    const partsResult = await query(
      'SELECT COUNT(*) FROM parts WHERE brand_id = ?',
      [id]
    );

    if (parseInt(partsResult.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete brand',
        message: 'Brand has associated parts. Please remove all parts first.'
      });
    }

    const result = await query(
      'DELETE FROM brands WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    res.json({ message: 'Brand deleted successfully' });
  } catch (error) {
    console.error('Delete brand error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new category
router.post('/categories', authenticateToken, requireAdmin, [
  body('name').trim().notEmpty().withMessage('Category name is required'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('parent_id').optional().isUUID().withMessage('Parent ID must be a valid UUID'),
  body('image_url').optional().isURL().withMessage('Image URL must be a valid URL')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, parent_id, image_url } = req.body;

    const id = uuidv4();

    // Verify parent category exists if provided
    if (parent_id) {
      const parentResult = await query(
        'SELECT id FROM categories WHERE id = ?',
        [parent_id]
      );

      if (parentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Parent category not found' });
      }
    }

    await query(
      'INSERT INTO categories (id, name, description, parent_id, image_url) VALUES (?, ?, ?, ?, ?)',
      [id, sanitizeString(name), description ?? null, parent_id ?? null, image_url ?? null]
    );

    const categoryResult = await query('SELECT * FROM categories WHERE id = ?', [id]);

    res.status(201).json({
      message: 'Category created successfully',
      category: categoryResult.rows[0]
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update category
router.put('/categories/:id', authenticateToken, requireAdmin, [
  body('name').optional().trim().notEmpty().withMessage('Category name cannot be empty'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('parent_id').optional().isUUID().withMessage('Parent ID must be a valid UUID'),
  body('image_url').optional().isURL().withMessage('Image URL must be a valid URL')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, description, parent_id, image_url } = req.body;

    // Prevent circular reference
    if (parent_id === id) {
      return res.status(400).json({ error: 'Category cannot be its own parent' });
    }

    // Verify parent category exists if provided
    if (parent_id) {
      const parentResult = await query(
        'SELECT id FROM categories WHERE id = ? AND id != ?',
        [parent_id, id]
      );

      if (parentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Parent category not found' });
      }
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount}`);
      values.push(sanitizeString(name));
      paramCount++;
    }

    if (description !== undefined) {
      updates.push(`description = $${paramCount}`);
      values.push(description);
      paramCount++;
    }

    if (parent_id !== undefined) {
      updates.push(`parent_id = $${paramCount}`);
      values.push(parent_id);
      paramCount++;
    }

    if (image_url !== undefined) {
      updates.push(`image_url = $${paramCount}`);
      values.push(image_url);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const queryText = `UPDATE categories SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

    const result = await query(queryText, values);

    res.json({
      message: 'Category updated successfully',
      category: result
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete category
router.delete('/categories/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if category has associated parts
    const partsResult = await query(
      'SELECT COUNT(*) FROM parts WHERE category_id = ?',
      [id]
    );

    if (parseInt(partsResult.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete category',
        message: 'Category has associated parts. Please remove all parts first.'
      });
    }

    // Check if category has child categories
    const childrenResult = await query(
      'SELECT COUNT(*) FROM categories WHERE parent_id = ?',
      [id]
    );

    if (parseInt(childrenResult.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete category',
        message: 'Category has subcategories. Please remove all subcategories first.'
      });
    }

    const result = await query(
      'DELETE FROM categories WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all feedback
router.get('/feedback', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, feedback_type } = req.query;
    const { offset, limit: queryLimit } = paginate(page, limit);

    let whereClause = '';
    let queryParams = [];
    let paramCount = 1;

    if (feedback_type) {
      whereClause = `WHERE f.feedback_type = ?`;
      queryParams.push(feedback_type);
      paramCount++;
    }

    const result = await query(
      `SELECT f.*, u.full_name, u.email
       FROM feedbacks f
       JOIN users u ON f.user_id = u.id
       ${whereClause}
       ORDER BY f.created_at DESC
       LIMIT ${queryLimit} OFFSET ${offset}`,
      queryParams
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM feedbacks f ${whereClause}`,
      queryParams
    );

    res.json({
      feedback: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get ambassador applications
router.get('/ambassadors', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const { offset, limit: queryLimit } = paginate(page, limit);

    let whereClause = '';
    let queryParams = [];
    let paramCount = 1;

    if (status) {
      whereClause = `WHERE a.status = ?`;
      queryParams.push(status);
      paramCount++;
    }

    const result = await query(
      `SELECT a.*, u.full_name, u.email, u.phone
       FROM ambassadors a
       JOIN users u ON a.user_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT ${queryLimit} OFFSET ${offset}`,
      queryParams
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM ambassadors a ${whereClause}`,
      queryParams
    );

    res.json({
      ambassadors: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Get ambassadors error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update ambassador application status
router.put('/ambassadors/:id/status', authenticateToken, requireAdmin, [
  body('status').isIn(['pending', 'approved', 'rejected']).withMessage('Valid status is required'),
  body('admin_notes').optional().isString().withMessage('Admin notes must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status, admin_notes } = req.body;

    const updates = [`status = ?`];
    const values = [status];

    if (admin_notes) {
      updates.push(`admin_notes = ?`);
      values.push(admin_notes);
    }

    values.push(id);
    const queryText = `UPDATE ambassadors SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

    const result = await query(queryText, values);
    console.log("result", result);
    res.json({
      message: 'Ambassador application status updated successfully',
      ambassador: result
    });
  } catch (error) {
    console.error('Update ambassador status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
