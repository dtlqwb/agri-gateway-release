const axios = require('axios');
const fs = require('fs');
const path = require('path');

class YunTinanService {
  constructor() {
    this.baseUrl = process.env.YT_API_BASE || 'https://ss.yuntinan.com/prod-api';
    this.username = process.env.YT_USERNAME || 'alqx';
    this.password = process.env.YT_PASSWORD || '';
    this.token = null;
    this.tokenExpire = null;
    // 从环境变量读取设备号列表
    this._loadDeviceNumbers();
    // 目标地区（从API的county字段过滤）
    this.targetCounty = '灵丘县';
  }

  /**
   * 从 .env 文件加载设备号列表
   */
  _loadDeviceNumbers() {
    const envVal = process.env.YT_DEVICE_NUMBERS || '';
    this.knownDeviceNumbers = envVal
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    console.log(`[云途安] 从环境变量加载 ${this.knownDeviceNumbers.length} 个已知设备号`);
  }

  /**
   * 发现新设备时自动追加到 .env 文件
   */
  _saveNewDevices(newNumbers) {
    if (!newNumbers.length) return;
    const envPath = path.resolve(__dirname, '../.env');
    let content = fs.readFileSync(envPath, 'utf-8');
    const currentNumbers = this.knownDeviceNumbers.join(',');
    const updatedNumbers = currentNumbers + ',' + newNumbers.join(',');
    content = content.replace(
      /^YT_DEVICE_NUMBERS=.*$/m,
      `YT_DEVICE_NUMBERS=${updatedNumbers}`
    );
    fs.writeFileSync(envPath, content, 'utf-8');
    this.knownDeviceNumbers.push(...newNumbers);
    console.log(`[云途安] 已将 ${newNumbers.length} 个新设备号保存到 .env`);
  }

  /**
   * 登录获取JWT Token
   */
  async login() {
    // Token缓存未过期则直接用
    if (this.token && this.tokenExpire && Date.now() < this.tokenExpire) {
      return this.token;
    }

    console.log('[云途安] 登录中...', this.username);
    const res = await axios.post(`${this.baseUrl}/login`, {
      username: this.username,
      password: this.password
    });

    if (res.data.code !== 200) {
      throw new Error(`登录失败: ${res.data.msg}`);
    }

    this.token = res.data.token;
    // JWT有效期通常24小时，提前1小时刷新
    this.tokenExpire = Date.now() + 23 * 60 * 60 * 1000;
    console.log('[云途安] 登录成功，Token已缓存');
    return this.token;
  }

  /**
   * 带Token的请求
   */
  async request(method, path, data) {
    const token = await this.login();
    const res = await axios({
      method,
      url: `${this.baseUrl}${path}`,
      data,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      validateStatus: () => true
    });

    if (res.data.code === 401) {
      // Token过期，重新登录
      this.token = null;
      this.tokenExpire = null;
      return this.request(method, path, data);
    }

    return res.data;
  }

  /**
   * 判断作业记录是否在目标地区（灵丘县）
   * 策略：直接从API返回的county字段判断，不需要GPS计算
   */
  isRecordInTargetCounty(record) {
    // record 可能是原始API数据或已处理的记录
    const rawRecord = record._raw || record;
    return rawRecord.county === this.targetCounty;
  }

  /**
   * 获取面积统计（耕/种/管/收）
   * 注意：API返回的是所有地区的汇总数据，需要按county字段过滤
   * startDate: 可选，开始日期 (YYYY-MM-DD)
   * endDate: 可选，结束日期 (YYYY-MM-DD)
   */
  async getAcreStats(startDate = null, endDate = null) {
    // 策略：通过作业记录列表按county字段过滤后重新计算
    // 获取所有作业类型
    const workTypes = await this.getWorkTypes();
    const stats = { geng: 0, zhong: 0, guan: 0, shou: 0, total: 0 };
    const uniqueDevices = new Set();
    
    // workType 到 stage 的映射
    const stageMap = {
      '1': 'geng',   // 旋耕
      '2': 'geng',   // 深翻
      '3': 'geng',   // 秸秆还田
      '35': 'zhong', // 玉米播种
      '4': 'zhong',  // 播种
      '6': 'guan',   // 打药
      '7': 'shou',   // 玉米收获
      '5': 'shou'    // 收割
    };
    
    for (const wt of workTypes) {
      try {
        const records = await this.getAcreList(wt.value, null, startDate, endDate);
        const totalAcre = records.reduce((sum, r) => sum + (r.acre || 0), 0);
        
        // 收集设备号
        records.forEach(r => {
          if (r.tNumber) uniqueDevices.add(r.tNumber);
        });
        
        // 根据workType映射到stage
        const stage = stageMap[String(wt.value)];
        if (stage && stats.hasOwnProperty(stage)) {
          stats[stage] += totalAcre;
        }
        stats.total += totalAcre;
      } catch (e) {
        console.log(`[云途安] 获取作业类型 ${wt.value} 统计失败:`, e.message);
      }
    }
    
    return {
      ...stats,
      totalMachines: uniqueDevices.size
    };
  }

  /**
   * 获取农机列表
   * 策略：先用已知设备号逐个查询，再用 carinfo/list 兜底发现新设备
   */
  async getMachineList() {
    const allRows = [];
    const seenIds = new Set();
    const seenTNumbers = new Set();

    // 第1步：用已知设备号逐个查询
    console.log(`[云途安] 通过 tNumber 逐个查询 ${this.knownDeviceNumbers.length} 个已知设备...`);

    for (const tNumber of this.knownDeviceNumbers) {
      try {
        const resp = await this.request('POST', '/machine/carinfo/list', { tNumber });
        if (resp.code === 200 && resp.rows?.length > 0) {
          const m = resp.rows[0];
          if (!seenIds.has(m.id)) {
            seenIds.add(m.id);
            const tn = m.tNumber || m.tnumber;
            if (tn) seenTNumbers.add(tn);
            allRows.push(m);
          }
        }
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        console.log(`[云途安] 查询设备 ${tNumber} 失败:`, e.message);
      }
    }

    // 第2步：carinfo/list 兜底（最多10条，用于发现新设备）
    let newDeviceNumbers = [];
    try {
      const fallback = await this.request('POST', '/machine/carinfo/list', {});
      if (fallback.code === 200 && fallback.rows) {
        for (const m of fallback.rows) {
          const tn = m.tNumber || m.tnumber;
          if (!seenIds.has(m.id)) {
            seenIds.add(m.id);
            if (tn) seenTNumbers.add(tn);
            allRows.push(m);
            if (tn) newDeviceNumbers.push(tn);
            console.log(`[云途安] 发现新设备: ${tn} (${m.plateNo || m.tNo || ''})`);
          }
        }
      }
    } catch (e) {
      console.log(`[云途安] 兜底查询失败:`, e.message);
    }

    // 第3步：如果有新设备，逐个查询它们（可能列表中还有更多未发现的）
    if (newDeviceNumbers.length > 0) {
      for (const tn of newDeviceNumbers) {
        try {
          const resp = await this.request('POST', '/machine/carinfo/list', { tNumber: tn });
          if (resp.code === 200 && resp.rows?.length > 0) {
            const m = resp.rows[0];
            if (!seenIds.has(m.id)) {
              seenIds.add(m.id);
              const t = m.tNumber || m.tnumber;
              if (t) seenTNumbers.add(t);
              allRows.push(m);
            }
          }
          await new Promise(r => setTimeout(r, 100));
        } catch (e) { /* ignore */ }
      }
    }

    // 第4步：自动保存新发现的设备号到 .env
    const finalNewNumbers = [...seenTNumbers].filter(
      tn => !this.knownDeviceNumbers.includes(tn)
    );
    if (finalNewNumbers.length > 0) {
      this._saveNewDevices(finalNewNumbers);
    }

    console.log(`[云途安] 共获取 ${allRows.length} 台设备` +
      (finalNewNumbers.length > 0 ? `（新发现 ${finalNewNumbers.length} 台）` : ''));

    return {
      total: allRows.length,
      newDevices: finalNewNumbers.length,
      rows: allRows.map(m => this.formatMachine(m))
    };
  }

  /**
   * 获取作业面积记录（按日汇总）
   * workType: 作业类型(1=旋耕, 2=深翻, 3=秸秆还田, 35=玉米播种 等)
   * tNumber: 可选，按设备号过滤
   * startDate: 可选，开始日期 (YYYY-MM-DD)
   * endDate: 可选，结束日期 (YYYY-MM-DD)
   */
  async getAcreList(workType, tNumber = null, startDate = null, endDate = null) {
    const params = { workType: String(workType) };
    if (tNumber) params.tNumber = tNumber;
    const data = await this.request('POST', '/machine/acre/listp', params);
    if (data.code === 200) {
      const allRecords = (data.data || []).map(r => ({
        id: r.id,
        tNumber: r.tNumber,
        plateNo: r.plateNo || '',
        workType: r.workType,
        workDate: r.workDate ? r.workDate.substring(0, 10) : null,
        startDate: r.startDate,
        endDate: r.endDate,
        duration: r.duration || 0,        // 作业时长（秒）
        acre: r.acre || 0,               // 作业面积
        okAcre: r.okAcre || 0,           // 达标面积
        repeatAcre: r.repeatAcre || 0,   // 重复面积
        leaveAcre: r.leaveAcre || 0,     // 漏耕面积
        landGroup: r.landGroup || '',    // GPS围栏多边形
        county: r.county || '',          // 作业地区
        speed: r.speed || 0,
        _raw: r
      }));
      
      // 过滤出目标地区（灵丘县）的作业记录
      let filteredRecords = allRecords.filter(record => this.isRecordInTargetCounty(record));
      
      // 按日期范围过滤
      if (startDate || endDate) {
        filteredRecords = filteredRecords.filter(record => {
          if (!record.workDate) return false;
          if (startDate && record.workDate < startDate) return false;
          if (endDate && record.workDate > endDate) return false;
          return true;
        });
      }
      
      console.log(`[云途安] 作业类型 ${workType}: 总记录 ${allRecords.length} 条，${this.targetCounty}内 ${filteredRecords.length} 条`);
      
      return filteredRecords;
    }
    throw new Error(`获取作业记录失败: ${data.msg}`);
  }

  /**
   * 获取实时监控数据（所有设备的位置、状态、速度等）
   * tNumber: 可选，按设备号过滤
   */
  async getMonitorList(tNumber = null) {
    const params = {};
    if (tNumber) params.tNumber = tNumber;
    const data = await this.request('POST', '/machine/monitor/list', params);
    if (data.code === 200) {
      return (data.data || []).map(m => ({
        id: m.id,
        tNumber: m.tNumber,
        plateNo: m.plateNo || '',
        name: m.name || '',              // 机手名
        location: m.location || '',       // 位置描述
        lng: m.lng || 0,
        lat: m.lat || 0,
        speed: m.speed || 0,
        workType: m.work_type,
        workTypeLabel: m.work_type_label || '',
        acres: m.acres || 0,             // 年度面积
        status: m.status || '离线',       // 在线/离线
        expireTime: m.expire_time,
        date: m.date,                     // 最后更新时间
        carId: m.car_id,
        _raw: m
      }));
    }
    throw new Error(`获取监控数据失败: ${data.msg}`);
  }

  /**
   * 获取设备详情
   */
  async getMachineDetail(id) {
    const data = await this.request('GET', `/machine/carinfo/${id}`);
    if (data.code === 200) {
      return this.formatMachine(data.data);
    }
    throw new Error(`获取设备详情失败: ${data.msg}`);
  }

  /**
   * 获取作业类型列表
   */
  async getWorkTypes() {
    const data = await this.request('GET', '/machine/calendar/list/newListWorkType');
    if (data.code === 200) {
      const types = [];
      Object.entries(data.data).forEach(([stage, list]) => {
        list.forEach(item => {
          if (item.isEnable) {
            types.push({
              value: item.dictValue,
              label: item.dictLabel,
              stage: stage,
              icon: item.iconPath
            });
          }
        });
      });
      return types;
    }
    throw new Error(`获取作业类型失败: ${data.msg}`);
  }

  /**
   * 格式化农机数据为统一格式
   */
  formatMachine(m) {
    // 解析年面积（字符串如 "7.9亩" 或 "157.27亩"）
    let yearAcre = 0;
    if (m.yearAcre) {
      const match = String(m.yearAcre).match(/([\d.]+)/);
      if (match) yearAcre = parseFloat(match[1]);
    }

    // 解析作业工具列表
    const tools = (m.toolCodeList || []).map(t => ({
      toolCode: t.toolCode,
      workType: t.workTypeLabel || t.workType,
      workTool: t.toolTypeYbytLabel || t.toolTool,
      width: t.toolWidth,
      depth: t.deepMax,
      status: t.toolStatus
    }));

    return {
      id: m.id,
      tNumber: m.tNumber || m.tnumber,
      plateNo: m.plateNo || m.tNo || '',
      driverName: m.name || '',
      driverTel: m.tel || '',
      orgName: m.orgId || '',
      workType: m.workType || '',
      workTool: m.workTool || '',
      yearAcre: yearAcre,
      status: m.status || '离线',
      lastWorkDate: m.workDate ? m.workDate.substring(0, 10) : null,
      terminalName: m.dName || '',
      terminalModel: m.dMd || '',
      width: m.width,
      expireTime: m.expireTime,
      source: 'yuntinan',  // 标记数据来源
      _raw: m  // 保留原始数据
    };
  }
  /**
   * 获取设备作业轨迹（GPS点位）
   * tNumber: 终端号
   * workDate: 作业日期 (YYYY-MM-DD)
   */
  async getMachineTrack(tNumber, workDate) {
    try {
      const params = { tNumber, workDate };
      const data = await this.request('POST', '/machine/track/list', params);
      
      if (data.code === 200) {
        const tracks = (data.data || []).map(point => ({
          tNumber,
          workDate,
          trackTime: point.trackTime || point.time || point.date,
          longitude: parseFloat(point.lng || point.longitude || 0),
          latitude: parseFloat(point.lat || point.latitude || 0),
          speed: parseFloat(point.speed || 0),
          direction: parseFloat(point.direction || point.angle || 0),
          altitude: parseFloat(point.altitude || point.height || 0),
          workType: point.workType || '',
          status: point.status || ''
        }));
        console.log(`[云途安] 获取轨迹: ${tNumber} ${workDate}, 共 ${tracks.length} 个点`);
        return tracks;
      }
      return [];
    } catch (e) {
      console.log(`[云途安] 获取轨迹失败 [${tNumber}]:`, e.message);
      return [];
    }
  }

  /**
   * 拉取云途安作业数据并同步到本地DB
   * API 返回的是所有日期的累计数据，靠 DB 唯一索引去重
   * @param {'all'|'recent'} mode - all=全量拉取, recent=拉最近N天(默认7天)
   * @returns {{ records: Array, machineMap: Object, workTypeLabels: Object, mode: string }}
   */
  async syncData(mode = 'recent', recentDays = 7) {
    const label = mode === 'all' ? '全量' : `最近${recentDays}天`;
    console.log(`[云途安] 开始${label}同步作业数据...`);

    // 计算日期截止线（增量模式用）
    let cutoffDate = null;
    if (mode === 'recent') {
      const d = new Date();
      d.setDate(d.getDate() - recentDays);
      cutoffDate = d.toISOString().substring(0, 10);
    }

    // 1) 获取所有启用的作业类型
    const workTypes = await this.getWorkTypes();
    const enabledTypes = workTypes.map(t => ({ value: t.value, label: t.label }));
    const workTypeLabels = {};
    for (const wt of enabledTypes) {
      workTypeLabels[wt.value] = wt.label;
    }
    console.log(`[云途安] 共 ${enabledTypes.length} 个作业类型: ${enabledTypes.map(t => t.label).join(', ')}`);

    // 2) 获取设备列表（含合作社信息）
    let machineMap = {};
    try {
      const machineList = await this.getMachineList();
      for (const m of machineList.rows) {
        machineMap[m.tNumber] = m;
      }
      console.log(`[云途安] 获取 ${machineList.rows.length} 台设备信息`);
    } catch (e) {
      console.log(`[云途安] 获取设备列表失败:`, e.message);
    }

    // 3) 逐个作业类型查询面积记录（API返回所有日期，全量数据）
    const allRecords = [];
    for (const wt of enabledTypes) {
      try {
        const records = await this.getAcreList(wt.value);
        for (const r of records) {
          if (!r.workDate) continue;
          // 增量模式：只保留截止日期之后的记录
          if (cutoffDate && r.workDate < cutoffDate) continue;

          allRecords.push({
            apiId: r.id,  // API原始记录ID
            tNumber: r.tNumber,
            workType: wt.value,
            workTypeLabel: wt.label,
            workDate: r.workDate,
            acre: r.acre || 0,
            okAcre: r.okAcre || 0,
            repeatAcre: r.repeatAcre || 0,
            leaveAcre: r.leaveAcre || 0,
            duration: r.duration || 0,
            landGroup: r.landGroup || '',
            county: r.county || '',
            plateNo: r.plateNo || ''
          });
        }
        const matched = cutoffDate
          ? records.filter(r => r.workDate && r.workDate >= cutoffDate).length
          : records.filter(r => r.workDate).length;
        console.log(`[云途安] ${wt.label}: API返回 ${records.length} 条, 符合条件 ${matched} 条`);
      } catch (e) {
        console.log(`[云途安] 查询 ${wt.label} 失败:`, e.message);
      }
      // 间隔200ms避免请求过快
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[云途安] ${label}同步完成, 共 ${allRecords.length} 条作业记录`);
    return { records: allRecords, machineMap, workTypeLabels, mode };
  }

  /**
   * 同步指定日期的数据
   * @param {string} targetDate - 目标日期 (YYYY-MM-DD)
   */
  async syncSingleDate(targetDate) {
    console.log(`[云途安] 开始同步指定日期数据: ${targetDate}`);

    // 1) 获取所有启用的作业类型
    const workTypes = await this.getWorkTypes();
    const enabledTypes = workTypes.map(t => ({ value: t.value, label: t.label }));
    const workTypeLabels = {};
    for (const wt of enabledTypes) {
      workTypeLabels[wt.value] = wt.label;
    }
    console.log(`[云途安] 共 ${enabledTypes.length} 个作业类型`);

    // 2) 获取设备列表（含合作社信息）
    let machineMap = {};
    try {
      const machineList = await this.getMachineList();
      for (const m of machineList.rows) {
        machineMap[m.tNumber] = m;
      }
      console.log(`[云途安] 获取 ${machineList.rows.length} 台设备信息`);
    } catch (e) {
      console.log(`[云途安] 获取设备列表失败:`, e.message);
    }

    // 3) 逐个作业类型查询面积记录，过滤出指定日期
    const allRecords = [];
    for (const wt of enabledTypes) {
      try {
        const records = await this.getAcreList(wt.value);
        // 只保留目标日期的记录
        const matched = records.filter(r => r.workDate === targetDate);
        
        for (const r of matched) {
          allRecords.push({
            apiId: r.id,
            tNumber: r.tNumber,
            workType: wt.value,
            workTypeLabel: wt.label,
            workDate: r.workDate,
            acre: r.acre || 0,
            okAcre: r.okAcre || 0,
            repeatAcre: r.repeatAcre || 0,
            leaveAcre: r.leaveAcre || 0,
            duration: r.duration || 0,
            landGroup: r.landGroup || '',
            county: r.county || '',
            plateNo: r.plateNo || ''
          });
        }
        console.log(`[云途安] ${wt.label}: API返回 ${records.length} 条, 匹配${targetDate} ${matched.length} 条`);
      } catch (e) {
        console.log(`[云途安] 查询 ${wt.label} 失败:`, e.message);
      }
      // 间隔200ms避免请求过快
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[云途安] 指定日期(${targetDate})同步完成, 共 ${allRecords.length} 条作业记录`);
    return { records: allRecords, machineMap, workTypeLabels, mode: 'single' };
  }
}

module.exports = new YunTinanService();
