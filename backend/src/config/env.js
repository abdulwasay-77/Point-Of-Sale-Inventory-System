

const dotenv = require('dotenv');
dotenv.config();

// No fallback for JWT_SECRET on purpose. A hardcoded default secret
// means anyone who reads the source code (or finds it in a public repo)
// can forge a valid token for any user, including the primary admin — if
// this is ever unset in production, the server should refuse to start
// rather than silently run with a guessable key.
if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET is not set. Add it to backend/.env before starting the server — see .env.example.'
  );
}

module.exports = {
  port: process.env.PORT || 5000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  nodeEnv: process.env.NODE_ENV || 'development',
};


