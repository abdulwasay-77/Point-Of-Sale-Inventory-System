
const app = require('./app');
const dotenv = require('dotenv');
const cron = require('node-cron');
const { suspendExpiredSubscriptions } = require('./jobs/subscriptionExpiry.job');

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 5000;

// Scheduling belongs at the process entry point, not app.js, so importing
// the Express app for tests or another runner never registers a second job.
cron.schedule('0 0 * * *', () => {
  suspendExpiredSubscriptions().catch((error) => {
    console.error('Subscription expiry job failed:', error);
  });
});

app.listen(PORT, () => {
  console.log('🚀 Server is running!');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🏥 Health: http://localhost:${PORT}/api/health`);
  console.log(`📅 Started: ${new Date().toISOString()}`);
});
