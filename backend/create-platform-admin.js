// One-off script to create your first Super Admin (platform-level)
// login. Run once with `node create-platform-admin.js` from inside
// backend/, then delete this file (or just leave it — running it again
// will fail harmlessly on the unique email constraint).
//
// Edit the name/email/password below before running.
const bcrypt = require('bcryptjs');
const prisma = require('./src/config/db').basePrisma;

const NAME = 'Abdul Wasay';
const EMAIL = 'wasay@platformadmin.com';
const PASSWORD = 'wasay112';

(async () => {
  const password_hash = await bcrypt.hash(PASSWORD, 10);
  const admin = await prisma.platformAdmin.create({
    data: { name: NAME, email: EMAIL, password_hash },
  });
  console.log('Created platform admin:', admin.email);
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error('Failed to create platform admin:', err.message);
  await prisma.$disconnect();
  process.exit(1);
});