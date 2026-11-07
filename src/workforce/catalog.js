// V2.4 sections 3.2 and 3.3: catalog entries are planning inventory, not deployed agents.
export const roles=[
  {
    "id": "research",
    "name": "市场研究数字员工",
    "responsibility": "市场、需求和竞争持续研究",
    "trigger": "某类角阀需求信号增长、竞争商品出现新的卖点",
    "delivery": "有来源依据的市场机会与趋势报告"
  },
  {
    "id": "selection",
    "name": "选品规划数字员工",
    "responsibility": "选品、商品组合、供货及盈利可行性评估",
    "trigger": "某新品机会具备供应条件和利润空间",
    "delivery": "候选SKU、选品评分、上新任务"
  },
  {
    "id": "merchandise",
    "name": "商品管理数字员工",
    "responsibility": "商品主数据、SKU、链接、上下架与生命周期",
    "trigger": "新品资料齐备、缺货、商品低效、链接异常",
    "delivery": "经过核验的商品上架、维护或下架结果"
  },
  {
    "id": "creative",
    "name": "内容创意数字员工",
    "responsibility": "商品文案、图片、详情页、视频和素材测试",
    "trigger": "商品缺少素材、转化表现提示内容需要优化",
    "delivery": "经过参数/合规校验的上架素材"
  },
  {
    "id": "growth",
    "name": "流量推广数字员工",
    "responsibility": "自然流量与广告经营、测款、推广优化",
    "trigger": "关键词机会出现、商品流量质量变化",
    "delivery": "推广策略、测试及授权执行记录"
  },
  {
    "id": "campaign",
    "name": "活动运营数字员工",
    "responsibility": "平台活动识别、商品报名与促销执行",
    "trigger": "平台活动临近、商品满足报名条件",
    "delivery": "活动任务、商品/库存校验、报名及复盘"
  },
  {
    "id": "supply",
    "name": "供应链协同数字员工",
    "responsibility": "库存、补货、供应及履约异常管理",
    "trigger": "畅销SKU缺货风险、供应延期、库存积压",
    "delivery": "协同补货或经营调整任务及状态"
  },
  {
    "id": "service",
    "name": "客服售后数字员工",
    "responsibility": "售前咨询、规格适配、售后和评价洞察",
    "trigger": "某接口尺寸退货上升、集中出现安装问题",
    "delivery": "自动服务结果、商品问题改进任务"
  },
  {
    "id": "profit",
    "name": "价格与利润数字员工",
    "responsibility": "成本、售价、毛利、商品贡献利润与定价",
    "trigger": "商品贡献利润转负、价格竞争力变化",
    "delivery": "经约束校验的定价/利润建议或授权调整"
  },
  {
    "id": "analysis",
    "name": "经营分析数字员工",
    "responsibility": "店铺经营监控、诊断、预测及效果验证",
    "trigger": "GMV与利润背离、转化异常、有效SKU下滑",
    "delivery": "根因、经营改进任务、效果评价"
  },
  {
    "id": "coordination",
    "name": "运营协同数字员工",
    "responsibility": "跨岗位任务路由、依赖管理、进度和异常升级",
    "trigger": "上新卡在设计确认、采购资料未及时返回",
    "delivery": "已完成的协同事项与可恢复流程"
  },
  {
    "id": "risk",
    "name": "运营风控数字员工",
    "responsibility": "商品合规、权限、价格、预算、操作安全",
    "trigger": "内容违规风险、调价越界、广告预算异常",
    "delivery": "校验记录、暂停/审批/回滚动作"
  }
];
export const capabilities=[
  {
    "id": "A01",
    "roleId": "research",
    "name": "市场机会洞察Agent",
    "description": "识别潜在增长品类、需求缺口和进入机会",
    "io": "品类数据、经营数据 → 机会清单",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "A02",
    "roleId": "research",
    "name": "品类趋势分析Agent",
    "description": "分析细分类目需求和价格变化",
    "io": "时间序列 → 趋势判断",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "A03",
    "roleId": "research",
    "name": "热点洞察Agent",
    "description": "识别与卫浴五金有关的热点和场景变化",
    "io": "可授权热点/内容数据 → 热点分析",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "A04",
    "roleId": "research",
    "name": "搜索需求洞察Agent",
    "description": "监测搜索词、需求表达及变化",
    "io": "可获得的搜索数据 → 需求主题",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "A05",
    "roleId": "research",
    "name": "竞品监测Agent",
    "description": "跟踪对标商品及其属性、价格、内容变化",
    "io": "竞品数据 → 竞品动态",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "A06",
    "roleId": "research",
    "name": "竞品上新Agent",
    "description": "发现新入场商品与差异化卖点",
    "io": "竞品商品目录 → 上新机会",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "A07",
    "roleId": "research",
    "name": "价格带洞察Agent",
    "description": "分析价格分层及竞争密度",
    "io": "同类商品价格 → 价格带地图",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "A08",
    "roleId": "research",
    "name": "评论需求洞察Agent",
    "description": "从评价识别消费者关注、痛点和不满",
    "io": "评价文本 → 需求标签及证据",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "A09",
    "roleId": "research",
    "name": "使用场景洞察Agent",
    "description": "归纳厨房、卫浴、安装和维修等需求场景",
    "io": "评论/咨询/内容 → 场景机会",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "A10",
    "roleId": "research",
    "name": "市场情报综合Agent",
    "description": "汇总多源证据、标注不确定性并输出研究结论",
    "io": "多源证据 → 商机研究结论",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "B01",
    "roleId": "selection",
    "name": "选品推荐Agent",
    "description": "基于目标生成候选品清单",
    "io": "机会与商品池 → 候选SKU",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "B02",
    "roleId": "selection",
    "name": "潜力商品评分Agent",
    "description": "评估需求、竞争、利润、供货和风险",
    "io": "规则与数据 → 评分及解释",
    "state": "partial",
    "skillIds": [
      "selection.score"
    ],
    "scope": "按明确评分输入计算；不自动获取市场或供货信息"
  },
  {
    "id": "B03",
    "roleId": "selection",
    "name": "商品差异化分析Agent",
    "description": "评估材质、规格、功能与卖点差异",
    "io": "商品参数 → 差异化判断",
    "state": "partial",
    "skillIds": [
      "product.compare"
    ],
    "scope": "比较用户提供的商品参数；不自动研究竞品"
  },
  {
    "id": "B04",
    "roleId": "selection",
    "name": "商品组合规划Agent",
    "description": "规划引流款、盈利款和长尾款组合",
    "io": "商品经营数据 → 组合方案",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "B05",
    "roleId": "selection",
    "name": "品类空白识别Agent",
    "description": "找出已有商品矩阵覆盖不足的需求",
    "io": "品类/商品映射 → 空白清单",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "B06",
    "roleId": "selection",
    "name": "规格适配评估Agent",
    "description": "校验尺寸、接口、安装条件及配件兼容性",
    "io": "确认过的参数 → 适配结果",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "B07",
    "roleId": "selection",
    "name": "供应商匹配Agent",
    "description": "从既有供应体系匹配供货对象",
    "io": "SKU需求/供应信息 → 候选供应商",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "B08",
    "roleId": "selection",
    "name": "新品成本预估Agent",
    "description": "测算商品销售条件与成本区间",
    "io": "成本、履约费用 → 盈利预测",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "B09",
    "roleId": "selection",
    "name": "新品上市策略Agent",
    "description": "形成价格、内容、测款和上架准备计划",
    "io": "评估结果 → 上新计划",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "B10",
    "roleId": "selection",
    "name": "选品复核Agent",
    "description": "检查数据依据、重复选品、规则冲突",
    "io": "候选计划 → 校验结果",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "C01",
    "roleId": "merchandise",
    "name": "商品信息解析Agent",
    "description": "从表单、文档和供应资料提取商品信息",
    "io": "已授权资料 → 结构化商品字段",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "C02",
    "roleId": "merchandise",
    "name": "商品主数据治理Agent",
    "description": "去重、规范命名、统一编码及属性检查",
    "io": "SPU/SKU资料 → 标准商品主档",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "C03",
    "roleId": "merchandise",
    "name": "平台类目映射Agent",
    "description": "将企业商品映射为平台类目与必填属性",
    "io": "企业SKU → 平台属性映射",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "C04",
    "roleId": "merchandise",
    "name": "SKU规格校验Agent",
    "description": "校验材质、尺寸、接口、型号与变体",
    "io": "权威商品主档 → 质量检查",
    "state": "partial",
    "skillIds": [
      "product.validate"
    ],
    "scope": "校验必填资料和基础数值；未实现型号兼容判断"
  },
  {
    "id": "C05",
    "roleId": "merchandise",
    "name": "商品标题优化Agent",
    "description": "根据平台规则与商品事实生成标题方案",
    "io": "商品事实 → 标题候选",
    "state": "partial",
    "skillIds": [
        "copy.titles"
    ],
    "scope": "基于确认特点编排三组标题并计算字符数；未接入词库与搜索优化"
},
  {
    "id": "C06",
    "roleId": "merchandise",
    "name": "商品卖点编排Agent",
    "description": "组织功能、优势和适用场景卖点",
    "io": "商品知识 → 卖点结构",
    "state": "partial",
    "skillIds": [
        "copy.selling_points"
    ],
    "scope": "按确认事实编排卖点并保留证据；不推导未经核验的功效"
},
  {
    "id": "C07",
    "roleId": "merchandise",
    "name": "商品定价执行Agent",
    "description": "依据批准策略形成价格或执行受控调价",
    "io": "价格规则 → 价格动作",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "C08",
    "roleId": "merchandise",
    "name": "上架准备检查Agent",
    "description": "检查必填字段、素材、库存、价格、权限",
    "io": "商品资料 → 可上架状态",
    "state": "partial",
    "skillIds": [
      "product.validate"
    ],
    "scope": "校验基础字段；尚缺图片、类目和真实平台权限检查"
  },
  {
    "id": "C09",
    "roleId": "merchandise",
    "name": "商品自动上架Agent",
    "description": "调用授权工具创建和发布商品并核验结果",
    "io": "上架任务 → 平台商品状态",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "C10",
    "roleId": "merchandise",
    "name": "商品链接巡检Agent",
    "description": "监测链接失效、错误信息和审核问题",
    "io": "平台商品 → 异常任务",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "C11",
    "roleId": "merchandise",
    "name": "商品信息更新Agent",
    "description": "维护经确认的属性、标题、图片和价格",
    "io": "审批/规则 → 更新结果",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "C12",
    "roleId": "merchandise",
    "name": "下架及淘汰Agent",
    "description": "按条件暂停销售、下架或标注观察",
    "io": "经营状态 → 受控下架结果",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "D01",
    "roleId": "creative",
    "name": "商品卖点提炼Agent",
    "description": "将参数转换为消费者可理解的核心利益",
    "io": "商品知识 → 卖点文案",
    "state": "partial",
    "skillIds": [
        "copy.selling_points"
    ],
    "scope": "按确认事实编排卖点并保留证据；不推导未经核验的功效"
},
  {
    "id": "D02",
    "roleId": "creative",
    "name": "商品主图AIGC Agent",
    "description": "生成符合事实和平台要求的主图方案",
    "io": "商品实拍/参数 → 主图素材",
    "state": "partial",
    "skillIds": [
        "copy.image_brief"
    ],
    "scope": "生成三版文字设计简报与素材清单；尚未生成图片"
},
  {
    "id": "D03",
    "roleId": "creative",
    "name": "场景图AIGC Agent",
    "description": "生成合理的安装和使用场景图",
    "io": "商品素材/场景要求 → 场景图",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "D04",
    "roleId": "creative",
    "name": "详情页策划Agent",
    "description": "设计详情页结构、模块与证明材料",
    "io": "商品资料 → 详情页大纲",
    "state": "partial",
    "skillIds": [
        "content.outline",
        "copy.detail"
    ],
    "scope": "输出五个文字模块和待补素材；图文排版尚未实现"
},
  {
    "id": "D05",
    "roleId": "creative",
    "name": "详情页生成Agent",
    "description": "组合图文、参数和安装提示",
    "io": "已核验素材 → 详情页",
    "state": "partial",
    "skillIds": [
        "copy.detail"
    ],
    "scope": "生成可审阅的文字稿；未生成图片、HTML 排版或发布"
},
  {
    "id": "D06",
    "roleId": "creative",
    "name": "短视频脚本Agent",
    "description": "生成商品演示、安装和卖点脚本",
    "io": "商品参数 → 视频脚本",
    "state": "partial",
    "skillIds": [
        "copy.video"
    ],
    "scope": "编排 30 / 60 秒分镜、口播和字幕；未生成或剪辑视频"
},
  {
    "id": "D07",
    "roleId": "creative",
    "name": "商品视频生成Agent",
    "description": "基于授权素材生成或剪辑演示视频",
    "io": "图片/视频 → 视频成品",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "D08",
    "roleId": "creative",
    "name": "多平台素材适配Agent",
    "description": "按平台要求调整尺寸、文案及布局",
    "io": "素材母版 → 平台素材",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "D09",
    "roleId": "creative",
    "name": "内容合规审核Agent",
    "description": "检查夸大宣传、参数不实、平台禁限内容",
    "io": "候选内容 → 审核意见",
    "state": "partial",
    "skillIds": [
      "content.review"
    ],
    "scope": "有限声明词检查；不替代平台合规审核"
  },
  {
    "id": "D10",
    "roleId": "creative",
    "name": "素材效果分析Agent",
    "description": "关联点击、转化及测试结果评估素材",
    "io": "经营数据 → 优化任务",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "E01",
    "roleId": "growth",
    "name": "自然流量诊断Agent",
    "description": "分析曝光、搜索与转化变化",
    "io": "流量数据 → 诊断结果",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "E02",
    "roleId": "growth",
    "name": "搜索关键词Agent",
    "description": "提出与商品相关的有效关键词方向",
    "io": "搜索/商品数据 → 关键词建议",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "E03",
    "roleId": "growth",
    "name": "推广机会识别Agent",
    "description": "发现适合测试或扩大经营的商品",
    "io": "SKU数据 → 推广候选",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "E04",
    "roleId": "growth",
    "name": "推广策略Agent",
    "description": "根据经营目标生成推广动作",
    "io": "预算与利润 → 策略方案",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "E05",
    "roleId": "growth",
    "name": "广告计划生成Agent",
    "description": "生成平台可执行的计划参数",
    "io": "授权规则 → 计划草案",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "E06",
    "roleId": "growth",
    "name": "广告异常诊断Agent",
    "description": "识别预算消耗、转化和获利异常",
    "io": "广告数据 → 诊断任务",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "E07",
    "roleId": "growth",
    "name": "创意测试Agent",
    "description": "规划不同主图、卖点和广告素材测试",
    "io": "创意池 → 测试方案",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "E08",
    "roleId": "growth",
    "name": "预算配置Agent",
    "description": "在平台/店铺/SKU预算约束下建议分配",
    "io": "利润/库存/投放 → 配置建议",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "E09",
    "roleId": "growth",
    "name": "推广执行Agent",
    "description": "调用获得授权的广告操作接口",
    "io": "已通过校验的动作 → 执行结果",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "E10",
    "roleId": "growth",
    "name": "推广效果评估Agent",
    "description": "判断投放对实际商品利润的贡献",
    "io": "广告及成本数据 → 评估结论",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "F01",
    "roleId": "campaign",
    "name": "平台活动监测Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "F02",
    "roleId": "campaign",
    "name": "活动机会识别Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "F03",
    "roleId": "campaign",
    "name": "活动资格检查Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "F04",
    "roleId": "campaign",
    "name": "活动选品Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "F05",
    "roleId": "campaign",
    "name": "促销策略Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "F06",
    "roleId": "campaign",
    "name": "优惠叠加测算Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "F07",
    "roleId": "campaign",
    "name": "活动价格校验Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "F08",
    "roleId": "campaign",
    "name": "活动库存校验Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "F09",
    "roleId": "campaign",
    "name": "活动报名执行Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "F10",
    "roleId": "campaign",
    "name": "活动效果分析Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "G01",
    "roleId": "supply",
    "name": "销量预测Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "G02",
    "roleId": "supply",
    "name": "可售库存监测Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "G03",
    "roleId": "supply",
    "name": "安全库存预警Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "partial",
    "skillIds": [
      "inventory.coverage"
    ],
    "scope": "按输入销量与供货周期计算库存覆盖；无实时库存连接"
  },
  {
    "id": "G04",
    "roleId": "supply",
    "name": "补货建议Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "G05",
    "roleId": "supply",
    "name": "供货周期评估Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "G06",
    "roleId": "supply",
    "name": "供应商信息协同Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "G07",
    "roleId": "supply",
    "name": "采购待办Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "G08",
    "roleId": "supply",
    "name": "缺货经营调整Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "G09",
    "roleId": "supply",
    "name": "订单异常识别Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "G10",
    "roleId": "supply",
    "name": "物流履约监控Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "G11",
    "roleId": "supply",
    "name": "库存积压分析Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "G12",
    "roleId": "supply",
    "name": "退货回仓分析Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "H01",
    "roleId": "service",
    "name": "五金商品问答Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "H02",
    "roleId": "service",
    "name": "规格/接口适配Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "H03",
    "roleId": "service",
    "name": "导购推荐Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "H04",
    "roleId": "service",
    "name": "安装问题解答Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "H05",
    "roleId": "service",
    "name": "订单查询Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "H06",
    "roleId": "service",
    "name": "物流解释Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "H07",
    "roleId": "service",
    "name": "售后意图识别Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "H08",
    "roleId": "service",
    "name": "退款/退换货工单Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "H09",
    "roleId": "service",
    "name": "评价情绪分析Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "H10",
    "roleId": "service",
    "name": "退货原因归类Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "H11",
    "roleId": "service",
    "name": "商品质量归因Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "H12",
    "roleId": "service",
    "name": "产品改进建议Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "I01",
    "roleId": "profit",
    "name": "采购成本校验Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "I02",
    "roleId": "profit",
    "name": "SKU利润核算Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "implemented",
    "skillIds": [
      "finance.calculate"
    ],
    "scope": "单期账单贡献利润计算；费用需人工提供"
  },
  {
    "id": "I03",
    "roleId": "profit",
    "name": "费用归集与分摊Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "I04",
    "roleId": "profit",
    "name": "竞品价格监测Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "I05",
    "roleId": "profit",
    "name": "价格竞争力评估Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "I06",
    "roleId": "profit",
    "name": "调价策略Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "I07",
    "roleId": "profit",
    "name": "最低利润约束Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "I08",
    "roleId": "profit",
    "name": "盈亏平衡测算Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "partial",
    "skillIds": [
      "price.break_even"
    ],
    "scope": "按单件成本与费率计算保本价；费用口径需确认"
  },
  {
    "id": "I09",
    "roleId": "profit",
    "name": "商品盈利分层Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "I10",
    "roleId": "profit",
    "name": "亏损预警Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "I11",
    "roleId": "profit",
    "name": "价格变更执行Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "I12",
    "roleId": "profit",
    "name": "调价效果复盘Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "J01",
    "roleId": "analysis",
    "name": "经营指标问答Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "J02",
    "roleId": "analysis",
    "name": "销售趋势分析Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "J03",
    "roleId": "analysis",
    "name": "转化漏斗诊断Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "J04",
    "roleId": "analysis",
    "name": "SKU经营归因Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "J05",
    "roleId": "analysis",
    "name": "店铺经营对比Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "J06",
    "roleId": "analysis",
    "name": "异常检测Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "J07",
    "roleId": "analysis",
    "name": "经营目标差距Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "J08",
    "roleId": "analysis",
    "name": "商品销量预测Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "J09",
    "roleId": "analysis",
    "name": "经营策略生成Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "J10",
    "roleId": "analysis",
    "name": "策略效果验证Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "J11",
    "roleId": "analysis",
    "name": "多店铺经营复盘Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "J12",
    "roleId": "analysis",
    "name": "经营报告Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "K01",
    "roleId": "coordination",
    "name": "任务识别与归并Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "K02",
    "roleId": "coordination",
    "name": "任务优先级Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "K03",
    "roleId": "coordination",
    "name": "任务计划Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "partial",
    "skillIds": [
      "task.brief"
    ],
    "scope": "整理目标、范围和当前成果；不代替自主跨岗位调度"
  },
  {
    "id": "K04",
    "roleId": "coordination",
    "name": "业务依赖识别Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "K05",
    "roleId": "coordination",
    "name": "责任岗位匹配Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "K06",
    "roleId": "coordination",
    "name": "跨部门任务创建Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "K07",
    "roleId": "coordination",
    "name": "消息与待办协同Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "K08",
    "roleId": "coordination",
    "name": "进度跟踪Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "K09",
    "roleId": "coordination",
    "name": "超时催办Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "K10",
    "roleId": "coordination",
    "name": "冲突协调Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "K11",
    "roleId": "coordination",
    "name": "任务验收Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "K12",
    "roleId": "coordination",
    "name": "异常升级Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "L01",
    "roleId": "risk",
    "name": "平台规则监测Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "L02",
    "roleId": "risk",
    "name": "商品发布合规Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "L03",
    "roleId": "risk",
    "name": "AIGC内容审核Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "L04",
    "roleId": "risk",
    "name": "价格约束校验Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "L05",
    "roleId": "risk",
    "name": "广告预算控制Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "L06",
    "roleId": "risk",
    "name": "店铺权限校验Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "L07",
    "roleId": "risk",
    "name": "敏感操作审批Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "L08",
    "roleId": "risk",
    "name": "数据可信度检查Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "L09",
    "roleId": "risk",
    "name": "工具调用审计Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "L10",
    "roleId": "risk",
    "name": "异常交易提示Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "L11",
    "roleId": "risk",
    "name": "执行熔断Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  },
  {
    "id": "L12",
    "roleId": "risk",
    "name": "操作回滚/补偿Agent",
    "description": "按方案规划，尚未实现",
    "io": "尚未连接数据与工具",
    "state": "planned",
    "skillIds": [],
    "scope": "尚未实现"
  }
];
