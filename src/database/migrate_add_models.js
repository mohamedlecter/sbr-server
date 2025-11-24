const { query } = require('./connection');

const migrateAddModels = async () => {
  try {
    console.log('Starting migration to add models table...');

    // Drop indexes if they exist (must drop before dropping table)
    const indexes = [
      { name: 'idx_models_manufacturer_id', table: 'models', column: 'manufacturer_id' },
      { name: 'idx_models_category_id', table: 'models', column: 'category_id' }
    ];

    for (const index of indexes) {
      try {
        await query(`DROP INDEX ${index.name} ON ${index.table}`);
        console.log(`Dropped index ${index.name}.`);
      } catch (error) {
        // Index doesn't exist, which is fine
        if (!error.message.includes("doesn't exist") && !error.message.includes("Unknown key")) {
          console.log(`Index ${index.name} does not exist, skipping drop.`);
        }
      }
    }

    // Drop models table if it exists
    try {
      await query('DROP TABLE IF EXISTS models');
      console.log('Dropped models table (if it existed).');
    } catch (error) {
      console.log('Models table does not exist, skipping drop.');
    }

    // Create models table
    await query(`
      CREATE TABLE models (
        id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
        manufacturer_id CHAR(36) NOT NULL,
        category_id CHAR(36) NULL,
        name VARCHAR(255) NOT NULL,
        year INT NULL,
        specifications JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (manufacturer_id) REFERENCES manufacturers(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
      )
    `);
    console.log('Created models table.');

    // Create indexes
    for (const index of indexes) {
      await query(`CREATE INDEX ${index.name} ON ${index.table}(${index.column})`);
      console.log(`Created index ${index.name}.`);
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

