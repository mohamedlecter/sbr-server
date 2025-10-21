const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../database/connection');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { sanitizeString, paginate } = require('../utils/helpers');

const router = express.Router();

// Submit feedback
router.post('/feedback', authenticateToken, [
  body('message').trim().isLength({ min: 10, max: 1000 }).withMessage('Message must be between 10 and 1000 characters'),
  body('rating').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('feedback_type').optional().isIn(['general', 'order', 'product', 'service', 'bug_report']).withMessage('Valid feedback type is required'),
  body('is_public').optional().isBoolean().withMessage('Public flag must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { message, rating, feedback_type = 'general', is_public = false } = req.body;

    const result = await query(
      'INSERT INTO feedbacks (user_id, message, rating, feedback_type, is_public) VALUES (?, ?, ?, ?, ?) RETURNING *',
      [req.user.id, sanitizeString(message), rating, feedback_type, is_public]
    );

    res.status(201).json({
      message: 'Feedback submitted successfully',
      feedback: {
        id: result.rows[0].id,
        message: result.rows[0].message,
        rating: result.rows[0].rating,
        feedback_type: result.rows[0].feedback_type,
        is_public: result.rows[0].is_public,
        created_at: result.rows[0].created_at
      }
    });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get public feedback
router.get('/feedback/public', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, rating } = req.query;
    const { offset, queryLimit } = paginate(page, limit);

    let whereConditions = ['f.is_public = true'];
    let queryParams = [];
    let paramCount = 1;

    if (rating) {
      whereConditions.push(`f.rating = $${paramCount}`);
      queryParams.push(parseInt(rating));
      paramCount++;
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const result = await query(
      `SELECT f.id, f.message, f.rating, f.feedback_type, f.created_at,
              u.full_name as user_name
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
    console.error('Get public feedback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's feedback
router.get('/feedback/my', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const { offset, queryLimit } = paginate(page, limit);

    const result = await query(
      `SELECT id, message, rating, feedback_type, is_public, created_at
       FROM feedbacks
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, queryLimit, offset]
    );

    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) FROM feedbacks WHERE user_id = ?',
      [req.user.id]
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
    console.error('Get user feedback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Apply to become ambassador
router.post('/ambassadors/apply', authenticateToken, [
  body('social_links').isObject().withMessage('Social links must be an object'),
  body('follower_count').isInt({ min: 0 }).withMessage('Follower count must be non-negative'),
  body('bike_brands').isArray().withMessage('Bike brands must be an array'),
  body('application_notes').optional().isString().withMessage('Application notes must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { social_links, follower_count, bike_brands, application_notes } = req.body;

    // Check if user already has an application
    const existingApplication = await query(
      'SELECT id, status FROM ambassadors WHERE user_id = ?',
      [req.user.id]
    );

    if (existingApplication.rows.length > 0) {
      const application = existingApplication.rows[0];
      return res.status(400).json({
        error: 'Application already exists',
        status: application.status,
        message: 'You have already submitted an ambassador application'
      });
    }

    const result = await query(
      'INSERT INTO ambassadors (user_id, social_links, follower_count, bike_brands, application_notes) VALUES (?, ?, ?, ?, ?) RETURNING *',
      [req.user.id, JSON.stringify(social_links), follower_count, JSON.stringify(bike_brands), application_notes]
    );

    res.status(201).json({
      message: 'Ambassador application submitted successfully',
      application: {
        id: result.rows[0].id,
        status: result.rows[0].status,
        social_links: result.rows[0].social_links,
        follower_count: result.rows[0].follower_count,
        bike_brands: result.rows[0].bike_brands,
        application_notes: result.rows[0].application_notes,
        created_at: result.rows[0].created_at
      }
    });
  } catch (error) {
    console.error('Apply ambassador error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's ambassador application
router.get('/ambassadors/my', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM ambassadors WHERE user_id = ?',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No ambassador application found' });
    }

    res.json({
      application: result.rows[0]
    });
  } catch (error) {
    console.error('Get ambassador application error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update ambassador application
router.put('/ambassadors/my', authenticateToken, [
  body('social_links').optional().isObject().withMessage('Social links must be an object'),
  body('follower_count').optional().isInt({ min: 0 }).withMessage('Follower count must be non-negative'),
  body('bike_brands').optional().isArray().withMessage('Bike brands must be an array'),
  body('application_notes').optional().isString().withMessage('Application notes must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { social_links, follower_count, bike_brands, application_notes } = req.body;

    // Check if application exists and is pending
    const existingApplication = await query(
      'SELECT id, status FROM ambassadors WHERE user_id = ?',
      [req.user.id]
    );

    if (existingApplication.rows.length === 0) {
      return res.status(404).json({ error: 'No ambassador application found' });
    }

    if (existingApplication.rows[0].status !== 'pending') {
      return res.status(400).json({ 
        error: 'Cannot update application',
        message: 'Application has already been reviewed'
      });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (social_links !== undefined) {
      updates.push(`social_links = $${paramCount}`);
      values.push(JSON.stringify(social_links));
      paramCount++;
    }

    if (follower_count !== undefined) {
      updates.push(`follower_count = $${paramCount}`);
      values.push(follower_count);
      paramCount++;
    }

    if (bike_brands !== undefined) {
      updates.push(`bike_brands = $${paramCount}`);
      values.push(JSON.stringify(bike_brands));
      paramCount++;
    }

    if (application_notes !== undefined) {
      updates.push(`application_notes = $${paramCount}`);
      values.push(application_notes);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.user.id);
    const queryText = `UPDATE ambassadors SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = $${paramCount} RETURNING *`;

    const result = await query(queryText, values);

    res.json({
      message: 'Ambassador application updated successfully',
      application: result.rows[0]
    });
  } catch (error) {
    console.error('Update ambassador application error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get approved ambassadors (public)
router.get('/ambassadors/approved', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { offset, queryLimit } = paginate(page, limit);

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
    console.error('Get approved ambassadors error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
