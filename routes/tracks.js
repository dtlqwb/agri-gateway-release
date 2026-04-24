/**
 * 设备轨迹路由
 * @module routes/tracks
 * @description 处理设备轨迹查询和同步
 */

const express = require('express');
const router = express.Router();
const db = require('../services/db');
const yt = require('../services/yunTinanService');

/**
 * 获取设备作业轨迹（从数据库）
 * @route GET /api/tracks
 * @query {string} tNumber - 终端编号
 * @query {string} workDate - 作业日期
 */
router.get('/tracks', async (req, res) => {
  try {
    const { tNumber, workDate } = req.query;
    if (!tNumber || !workDate) {
      return res.json({ code: -1, msg: '缺少 tNumber 或 workDate 参数' });
    }
    const tracks = await db.getMachineTracks(tNumber, workDate);
    res.json({ code: 0, data: tracks, total: tracks.length });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * 同步设备轨迹（从云途安API拉取并保存到数据库）
 * @route POST /api/tracks/sync
 * @body {string} tNumber - 终端编号
 * @body {string} workDate - 作业日期
 */
router.post('/tracks/sync', async (req, res) => {
  try {
    const { tNumber, workDate } = req.body;
    if (!tNumber || !workDate) {
      return res.json({ code: -1, msg: '缺少 tNumber 或 workDate 参数' });
    }
    
    // 1. 从云途安API获取轨迹
    console.log(`[轨迹同步] 开始同步: ${tNumber} ${workDate}`);
    const tracks = await yt.getMachineTrack(tNumber, workDate);
    
    if (tracks.length === 0) {
      return res.json({ 
        code: 0, 
        msg: '该设备当天无轨迹数据', 
        data: [], 
        inserted: 0, 
        skipped: 0 
      });
    }

    // 2. 保存到数据库
    const result = await db.saveMachineTracks(tracks);
    
    console.log(`[轨迹同步] 完成: ${tNumber} ${workDate}, 新增 ${result.inserted} 条, 跳过 ${result.skipped} 条`);
    
    res.json({ 
      code: 0, 
      msg: '轨迹同步成功',
      data: tracks,
      inserted: result.inserted,
      skipped: result.skipped
    });
  } catch (e) {
    console.error('[轨迹同步] 失败:', e.message);
    res.json({ code: -1, msg: e.message });
  }
});

module.exports = router;
