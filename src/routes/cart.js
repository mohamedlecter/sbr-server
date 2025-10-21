const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../database/connection');
const { authenticateToken, requireVerified } = require('../middleware/auth');
const { getMembershipDiscount, calculatePointsEarned } = require('../utils/helpers');

const router = express.Router();

// Get user's cart
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT ci.*, 
              CASE 
                WHEN ci.product_type = 'part' THEN p.name
                WHEN ci.product_type = 'merch' THEN m.name
              END as product_name,
              CASE 
                WHEN ci.product_type = 'part' THEN p.selling_price
                WHEN ci.product_type = 'merch' THEN m.price
              END as unit_price,
              CASE 
                WHEN ci.product_type = 'part' THEN p.images
                WHEN ci.product_type = 'merch' THEN m.images
              END as product_images,
              CASE 
                WHEN ci.product_type = 'part' THEN b.name
                ELSE NULL
              END as brand_name,
              CASE 
                WHEN ci.product_type = 'part' THEN p.quantity
                WHEN ci.product_type = 'merch' THEN m.quantity
              END as available_quantity
       FROM cart_items ci
       LEFT JOIN parts p ON ci.product_type = 'part' AND ci.product_id = p.id
       LEFT JOIN merchandise m ON ci.product_type = 'merch' AND ci.product_id = m.id
       LEFT JOIN brands b ON ci.product_type = 'part' AND p.brand_id = b.id
       WHERE ci.user_id = ?
       ORDER BY ci.created_at DESC`,
      [req.user.id]
    );

    // Calculate totals
    let subtotal = 0;
    const cartItems = result.rows.map(item => {
      const itemTotal = item.unit_price * item.quantity;
      subtotal += itemTotal;
      
      return {
        ...item,
        item_total: itemTotal
      };
    });

    const discount = getMembershipDiscount(req.user.membership_type);
    const discountAmount = subtotal * discount;
    const total = subtotal - discountAmount;

    res.json({
      cart_items: cartItems,
      summary: {
        subtotal,
        discount_percentage: discount * 100,
        discount_amount: discountAmount,
        total,
        item_count: cartItems.length,
        total_quantity: cartItems.reduce((sum, item) => sum + item.quantity, 0)
      }
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add item to cart
router.post('/add', authenticateToken, requireVerified, [
  body('product_type').isIn(['part', 'merch']).withMessage('Product type must be either "part" or "merch"'),
  body('product_id').isUUID().withMessage('Valid product ID is required'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { product_type, product_id, quantity } = req.body;

    // Check if product exists and is available
    let productQuery, productResult;
    if (product_type === 'part') {
      productQuery = 'SELECT id, name, selling_price, quantity FROM parts WHERE id = ? AND is_active = true';
    } else {
      productQuery = 'SELECT id, name, price as selling_price, quantity FROM merchandise WHERE id = ? AND is_active = true';
    }

    productResult = await query(productQuery, [product_id]);

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found or not available' });
    }

    const product = productResult.rows[0];

    // Check if requested quantity is available
    if (product.quantity < quantity) {
      return res.status(400).json({ 
        error: 'Insufficient stock',
        message: `Only ${product.quantity} items available`,
        available_quantity: product.quantity
      });
    }

    // Check if item already exists in cart
    const existingItem = await query(
      'SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_type = ? AND product_id = ?',
      [req.user.id, product_type, product_id]
    );

    if (existingItem.rows.length > 0) {
      // Update existing item
      const newQuantity = existingItem.rows[0].quantity + quantity;
      
      if (product.quantity < newQuantity) {
        return res.status(400).json({ 
          error: 'Insufficient stock',
          message: `Only ${product.quantity} items available`,
          available_quantity: product.quantity
        });
      }

      await query(
        'UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newQuantity, existingItem.rows[0].id]
      );

      res.json({ 
        message: 'Item quantity updated in cart',
        quantity: newQuantity
      });
    } else {
      // Add new item to cart
      await query(
        'INSERT INTO cart_items (user_id, product_type, product_id, quantity) VALUES (?, ?, ?, ?)',
        [req.user.id, product_type, product_id, quantity]
      );

      res.json({ 
        message: 'Item added to cart successfully',
        quantity
      });
    }
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update cart item quantity
router.put('/update/:id', authenticateToken, requireVerified, [
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { quantity } = req.body;

    // Get cart item with product details
    const cartItemResult = await query(
      `SELECT ci.*, 
              CASE 
                WHEN ci.product_type = 'part' THEN p.quantity
                WHEN ci.product_type = 'merch' THEN m.quantity
              END as available_quantity
       FROM cart_items ci
       LEFT JOIN parts p ON ci.product_type = 'part' AND ci.product_id = p.id
       LEFT JOIN merchandise m ON ci.product_type = 'merch' AND ci.product_id = m.id
       WHERE ci.id = ? AND ci.user_id = ?`,
      [id, req.user.id]
    );

    if (cartItemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    const cartItem = cartItemResult.rows[0];

    // Check if requested quantity is available
    if (cartItem.available_quantity < quantity) {
      return res.status(400).json({ 
        error: 'Insufficient stock',
        message: `Only ${cartItem.available_quantity} items available`,
        available_quantity: cartItem.available_quantity
      });
    }

    // Update quantity
    await query(
      'UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [quantity, id]
    );

    res.json({ 
      message: 'Cart item updated successfully',
      quantity
    });
  } catch (error) {
    console.error('Update cart item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove item from cart
router.delete('/remove/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if item exists first
    const checkResult = await query(
      'SELECT id FROM cart_items WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    // Delete the item
    await query(
      'DELETE FROM cart_items WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    res.json({ message: 'Item removed from cart successfully' });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear entire cart
router.delete('/clear', authenticateToken, async (req, res) => {
  try {
    await query(
      'DELETE FROM cart_items WHERE user_id = ?',
      [req.user.id]
    );

    res.json({ message: 'Cart cleared successfully' });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get cart summary for checkout
router.get('/checkout-summary', authenticateToken, requireVerified, async (req, res) => {
  try {
    const result = await query(
      `SELECT ci.*, 
              CASE 
                WHEN ci.product_type = 'part' THEN p.name
                WHEN ci.product_type = 'merch' THEN m.name
              END as product_name,
              CASE 
                WHEN ci.product_type = 'part' THEN p.selling_price
                WHEN ci.product_type = 'merch' THEN m.price
              END as unit_price,
              CASE 
                WHEN ci.product_type = 'part' THEN p.quantity
                WHEN ci.product_type = 'merch' THEN m.quantity
              END as available_quantity,
              CASE 
                WHEN ci.product_type = 'part' THEN p.weight
                WHEN ci.product_type = 'merch' THEN m.weight
              END as weight
       FROM cart_items ci
       LEFT JOIN parts p ON ci.product_type = 'part' AND ci.product_id = p.id
       LEFT JOIN merchandise m ON ci.product_type = 'merch' AND ci.product_id = m.id
       WHERE ci.user_id = ?`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Calculate totals and validate stock
    let subtotal = 0;
    let totalWeight = 0;
    const cartItems = [];

    for (const item of result.rows) {
      // Check stock availability
      if (item.available_quantity < item.quantity) {
        return res.status(400).json({ 
          error: 'Insufficient stock',
          message: `Only ${item.available_quantity} ${item.product_name} available`,
          product_name: item.product_name,
          available_quantity: item.available_quantity,
          requested_quantity: item.quantity
        });
      }

      const itemTotal = item.unit_price * item.quantity;
      subtotal += itemTotal;
      totalWeight += (item.weight || 0) * item.quantity;

      cartItems.push({
        ...item,
        item_total: itemTotal
      });
    }

    const discount = getMembershipDiscount(req.user.membership_type);
    const discountAmount = subtotal * discount;
    const pointsEarned = calculatePointsEarned(subtotal, req.user.membership_type);

    res.json({
      cart_items: cartItems,
      summary: {
        subtotal,
        discount_percentage: discount * 100,
        discount_amount: discountAmount,
        total: subtotal - discountAmount,
        total_weight: totalWeight,
        item_count: cartItems.length,
        total_quantity: cartItems.reduce((sum, item) => sum + item.quantity, 0),
        points_earned: pointsEarned
      }
    });
  } catch (error) {
    console.error('Get checkout summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
