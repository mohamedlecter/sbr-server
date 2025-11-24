const { v4: uuidv4 } = require('uuid');
const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../database/connection');
const { authenticateToken, requireVerified } = require('../middleware/auth');
const { generateOrderNumber, calculateShippingCost, calculatePointsEarned, paginate } = require('../utils/helpers');

const router = express.Router();

// Create new order
router.post('/create', authenticateToken, requireVerified, [
  body('shipping_address_id').isUUID().withMessage('Valid shipping address ID is required'),
  body('payment_method').isIn(['sadad', 'paypal', 'cash', 'pay_later', 'stripe']).withMessage('Valid payment method is required'),
  body('notes').optional().isString().withMessage('Notes must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { shipping_address_id, payment_method, notes } = req.body;

    // Verify shipping address belongs to user
    const addressResult = await query(
      'SELECT * FROM addresses WHERE id = ? AND user_id = ?',
      [shipping_address_id, req.user.id]
    );

    if (addressResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shipping address not found' });
    }

    const shippingAddress = addressResult.rows[0];

    // Get cart items
    const cartResult = await query(
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

    if (cartResult.rows.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Validate stock and calculate totals
    let subtotal = 0;
    let totalWeight = 0;
    const orderItems = [];

    for (const item of cartResult.rows) {
      if (item.available_quantity < item.quantity) {
        return res.status(400).json({ 
          error: 'Insufficient stock',
          message: `Only ${item.available_quantity} ${item.product_name} available`
        });
      }

      const itemTotal = item.unit_price * item.quantity;
      subtotal += itemTotal;
      totalWeight += (item.weight || 0) * item.quantity;

      orderItems.push({
        product_type: item.product_type,
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.unit_price
      });
    }

    // Calculate shipping cost
    const shippingCost = calculateShippingCost(shippingAddress.country, totalWeight);
    const totalAmount = subtotal + shippingCost;

    // Create order in transaction
    const orderResult = await transaction(async (client) => {
      // Create order
      const orderId = uuidv4(); // Generate UUID for order
      const orderNumber = generateOrderNumber();

      // Insert order
      await client.query(
        `INSERT INTO orders (id, user_id, order_number, status, total_amount, shipping_address_id, payment_status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, req.user.id, orderNumber, 'pending', totalAmount, shipping_address_id, 'unpaid', notes || null]
      );
     // Insert order items
      for (const item of orderItems) {
        await client.query(
          `INSERT INTO order_items (order_id, product_type, product_id, quantity, price)
           VALUES (?, ?, ?, ?, ?)`,
          [orderId, item.product_type, item.product_id, item.quantity, item.price]
        );
      }

      // Insert payment record
      const paymentId = uuidv4();
      await client.query(
        `INSERT INTO payments (id, order_id, method, amount, status)
         VALUES (?, ?, ?, ?, ?)`,
        [paymentId, orderId, payment_method, totalAmount, 'pending']
      );

      // Update stock
      for (const item of orderItems) {
        const table = item.product_type === 'part' ? 'parts' : 'merchandise';
        await client.query(`UPDATE ${table} SET quantity = quantity - ? WHERE id = ?`, [
          item.quantity,
          item.product_id
        ]);
      }

      // Clear cart
      await client.query('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);

      // Fetch order and payment for response
      const [orderRows] = await client.query('SELECT * FROM orders WHERE id = ?', [orderId]);
      const [paymentRows] = await client.query('SELECT * FROM payments WHERE id = ?', [paymentId]);

      return { order: orderRows[0], payment: paymentRows[0], orderNumber };
    });

    res.status(201).json({
      message: 'Order created successfully',
      order: {
        id: orderResult.order.id,
        order_number: orderResult.orderNumber,
        status: orderResult.order.status,
        total_amount: orderResult.order.total_amount,
        shipping_cost: shippingCost,
        subtotal,
        payment_status: orderResult.order.payment_status,
        created_at: orderResult.order.created_at
      },
      payment: {
        id: orderResult.payment.id,
        method: orderResult.payment.method,
        amount: orderResult.payment.amount,
        status: orderResult.payment.status
      }
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's orders
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const { offset, limit: queryLimit } = paginate(page, limit);

    let whereClause = 'WHERE o.user_id = ?';
    const queryParams = [req.user.id];

    if (status) {
      whereClause += ' AND o.status = ?';
      queryParams.push(status);
    }

    // Main query
    const result = await query(
      `SELECT o.*, a.label as shipping_address_label, a.city, a.country,
              COUNT(oi.id) as item_count
       FROM orders o
       JOIN addresses a ON o.shipping_address_id = a.id
       LEFT JOIN order_items oi ON o.id = oi.order_id
       ${whereClause}
       GROUP BY o.id, a.label, a.city, a.country
       ORDER BY o.created_at DESC
       LIMIT ${queryLimit} OFFSET ${offset}`,
      queryParams
    );

    // Total count
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

// Get single order details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get order details
    const orderResult = await query(
      `SELECT o.*, a.*, a.label as shipping_address_label
       FROM orders o
       JOIN addresses a ON o.shipping_address_id = a.id
       WHERE o.id = ? AND o.user_id = ?`,
      [id, req.user.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Get order items
    const itemsResult = await query(
      `SELECT oi.*, 
              CASE 
                WHEN oi.product_type = 'part' THEN p.name
                WHEN oi.product_type = 'merch' THEN m.name
              END as product_name,
              CASE 
                WHEN oi.product_type = 'part' THEN p.images
                WHEN oi.product_type = 'merch' THEN m.images
              END as product_images,
              CASE 
                WHEN oi.product_type = 'part' THEN b.name
                ELSE NULL
              END as manufacturer_name
       FROM order_items oi
       LEFT JOIN parts p ON oi.product_type = 'part' AND oi.product_id = p.id
       LEFT JOIN merchandise m ON oi.product_type = 'merch' AND oi.product_id = m.id
       LEFT JOIN manufacturers b ON oi.product_type = 'part' AND p.manufacturer_id = b.id
       WHERE oi.order_id = ?`,
      [id]
    );

    // Get payment details
    const paymentResult = await query(
      'SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC',
      [id]
    );

    res.json({
      order: {
        id: order.id,
        status: order.status,
        total_amount: order.total_amount,
        payment_status: order.payment_status,
        tracking_number: order.tracking_number,
        notes: order.notes,
        created_at: order.created_at,
        updated_at: order.updated_at,
        shipping_address: {
          label: order.shipping_address_label,
          country: order.country,
          city: order.city,
          street: order.street,
          postal_code: order.postal_code
        }
      },
      items: itemsResult.rows,
      payments: paymentResult.rows
    });
  } catch (error) {
    console.error('Get order details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel order (only if not shipped)
router.put('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if order exists and belongs to user
    const orderResult = await query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Check if order can be cancelled
    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'Order is already cancelled' });
    }

    if (order.status === 'shipped' || order.status === 'delivered') {
      return res.status(400).json({ error: 'Cannot cancel shipped or delivered orders' });
    }

    // Cancel order and restore stock
    await transaction(async (client) => {
      // Update order status
      await client.query(
        'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['cancelled', id]
      );

      // Get order items to restore stock
      const itemsResult = await client.query(
        'SELECT product_type, product_id, quantity FROM order_items WHERE order_id = ?',
        [id]
      );
      console.log("itemsResult", itemsResult);

      // Restore stock
      for (const item of itemsResult[0]) {
        if (item.product_type === 'part') {
          await client.query(
            'UPDATE parts SET quantity = quantity + ? WHERE id = ?',
            [item.quantity, item.product_id]
          );
        } else {
          await client.query(
            'UPDATE merchandise SET quantity = quantity + ? WHERE id = ?',
            [item.quantity, item.product_id]
          );
        }
      }

      // Update payment status if needed
      await client.query(
        'UPDATE payments SET status = ? WHERE order_id = ? AND status = ?',
        ['refunded', id, 'completed']
      );
    });

    res.json({ message: 'Order cancelled successfully' });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Track order
router.get('/:id/track', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT o.status, o.tracking_number, o.created_at, o.updated_at,
              a.label as shipping_address_label, a.city, a.country
       FROM orders o
       JOIN addresses a ON o.shipping_address_id = a.id
       WHERE o.id = ? AND o.user_id = ?`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = result.rows[0];

    // Define status timeline
    const statusTimeline = [
      { status: 'pending', label: 'Order Placed', description: 'Your order has been placed and is being processed' },
      { status: 'paid', label: 'Payment Confirmed', description: 'Payment has been confirmed and order is being prepared' },
      { status: 'shipped', label: 'Shipped', description: 'Your order has been shipped and is on its way' },
      { status: 'delivered', label: 'Delivered', description: 'Your order has been delivered successfully' }
    ];

    const currentStatusIndex = statusTimeline.findIndex(s => s.status === order.status);
    const timeline = statusTimeline.map((status, index) => ({
      ...status,
      completed: index <= currentStatusIndex,
      current: index === currentStatusIndex
    }));

    res.json({
      order_id: id,
      status: order.status,
      tracking_number: order.tracking_number,
      timeline,
      shipping_address: {
        label: order.shipping_address_label,
        city: order.city,
        country: order.country
      },
      created_at: order.created_at,
      updated_at: order.updated_at
    });
  } catch (error) {
    console.error('Track order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
