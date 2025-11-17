/**
 * Database Seeding Script
 * 
 * This script:
 * 1. Clears existing brands, categories, and models
 * 2. Inserts makes from provided JSON data as brands
 * 3. Inserts categories from provided JSON data
 * 4. Fetches models for famous brands only (to respect rate limits)
 * 
 * Usage:
 *   npm run seed
 */

const { query } = require('./connection'); // your DB connection helper
const https = require('https');
const bcrypt = require('bcryptjs');
const API_KEY = 'a9e3502d15msh462887bed5f186dp1d18c0jsn53d570692a14';
const API_HOST = 'motorcycle-specs-database.p.rapidapi.com';

// === DATA ===

// Example: Famous brands to fetch models for (to avoid rate limits)
const FAMOUS_BRANDS = ['Honda', 'Yamaha', 'Kawasaki', 'Suzuki', 'Ducati', 'BMW', 'Harley-Davidson'];

// Makes/brands JSON data (abbreviated, you can include all from your file)
const MAKES_DATA = [
  { "id": "1", "name": "Acabion" },
  { "id": "2", "name": "Access" },
  { "id": "3", "name": "Ace" },
  { "id": "196", "name": "Honda" },
  { "id": "231", "name": "Kawasaki" },
  { "id": "419", "name": "Suzuki" },
  { "id": "126", "name": "Ducati" },
  { "id": "55", "name": "BMW" },
  { "id": "181", "name": "Harley-Davidson" },
];

// Categories data example
const CATEGORIES_DATA = [
  { id: 1, name: 'Sport' },
  { id: 2, name: 'Cruiser' },
  { id: 3, name: 'Touring' },
  { id: 4, name: 'Scooter' },
  { id: 5, name: 'Dirt Bike' },
];

// === FUNCTIONS ===

// Function to fetch models from RapidAPI
function fetchModels(brandName) {
  const options = {
    hostname: API_HOST,
    path: `/models?brand=${encodeURIComponent(brandName)}`,
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': API_KEY,
      'X-RapidAPI-Host': API_HOST,
    },
  };

  return new Promise((resolve, reject) => {
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.models || []);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

// Insert brands
async function insertBrands() {
  console.log('Clearing existing brands...');
  await query('DELETE FROM brands');
  console.log('Inserting brands...');
  for (const make of MAKES_DATA) {
    await query('INSERT INTO brands (id, name) VALUES (?, ?)', [make.id, make.name]);
  }
  console.log('Brands inserted!');
}

// Insert categories
async function insertCategories() {
  console.log('Clearing existing categories...');
  await query('DELETE FROM categories');
  console.log('Inserting categories...');
  for (const cat of CATEGORIES_DATA) {
    await query('INSERT INTO categories (id, name) VALUES (?, ?)', [cat.id, cat.name]);
  }
  console.log('Categories inserted!');
}

// Insert models for famous brands
async function insertModels() {
  console.log('Clearing existing models...');
  await query('DELETE FROM models');

  for (const make of MAKES_DATA) {
    if (FAMOUS_BRANDS.includes(make.name)) {
      console.log(`Fetching models for ${make.name}...`);
      try {
        const models = await fetchModels(make.name);
        for (const model of models) {
          await query(
            'INSERT INTO models (name, brand_id) VALUES (?, ?)',
            [model.name, make.id]
          );
        }
        console.log(`${models.length} models inserted for ${make.name}`);
      } catch (err) {
        console.error(`Error fetching models for ${make.name}:`, err.message);
      }
    }
  }
}

addAdminUser = async () => {
  let password_hash = await bcrypt.hash('admin@admin', 12);
  await query('INSERT INTO users (full_name, email, password_hash, is_admin) VALUES (?, ?, ?, ?)', ['Admin', 'admin@admin.com', password_hash, true]);
}

// Main seeding function
async function seedDatabase() {
  try {
    await insertBrands();
    await insertCategories();
    await insertModels();
    await addAdminUser();
    console.log('Database seeding completed!');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
}

// Start seeding
seedDatabase();
