// One-off script to create your first Super Admin (platform-level)
// login. Run once with `node create-platform-admin.js` from inside
// backend/, then delete this file (or just leave it — running it again
// will fail harmlessly on the unique email constraint).
//
// Edit the name/email/password below before running.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./src/config/db').basePrisma;

const NAME = 'Deep Lexica';  // platform admin Change it when needed
const EMAIL = 'deeplexica@platformadmin.com'; // platform admin Change it when needed
const PASSWORD = 'deep123';  // platform admin

(async () => {
  const password_hash = await bcrypt.hash(PASSWORD, 10);
  const admin = await prisma.platformAdmin.create({
    data: { name: NAME, email: EMAIL, password_hash },
  });

  // Build the portal URL from .env values
  const appDomain = process.env.APP_DOMAIN || 'localhost';
  const platformSubdomain = process.env.PLATFORM_SUBDOMAIN || 'platformadmin';
  // Vite default port for local dev — adjust if your frontend runs on a different port
  const frontendPort = process.env.FRONTEND_PORT || '5173';
  const portalUrl = `http://${platformSubdomain}.${appDomain}:${frontendPort}/platform/login`;

  console.log('');
  console.log('✅ Platform Admin created successfully!');
  console.log('   Name  :', admin.name);
  console.log('   Email :', admin.email);
  console.log('');
  console.log('🔗 Platform Admin Portal URL:');
  console.log('  ', portalUrl);
  console.log('');
  console.log('⚠️  Keep this URL private — share only with authorised platform admins.');
  console.log('');

  await prisma.$disconnect();
})().catch(async (err) => {
  console.error('Failed to create platform admin:', err.message);
  await prisma.$disconnect();
  process.exit(1);
});