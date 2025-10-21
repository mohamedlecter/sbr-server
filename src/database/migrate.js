const { query } = require('./connection');
const fs = require('fs');
const path = require('path');

const migrate = async () => {
  try {
    console.log('Starting database migration...');
    
    // Read the schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute the schema
    await query(schema);
    
    console.log('Database migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
