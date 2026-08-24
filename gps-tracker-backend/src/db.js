const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Supabase ke external connections ke liye yeh zaroori hota hai
    }
});

pool.on('connect', () => {
    console.log('[+] Connected to Supabase PostgreSQL');
});

pool.on('error', (err) => {
    console.error('[-] Supabase Database Error:', err);
    process.exit(-1);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};