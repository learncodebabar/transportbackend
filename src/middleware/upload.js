const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const ensureDirectoryExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'uploads/';
    
    if (file.fieldname === 'idCardFront' || file.fieldname === 'idCardBack') {
      folder += 'id-cards';
    } else if (file.fieldname === 'selfie') {
      folder += 'selfies';
    } else if (file.fieldname === 'biometricLeft' || file.fieldname === 'biometricRight') {
      folder += 'biometrics';
    } else if (file.fieldname === 'license') {
      folder += 'licenses';
    } else {
      folder += 'others';
    }
    
    ensureDirectoryExists(folder);
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image and PDF files are allowed'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter,
});

// Middleware for multiple file uploads
const uploadRiderDocuments = upload.fields([
  { name: 'idCardFront', maxCount: 1 },
  { name: 'idCardBack', maxCount: 1 },
  { name: 'selfie', maxCount: 1 },
  { name: 'biometricLeft', maxCount: 1 },
  { name: 'biometricRight', maxCount: 1 },
  { name: 'license', maxCount: 1 },
]);

module.exports = { upload, uploadRiderDocuments };