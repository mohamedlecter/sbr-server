const express = require('express');
const { query } = require('../database/connection');
const { optionalAuth } = require('../middleware/auth');
const { paginate } = require('../utils/helpers');

const router = express.Router();

// Get all partners
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const { offset, queryLimit } = paginate(page, limit);

    let whereClause = 'WHERE p.is_active = true';
    let queryParams = [];
    let paramCount = 1;

    if (search) {
      whereClause += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    const result = await query(
      `SELECT p.id, p.name, p.logo_url, p.description, p.website_url, p.contact_email
       FROM partners p
       ${whereClause}
       ORDER BY p.name
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...queryParams, queryLimit, offset]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM partners p ${whereClause}`,
      queryParams
    );

    res.json({
      partners: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get partners error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single partner details
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT * FROM partners WHERE id = ? AND is_active = true',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    res.json({
      partner: result.rows[0]
    });
  } catch (error) {
    console.error('Get partner error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
