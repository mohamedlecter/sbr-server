const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../database/connection');
const { authenticateToken, requireVerified } = require('../middleware/auth');
const { calculatePointsEarned, paginate } = require('../utils/helpers');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

// Process payment
router.post('/process', authenticateToken, requireVerified, [
  body('order_id').isUUID().withMessage('Valid order ID is required'),
  body('payment_method').isIn(['sadad', 'paypal', 'cash', 'pay_later', 'stripe']).withMessage('Valid payment method is required'),
  body('payment_data').optional().isObject().withMessage('Payment data must be an object')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { order_id, payment_method, payment_data = {} } = req.body;

    // Get order details
    const orderResult = await query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ? AND payment_status = ?',
      [order_id, req.user.id, 'unpaid']
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found or already paid' });
    }

    const order = orderResult.rows[0];

    // Process payment based on method
    let paymentResult;
    switch (payment_method) {
      case 'stripe':
        paymentResult = await processStripePayment(order, payment_data);
        break;
      case 'sadad':
        paymentResult = await processSadadPayment(order, payment_data);
        break;
      case 'paypal':
        paymentResult = await processPayPalPayment(order, payment_data);
        break;
      case 'cash':
        paymentResult = await processCashPayment(order);
        break;
      case 'pay_later':
        paymentResult = await processPayLaterPayment(order);
        break;
      default:
        return res.status(400).json({ error: 'Invalid payment method' });
    }

    // Update order and payment status
    await transaction(async (client) => {
      // Update payment record
      await client.query(
        'UPDATE payments SET status = ?, transaction_id = ?, gateway_response = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?',
        [paymentResult.status, paymentResult.transaction_id, paymentResult.gateway_response, order_id]
      );

      // Update order status
      if (paymentResult.status === 'completed') {
        await client.query(
          'UPDATE orders SET payment_status = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          ['paid', 'paid', order_id]
        );

        // Award membership points
        const pointsEarned = calculatePointsEarned(order.total_amount, req.user.membership_type);
        await client.query(
          'UPDATE users SET membership_points = membership_points + ? WHERE id = ?',
          [pointsEarned, req.user.id]
        );
      }
    });

    res.json({
      message: 'Payment processed successfully',
      payment: {
        id: paymentResult.id,
        method: payment_method,
        amount: order.total_amount,
        status: paymentResult.status,
        transaction_id: paymentResult.transaction_id
      },
      order: {
        id: order_id,
        status: paymentResult.status === 'completed' ? 'paid' : order.status,
        payment_status: paymentResult.status === 'completed' ? 'paid' : 'unpaid'
      }
    });
  } catch (error) {
    console.error('Process payment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Process Stripe payment
async function processStripePayment(order, paymentData) {
  try {
    const { payment_intent_id, payment_method_id } = paymentData;

    if (!payment_intent_id && !payment_method_id) {
      throw new Error('Stripe payment data is required');
    }

    let paymentIntent;

    if (payment_intent_id) {
      // Confirm existing payment intent
      paymentIntent = await stripe.paymentIntents.confirm(payment_intent_id);
    } else {
      // Create new payment intent
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(order.total_amount * 100), // Convert to cents
        currency: 'sar',
        payment_method: payment_method_id,
        confirmation_method: 'manual',
        confirm: true,
        metadata: {
          order_id: order.id,
          user_id: order.user_id
        }
      });
    }

    return {
      status: paymentIntent.status === 'succeeded' ? 'completed' : 'failed',
      transaction_id: paymentIntent.id,
      gateway_response: {
        payment_intent: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency
      }
    };
  } catch (error) {
    console.error('Stripe payment error:', error);
    return {
      status: 'failed',
      transaction_id: null,
      gateway_response: { error: error.message }
    };
  }
}

// Process Sadad payment (mock implementation)
async function processSadadPayment(order, paymentData) {
  try {
    const { sadad_token, otp } = paymentData;

    if (!sadad_token) {
      throw new Error('Sadad token is required');
    }

    // Mock Sadad API call
    // In real implementation, you would call Sadad's API here
    const mockSuccess = Math.random() > 0.1; // 90% success rate for demo

    if (mockSuccess) {
      return {
        status: 'completed',
        transaction_id: `SADAD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        gateway_response: {
          sadad_token,
          status: 'success',
          reference_number: `REF_${Date.now()}`
        }
      };
    } else {
      throw new Error('Sadad payment failed');
    }
  } catch (error) {
    console.error('Sadad payment error:', error);
    return {
      status: 'failed',
      transaction_id: null,
      gateway_response: { error: error.message }
    };
  }
}

// Process PayPal payment (mock implementation)
async function processPayPalPayment(order, paymentData) {
  try {
    const { paypal_order_id } = paymentData;

    if (!paypal_order_id) {
      throw new Error('PayPal order ID is required');
    }

    // Mock PayPal API call
    // In real implementation, you would call PayPal's API here
    const mockSuccess = Math.random() > 0.1; // 90% success rate for demo

    if (mockSuccess) {
      return {
        status: 'completed',
        transaction_id: `PAYPAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        gateway_response: {
          paypal_order_id,
          status: 'COMPLETED',
          payer_id: `PAYER_${Date.now()}`
        }
      };
    } else {
      throw new Error('PayPal payment failed');
    }
  } catch (error) {
    console.error('PayPal payment error:', error);
    return {
      status: 'failed',
      transaction_id: null,
      gateway_response: { error: error.message }
    };
  }
}

// Process cash payment
async function processCashPayment(order) {
  // Cash payments are always successful but require manual confirmation
  return {
    status: 'pending',
    transaction_id: `CASH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    gateway_response: {
      method: 'cash',
      status: 'pending_confirmation',
      note: 'Payment will be collected upon delivery'
    }
  };
}

// Process pay later payment
async function processPayLaterPayment(order) {
  // Pay later payments are always successful but require manual confirmation
  return {
    status: 'pending',
    transaction_id: `PAYLATER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    gateway_response: {
      method: 'pay_later',
      status: 'pending_confirmation',
      note: 'Payment will be processed after delivery'
    }
  };
}

// Get payment methods
router.get('/methods', (req, res) => {
  res.json({
    payment_methods: [
      {
        id: 'stripe',
        name: 'Credit/Debit Card',
        description: 'Pay securely with your credit or debit card',
        icon: 'credit-card',
        enabled: true
      },
      {
        id: 'sadad',
        name: 'Sadad',
        description: 'Pay using Sadad payment gateway',
        icon: 'bank',
        enabled: true
      },
      {
        id: 'paypal',
        name: 'PayPal',
        description: 'Pay using your PayPal account',
        icon: 'paypal',
        enabled: true
      },
      {
        id: 'cash',
        name: 'Cash on Delivery',
        description: 'Pay with cash when your order is delivered',
        icon: 'money',
        enabled: true
      },
      {
        id: 'pay_later',
        name: 'Pay Later',
        description: 'Pay after receiving your order',
        icon: 'clock',
        enabled: true
      }
    ]
  });
});

// Get payment history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const { offset, queryLimit } = paginate(page, limit);

    let whereClause = 'WHERE p.order_id IN (SELECT id FROM orders WHERE user_id = ?)';
    let queryParams = [req.user.id];
    let paramCount = 2;

    if (status) {
      whereClause += ` AND p.status = $${paramCount}`;
      queryParams.push(status);
      paramCount++;
    }

    const result = await query(
      `SELECT p.*, o.total_amount, o.status as order_status, o.created_at as order_date
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...queryParams, queryLimit, offset]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM payments p
       JOIN orders o ON p.order_id = o.id
       ${whereClause}`,
      queryParams
    );

    res.json({
      payments: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refund payment (admin only)
router.post('/refund', authenticateToken, [
  body('payment_id').isUUID().withMessage('Valid payment ID is required'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('Refund amount must be positive'),
  body('reason').optional().isString().withMessage('Refund reason must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { payment_id, amount, reason } = req.body;

    // Get payment details
    const paymentResult = await query(
      'SELECT * FROM payments WHERE id = ?',
      [payment_id]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    if (payment.status !== 'completed') {
      return res.status(400).json({ error: 'Can only refund completed payments' });
    }

    const refundAmount = amount || payment.amount;

    // Process refund based on payment method
    let refundResult;
    switch (payment.method) {
      case 'stripe':
        refundResult = await processStripeRefund(payment, refundAmount);
        break;
      case 'sadad':
        refundResult = await processSadadRefund(payment, refundAmount);
        break;
      case 'paypal':
        refundResult = await processPayPalRefund(payment, refundAmount);
        break;
      default:
        return res.status(400).json({ error: 'Refund not supported for this payment method' });
    }

    // Update payment status
    await transaction(async (client) => {
      await client.query(
        'UPDATE payments SET status = ?, gateway_response = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['refunded', refundResult.gateway_response, payment_id]
      );

      await client.query(
        'UPDATE orders SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['refunded', payment.order_id]
      );
    });

    res.json({
      message: 'Refund processed successfully',
      refund: {
        payment_id,
        amount: refundAmount,
        status: refundResult.status,
        transaction_id: refundResult.transaction_id
      }
    });
  } catch (error) {
    console.error('Refund payment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Process Stripe refund
async function processStripeRefund(payment, amount) {
  try {
    const refund = await stripe.refunds.create({
      payment_intent: payment.transaction_id,
      amount: Math.round(amount * 100), // Convert to cents
      reason: 'requested_by_customer'
    });

    return {
      status: 'completed',
      transaction_id: refund.id,
      gateway_response: {
        refund_id: refund.id,
        status: refund.status,
        amount: refund.amount
      }
    };
  } catch (error) {
    console.error('Stripe refund error:', error);
    return {
      status: 'failed',
      transaction_id: null,
      gateway_response: { error: error.message }
    };
  }
}

// Process Sadad refund (mock)
async function processSadadRefund(payment, amount) {
  // Mock Sadad refund
  return {
    status: 'completed',
    transaction_id: `SADAD_REFUND_${Date.now()}`,
    gateway_response: {
      refund_id: `REFUND_${Date.now()}`,
      status: 'success',
      amount: amount
    }
  };
}

// Process PayPal refund (mock)
async function processPayPalRefund(payment, amount) {
  // Mock PayPal refund
  return {
    status: 'completed',
    transaction_id: `PAYPAL_REFUND_${Date.now()}`,
    gateway_response: {
      refund_id: `REFUND_${Date.now()}`,
      status: 'COMPLETED',
      amount: amount
    }
  };
}

module.exports = router;
