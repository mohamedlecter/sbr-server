const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../database/connection');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { paginate, sanitizeString } = require('../utils/helpers');

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
    const { offset, queryLimit } = paginate(page, limit);

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 1;

    if (search) {
      whereConditions.push(`(u.full_name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`);
      queryParams.push(`%${sanitizeString(search)}%`);
      paramCount++;
    }

    if (membership_type) {
      whereConditions.push(`u.membership_type = $${paramCount}`);
      queryParams.push(membership_type);
      paramCount++;
    }

    if (email_verified !== undefined) {
      whereConditions.push(`u.email_verified = $${paramCount}`);
      queryParams.push(email_verified === 'true');
      paramCount++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT u.*, COUNT(o.id) as order_count, COALESCE(SUM(o.total_amount), 0) as total_spent
       FROM users u
       LEFT JOIN orders o ON u.id = o.user_id
       ${whereClause}
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...queryParams, queryLimit, offset]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM users u ${whereClause}`,
      queryParams
    );

    res.json({
      users: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
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
    const queryText = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount} RETURNING *`;

    const result = await query(queryText, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'User membership updated successfully',
      user: result.rows[0]
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
    const { offset, queryLimit } = paginate(page, limit);

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 1;

    if (status) {
      whereConditions.push(`o.status = $${paramCount}`);
      queryParams.push(status);
      paramCount++;
    }

    if (payment_status) {
      whereConditions.push(`o.payment_status = $${paramCount}`);
      queryParams.push(payment_status);
      paramCount++;
    }

    if (user_id) {
      whereConditions.push(`o.user_id = $${paramCount}`);
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
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...queryParams, queryLimit, offset]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM orders o ${whereClause}`,
      queryParams
    );

    res.json({
      orders: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
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
    const queryText = `UPDATE orders SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount} RETURNING *`;

    const result = await query(queryText, values);

    if (result.rows.length === 0) {
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
    const { page = 1, limit = 20, type, search, brand_id, category_id } = req.query;
    const { offset, queryLimit } = paginate(page, limit);

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 1;

    if (type === 'part') {
      whereConditions.push('p.id IS NOT NULL');
    } else if (type === 'merch') {
      whereConditions.push('m.id IS NOT NULL');
    }

    if (search) {
      whereConditions.push(`(COALESCE(p.name, m.name) ILIKE $${paramCount})`);
      queryParams.push(`%${sanitizeString(search)}%`);
      paramCount++;
    }

    if (brand_id && type === 'part') {
      whereConditions.push(`p.brand_id = $${paramCount}`);
      queryParams.push(brand_id);
      paramCount++;
    }

    if (category_id && type === 'part') {
      whereConditions.push(`p.category_id = $${paramCount}`);
      queryParams.push(category_id);
      paramCount++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT 
        COALESCE(p.id, m.id) as id,
        COALESCE(p.name, m.name) as name,
        CASE WHEN p.id IS NOT NULL THEN 'part' ELSE 'merch' END as type,
        p.selling_price as price,
        m.price as merch_price,
        COALESCE(p.quantity, m.quantity) as quantity,
        COALESCE(p.is_active, m.is_active) as is_active,
        COALESCE(p.created_at, m.created_at) as created_at,
        b.name as brand_name,
        c.name as category_name
       FROM parts p
       FULL OUTER JOIN merchandise m ON FALSE
       LEFT JOIN brands b ON p.brand_id = b.id
       LEFT JOIN categories c ON p.category_id = c.id
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...queryParams, queryLimit, offset]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM (
        SELECT p.id FROM parts p
        UNION ALL
        SELECT m.id FROM merchandise m
      ) as products ${whereClause}`,
      queryParams
    );

    res.json({
      products: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
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

    const result = await query(
      `INSERT INTO parts (brand_id, category_id, name, description, original_price, selling_price, 
                         quantity, sku, weight, images, color_options, compatibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?0, ?1, ?2)
       RETURNING *`,
      [brand_id, category_id, sanitizeString(name), description, original_price, selling_price,
       quantity, sku, weight, JSON.stringify(images), JSON.stringify(color_options), JSON.stringify(compatibility)]
    );

    res.status(201).json({
      message: 'Part created successfully',
      part: result.rows[0]
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

// Create new brand
router.post('/brands', authenticateToken, requireAdmin, [
  body('name').trim().notEmpty().withMessage('Brand name is required'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('logo_url').optional().isURL().withMessage('Logo URL must be a valid URL')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, logo_url } = req.body;

    const result = await query(
      'INSERT INTO brands (name, description, logo_url) VALUES (?, ?, ?) RETURNING *',
      [sanitizeString(name), description, logo_url]
    );

    res.status(201).json({
      message: 'Brand created successfully',
      brand: result.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ error: 'Brand with this name already exists' });
    }
    console.error('Create brand error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    const queryText = `UPDATE brands SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount} RETURNING *`;

    const result = await query(queryText, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    res.json({
      message: 'Brand updated successfully',
      brand: result.rows[0]
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
      'DELETE FROM brands WHERE id = ? RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
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

    const result = await query(
      'INSERT INTO categories (name, description, parent_id, image_url) VALUES (?, ?, ?, ?) RETURNING *',
      [sanitizeString(name), description, parent_id, image_url]
    );

    res.status(201).json({
      message: 'Category created successfully',
      category: result.rows[0]
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
    const queryText = `UPDATE categories SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount} RETURNING *`;

    const result = await query(queryText, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({
      message: 'Category updated successfully',
      category: result.rows[0]
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
      'DELETE FROM categories WHERE id = ? RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
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
    const { offset, queryLimit } = paginate(page, limit);

    let whereClause = '';
    let queryParams = [];
    let paramCount = 1;

    if (feedback_type) {
      whereClause = `WHERE f.feedback_type = $${paramCount}`;
      queryParams.push(feedback_type);
      paramCount++;
    }

    const result = await query(
      `SELECT f.*, u.full_name, u.email
       FROM feedbacks f
       JOIN users u ON f.user_id = u.id
       ${whereClause}
       ORDER BY f.created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...queryParams, queryLimit, offset]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM feedbacks f ${whereClause}`,
      queryParams
    );

    res.json({
      feedback: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
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
    const { offset, queryLimit } = paginate(page, limit);

    let whereClause = '';
    let queryParams = [];
    let paramCount = 1;

    if (status) {
      whereClause = `WHERE a.status = $${paramCount}`;
      queryParams.push(status);
      paramCount++;
    }

    const result = await query(
      `SELECT a.*, u.full_name, u.email, u.phone
       FROM ambassadors a
       JOIN users u ON a.user_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...queryParams, queryLimit, offset]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM ambassadors a ${whereClause}`,
      queryParams
    );

    res.json({
      ambassadors: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
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
    let paramCount = 2;

    if (admin_notes) {
      updates.push(`admin_notes = $${paramCount}`);
      values.push(admin_notes);
      paramCount++;
    }

    values.push(id);
    const queryText = `UPDATE ambassadors SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount} RETURNING *`;

    const result = await query(queryText, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ambassador application not found' });
    }

    res.json({
      message: 'Ambassador application status updated successfully',
      ambassador: result.rows[0]
    });
  } catch (error) {
    console.error('Update ambassador status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
