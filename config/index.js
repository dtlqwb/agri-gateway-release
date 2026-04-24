/**
 * 应用配置文件
 * 集中管理所有可配置项
 */

// API配置
const API_CONFIG = {
  // 旧供应商API配置
  OLD_SUPPLIER: {
    BASE_URL: process.env.OLD_API_BASE || 'http://60.188.243.23:28111',
    USER: process.env.OLD_API_USER || '2dd7d00ac0ac421caa398f47c65cee6b',
    KEY: process.env.OLD_API_KEY || '998c50f71d4740a79d11d0101f196f8f',
    ENABLED: process.env.ENABLE_OLD_SYNC === 'true',
    TIMEOUT: 10000, // 请求超时时间（毫秒）
  },
  
  // 云途安API配置
  YUNTINAN: {
    BASE_URL: process.env.YUNTINAN_API_BASE || 'https://api.yuntinan.com',
    USERNAME: process.env.YUNTINAN_USERNAME || '',
    PASSWORD: process.env.YUNTINAN_PASSWORD || '',
    TOKEN_CACHE_DURATION: 24 * 60 * 60 * 1000, // Token缓存时长（24小时）
  },
};

// 数据库配置
const DB_CONFIG = {
  HOST: process.env.DB_HOST || 'localhost',
  PORT: parseInt(process.env.DB_PORT) || 3306,
  USER: process.env.DB_USER || 'root',
  PASSWORD: process.env.DB_PASSWORD || '',
  DATABASE: process.env.DB_NAME || 'agri_gateway',
  CONNECTION_LIMIT: 10,
};

// 服务器配置
const SERVER_CONFIG = {
  PORT: parseInt(process.env.PORT) || 3001,
  JWT_SECRET: process.env.JWT_SECRET || 'default-secret-change-in-production',
  TOKEN_EXPIRY: 24 * 60 * 60 * 1000, // Token过期时间（24小时）
};

// 同步任务配置
const SYNC_CONFIG = {
  // 云途安定时同步
  YUNTINAN_AUTO_SYNC: {
    ENABLED: process.env.ENABLE_YUNTINAN_SYNC !== 'false',
    CRON_EXPRESSION: '0 2 * * *', // 每天凌晨2点
    INITIAL_DELAY: 10000, // 首次启动延迟（10秒）
  },
  
  // 旧供应商定时同步
  OLD_SUPPLIER_AUTO_SYNC: {
    ENABLED: process.env.ENABLE_OLD_SYNC === 'true',
    CRON_EXPRESSION: '0 4 * * *', // 每天凌晨4点
  },
  
  // 旧供应商爬虫（已禁用）
  OLD_CRAWLER: {
    ENABLED: process.env.ENABLE_OLD_CRAWLER === 'true',
  },
};

// 文件上传配置
const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 最大文件大小（10MB）
  UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
  ALLOWED_TYPES: ['.xlsx', '.xls'],
};

// 日志配置
const LOG_CONFIG = {
  LEVEL: process.env.LOG_LEVEL || 'info', // debug, info, warn, error
  ENABLE_CONSOLE: true,
  ENABLE_FILE: false,
};

// 业务配置
const BUSINESS_CONFIG = {
  // 默认作业类型
  DEFAULT_WORK_TYPE: '其他',
  
  // 分页配置
  PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 500,
  
  // 数据保留天数
  DATA_RETENTION_DAYS: 365,
};

module.exports = {
  API_CONFIG,
  DB_CONFIG,
  SERVER_CONFIG,
  SYNC_CONFIG,
  UPLOAD_CONFIG,
  LOG_CONFIG,
  BUSINESS_CONFIG,
};
