const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query } = require('../database/connection');
const { authenticateToken, requireVerified } = require('../middleware/auth');
const { sanitizeString, formatDate } = require('../utils/helpers');

const router = express.Router();

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, full_name, email, phone, membership_type, membership_points, 
              email_verified, phone_verified, created_at, updated_at, is_admin
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        membership_type: user.membership_type,
        membership_points: user.membership_points,
        email_verified: user.email_verified,
        phone_verified: user.phone_verified,
        created_at: user.created_at,
        updated_at: user.updated_at,
        is_admin: user.is_admin
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put(
  '/profile',
  authenticateToken,
  [
    body('full_name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage('Full name must be between 2 and 255 characters'),
    body('phone')
      .optional()
      .isMobilePhone()
      .withMessage('Valid phone number is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { full_name, phone } = req.body;

      // Build SQL SET clause dynamically
      const setClause = [];
      const values = [];

      if (full_name) {
        setClause.push(`full_name = ?`);
        values.push(sanitizeString(full_name));
      }

      if (phone) {
        setClause.push(`phone = ?`);
        values.push(phone);
      }

      if (setClause.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      // Add updated_at timestamp
      setClause.push(`updated_at = CURRENT_TIMESTAMP`);

      // Add user ID at the end
      values.push(req.user.id);

      // Update user info
      const updateSql = `
        UPDATE users 
        SET ${setClause.join(', ')} 
        WHERE id = ?
      `;
      await query(updateSql, values);

      // Get updated user
      const userResult = await query(
        `SELECT id, full_name, email, phone, membership_type, membership_points, 
                email_verified, phone_verified, created_at, updated_at, is_admin
         FROM users WHERE id = ?`,
        [req.user.id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        message: 'Profile updated successfully',
        user: {
          id: userResult.rows[0].id,
          full_name: userResult.rows[0].full_name,
          email: userResult.rows[0].email,
          phone: userResult.rows[0].phone,
          membership_type: userResult.rows[0].membership_type,
          membership_points: userResult.rows[0].membership_points,
          email_verified: userResult.rows[0].email_verified,
          phone_verified: userResult.rows[0].phone_verified,
          created_at: userResult.rows[0].created_at,
          updated_at: userResult.rows[0].updated_at,
          is_admin: userResult.rows[0].is_admin
        }
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);


// Change password
router.put('/change-password', authenticateToken, [
  body('current_password').notEmpty().withMessage('Current password is required'),
  body('new_password').isLength({ min: 8 }).withMessage('New password must be at least 8 characters long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { current_password, new_password } = req.body;

    // Get current password hash
    const result = await query(
      'SELECT password_hash FROM users WHERE id = ?',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(new_password, saltRounds);

    // Update password
    await query(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [password_hash, req.user.id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user addresses
router.get('/addresses', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
      [req.user.id]
    );

    res.json({ addresses: result.rows });
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add new address
router.post('/addresses', authenticateToken, requireVerified, [
  body('label').trim().notEmpty().withMessage('Address label is required'),
  body('country').trim().notEmpty().withMessage('Country is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('street').trim().notEmpty().withMessage('Street is required'),
  body('postal_code').optional().trim(),
  body('is_default').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { label, country, city, street, postal_code, is_default } = req.body;
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    // If this is set as default, unset other defaults
    if (is_default) {
      await query(
        'UPDATE addresses SET is_default = false WHERE user_id = ?',
        [req.user.id]
      );
    }

    await query(
      `INSERT INTO addresses (user_id, label, country, city, street, postal_code, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, label, country, city, street, postal_code ?? null, is_default || false]
    );
    
    const selectResult = await query(
      'SELECT id, label, country, city, street, postal_code, is_default, created_at, updated_at FROM addresses WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );

    if (selectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Address not found' });
    }


    res.status(201).json({
      message: 'Address added successfully',
      address: selectResult.rows[0]
    });
  } catch (error) {
    console.error('Add address error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update address
router.put('/addresses/:id', authenticateToken, [
  body('label').optional().trim().notEmpty().withMessage('Address label cannot be empty'),
  body('country').optional().trim().notEmpty().withMessage('Country cannot be empty'),
  body('city').optional().trim().notEmpty().withMessage('City cannot be empty'),
  body('street').optional().trim().notEmpty().withMessage('Street cannot be empty'),
  body('postal_code').optional().trim(),
  body('is_default').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { label, country, city, street, postal_code, is_default } = req.body;

    // Check if address belongs to user
    const addressCheck = await query(
      'SELECT id FROM addresses WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (addressCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Address not found' });
    }

    // If this is set as default, unset other defaults
    if (is_default) {
      await query(
        'UPDATE addresses SET is_default = false WHERE user_id = ? AND id != ?',
        [req.user.id, id]
      );
    }

    const updates = [];
    const values = [];

    if (label !== undefined) {
      updates.push('label = ?');
      values.push(sanitizeString(label));
    }
    if (country !== undefined) {
      updates.push('country = ?');
      values.push(sanitizeString(country));
    }
    if (city !== undefined) {
      updates.push('city = ?');
      values.push(sanitizeString(city));
    }
    if (street !== undefined) {
      updates.push('street = ?');
      values.push(sanitizeString(street));
    }
    if (postal_code !== undefined) {
      updates.push('postal_code = ?');
      values.push(postal_code);
    }
    if (is_default !== undefined) {
      updates.push('is_default = ?');
      values.push(is_default);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id, req.user.id);
    const queryText = `UPDATE addresses SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`;

    await query(queryText, values);

    // Get updated address
    const addressResult = await query(
      'SELECT * FROM addresses WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (addressResult.rows.length === 0) {
      return res.status(404).json({ error: 'Address not found' });
    }

    res.json({
      message: 'Address updated successfully',
      address: addressResult.rows[0]
    });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete address
router.delete('/addresses/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM addresses WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Address not found' });
    }

    res.json({ message: 'Address deleted successfully' });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user orders
router.get('/orders', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT o.*, a.label as shipping_address_label, a.city, a.country
       FROM orders o
       JOIN addresses a ON o.shipping_address_id = a.id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset]
    );

    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) FROM orders WHERE user_id = ?',
      [req.user.id]
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

module.exports = router;
