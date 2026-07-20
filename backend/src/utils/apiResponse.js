
// Small helpers so every controller returns responses in the same shape:
// { success, message, data } for success, { success, message } for errors.

function success(res, data = null, message = 'OK', statusCode = 200) {
  return res.status(statusCode).json({ success: true, message, data });
}

function created(res, data = null, message = 'Created') {
  return success(res, data, message, 201);
}

function error(res, message = 'Something went wrong', statusCode = 500, extra = {}) {
  return res.status(statusCode).json({ success: false, message, ...extra });
}

module.exports = { success, created, error };
