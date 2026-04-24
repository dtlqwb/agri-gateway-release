/**
 * 旧供应商数据抓取服务
 * 使用 Playwright 自动登录并抓取作业数据
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const db = require('./db');

// 旧供应商平台配置
const CONFIG = {
  baseUrl: 'https://cooperation.bdqtagri.com',
  username: process.env.OLD_SUPPLIER_USERNAME || '13934760824',
  password: process.env.OLD_SUPPLIER_PASSWORD || '860824',
  headless: process.env.CRAWL_HEADLESS !== 'false' // 默认无头模式
};

/**
 * 解析算术验证码
 * @param {string} captchaText - 验证码文本，如 "9+6=?"
 * @returns {number|null} 计算结果
 */
function parseCaptcha(captchaText) {
  if (!captchaText) return null;
  
  // 匹配格式：数字 运算符 数字
  const match = captchaText.match(/(\d+)\s*([+\-*/])\s*(\d+)/);
  if (!match) return null;
  
  const [, a, op, b] = match;
  const numA = parseInt(a);
  const numB = parseInt(b);
  
  let result;
  switch (op) {
    case '+': result = numA + numB; break;
    case '-': result = numA - numB; break;
    case '*': result = numA * numB; break;
    case '/': result = Math.floor(numA / numB); break;
    default: return null;
  }
  
  console.log(`[验证码] ${captchaText} = ${result}`);
  return result;
}

/**
 * 登录旧供应商平台
 * @param {Page} page - Playwright页面对象
 * @returns {boolean} 是否登录成功
 */
async function login(page) {
  try {
    console.log('[登录] 访问登录页面...');
    await page.goto(CONFIG.baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
    
    // 等待登录表单加载
    await page.waitForSelector('input[name="username"], input[type="text"]', { timeout: 10000 });
    
    console.log('[登录] 填写用户名和密码...');
    // 尝试多种选择器
    const usernameSelectors = ['input[name="username"]', 'input[type="text"]:first-child', '#username'];
    const passwordSelectors = ['input[name="password"]', 'input[type="password"]', '#password'];
    
    let usernameFilled = false;
    for (const selector of usernameSelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          await el.fill(CONFIG.username);
          usernameFilled = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!usernameFilled) {
      throw new Error('未找到用户名输入框');
    }
    
    let passwordFilled = false;
    for (const selector of passwordSelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          await el.fill(CONFIG.password);
          passwordFilled = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!passwordFilled) {
      throw new Error('未找到密码输入框');
    }
    
    // 处理验证码
    console.log('[登录] 处理验证码...');
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        // 获取验证码文本
        const captchaSelectors = ['.captcha', '#captcha', '.verify-code', '[class*="captcha"]'];
        let captchaText = null;
        
        for (const selector of captchaSelectors) {
          try {
            const el = await page.$(selector);
            if (el) {
              captchaText = await el.textContent();
              if (captchaText && captchaText.trim()) {
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }
        
        if (captchaText) {
          const answer = parseCaptcha(captchaText);
          if (answer !== null) {
            // 填写验证码
            const captchaInputSelectors = ['input[name="captcha"]', 'input[name="code"]', '#captcha-input'];
            for (const selector of captchaInputSelectors) {
              try {
                const el = await page.$(selector);
                if (el) {
                  await el.fill(answer.toString());
                  break;
                }
              } catch (e) {
                continue;
              }
            }
          }
        }
        
        // 点击登录按钮
        console.log('[登录] 提交登录...');
        const loginButtonSelectors = ['button[type="submit"]', 'input[type="submit"]', '.login-btn', 'button:has-text("登录")'];
        let loginClicked = false;
        
        for (const selector of loginButtonSelectors) {
          try {
            const el = await page.$(selector);
            if (el) {
              await el.click();
              loginClicked = true;
              break;
            }
          } catch (e) {
            continue;
          }
        }
        
        if (!loginClicked) {
          throw new Error('未找到登录按钮');
        }
        
        // 等待跳转或错误提示
        await page.waitForTimeout(2000);
        
        // 检查是否登录成功（通过URL变化或特定元素）
        const currentUrl = page.url();
        if (!currentUrl.includes('login') && !currentUrl.includes('Login')) {
          console.log('[登录] ✅ 登录成功');
          return true;
        }
        
        // 检查是否有错误提示
        const errorSelectors = ['.error', '.alert-danger', '[class*="error"]', '[class*="alert"]'];
        for (const selector of errorSelectors) {
          try {
            const el = await page.$(selector);
            if (el) {
              const errorText = await el.textContent();
              if (errorText && errorText.trim()) {
                console.log(`[登录] 错误提示: ${errorText}`);
                // 如果是验证码错误，刷新重试
                if (errorText.includes('验证码') || errorText.includes('错误')) {
                  retryCount++;
                  console.log(`[登录] 验证码错误，第${retryCount}次重试...`);
                  await page.reload({ waitUntil: 'networkidle' });
                  continue;
                }
              }
            }
          } catch (e) {
            continue;
          }
        }
        
        // 如果没有明显错误，再检查一次URL
        if (!page.url().includes('login')) {
          console.log('[登录] ✅ 登录成功');
          return true;
        }
        
        retryCount++;
        console.log(`[登录] 登录失败，第${retryCount}次重试...`);
        await page.reload({ waitUntil: 'networkidle' });
        
      } catch (e) {
        console.error(`[登录] 第${retryCount + 1}次尝试失败:`, e.message);
        retryCount++;
        if (retryCount < maxRetries) {
          await page.reload({ waitUntil: 'networkidle' });
        }
      }
    }
    
    throw new Error(`登录失败，已重试${maxRetries}次`);
    
  } catch (e) {
    console.error('[登录] 失败:', e.message);
    throw e;
  }
}

/**
 * 导航到作业统计页面
 * @param {Page} page - Playwright页面对象
 */
async function navigateToWorkStats(page) {
  try {
    console.log('[导航] 进入作业统计页面...');
    
    // 尝试多种导航方式
    const navSelectors = [
      'a:has-text("作业统计")',
      'a:has-text("作业管理")',
      '[href*="work"]',
      '[href*="statistic"]',
      '.menu-item:has-text("作业")'
    ];
    
    for (const selector of navSelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          await el.click();
          await page.waitForTimeout(2000);
          console.log('[导航] ✅ 已进入作业统计页面');
          return true;
        }
      } catch (e) {
        continue;
      }
    }
    
    // 如果都没找到，尝试直接访问可能的URL
    const possibleUrls = [
      '/work/statistics',
      '/work/stats',
      '/statistics/work',
      '/admin/work'
    ];
    
    for (const urlPath of possibleUrls) {
      try {
        await page.goto(CONFIG.baseUrl + urlPath, { waitUntil: 'networkidle', timeout: 10000 });
        console.log(`[导航] 尝试访问: ${urlPath}`);
        return true;
      } catch (e) {
        continue;
      }
    }
    
    throw new Error('无法导航到作业统计页面');
    
  } catch (e) {
    console.error('[导航] 失败:', e.message);
    throw e;
  }
}

/**
 * 设置时间范围并导出Excel
 * @param {Page} page - Playwright页面对象
 * @param {Object} options - 选项
 * @param {number} options.days - 最近几天，默认7
 * @param {string} options.startDate - 开始日期（可选）
 * @param {string} options.endDate - 结束日期（可选）
 * @returns {string} 下载的Excel文件路径
 */
async function exportExcel(page, options = {}) {
  try {
    console.log('[导出] 设置时间范围...');
    
    const { days = 7, startDate, endDate } = options;
    
    // 计算日期范围
    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      end = new Date();
      start = new Date();
      start.setDate(start.getDate() - days);
    }
    
    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];
    
    console.log(`[导出] 时间范围: ${startDateStr} ~ ${endDateStr}`);
    
    // 查找并填写日期输入框
    const dateSelectors = {
      start: ['input[name="startDate"]', 'input[name="start_date"]', '#startDate', 'input[type="date"]:first-child'],
      end: ['input[name="endDate"]', 'input[name="end_date"]', '#endDate', 'input[type="date"]:last-child']
    };
    
    // 填写开始日期
    for (const selector of dateSelectors.start) {
      try {
        const el = await page.$(selector);
        if (el) {
          await el.fill(startDateStr);
          console.log('[导出] 已填写开始日期');
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // 填写结束日期
    for (const selector of dateSelectors.end) {
      try {
        const el = await page.$(selector);
        if (el) {
          await el.fill(endDateStr);
          console.log('[导出] 已填写结束日期');
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // 点击查询/搜索按钮（如果有）
    const searchButtonSelectors = ['button:has-text("查询")', 'button:has-text("搜索")', '.search-btn'];
    for (const selector of searchButtonSelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          await el.click();
          await page.waitForTimeout(1000);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // 点击下载/导出按钮
    console.log('[导出] 点击导出按钮...');
    const exportButtonSelectors = [
      'button:has-text("导出")',
      'button:has-text("下载")',
      'a:has-text("导出")',
      '.export-btn',
      '.download-btn',
      '[onclick*="export"]'
    ];
    
    let exportClicked = false;
    for (const selector of exportButtonSelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          // 监听下载事件
          const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 15000 }),
            el.click()
          ]);
          
          // 保存文件
          const downloadDir = path.join(__dirname, '..', 'downloads');
          if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
          }
          
          const fileName = `old_supplier_${Date.now()}.xlsx`;
          const filePath = path.join(downloadDir, fileName);
          await download.saveAs(filePath);
          
          console.log(`[导出] ✅ Excel已下载: ${filePath}`);
          exportClicked = true;
          return filePath;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!exportClicked) {
      throw new Error('未找到导出按钮');
    }
    
  } catch (e) {
    console.error('[导出] 失败:', e.message);
    throw e;
  }
}

/**
 * 执行完整的抓取流程
 * @param {Object} options - 抓取选项
 * @param {number} options.days - 最近几天，默认7
 * @param {string} options.startDate - 开始日期（可选）
 * @param {string} options.endDate - 结束日期（可选）
 * @returns {Object} 抓取结果
 */
async function crawlOldSupplierData(options = {}) {
  const { days = 7, startDate, endDate } = options;
  let browser = null;
  let logId = null;
  
  try {
    console.log('\n========== 开始抓取旧供应商数据 ==========');
    console.log(`配置: days=${days}, startDate=${startDate || 'N/A'}, endDate=${endDate || 'N/A'}`);
    
    // 创建抓取日志
    logId = await db.createCrawlLog('old');
    console.log(`[日志] 创建日志记录 ID: ${logId}`);
    
    // 启动浏览器
    console.log('[浏览器] 启动 Chromium...');
    browser = await chromium.launch({
      headless: CONFIG.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    
    // 步骤1: 登录
    await login(page);
    
    // 步骤2: 导航到作业统计页面
    await navigateToWorkStats(page);
    
    // 步骤3: 导出Excel
    const excelPath = await exportExcel(page, { days, startDate, endDate });
    
    // 步骤4: 解析Excel并导入数据库
    console.log('[处理] 解析Excel并导入数据库...');
    const excelParser = require('./excelParser');
    const importResult = await excelParser.parseAndImport(excelPath, 'old');
    
    // 更新日志
    await db.updateCrawlLog(logId, {
      status: 'success',
      total_records: importResult.totalRecords,
      new_records: importResult.newRecords,
      skip_records: importResult.skipRecords,
      finished_at: new Date()
    });
    
    console.log('\n========== 抓取完成 ==========');
    console.log(`总计: ${importResult.totalRecords} 条`);
    console.log(`新增: ${importResult.newRecords} 条`);
    console.log(`跳过: ${importResult.skipRecords} 条`);
    
    return {
      success: true,
      logId,
      ...importResult
    };
    
  } catch (e) {
    console.error('\n========== 抓取失败 ==========');
    console.error('错误:', e.message);
    
    // 更新日志为失败状态
    if (logId) {
      try {
        await db.updateCrawlLog(logId, {
          status: 'failed',
          error_msg: e.message,
          finished_at: new Date()
        });
      } catch (err) {
        console.error('[日志] 更新失败日志出错:', err.message);
      }
    }
    
    return {
      success: false,
      logId,
      error: e.message
    };
    
  } finally {
    // 关闭浏览器
    if (browser) {
      await browser.close();
      console.log('[浏览器] 已关闭');
    }
  }
}

module.exports = {
  crawlOldSupplierData,
  parseCaptcha
};
