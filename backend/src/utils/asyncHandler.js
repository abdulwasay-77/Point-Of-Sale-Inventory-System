
// Wraps an async controller method so thrown errors / rejected promises
// are forwarded to next(err) automatically, instead of every controller
// needing its own try/catch.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = asyncHandler;
