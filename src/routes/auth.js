const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query } = require('../database/connection');
const { v4: uuidv4 } = require('uuid');
// const { sendVerificationEmail, sendVerificationSMS } = require('../utils/verification');
const { generateVerificationCode } = require('../utils/helpers');

const router = express.Router();

// Register new user
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { full_name, email, phone, password } = req.body;

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = ? OR phone = ?',
      [email, phone]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        error: 'User already exists',
        message: 'A user with this email or phone number already exists'
      });
    }

    // Hash password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Generate verification code
    const verification_code = generateVerificationCode();
    const verification_expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Generate UUID for user id
    const id = uuidv4();

    // Create user
    const result = await query(
      `INSERT INTO users (id, full_name, email, phone, password_hash, verification_code, verification_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, full_name, email, phone, password_hash, verification_code, verification_expires_at]
    );

    // Get the created user
    const userResult = await query(
      'SELECT id, full_name, email, phone, membership_type, membership_points, created_at FROM users WHERE email = ?',
      [email]
    );

    const user = userResult.rows[0];

    // Send verification code via email
    try {
      // await sendVerificationEmail(email, verification_code);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
    }

    // Send verification code via SMS if phone provided
    if (phone) {
      try {
        // await sendVerificationSMS(phone, verification_code);
      } catch (smsError) {
        console.error('Failed to send verification SMS:', smsError);
      }
    }

    res.status(201).json({
      message: 'User registered successfully. Please verify your account.',
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        membership_type: user.membership_type,
        membership_points: user.membership_points,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
const registerAdmin = async (req, res) => {
  // simailr to register but with admin privileges
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { full_name, email, phone, password } = req.body;

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = ? OR phone = ?',
      [email, phone]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        error: 'User already exists',
        message: 'A user with this email or phone number already exists'
      });
    }

    // Hash password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Generate verification code
    const verification_code = generateVerificationCode();
    const verification_expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Generate UUID for user id
    const id = uuidv4();

    // Create user
    const result = await query(
      `INSERT INTO users (id, full_name, email, phone, password_hash, verification_code, verification_expires_at, is_admin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, full_name, email, phone, password_hash, verification_code, verification_expires_at, true]
    );

    // Get the created user
    const userResult = await query(
      'SELECT id, full_name, email, phone, is_admin, created_at FROM users WHERE email = ?',
      [email]
    );

    const user = userResult.rows[0];

    // Send verification code via email
    try {
      // await sendVerificationEmail(email, verification_code);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
    }

    // Send verification code via SMS if phone provided
    if (phone) {
      try {
        // await sendVerificationSMS(phone, verification_code);
      } catch (smsError) {
        console.error('Failed to send verification SMS:', smsError);
      }
    }

    res.status(201).json({
      message: 'User registered successfully. Please verify your account.',
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        is_admin: user.is_admin,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Verify user account
const verifyAccount = async (req, res) => {
  try {
    const { email, verification_code } = req.body;

    const result = await query(
      'SELECT id, verification_code, verification_expires_at FROM users WHERE email = ?',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (!user.verification_code) {
      return res.status(400).json({ error: 'Account already verified' });
    }

    if (user.verification_code !== verification_code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    if (new Date() > user.verification_expires_at) {
      return res.status(400).json({ error: 'Verification code expired' });
    }

    // Update user as verified
    await query(
      'UPDATE users SET email_verified = true, verification_code = NULL, verification_expires_at = NULL WHERE id = ?',
      [user.id]
    );

    res.json({ message: 'Account verified successfully' });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const result = await query(
      'SELECT id, full_name, email, phone, password_hash, membership_type, membership_points, email_verified FROM users WHERE email = ?',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Check if account is verified
    // if (!user.email_verified) {
    //   return res.status(401).json({ 
    //     error: 'Account not verified',
    //     message: 'Please verify your account before logging in'
    //   });
    // }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        membership_type: user.membership_type
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        membership_type: user.membership_type,
        membership_points: user.membership_points
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
const loginAdmin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
  
  const { email, password } = req.body;

  const result = await query(
    'SELECT id, full_name, email, phone, is_admin, password_hash FROM users WHERE email = ? AND is_admin = true',
    [email]
  );
  
  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid credentials or user is not an admin' });
  }

  const user = result.rows[0];
  
  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    return res.status(401).json({ error: 'Invalid credentials or user is not an admin' });
  }

  const token = jwt.sign(
    { 
      userId: user.id, 
      email: user.email,
      is_admin: user.is_admin
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      is_admin: user.is_admin
    }
  });
} catch (error) {
  console.error('Login error:', error);
  res.status(500).json({ error: 'Internal server error' });
}
};

// Request password reset
const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    const result = await query(
      'SELECT id, email FROM users WHERE email = ?',
      [email]
    );

    if (result.rows.length === 0) {
      // Don't reveal if email exists or not
      return res.json({ message: 'If the email exists, a reset code has been sent' });
    }

    const user = result.rows[0];
    const reset_code = generateVerificationCode();
    const reset_expires_at = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store reset code
    await query(
      'UPDATE users SET verification_code = ?, verification_expires_at = ? WHERE id = ?',
      [reset_code, reset_expires_at, user.id]
    );

    // Send reset code via email
    try {
      // await sendVerificationEmail(email, reset_code, 'password reset');
    } catch (emailError) {
      console.error('Failed to send reset email:', emailError);
    }

    res.json({ message: 'If the email exists, a reset code has been sent' });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Reset password
const resetPassword = async (req, res) => {
  try {
    const { email, verification_code, new_password } = req.body;

    const result = await query(
      'SELECT id, verification_code, verification_expires_at FROM users WHERE email = ?',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (!user.verification_code) {
      return res.status(400).json({ error: 'No reset code found' });
    }

    if (user.verification_code !== verification_code) {
      return res.status(400).json({ error: 'Invalid reset code' });
    }

    if (new Date() > user.verification_expires_at) {
      return res.status(400).json({ error: 'Reset code expired' });
    }

    // Hash new password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(new_password, saltRounds);

    // Update password and clear reset code
    await query(
      'UPDATE users SET password_hash = ?, verification_code = NULL, verification_expires_at = NULL WHERE id = ?',
      [password_hash, user.id]
    );

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Validation middleware
const registerValidation = [
  body('full_name').trim().isLength({ min: 2, max: 255 }).withMessage('Full name must be between 2 and 255 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').optional().isMobilePhone().withMessage('Valid phone number is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
];

const verifyValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('verification_code').isLength({ min: 6, max: 6 }).withMessage('Verification code must be 6 digits')
];

const resetRequestValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
];

const resetPasswordValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('verification_code').isLength({ min: 6, max: 6 }).withMessage('Reset code must be 6 digits'),
  body('new_password').isLength({ min: 8 }).withMessage('New password must be at least 8 characters long')
];

// Define routes
router.post('/register', [registerValidation, register]);
router.post('/register-admin', [registerValidation, registerAdmin]);
router.post('/verify', [verifyValidation, verifyAccount]);
router.post('/login', [loginValidation, login]);
router.post('/login-admin', [loginValidation, loginAdmin]);
router.post('/request-password-reset', [resetRequestValidation, requestPasswordReset]);
router.post('/reset-password', [resetPasswordValidation, resetPassword]);

module.exports = router;
