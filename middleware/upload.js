/**
 * 文件上传配置中间件
 * @module middleware/upload
 * @description 使用磁盘存储，避免内存泄漏
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 上传目录
const uploadDir = path.join(__dirname, '..', 'uploads');

// 确保上传目录存在
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * 磁盘存储配置
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 使用时间戳+随机数生成唯一文件名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

/**
 * 上传配置
 */
const upload = multer({
  storage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 限制10MB
    files: 1 // 每次只允许一个文件
  },
  fileFilter: (req, file, cb) => {
    // 只允许Excel文件
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel' // .xls
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 .xlsx 或 .xls 格式的Excel文件'), false);
    }
  }
});

module.exports = upload;
