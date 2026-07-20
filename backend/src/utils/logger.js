
// Minimal leveled logger. Keeps console usage centralized so it's easy to
// swap for a real logging library (winston/pino) later without touching
// every module.
const levels = ['info', 'warn', 'error', 'debug'];

const logger = {};
levels.forEach((level) => {
  logger[level] = (...args) => {
    const timestamp = new Date().toISOString();
    const tag = `[${timestamp}] [${level.toUpperCase()}]`;
    if (level === 'error') {
      console.error(tag, ...args);
    } else {
      console.log(tag, ...args);
    }
  };
});

module.exports = logger;
