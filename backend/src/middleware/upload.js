const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Shared factory so every upload area (product images, avatars, business
// logo) gets its own subfolder under backend/uploads/ but the same
// filename/size/type rules — see app.js: app.use('/uploads', ...) serves
// all of them statically the same way.
function createUploader(subfolder) {
  const uploadDir = path.join(__dirname, '..', '..', 'uploads', subfolder);
  fs.mkdirSync(uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, unique);
    },
  });

  function fileFilter(req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }

  return multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB
}

module.exports = {
  product: createUploader('products'),
  // Profile module (avatar_url on User) — see profile.service.js.
  avatar: createUploader('avatars'),
  // Settings module (logo_url on BusinessSettings) — see settings.service.js.
  logo: createUploader('business'),
  // Billing keeps each payment proof in its own permanent audit record.
  paymentProof: createUploader('payment-proofs'),
};
