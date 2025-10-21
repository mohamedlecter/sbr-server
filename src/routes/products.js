const express = require('express');
const { query } = require('../database/connection');
const { optionalAuth, authenticateToken } = require('../middleware/auth');
const { paginate, sanitizeString } = require('../utils/helpers');

const router = express.Router();

// Get all categories with optional nesting
router.get('/categories', async (req, res) => {
  try {
    const { include_children = false } = req.query;
    
    let queryText = `
      SELECT c.*, 
             parent.name as parent_name,
             COUNT(child.id) as children_count
      FROM categories c
      LEFT JOIN categories parent ON c.parent_id = parent.id
      LEFT JOIN categories child ON child.parent_id = c.id
      GROUP BY c.id, parent.name
      ORDER BY c.parent_id NULLS FIRST, c.name
    `;

    const result = await query(queryText);
    
    // Organize categories hierarchically if requested
    let categories = result.rows;
    if (include_children === 'true') {
      categories = organizeCategoriesHierarchy(result.rows);
    }

    res.json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single category with products
router.get('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, sort = 'name', order = 'asc' } = req.query;
    const { offset, limit: queryLimit } = paginate(page, limit);

    // Get category details
    const categoryResult = await query(
      `SELECT c.*, parent.name as parent_name
       FROM categories c
       LEFT JOIN categories parent ON c.parent_id = parent.id
       WHERE c.id = ?`,
      [id]
    );

    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const category = categoryResult.rows[0];

    // Get parts in this category
    const validSortFields = ['name', 'selling_price', 'created_at'];
    const sortField = validSortFields.includes(sort) ? sort : 'name';
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const partsResult = await query(
      `SELECT p.*, b.name as brand_name, b.logo_url as brand_logo
       FROM parts p
       JOIN brands b ON p.brand_id = b.id
       WHERE p.category_id = ? AND p.is_active = true
       ORDER BY p.${sortField} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [id, queryLimit, offset]
    );

    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) FROM parts WHERE category_id = ? AND is_active = true',
      [id]
    );

    res.json({
      category,
      parts: partsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all brands
router.get('/brands', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const { offset, queryLimit } = paginate(page, limit);

    const result = await query(
      `SELECT b.*, COUNT(p.id) as parts_count
       FROM brands b
       LEFT JOIN parts p ON b.id = p.brand_id AND p.is_active = true
       GROUP BY b.id
       ORDER BY b.name
       LIMIT ? OFFSET ?`,
      [queryLimit, offset]
    );

    // Get total count
    const countResult = await query('SELECT COUNT(*) FROM brands');

    res.json({
      brands: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get brands error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single brand with products
router.get('/brands/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, sort = 'name', order = 'asc' } = req.query;
    const { offset, queryLimit } = paginate(page, limit);

    // Get brand details
    const brandResult = await query(
      'SELECT * FROM brands WHERE id = ?',
      [id]
    );

    if (brandResult.rows.length === 0) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const brand = brandResult.rows[0];

    // Get parts for this brand
    const validSortFields = ['name', 'selling_price', 'created_at'];
    const sortField = validSortFields.includes(sort) ? sort : 'name';
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const partsResult = await query(
      `SELECT p.*, c.name as category_name
       FROM parts p
       JOIN categories c ON p.category_id = c.id
       WHERE p.brand_id = ? AND p.is_active = true
       ORDER BY p.${sortField} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [id, queryLimit, offset]
    );

    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) FROM parts WHERE brand_id = ? AND is_active = true',
      [id]
    );

    res.json({
      brand,
      parts: partsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get brand error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search and filter parts
router.get('/parts', optionalAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      category_id, 
      brand_id, 
      min_price, 
      max_price, 
      color, 
      sort = 'name', 
      order = 'asc',
      in_stock = false 
    } = req.query;

    const { offset, queryLimit } = paginate(page, limit);
    
    let whereConditions = ['p.is_active = true'];
    let queryParams = [];
    let paramCount = 1;

    // Build WHERE clause dynamically
    if (search) {
      whereConditions.push(`(p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`);
      queryParams.push(`%${sanitizeString(search)}%`);
      paramCount++;
    }

    if (category_id) {
      whereConditions.push(`p.category_id = $${paramCount}`);
      queryParams.push(category_id);
      paramCount++;
    }

    if (brand_id) {
      whereConditions.push(`p.brand_id = $${paramCount}`);
      queryParams.push(brand_id);
      paramCount++;
    }

    if (min_price) {
      whereConditions.push(`p.selling_price >= $${paramCount}`);
      queryParams.push(parseFloat(min_price));
      paramCount++;
    }

    if (max_price) {
      whereConditions.push(`p.selling_price <= $${paramCount}`);
      queryParams.push(parseFloat(max_price));
      paramCount++;
    }

    if (color) {
      whereConditions.push(`p.color_options::text ILIKE $${paramCount}`);
      queryParams.push(`%"${sanitizeString(color)}"%`);
      paramCount++;
    }

    if (in_stock === 'true') {
      whereConditions.push(`p.quantity > 0`);
    }

    const validSortFields = ['name', 'selling_price', 'created_at', 'original_price'];
    const sortField = validSortFields.includes(sort) ? sort : 'name';
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get parts with pagination
    const partsQuery = `
      SELECT p.*, b.name as brand_name, b.logo_url as brand_logo, c.name as category_name
      FROM parts p
      JOIN brands b ON p.brand_id = b.id
      JOIN categories c ON p.category_id = c.id
      ${whereClause}
      ORDER BY p.${sortField} ${sortOrder}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    queryParams.push(queryLimit, offset);
    const result = await query(partsQuery, queryParams);

    // Get total count
    const countQuery = `
      SELECT COUNT(*)
      FROM parts p
      JOIN brands b ON p.brand_id = b.id
      JOIN categories c ON p.category_id = c.id
      ${whereClause}
    `;
    const countResult = await query(countQuery, queryParams.slice(0, -2));

    res.json({
      parts: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      },
      filters: {
        search,
        category_id,
        brand_id,
        min_price,
        max_price,
        color,
        in_stock,
        sort,
        order
      }
    });
  } catch (error) {
    console.error('Search parts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single part details
router.get('/parts/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT p.*, b.name as brand_name, b.logo_url as brand_logo, 
              c.name as category_name, c.parent_id as category_parent_id
       FROM parts p
       JOIN brands b ON p.brand_id = b.id
       JOIN categories c ON p.category_id = c.id
       WHERE p.id = ? AND p.is_active = true`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Part not found' });
    }

    const part = result.rows[0];

    // Get related parts (same category or brand)
    const relatedResult = await query(
      `SELECT p.*, b.name as brand_name, b.logo_url as brand_logo
       FROM parts p
       JOIN brands b ON p.brand_id = b.id
       WHERE p.id != ? AND p.is_active = true 
       AND (p.category_id = ? OR p.brand_id = ?)
       ORDER BY RANDOM()
       LIMIT 6`,
      [id, part.category_id, part.brand_id]
    );

    res.json({
      part,
      related_parts: relatedResult.rows
    });
  } catch (error) {
    console.error('Get part error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all merchandise
router.get('/merchandise', optionalAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      min_price, 
      max_price, 
      color, 
      size,
      sort = 'name', 
      order = 'asc',
      in_stock = false 
    } = req.query;

    const { offset, queryLimit } = paginate(page, limit);
    
    let whereConditions = ['m.is_active = true'];
    let queryParams = [];
    let paramCount = 1;

    // Build WHERE clause dynamically
    if (search) {
      whereConditions.push(`(m.name ILIKE $${paramCount} OR m.description ILIKE $${paramCount})`);
      queryParams.push(`%${sanitizeString(search)}%`);
      paramCount++;
    }

    if (min_price) {
      whereConditions.push(`m.price >= $${paramCount}`);
      queryParams.push(parseFloat(min_price));
      paramCount++;
    }

    if (max_price) {
      whereConditions.push(`m.price <= $${paramCount}`);
      queryParams.push(parseFloat(max_price));
      paramCount++;
    }

    if (color) {
      whereConditions.push(`m.color_options::text ILIKE $${paramCount}`);
      queryParams.push(`%"${sanitizeString(color)}"%`);
      paramCount++;
    }

    if (size) {
      whereConditions.push(`m.size_options::text ILIKE $${paramCount}`);
      queryParams.push(`%"${sanitizeString(size)}"%`);
      paramCount++;
    }

    if (in_stock === 'true') {
      whereConditions.push(`m.quantity > 0`);
    }

    const validSortFields = ['name', 'price', 'created_at'];
    const sortField = validSortFields.includes(sort) ? sort : 'name';
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get merchandise with pagination
    const merchandiseQuery = `
      SELECT *
      FROM merchandise m
      ${whereClause}
      ORDER BY m.${sortField} ${sortOrder}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    queryParams.push(queryLimit, offset);
    const result = await query(merchandiseQuery, queryParams);

    // Get total count
    const countQuery = `
      SELECT COUNT(*)
      FROM merchandise m
      ${whereClause}
    `;
    const countResult = await query(countQuery, queryParams.slice(0, -2));

    res.json({
      merchandise: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      },
      filters: {
        search,
        min_price,
        max_price,
        color,
        size,
        in_stock,
        sort,
        order
      }
    });
  } catch (error) {
    console.error('Get merchandise error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single merchandise details
router.get('/merchandise/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT * FROM merchandise WHERE id = ? AND is_active = true',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Merchandise not found' });
    }

    const merchandise = result.rows[0];

    // Get related merchandise
    const relatedResult = await query(
      `SELECT *
       FROM merchandise
       WHERE id != ? AND is_active = true
       ORDER BY RANDOM()
       LIMIT 6`,
      [id]
    );

    res.json({
      merchandise,
      related_merchandise: relatedResult.rows
    });
  } catch (error) {
    console.error('Get merchandise error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to organize categories hierarchically
function organizeCategoriesHierarchy(categories) {
  const categoryMap = new Map();
  const rootCategories = [];

  // Create a map of all categories
  categories.forEach(category => {
    categoryMap.set(category.id, { ...category, children: [] });
  });

  // Organize hierarchy
  categories.forEach(category => {
    if (category.parent_id) {
      const parent = categoryMap.get(category.parent_id);
      if (parent) {
        parent.children.push(categoryMap.get(category.id));
      }
    } else {
      rootCategories.push(categoryMap.get(category.id));
    }
  });

  return rootCategories;
}

module.exports = router;
