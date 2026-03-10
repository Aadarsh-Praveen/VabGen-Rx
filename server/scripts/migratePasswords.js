
require('dotenv').config({ path: '../.env' });
const bcrypt = require('bcrypt');
const { sql, poolPromise } = require('../db');

const SALT_ROUNDS = 12;

(async () => {
  try {
    console.log('🔐 Starting password migration...');
    const pool = await poolPromise;

    const result = await pool.request().query('SELECT id, email, password FROM users');
    const users  = result.recordset;
    console.log(`Found ${users.length} user(s) to migrate.`);

    for (const user of users) {
    
      if (user.password && user.password.startsWith('$2b$')) {
        console.log(`⏭️  Skipping ${user.email} — already hashed`);
        continue;
      }

      const hashed = await bcrypt.hash(user.password, SALT_ROUNDS);
      await pool.request()
        .input('id',       sql.Int,     user.id)
        .input('password', sql.VarChar, hashed)
        .query('UPDATE users SET password = @password WHERE id = @id');

      console.log(`✅ Hashed password for ${user.email}`);
    }

    console.log('🎉 Migration complete! All passwords are now bcrypt hashed.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
})();