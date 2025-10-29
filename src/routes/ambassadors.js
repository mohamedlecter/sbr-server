const express = require('express');
const { query } = require('../database/connection');
const { optionalAuth } = require('../middleware/auth');
const { paginate } = require('../utils/helpers');

const router = express.Router();

// Get approved ambassadors (public)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { offset, limit: queryLimit } = paginate(page, limit);

    const result = await query(
      `SELECT a.id, a.social_links, a.follower_count, a.bike_brands, a.created_at,
              u.full_name, u.email
       FROM ambassadors a
       JOIN users u ON a.user_id = u.id
       WHERE a.status = 'approved'
       ORDER BY a.follower_count DESC
       LIMIT ? OFFSET ?`,
      [queryLimit, offset]
    );

    // Get total count
    const countResult = await query(
      "SELECT COUNT(*) FROM ambassadors WHERE status = 'approved'"
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

// Get single ambassador details
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT a.id, a.social_links, a.follower_count, a.bike_brands, a.created_at,
              u.full_name, u.email
       FROM ambassadors a
       JOIN users u ON a.user_id = u.id
       WHERE a.id = ? AND a.status = 'approved'`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ambassador not found' });
    }

    res.json({
      ambassador: result.rows[0]
    });
  } catch (error) {
    console.error('Get ambassador error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
