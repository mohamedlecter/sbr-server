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
        //    Then filter out any resulting empty statements and USE statements
        //    (USE is not supported in prepared statements and is not needed since
        //    the database is already specified in the connection pool)
        const statements = schema
            .split(';')
            .map(s => s.trim())
            .filter(s => {
                // Filter out empty statements and USE statements
                if (s.length === 0) return false;
                const upperStatement = s.toUpperCase().trim();
                if (upperStatement.startsWith('USE ')) {
                    console.log('Skipping USE statement (database already specified in connection pool)');
                    return false;
                }
                return true;
            });
            
        console.log(`Found ${statements.length} SQL statements to execute.`);

        // Execute each statement sequentially
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            // Log DROP and CREATE statements for clarity
            const statementType = statement.toUpperCase().trim().substring(0, 4);
            if (statementType === 'DROP' || statementType === 'CREA') {
                console.log(`Executing statement ${i + 1}/${statements.length}: ${statementType}...`);
            }
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