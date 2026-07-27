const { getDb, queryOne, closeDb } = require('./db');
const bcrypt = require('bcryptjs');

async function test() {
  console.log('=== TESTING DATABASE INIT ===');
  const db = await getDb();
  
  // Check users
  const users = queryOne('SELECT COUNT(*) as cnt FROM users');
  console.log('Users count:', users.cnt);
  
  const admin = queryOne("SELECT * FROM users WHERE role = 'admin'");
  console.log('Admin found:', admin ? admin.username : 'NO');
  if (admin) {
    console.log('Admin password hash:', admin.password.substring(0, 20) + '...');
    const pwCheck = bcrypt.compareSync('Admin@123', admin.password);
    console.log('Password match for Admin@123:', pwCheck ? 'YES' : 'NO');
  }
  
  const student = queryOne("SELECT * FROM users WHERE username = 'student'");
  console.log('Student found:', student ? student.username : 'NO');
  if (student) {
    const pwCheck2 = bcrypt.compareSync('Student@123', student.password);
    console.log('Password match for Student@123:', pwCheck2 ? 'YES' : 'NO');
  }
  
  // Check questions
  const qs = queryOne('SELECT COUNT(*) as cnt FROM questions');
  console.log('Questions count:', qs.cnt);
  
  // Direct login test
  const loginUser = queryOne('SELECT id, username, email, password, role, full_name, is_active FROM users WHERE username = ? LIMIT 1', ['admin']);
  console.log('');
  console.log('Direct login query for admin:');
  console.log('  Found:', loginUser ? 'YES' : 'NO');
  console.log('  Active:', loginUser ? loginUser.is_active : 'N/A');
  console.log('  Role:', loginUser ? loginUser.role : 'N/A');
  if (loginUser) {
    const pwCheck3 = bcrypt.compareSync('Admin@123', loginUser.password);
    console.log('  Password correct:', pwCheck3 ? 'YES' : 'NO (WRONG PASSWORD!)');
  }
  
  await closeDb();
  console.log('');
  console.log('=== ALL CHECKS COMPLETE ===');
}
test().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
