const { query } = require('./connection');

const migrateAddModels = async () => {
  try {
    console.log('Starting migration to add models table and API columns...');

    // Check if api_make_id column exists in brands table
    const brandColumns = await query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'brands' 
      AND COLUMN_NAME = 'api_make_id'
    `);

    if (brandColumns.rows.length === 0) {
      await query('ALTER TABLE brands ADD COLUMN api_make_id INT');
      console.log('Added api_make_id column to brands table.');
    } else {
      console.log('api_make_id column already exists in brands table.');
    }

    // Check if api_category_id column exists in categories table
    const categoryColumns = await query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'categories' 
      AND COLUMN_NAME = 'api_category_id'
    `);

    if (categoryColumns.rows.length === 0) {
      await query('ALTER TABLE categories ADD COLUMN api_category_id INT');
      console.log('Added api_category_id column to categories table.');
    } else {
      console.log('api_category_id column already exists in categories table.');
    }

    // Check if models table exists
    const tables = await query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'models'
    `);

    if (tables.rows.length === 0) {
      await query(`
        CREATE TABLE models (
          id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
          brand_id CHAR(36) NOT NULL,
          category_id CHAR(36) NULL,
          name VARCHAR(255) NOT NULL,
          api_model_id INT,
          api_make_id INT,
          year INT NULL,
          specifications JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
        )
      `);
      console.log('Created models table.');
    } else {
      console.log('Models table already exists.');
    }

    // Add indexes if they don't exist
    const indexes = [
      { name: 'idx_models_brand_id', table: 'models', column: 'brand_id' },
      { name: 'idx_models_category_id', table: 'models', column: 'category_id' },
      { name: 'idx_brands_api_make_id', table: 'brands', column: 'api_make_id' },
      { name: 'idx_categories_api_category_id', table: 'categories', column: 'api_category_id' }
    ];

    for (const index of indexes) {
      const existingIndex = await query(`
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      `, [index.table, index.name]);

      if (existingIndex.rows[0].count === 0) {
        await query(`CREATE INDEX ${index.name} ON ${index.table}(${index.column})`);
        console.log(`Created index ${index.name}.`);
      } else {
        console.log(`Index ${index.name} already exists.`);
      }
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  migrateAddModels()
    .then(() => {
      console.log('Migration process completed.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration process failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateAddModels };

