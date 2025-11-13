const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create subdirectories based on URL path
    let subDir = 'general';
    const urlPath = req.originalUrl || req.url || '';
    
    if (urlPath.includes('/brands')) {
      subDir = 'brands';
    } else if (urlPath.includes('/categories')) {
      subDir = 'categories';
    } else if (urlPath.includes('/parts')) {
      subDir = 'parts';
    } else if (urlPath.includes('/merchandise')) {
      subDir = 'merchandise';
    } else if (urlPath.includes('/partners')) {
      subDir = 'partners';
    }
    
    const dir = path.join(uploadsDir, subDir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp-random-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

// File filter - only images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: fileFilter
});

// Middleware for single image upload (for logos, category images)
const uploadSingle = (fieldName = 'image') => {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
          }
          return res.status(400).json({ error: `Upload error: ${err.message}` });
        }
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  };
};

// Middleware for multiple images (for parts, merchandise)
const uploadMultiple = (fieldName = 'images', maxCount = 10) => {
  return (req, res, next) => {
    upload.array(fieldName, maxCount)(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: `Too many files. Maximum is ${maxCount} files.` });
          }
          return res.status(400).json({ error: `Upload error: ${err.message}` });
        }
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  };
};

// Helper to get file URL from file path
const getFileUrl = (file) => {
  if (!file) return null;
  
  // If it's already a URL, return as is
  if (typeof file === 'string' && (file.startsWith('http://') || file.startsWith('https://'))) {
    return file;
  }
  
  // If it's a file object from multer
  if (file.path) {
    // Convert absolute path to relative URL
    const relativePath = file.path.replace(uploadsDir, '').replace(/\\/g, '/');
    return `/uploads${relativePath}`;
  }
  
  // If it's already a relative path
  if (typeof file === 'string' && file.startsWith('/uploads')) {
    return file;
  }
  
  return null;
};

// Helper to process multiple files
const processFiles = (files) => {
  if (!files) return [];
  if (Array.isArray(files)) {
    return files.map(file => getFileUrl(file)).filter(url => url !== null);
  }
  const url = getFileUrl(files);
  return url ? [url] : [];
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  getFileUrl,
  processFiles
};

