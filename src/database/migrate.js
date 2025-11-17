const { query } = require('./connection');
const fs = require('fs');
const path = require('path');

const migrate = async () => {
    try {
        console.log('Starting database migration...');
        
        // Read the schema file
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // --- START OF FIX ---
        // 1. Split the schema into individual statements using ';'
        // 2. Filter out empty strings and comments that result from the split
        const statements = schema
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--')); 
            
        console.log(`Found ${statements.length} SQL statements to execute.`);

        // Execute each statement sequentially
        for (const statement of statements) {
            // Optional: Log the statement being executed (for debugging)
            // console.log(`Executing: ${statement.substring(0, 50)}...`);
            await query(statement);
        }
        // --- END OF FIX ---
        
        console.log('Database migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
        // Log the specific SQL command that caused the failure if you wish
        // console.error('Failing SQL:', error.sql); 
        process.exit(1);
    }
};

// Run migration if this file is executed directly
if (require.main === module) {
    migrate();
}

module.exports = { migrate };