const crypto = require('crypto');

// Generate a 6-digit verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Generate a random string of specified length
const generateRandomString = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Format currency
const formatCurrency = (amount, currency = 'SAR') => {
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency: currency
  }).format(amount);
};

// Calculate membership discount based on membership type
const getMembershipDiscount = (membershipType) => {
  const discounts = {
    silver: 0,
    gold: 0.05,    // 5%
    diamond: 0.10, // 10%
    platinum: 0.15, // 15%
    garage: 0.20   // 20%
  };
  
  return discounts[membershipType] || 0;
};

// Calculate points earned based on purchase amount
const calculatePointsEarned = (amount, membershipType) => {
  const pointRates = {
    silver: 1,    // 1 point per SAR
    gold: 1.2,   // 1.2 points per SAR
    diamond: 1.5, // 1.5 points per SAR
    platinum: 2,  // 2 points per SAR
    garage: 2.5   // 2.5 points per SAR
  };
  
  const rate = pointRates[membershipType] || 1;
  return Math.floor(amount * rate);
};

// Check if user can upgrade membership based on points
const canUpgradeMembership = (currentType, points) => {
  const upgradeThresholds = {
    silver: 1000,   // 1000 points to gold
    gold: 2500,     // 2500 points to diamond
    diamond: 5000,  // 5000 points to platinum
    platinum: 10000 // 10000 points to garage
  };
  
  return points >= (upgradeThresholds[currentType] || Infinity);
};

// Get next membership level
const getNextMembershipLevel = (currentType) => {
  const levels = ['silver', 'gold', 'diamond', 'platinum', 'garage'];
  const currentIndex = levels.indexOf(currentType);
  return currentIndex < levels.length - 1 ? levels[currentIndex + 1] : null;
};

// Validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate phone number (Saudi format)
const isValidSaudiPhone = (phone) => {
  const phoneRegex = /^(\+966|966|0)?[5-9][0-9]{8}$/;
  return phoneRegex.test(phone);
};

// Sanitize input string
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str.trim().replace(/[<>]/g, '');
};

// Generate order number
const generateOrderNumber = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `SBR-${timestamp}-${random}`.toUpperCase();
};

// Calculate shipping cost based on address and order weight
const calculateShippingCost = (country, weight) => {
  const baseCosts = {
    'Saudi Arabia': 0,      // Free shipping within Saudi
    'UAE': 50,
    'Kuwait': 45,
    'Qatar': 40,
    'Bahrain': 35,
    'Oman': 55
  };
  
  const baseCost = baseCosts[country] || 100; // Default international shipping
  const weightMultiplier = Math.ceil(weight / 5); // Additional cost per 5kg
  
  return baseCost + (weightMultiplier * 10);
};

// Format date for display
const formatDate = (date, locale = 'en-SA') => {
  return new Date(date).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Pagination helper
function paginate(page, limit) {
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;
  const offset = (pageNum - 1) * limitNum;
  return { offset, limit: limitNum };
}


module.exports = {
  generateVerificationCode,
  generateRandomString,
  formatCurrency,
  getMembershipDiscount,
  calculatePointsEarned,
  canUpgradeMembership,
  getNextMembershipLevel,
  isValidEmail,
  isValidSaudiPhone,
  sanitizeString,
  generateOrderNumber,
  calculateShippingCost,
  formatDate,
  paginate
};
