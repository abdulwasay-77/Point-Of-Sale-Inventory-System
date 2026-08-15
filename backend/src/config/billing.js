// One backend-owned threshold keeps warning timing consistent for every
// tenant. The subscription endpoint returns this value to the frontend so
// no UI component needs a duplicate hard-coded policy number.
const BILLING_WARNING_THRESHOLD_DAYS = 7;

module.exports = { BILLING_WARNING_THRESHOLD_DAYS };
