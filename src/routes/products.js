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
             COUNT(DISTINCT child.id) as children_count,
             COUNT(DISTINCT p.id) as parts_count,
             COUNT(DISTINCT m.id) as models_count
      FROM categories c
      LEFT JOIN categories parent ON c.parent_id = parent.id
      LEFT JOIN categories child ON child.parent_id = c.id
      LEFT JOIN parts p ON c.id = p.category_id AND p.is_active = true
      LEFT JOIN models m ON c.id = m.category_id
      GROUP BY c.id, parent.name
      ORDER BY (c.parent_id IS NOT NULL), c.name
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
    const categoryId = req.params.id;
    const { page = 1, limit = 20, sort = 'name', order = 'asc' } = req.query;
    const { offset, limit: queryLimit } = paginate(page, limit);


    // Get category details
    const categoryResult = await query(
      `SELECT c.*, parent.name as parent_name
       FROM categories c
       LEFT JOIN categories parent ON c.parent_id = parent.id
       WHERE c.id = ?`,
      [categoryId]
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
       LIMIT ${queryLimit} OFFSET ${offset}`,
      [categoryId]
    );

    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) FROM parts WHERE category_id = ? AND is_active = true',
      [categoryId]
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

    const result = await query(
      `SELECT b.*, 
              COUNT(DISTINCT p.id) as parts_count,
              COUNT(DISTINCT m.id) as models_count
       FROM brands b
       LEFT JOIN parts p ON b.id = p.brand_id AND p.is_active = true
       LEFT JOIN models m ON b.id = m.brand_id
       GROUP BY b.id
       ORDER BY b.name`,
    );

    res.json({
      brands: result.rows,
    });
  } catch (error) {
    console.error('Get brands error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single brand with products
router.get('/brands/:id', async (req, res) => {
  try {
    const brandId = req.params.id;
    const { page = 1, limit = 20, sort = 'name', order = 'asc' } = req.query;
    const { offset, limit: queryLimit } = paginate(page, limit);

    // Get brand details with counts
    const brandResult = await query(
      `SELECT b.*, 
              COUNT(DISTINCT p.id) as parts_count,
              COUNT(DISTINCT m.id) as models_count
       FROM brands b
       LEFT JOIN parts p ON b.id = p.brand_id AND p.is_active = true
       LEFT JOIN models m ON b.id = m.brand_id
       WHERE b.id = ?
       GROUP BY b.id`,
      [brandId]
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
     LIMIT ${queryLimit} OFFSET ${offset}`,
    [brandId]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM parts WHERE brand_id = ? AND is_active = true`,
      [brandId]
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

    const { offset, limit: queryLimit } = paginate(page, limit);
    
    let whereConditions = ['p.is_active = true'];
    let queryParams = [];

    // Build WHERE clause dynamically
    if (search) {
      whereConditions.push(`(LOWER(p.name) LIKE ? OR LOWER(p.description) LIKE ?)`);
      queryParams.push(`%${sanitizeString(search).toLowerCase()}%`);
      queryParams.push(`%${sanitizeString(search).toLowerCase()}%`);
    }

    if (category_id) {
      whereConditions.push(`p.category_id = ?`);
      queryParams.push(parseInt(category_id, 10));
    }

    if (brand_id) {
      whereConditions.push(`p.brand_id = ?`);
      queryParams.push(parseInt(brand_id, 10));
    }

    if (min_price) {
      whereConditions.push(`p.selling_price >= ?`);
      queryParams.push(parseFloat(min_price));
    }

    if (max_price) {
      whereConditions.push(`p.selling_price <= ?`);
      queryParams.push(parseFloat(max_price));
    }

    if (color) {
      whereConditions.push(`JSON_SEARCH(color_options, 'one', ?) IS NOT NULL`);
      queryParams.push(color);
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
      LIMIT ${queryLimit} OFFSET ${offset}
    `;

    const result = await query(partsQuery);

    // exclude original_price from the result
    const parts = result.rows.map(part => {
      const { original_price, ...otherFields } = part;
      return otherFields;
    });

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
      parts: parts,
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
    const partId = req.params.id;

    const result = await query(
      `SELECT p.*, b.name as brand_name, b.logo_url as brand_logo, 
              c.name as category_name, c.parent_id as category_parent_id
       FROM parts p
       JOIN brands b ON p.brand_id = b.id
       JOIN categories c ON p.category_id = c.id
       WHERE p.id = ? AND p.is_active = true`,
      [partId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Part not found' });
    }

    const partRow = result.rows[0];
    const { original_price, ...part } = partRow; // keep category_id & brand_id


    let relatedResult = await query(
      `SELECT p.*, b.name as brand_name, b.logo_url as brand_logo
       FROM parts p
       JOIN brands b ON p.brand_id = b.id
       WHERE p.id != ? AND p.is_active = true
         AND (p.category_id = ? OR p.brand_id = ?)
       ORDER BY RAND()
       LIMIT 6`,
      [partId, part.category_id, part.brand_id]
    );
    
    if (relatedResult.rows.length === 0) {
      relatedResult = await query(
        `SELECT p.*, b.name as brand_name, b.logo_url as brand_logo
         FROM parts p
         JOIN brands b ON p.brand_id = b.id
         WHERE p.id != ? AND p.is_active = true
         ORDER BY RAND()
         LIMIT 6`,
        [partId]
      );
    }
    

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

    const { offset, limit: queryLimit } = paginate(page, limit);
    
    let whereConditions = ['m.is_active = 1'];
    let queryParams = [];

    if (search) {
      whereConditions.push('(LOWER(m.name) LIKE ? OR LOWER(m.description) LIKE ?)');
      queryParams.push(`%${sanitizeString(search).toLowerCase()}%`);
      queryParams.push(`%${sanitizeString(search).toLowerCase()}%`);
    }

    if (min_price) {
      whereConditions.push('m.price >= ?');
      queryParams.push(parseFloat(min_price));
    }

    if (max_price) {
      whereConditions.push('m.price <= ?');
      queryParams.push(parseFloat(max_price));
    }

    if (color) {
      whereConditions.push('JSON_SEARCH(m.color_options, "one", ?) IS NOT NULL');
      queryParams.push(color);
    }

    if (size) {
      whereConditions.push('JSON_SEARCH(m.size_options, "one", ?) IS NOT NULL');
      queryParams.push(size);
    }

    if (in_stock === 'true') {
      whereConditions.push('m.quantity > 0');
    }

    const validSortFields = ['name', 'price', 'created_at'];
    const sortField = validSortFields.includes(sort) ? sort : 'name';
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const merchandiseQuery = `
    SELECT m.*
    FROM merchandise m
    ${whereClause}
    ORDER BY m.${sortField} ${sortOrder}
    LIMIT ${queryLimit} OFFSET ${offset}
  `;
  
  const result = await query(merchandiseQuery, queryParams);
  
    const countQuery = `SELECT COUNT(*) AS count FROM merchandise m ${whereClause}`;
    const countResult = await query(countQuery, queryParams);

    res.json({
      merchandise: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      },
      filters: { search, min_price, max_price, color, size, in_stock, sort, order }
    });
  } catch (error) {
    console.error('Get merchandise error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Get single merchandise details
router.get('/merchandise/:id', optionalAuth, async (req, res) => {
  try {
    const merchandiseId = req.params.id;

    const result = await query(
      `SELECT * FROM merchandise WHERE id = ? AND is_active = true`,
      [merchandiseId]
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
       ORDER BY RAND()
       LIMIT 6`,
      [merchandiseId]
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

// Get all models
router.get('/models', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      brand_id, 
      category_id,
      year,
      sort = 'name', 
      order = 'asc' 
    } = req.query;

    const { offset, limit: queryLimit } = paginate(page, limit);
    
    let whereConditions = [];
    let queryParams = [];

    // Build WHERE clause dynamically
    if (search) {
      whereConditions.push(`(LOWER(m.name) LIKE ? OR LOWER(b.name) LIKE ?)`);
      queryParams.push(`%${sanitizeString(search).toLowerCase()}%`);
      queryParams.push(`%${sanitizeString(search).toLowerCase()}%`);
    }

    if (brand_id) {
      whereConditions.push(`m.brand_id = ?`);
      queryParams.push(brand_id);
    }

    if (category_id) {
      whereConditions.push(`m.category_id = ?`);
      queryParams.push(category_id);
    }

    if (year) {
      whereConditions.push(`m.year = ?`);
      queryParams.push(parseInt(year));
    }

    const validSortFields = ['name', 'year', 'created_at'];
    const sortField = validSortFields.includes(sort) ? sort : 'name';
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get models with pagination
    const modelsQuery = `
      SELECT m.*, 
             b.name as brand_name, 
             b.logo_url as brand_logo,
             c.name as category_name
      FROM models m
      LEFT JOIN brands b ON m.brand_id = b.id
      LEFT JOIN categories c ON m.category_id = c.id
      ${whereClause}
      ORDER BY m.${sortField} ${sortOrder}
      LIMIT ${queryLimit} OFFSET ${offset}
    `;

    const result = await query(modelsQuery);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as count
      FROM models m
      LEFT JOIN brands b ON m.brand_id = b.id
      LEFT JOIN categories c ON m.category_id = c.id
      ${whereClause}
    `;
    const countResult = await query(countQuery, queryParams);

    res.json({
      models: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      },
      filters: {
        search,
        brand_id,
        category_id,
        year,
        sort,
        order
      }
    });
  } catch (error) {
    console.error('Get models error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single model details
router.get('/models/:id', async (req, res) => {
  try {
    const modelId = req.params.id;

    const result = await query(
      `SELECT m.*, 
              b.name as brand_name, 
              b.logo_url as brand_logo,
              c.name as category_name
       FROM models m
       LEFT JOIN brands b ON m.brand_id = b.id
       LEFT JOIN categories c ON m.category_id = c.id
       WHERE m.id = ?`,
      [modelId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const model = result.rows[0];

    // Parse specifications JSON if it exists
    if (model.specifications && typeof model.specifications === 'string') {
      try {
        model.specifications = JSON.parse(model.specifications);
      } catch (e) {
        // If parsing fails, keep as is
      }
    }

    // Get related models (same brand or category)
    const relatedResult = await query(
      `SELECT m.*, b.name as brand_name, b.logo_url as brand_logo, c.name as category_name
       FROM models m
       LEFT JOIN brands b ON m.brand_id = b.id
       LEFT JOIN categories c ON m.category_id = c.id
       WHERE m.id != ? 
         AND (m.brand_id = ? OR m.category_id = ?)
       ORDER BY RAND()
       LIMIT 6`,
      [modelId, model.brand_id, model.category_id]
    );

    res.json({
      model,
      related_models: relatedResult.rows
    });
  } catch (error) {
    console.error('Get model error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get models by brand
router.get('/brands/:id/models', async (req, res) => {
  try {
    const brandId = req.params.id;
    const { page = 1, limit = 20, sort = 'name', order = 'asc', year } = req.query;
    const { offset, limit: queryLimit } = paginate(page, limit);

    // Verify brand exists
    const brandResult = await query('SELECT * FROM brands WHERE id = ?', [brandId]);
    if (brandResult.rows.length === 0) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    let whereConditions = ['m.brand_id = ?'];
    let queryParams = [brandId];

    if (year) {
      whereConditions.push('m.year = ?');
      queryParams.push(parseInt(year));
    }

    const validSortFields = ['name', 'year', 'created_at'];
    const sortField = validSortFields.includes(sort) ? sort : 'name';
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const modelsResult = await query(
      `SELECT m.*, c.name as category_name
       FROM models m
       LEFT JOIN categories c ON m.category_id = c.id
       WHERE ${whereConditions.join(' AND ')}
       ORDER BY m.${sortField} ${sortOrder}
       LIMIT ${queryLimit} OFFSET ${offset}`,
      queryParams
    );

    const countResult = await query(
      `SELECT COUNT(*) as count FROM models WHERE ${whereConditions.join(' AND ')}`,
      queryParams
    );

    res.json({
      brand: brandResult.rows[0],
      models: modelsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get brand models error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get models by category
router.get('/categories/:id/models', async (req, res) => {
  try {
    const categoryId = req.params.id;
    const { page = 1, limit = 20, sort = 'name', order = 'asc', brand_id, year } = req.query;
    const { offset, limit: queryLimit } = paginate(page, limit);

    // Verify category exists
    const categoryResult = await query('SELECT * FROM categories WHERE id = ?', [categoryId]);
    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    let whereConditions = ['m.category_id = ?'];
    let queryParams = [categoryId];

    if (brand_id) {
      whereConditions.push('m.brand_id = ?');
      queryParams.push(brand_id);
    }

    if (year) {
      whereConditions.push('m.year = ?');
      queryParams.push(parseInt(year));
    }

    const validSortFields = ['name', 'year', 'created_at'];
    const sortField = validSortFields.includes(sort) ? sort : 'name';
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const modelsResult = await query(
      `SELECT m.*, b.name as brand_name, b.logo_url as brand_logo
       FROM models m
       LEFT JOIN brands b ON m.brand_id = b.id
       WHERE ${whereConditions.join(' AND ')}
       ORDER BY m.${sortField} ${sortOrder}
       LIMIT ${queryLimit} OFFSET ${offset}`,
      queryParams
    );

    const countResult = await query(
      `SELECT COUNT(*) as count FROM models WHERE ${whereConditions.join(' AND ')}`,
      queryParams
    );

    res.json({
      category: categoryResult.rows[0],
      models: modelsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get category models error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get models by brand name
router.get('/models/make-name/:makeName', async (req, res) => {
  try {
    const makeName = decodeURIComponent(req.params.makeName);
    const { page = 1, limit = 20, sort = 'name', order = 'asc' } = req.query;
    const { offset, limit: queryLimit } = paginate(page, limit);

    // Find brand by name
    const brandResult = await query(
      'SELECT * FROM brands WHERE name = ?',
      [makeName]
    );

    if (brandResult.rows.length === 0) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const brand = brandResult.rows[0];

    const validSortFields = ['name', 'year', 'created_at'];
    const sortField = validSortFields.includes(sort) ? sort : 'name';
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const modelsResult = await query(
      `SELECT m.*, c.name as category_name
       FROM models m
       LEFT JOIN categories c ON m.category_id = c.id
       WHERE m.brand_id = ?
       ORDER BY m.${sortField} ${sortOrder}
       LIMIT ${queryLimit} OFFSET ${offset}`,
      [brand.id]
    );

    const countResult = await query(
      'SELECT COUNT(*) as count FROM models WHERE brand_id = ?',
      [brand.id]
    );

    res.json({
      brand: {
        id: brand.id,
        name: brand.name,
        logo_url: brand.logo_url,
        description: brand.description
      },
      models: modelsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get models by brand name error:', error);
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
