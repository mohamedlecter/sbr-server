const { query } = require('./connection');
const fs = require('fs');
const path = require('path');

const migrate = async () => {
    try {
        console.log('Starting database migration...');

        // Read the schema file
        const schemaPath = path.join(__dirname, 'schema.sql');
        let schema = fs.readFileSync(schemaPath, 'utf8');

        // --- ENHANCED FIX ---
        
        // 1. Remove SQL comments (starts with --) and replace newlines with a space
        schema = schema.replace(/--.*$/gm, '').replace(/\n/g, ' '); 

        // 2. Remove multiple spaces and trim
        schema = schema.replace(/\s+/g, ' ').trim();

        // 3. Split the schema into individual statements using ';'
        //    Then filter out any resulting empty statements.
        const statements = schema
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);
            
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
        console.error('Database query error:', error);
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

// Run migration if this file is executed directly
if (require.main === module) {
    migrate();
}

module.exports = { migrate };