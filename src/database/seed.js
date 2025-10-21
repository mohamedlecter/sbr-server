const { query } = require('./connection');

const seed = async () => {
  try {
    console.log('Starting database seeding...');

    // Insert sample brands
    const brands = [
      { name: 'Yamaha', description: 'Leading manufacturer of motorcycles and marine products' },
      { name: 'Kawasaki', description: 'Japanese manufacturer of motorcycles, ATVs, and watercraft' },
      { name: 'Honda', description: 'World\'s largest motorcycle manufacturer' },
      { name: 'Suzuki', description: 'Japanese multinational corporation specializing in motorcycles' },
      { name: 'Ducati', description: 'Italian manufacturer of motorcycles and engines' },
      { name: 'BMW', description: 'German luxury motorcycle manufacturer' },
      { name: 'KTM', description: 'Austrian motorcycle manufacturer' },
      { name: 'Harley-Davidson', description: 'American motorcycle manufacturer' }
    ];

    console.log('Inserting brands...');
    for (const brand of brands) {
      await query(
        'INSERT IGNORE INTO brands (name, description) VALUES (?, ?)',
        [brand.name, brand.description]
      );
    }

    // Insert sample categories
    const categories = [
      { name: 'Street Bikes', parent_id: null },
      { name: 'Sport Bikes', parent_id: null },
      { name: 'Cruiser Bikes', parent_id: null },
      { name: 'Off-Road Bikes', parent_id: null },
      { name: 'Jet Skis', parent_id: null },
      { name: 'ATVs', parent_id: null },
      { name: 'Engine Parts', parent_id: null },
      { name: 'Body Parts', parent_id: null },
      { name: 'Accessories', parent_id: null },
      { name: 'Electronics', parent_id: null },
      { name: 'Tires & Wheels', parent_id: null },
      { name: 'Brake System', parent_id: null },
      { name: 'Suspension', parent_id: null },
      { name: 'Exhaust System', parent_id: null }
    ];

    console.log('Inserting categories...');
    const categoryIds = {};
    for (const category of categories) {
      await query(
        'INSERT IGNORE INTO categories (name, parent_id) VALUES (?, ?)',
        [category.name, category.parent_id]
      );
      // Get the inserted category ID
      const getResult = await query(
        'SELECT id FROM categories WHERE name = ?',
        [category.name]
      );
      if (getResult.rows.length > 0) {
        categoryIds[category.name] = getResult.rows[0].id;
      }
    }

    // Get brand IDs
    const brandResult = await query('SELECT id, name FROM brands');
    const brandIds = {};
    brandResult.rows.forEach(brand => {
      brandIds[brand.name] = brand.id;
    });

    // Insert sample parts
    const parts = [
      {
        name: 'Yamaha R1 Engine Block',
        brand: 'Yamaha',
        category: 'Engine Parts',
        description: 'High-performance engine block for Yamaha R1 sport bikes',
        original_price: 2500.00,
        selling_price: 2200.00,
        quantity: 5,
        sku: 'YAM-R1-ENG-001',
        weight: 15.5,
        images: ['https://example.com/images/yamaha-r1-engine.jpg'],
        color_options: ['Black', 'Silver'],
        compatibility: ['Yamaha R1 2020-2024']
      },
      {
        name: 'Kawasaki Ninja Fairing Kit',
        brand: 'Kawasaki',
        category: 'Body Parts',
        description: 'Complete fairing kit for Kawasaki Ninja series',
        original_price: 800.00,
        selling_price: 720.00,
        quantity: 12,
        sku: 'KAW-NIN-FAIR-001',
        weight: 8.2,
        images: ['https://example.com/images/kawasaki-fairing.jpg'],
        color_options: ['Green', 'Black', 'White'],
        compatibility: ['Kawasaki Ninja 650', 'Kawasaki Ninja 1000']
      },
      {
        name: 'Honda CBR Exhaust System',
        brand: 'Honda',
        category: 'Exhaust System',
        description: 'Performance exhaust system for Honda CBR series',
        original_price: 450.00,
        selling_price: 400.00,
        quantity: 8,
        sku: 'HON-CBR-EXH-001',
        weight: 6.8,
        images: ['https://example.com/images/honda-exhaust.jpg'],
        color_options: ['Chrome', 'Black', 'Carbon Fiber'],
        compatibility: ['Honda CBR600RR', 'Honda CBR1000RR']
      },
      {
        name: 'Ducati Monster Brake Discs',
        brand: 'Ducati',
        category: 'Brake System',
        description: 'High-performance brake discs for Ducati Monster',
        original_price: 320.00,
        selling_price: 290.00,
        quantity: 15,
        sku: 'DUC-MON-BRK-001',
        weight: 2.5,
        images: ['https://example.com/images/ducati-brake.jpg'],
        color_options: ['Silver', 'Black'],
        compatibility: ['Ducati Monster 821', 'Ducati Monster 1200']
      },
      {
        name: 'BMW GS Suspension Kit',
        brand: 'BMW',
        category: 'Suspension',
        description: 'Upgraded suspension kit for BMW GS adventure bikes',
        original_price: 1200.00,
        selling_price: 1080.00,
        quantity: 6,
        sku: 'BMW-GS-SUS-001',
        weight: 12.3,
        images: ['https://example.com/images/bmw-suspension.jpg'],
        color_options: ['Black', 'Gold'],
        compatibility: ['BMW R1250GS', 'BMW F850GS']
      }
    ];

    console.log('Inserting parts...');
    for (const part of parts) {
      await query(
        `INSERT IGNORE INTO parts (brand_id, category_id, name, description, original_price, selling_price, 
                           quantity, sku, weight, images, color_options, compatibility)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          brandIds[part.brand],
          categoryIds[part.category],
          part.name,
          part.description,
          part.original_price,
          part.selling_price,
          part.quantity,
          part.sku,
          part.weight,
          JSON.stringify(part.images),
          JSON.stringify(part.color_options),
          JSON.stringify(part.compatibility)
        ]
      );
    }

    // Insert sample merchandise
    const merchandise = [
      {
        name: 'SBR Bike Store T-Shirt',
        description: 'Comfortable cotton t-shirt with SBR Bike Store logo',
        price: 25.00,
        quantity: 50,
        sku: 'SBR-TSHIRT-001',
        weight: 0.2,
        images: ['https://example.com/images/sbr-tshirt.jpg'],
        size_options: ['S', 'M', 'L', 'XL', 'XXL'],
        color_options: ['Black', 'White', 'Red', 'Blue']
      },
      {
        name: 'Motorcycle Helmet',
        description: 'High-quality motorcycle helmet with safety certification',
        price: 150.00,
        quantity: 20,
        sku: 'SBR-HELMET-001',
        weight: 1.5,
        images: ['https://example.com/images/helmet.jpg'],
        size_options: ['S', 'M', 'L', 'XL'],
        color_options: ['Black', 'White', 'Red', 'Blue', 'Yellow']
      },
      {
        name: 'Bike Gloves',
        description: 'Leather motorcycle gloves with knuckle protection',
        price: 45.00,
        quantity: 30,
        sku: 'SBR-GLOVES-001',
        weight: 0.3,
        images: ['https://example.com/images/gloves.jpg'],
        size_options: ['S', 'M', 'L', 'XL'],
        color_options: ['Black', 'Brown', 'Red']
      },
      {
        name: 'Motorcycle Jacket',
        description: 'Protective motorcycle jacket with armor inserts',
        price: 200.00,
        quantity: 15,
        sku: 'SBR-JACKET-001',
        weight: 2.0,
        images: ['https://example.com/images/jacket.jpg'],
        size_options: ['S', 'M', 'L', 'XL', 'XXL'],
        color_options: ['Black', 'Brown', 'Red', 'Blue']
      }
    ];

    console.log('Inserting merchandise...');
    for (const item of merchandise) {
      await query(
        `INSERT IGNORE INTO merchandise (name, description, price, quantity, sku, weight, images, size_options, color_options)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.name,
          item.description,
          item.price,
          item.quantity,
          item.sku,
          item.weight,
          JSON.stringify(item.images),
          JSON.stringify(item.size_options),
          JSON.stringify(item.color_options)
        ]
      );
    }

    // Insert sample partners
    const partners = [
      {
        name: 'Yamaha Middle East',
        description: 'Official Yamaha distributor for the Middle East region',
        about_page: 'Yamaha Middle East has been serving motorcycle enthusiasts across the region for over 20 years.',
        website_url: 'https://yamaha-middle-east.com',
        contact_email: 'info@yamaha-middle-east.com'
      },
      {
        name: 'Kawasaki Saudi Arabia',
        description: 'Authorized Kawasaki dealer and service center',
        about_page: 'Kawasaki Saudi Arabia provides sales, service, and parts for all Kawasaki motorcycles.',
        website_url: 'https://kawasaki-saudi.com',
        contact_email: 'contact@kawasaki-saudi.com'
      },
      {
        name: 'Honda Motorcycles KSA',
        description: 'Premier Honda motorcycle dealership in Saudi Arabia',
        about_page: 'Honda Motorcycles KSA offers the complete range of Honda motorcycles with expert service.',
        website_url: 'https://honda-motorcycles-ksa.com',
        contact_email: 'sales@honda-motorcycles-ksa.com'
      }
    ];

    console.log('Inserting partners...');
    for (const partner of partners) {
      await query(
        `INSERT IGNORE INTO partners (name, description, about_page, website_url, contact_email)
         VALUES (?, ?, ?, ?, ?)`,
        [partner.name, partner.description, partner.about_page, partner.website_url, partner.contact_email]
      );
    }

    console.log('Database seeding completed successfully!');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

// Run seeding if this file is executed directly
if (require.main === module) {
  seed();
}

module.exports = { seed };
