/**
 * Database Seeding Script
 * * This script:
 * 1. Clears existing brands, categories, and models
 * 2. Inserts makes from provided JSON data as brands
 * 3. Inserts categories from provided JSON data
 * 4. Creates ~5 models per brand
 * 5. Adds a default administrative user.
 * * Usage:
 * npm run seed
 * * Note: Make sure to run the migration first if you haven't already:
 * node src/database/migrate_add_models.js
 */

const { query } = require('./connection');
// NOTE: You will need to install and configure 'bcrypt' or a similar library 
// and implement the actual hashPassword function in your project.
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Provided makes/brands JSON data
const MAKES_DATA = [
{ "id": "1", "name": "Yamaha" },
{ "id": "2", "name": "Honda" },
{ "id": "3", "name": "Kawasaki" },
{ "id": "4", "name": "Suzuki" },
{ "id": "5", "name": "Ducati" },
{ "id": "6", "name": "BMW" },
{ "id": "7", "name": "KTM" },
{ "id": "8", "name": "Harley-Davidson" },
{ "id": "9", "name": "Triumph" },
{ "id": "10", "name": "Aprilia" },
{ "id": "11", "name": "MV Agusta" },
{ "id": "12", "name": "Indian" },
{ "id": "13", "name": "Moto Guzzi" },
{ "id": "14", "name": "Benelli" },
{ "id": "15", "name": "Husqvarna" },
{ "id": "16", "name": "Royal Enfield" },
{ "id": "17", "name": "Bajaj" },
{ "id": "18", "name": "Hero" },
{ "id": "19", "name": "TVS" },
{ "id": "20", "name": "Kymco" },
{ "id": "21", "name": "Piaggio" },
  
];

// Provided categories JSON data
const CATEGORIES_DATA = [
  { "id": "1", "name": "Exhaust" },
  { "id": "2", "name": "Driveline" },
  { "id": "3", "name": "Carbon" },
  { "id": "4", "name": "Suspension" },
  { "id": "5", "name": "Chassis" },
  { "id": "6", "name": "Engine" },
  { "id": "7", "name": "Electronics" },
  { "id": "8", "name": "Accessories" },
  { "id": "9", "name": "Brake System" },
  { "id": "10", "name": "Wheels & Tires" },
  { "id": "11", "name": "Body Parts" },
  
];

// Helper function to generate model names for a brand
const generateModelsForBrand = (brandName) => {
  // Brand-specific model name patterns
  const modelPatterns = {
    'Yamaha': ['R1', 'R6', 'MT-07', 'MT-09', 'FZ-09', 'XSR900', 'Tracer 900', 'YZF-R3', 'Super Tenere', 'VMAX'],
    'Honda': ['CBR1000RR', 'CBR600RR', 'CB650R', 'CB1000R', 'Africa Twin', 'Gold Wing', 'Rebel 500', 'CRF450R', 'Grom', 'Shadow'],
    'Kawasaki': ['Ninja ZX-10R', 'Ninja ZX-6R', 'Ninja 650', 'Z900', 'Z650', 'Versys 650', 'KLR 650', 'Vulcan', 'H2', 'KLX'],
    'Suzuki': ['GSX-R1000', 'GSX-R600', 'GSX-S1000', 'Hayabusa', 'V-Strom 650', 'V-Strom 1000', 'DR-Z400', 'Boulevard', 'RM-Z450', 'SV650'],
    'Ducati': ['Panigale V4', 'Panigale V2', 'Monster', 'Multistrada', 'Diavel', 'Scrambler', 'SuperSport', 'Hypermotard', 'Streetfighter', 'DesertX'],
    'BMW': ['S1000RR', 'R1250GS', 'F850GS', 'R nineT', 'K1600', 'F800R', 'G310R', 'M1000RR', 'R18', 'C400X'],
    'KTM': ['1290 Super Duke', '890 Duke', '790 Duke', '390 Duke', '1290 Adventure', '790 Adventure', '450 SX-F', '350 EXC-F', 'RC 390', '690 Enduro'],
    'Harley-Davidson': ['Street Glide', 'Road Glide', 'Fat Boy', 'Sportster', 'Softail', 'Breakout', 'Low Rider', 'Pan America', 'LiveWire', 'Iron 883'],
    'Triumph': ['Speed Triple', 'Street Triple', 'Tiger 900', 'Tiger 1200', 'Bonneville', 'Scrambler', 'Rocket 3', 'Daytona', 'Thruxton', 'Trident'],
    'Aprilia': ['RSV4', 'Tuono V4', 'RS 660', 'Tuono 660', 'Shiver', 'Dorsoduro', 'Caponord', 'Mana', 'SXV', 'Pegaso'],
    'MV Agusta': ['F4', 'Brutale', 'Dragster', 'Turismo Veloce', 'Rivale', 'Stradale', 'F3', 'Superveloce', 'Turismo', 'Brutale 800'],
    'Indian': ['Scout', 'Chief', 'Challenger', 'FTR', 'Springfield', 'Roadmaster', 'Dark Horse', 'Pursuit', 'Scout Bobber', 'Chieftain'],
    'Moto Guzzi': ['V7', 'V9', 'V85 TT', 'California', 'Griso', 'Stelvio', 'Breva', 'Norge', 'Bellagio', 'V11'],
    'Benelli': ['TNT 600', 'TNT 300', 'TRK 502', 'Leoncino', 'Imperiale', '302R', '752S', 'Tornado', 'TNT 899', 'BN 600'],
    'Husqvarna': ['701 Enduro', '701 Supermoto', 'Vitpilen 701', 'Svartpilen 701', 'Vitpilen 401', 'Svartpilen 401', 'TE 300', 'FE 501', 'TC 250', 'FC 450'],
    'Royal Enfield': ['Classic 350', 'Bullet 350', 'Interceptor 650', 'Continental GT', 'Himalayan', 'Meteor 350', 'Thunderbird', 'GT 650', 'Hunter 350', 'Scram 411'],
    'Bajaj': ['Pulsar 200', 'Pulsar 150', 'Dominar 400', 'Avenger', 'Discover', 'CT 100', 'Platina', 'NS 200', 'RS 200', 'KTM Duke'],
    'Hero': ['Splendor', 'Passion', 'HF Deluxe', 'Glamour', 'Xtreme', 'Karizma', 'Hunk', 'Achiever', 'CBZ', 'Impulse'],
    'TVS': ['Apache RTR', 'Apache RR 310', 'Jupiter', 'Scooty', 'Star City', 'Sport', 'Wego', 'Ntorq', 'Raider', 'Ronin'],
    'Kymco': ['AK 550', 'Xciting', 'Downtown', 'Like', 'Agility', 'Super 8', 'People', 'Grand Vista', 'G-Dink', 'KRV'],
    'Piaggio': ['Vespa', 'Beverly', 'Medley', 'Liberty', 'MP3', 'X10', 'Fly', 'Zip', 'Typhoon', 'GTS']
  };

  // Get brand-specific models or use generic ones
  const brandModels = modelPatterns[brandName] || [
    'Sport', 'Touring', 'Adventure', 'Naked', 'Cruiser', 'Super Sport', 'Classic', 'Enduro', 'Scrambler', 'Cafe Racer'
  ];

  // Return 5 random models from the brand-specific list
  const shuffled = [...brandModels].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 5).map((modelName, index) => ({
    name: `${brandName} ${modelName}`,
    year: 2020 + (index % 4), // Years between 2020-2023
    specifications: null
  }));
};

// Function to add a default admin user
const addAdminUser = async () => {
  console.log('Adding default admin user...');
  const email = 'admin@admin.com';
  const plainPassword = 'admin@admin'; // NOTE: Change this in a production environment!
  let hashedPassword;

  try {
    // Check if the user already exists
    const userCheck = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (userCheck.rows.length > 0) {
      console.log(`  ⚠ Admin user with email ${email} already exists. Skipping insertion.`);
      return;
    }
    
    // Hash the password (Requires a real hashing function like one using bcrypt)
    try {
      hashedPassword = await bcrypt.hash(plainPassword, 12);
    } catch (e) {
      console.error('  Error hashing password. Ensure `hashPassword` function is correctly implemented:', e.message);
      // For seeding purposes, if hashing fails, we'll stop to prevent inserting a plaintext password.
      // In a real scenario, the hashing utility should be robust.
      throw new Error('Password hashing failed.'); 
    }

    // Insert the admin user with a placeholder role (assuming a `role` column exists)
    await query(
      'INSERT INTO users (id, full_name, email, password_hash, is_admin) VALUES (?, ?, ?, ?, ?)',
      [uuidv4(), 'Admin', email, hashedPassword, true]
    );
    console.log(`  ✓ Default admin user inserted: ${email} (Password: ${plainPassword} - Hashed)`);

  } catch (error) {
    console.error('  ✗ Error inserting admin user:', error.message);
    throw error;
  }
};


const seed = async () => {
  try {
    console.log('Starting database seeding...');

    // Step 1: Clear existing data
    console.log('Clearing existing data...');
    // Note: Do not clear the 'users' table in this step if you want the admin user to persist 
    // across multiple structural data seeds. For a complete reset, uncomment the 'DELETE FROM users' line.
    await query('DELETE FROM models');
    await query('DELETE FROM parts WHERE brand_id IS NOT NULL');
    await query('DELETE FROM brands');
    await query('DELETE FROM categories');
    // await query('DELETE FROM users'); 
    console.log('Existing data cleared (excluding users).');

    // Step 2: Insert Makes (Brands) from provided JSON
    console.log(`Inserting ${MAKES_DATA.length} brands from provided data...`);
    const brandMap = {}; // Map API make ID to database brand ID

    for (const make of MAKES_DATA) {
      if (make.id && make.name) {
        try {
          const brandId = uuidv4();
          await query(
            'INSERT INTO brands (id, name) VALUES (?, ?)',
            [brandId, make.name]
          );
          
          brandMap[make.id] = brandId;
        } catch (error) {
          // Skip duplicates
          if (!error.message.includes('Duplicate entry') && !error.message.includes('ER_DUP_ENTRY')) {
            console.error(`Error inserting brand ${make.name}:`, error.message);
          } else {
            // If duplicate, get existing brand ID
            const existingBrand = await query(
              'SELECT id FROM brands WHERE name = ?',
              [make.name]
            );
            if (existingBrand.rows.length > 0) {
              brandMap[make.id] = existingBrand.rows[0].id;
            }
          }
        }
      }
    }
    console.log(`Inserted ${Object.keys(brandMap).length} brands.`);

    // Step 3: Insert Categories from provided JSON
    console.log(`Inserting ${CATEGORIES_DATA.length} categories from provided data...`);
    const categoryMap = {}; // Map API category ID to database category ID

    for (const category of CATEGORIES_DATA) {
      if (category.id && category.name) {
        try {
          const categoryId = uuidv4();
          await query(
            'INSERT INTO categories (id, name) VALUES (?, ?)',
            [categoryId, category.name]
          );
          
          categoryMap[category.id] = categoryId;
        } catch (error) {
          // Skip duplicates
          if (!error.message.includes('Duplicate entry') && !error.message.includes('ER_DUP_ENTRY')) {
            console.error(`Error inserting category ${category.name}:`, error.message);
          } else {
            // If duplicate, get existing category ID
            const existingCategory = await query(
              'SELECT id FROM categories WHERE name = ?',
              [category.name]
            );
            if (existingCategory.rows.length > 0) {
              categoryMap[category.id] = existingCategory.rows[0].id;
            }
          }
        }
      }
    }
    console.log(`Inserted ${Object.keys(categoryMap).length} categories.`);

    // Step 4: Create models for all brands (~5 models per brand)
    console.log('Creating models for all brands...');
    let totalModels = 0;

    for (let i = 0; i < MAKES_DATA.length; i++) {
      const make = MAKES_DATA[i];
      if (!make.id || !make.name) continue;

      const brandId = brandMap[make.id];
      if (!brandId) {
        console.log(`  Warning: Brand ID not found for ${make.name}`);
        continue;
      }

      try {
        // Generate ~5 models for this brand
        const modelsToCreate = generateModelsForBrand(make.name);
        let modelsInserted = 0;
        let modelsSkipped = 0;

        for (const modelData of modelsToCreate) {
          try {
            await query(
              'INSERT INTO models (id, brand_id, name, year, specifications) VALUES (?, ?, ?, ?, ?)',
              [uuidv4(), brandId, modelData.name, modelData.year, modelData.specifications]
            );
            modelsInserted++;
            totalModels++;
          } catch (error) {
            // Skip duplicate models
            if (error.message.includes('Duplicate entry') || error.message.includes('ER_DUP_ENTRY')) {
              modelsSkipped++;
            } else {
              console.error(`  Error inserting model ${modelData.name}:`, error.message);
            }
          }
        }
        console.log(`  ✓ Created ${modelsInserted} models for ${make.name}${modelsSkipped > 0 ? ` (${modelsSkipped} duplicates skipped)` : ''}`);
      } catch (error) {
        console.error(`  ✗ Error creating models for ${make.name}:`, error.message);
      }
    }
    
    // Step 5: Add a default administrative user
    await addAdminUser();

    console.log(`\nTotal models inserted: ${totalModels}`);

    console.log('\nDatabase seeding completed successfully!');
    console.log(`Summary:`);
    console.log(`  - Brands: ${Object.keys(brandMap).length}`);
    console.log(`  - Categories: ${Object.keys(categoryMap).length}`);
    console.log(`  - Models: ${totalModels} (from ${MAKES_DATA.length} brands)`);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

// Run seeding if this file is executed directly
if (require.main === module) {
  seed()
    .then(() => {
      console.log('\nSeed process completed.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed process failed:', error);
      process.exit(1);
    });
}

module.exports = { seed };