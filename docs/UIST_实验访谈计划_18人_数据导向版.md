# UIST 实验与访谈计划（18人，数据导向版）

## 1. 研究目标与问题

本计划用于评估「合同星座（Contract Constellation）」是否在合同审查任务中，相比基线工具显著提升效率、质量与可解释信任，并形成可在 UIST 论文中呈现的高质量定量与定性证据。

研究问题（RQs）：
- RQ1（效率）：系统是否显著降低完成任务时间与交互成本？
- RQ2（质量）：系统是否显著提升风险识别与修订建议质量？
- RQ3（认知与信任）：系统是否降低认知负担，并提升可校准信任？
- RQ4（机制）：哪些交互机制（图谱、证据锚定、建议应用）驱动收益？

---

## 2. 实验设计

### 2.1 总体设计
- 设计类型：within-subject（被试内）
- 条件：
  - Baseline：常规工作流（PDF/Word + 关键词检索 + 通用问答工具）
  - System：合同星座系统（结构化节点、风险、建议与证据）
- 参与者：18 人
- 激励预算：100 RMB/人，总计 1800 RMB

采用 within-subject 的原因：在样本量受限时统计效率更高，更容易在 18 人规模下观察到显著差异。

### 2.2 样本构成建议
- 人员组成有一丹来定
- 记录协变量：年限、合同阅读频次、LLM 使用频次、合同类型熟悉度

### 2.3 素材设置（不再使用 A/B/C 任务）
- Simple 合同（简单素材）：
  - 条款层级浅、引用关系少、风险点较明确
- Complex 合同（复杂素材）：
  - 条款层级深、跨条款引用多、风险点更隐蔽

每位参与者在两种条件下都处理两份素材，共 4 个单元：
- Baseline + Simple
- Baseline + Complex
- System + Simple
- System + Complex

### 2.4 反平衡与顺序控制 （初步确定，之后需要改，尽量压缩到1个小时以内）
- 条件顺序：AB/BA 各 9 人
- 素材顺序：Simple/Complex 反平衡（在每种条件内各占一半）
- 建议将 18 人分为 4 组，平衡 4 个单元顺序，降低学习效应
- 预期时长：
  - 引导与培训：10-12 分钟
  - 两条件 x 两素材执行：45-55 分钟
  - 问卷：8-10 分钟
  - 半结构访谈：18-22 分钟
  - 总计：约 85-95 分钟/人

---

## 3. 数据采集框架（核心）

### 3.1 客观指标（Primary）
- 完成时长（秒）：Task Completion Time（TCT）
- 交互成本：总操作数、无效操作占比、回退次数
- 首次价值产出时间：
  - TFF：Time to First valid Finding（首次有效风险）
  - TFA：Time to First Action（首次可执行改写）
- 质量指标：
  - 风险识别 Precision / Recall / F1
  - 冲突检测命中率（Conflict Hit Rate）
  - 建议可执行性评分（专家双评，1-5）
- 复杂度敏感性：
  - 复杂素材相对简单素材的性能下降幅度（越小说明系统抗复杂性更强）

### 3.2 主观指标（Secondary）
- NASA-TLX（认知负荷）
- 系统质量（7 点量表）
- 信息质量（7 点量表）
- 满意度（7 点量表）
- 信任与可解释性（7 点量表）
- 未来使用意愿（7 点量表）

### 3.3 机制指标（Mechanism）
- 证据查看率（Evidence Open Rate）
- 建议采用率（Accept Rate）
- 建议修改率（Edit-before-accept Rate）
- 查询重写次数（Query Reformulation Count）
- 校验行为比例（Verification Action Ratio）
- 切屏次数 

---

## 4. 日志埋点规范（建议新增后台能力），这个一丹暂时不需要看

为保证论文图表质量，建议实现统一事件日志（CSV/JSON 可导出）：

- session_start / session_end
- task_start / task_end
- query_submit
- node_click
- risk_expand
- evidence_open
- suggestion_view
- suggestion_apply
- suggestion_edit
- suggestion_reject
- export_contract

每条日志字段最小集合：
- participant_id
- condition（baseline/system）
- material_id（simple/complex）
- event_name
- timestamp_ms
- payload（JSON：node_id、risk_level、action_type、query_length 等）

派生指标可离线计算，避免前端复杂逻辑污染实验过程。

---

## 5. 数据导向访谈提纲（可量化优先）

原则：先量化（评分/百分比/排序），再追问原因（用于主题编码）。


### 5.2 结束访谈（约 20 分钟）
1) 你对系统整体可执行性评分（1-7）  
  a：对于聚合功能(1-3) b: 一键修改功能(1-3) c:星系图看起来混乱吗（1-7） 你认为节省了多少时间（0-100%）
2) 你对修改意见评分（1-7）  
3) 你对“何时应该人工复核”的判断信心（1-7）  
4) 若显示置信度，你会在多少阈值直接采用（0-100）  
5) 简单与复杂素材中，系统收益排序（Simple vs Complex）  
6) 最不信任的步骤是什么（开放题，后续编码/可选）  
7) 你希望新增的一个功能（开放题，后续编码/可选）

---




后面是我的数据方面，你可以先不看，我会选择性的去做，这个是目前的最大范围




## 6. 统计分析计划

### 6.1 定量统计
- 正态性：Shapiro-Wilk
- 主要检验：Wilcoxon signed-rank（在 simple 与 complex 内分别比较 Baseline vs System）
- 补充检验：比较复杂度增量（Complex - Simple）在两条件下的差异，用于评估抗复杂性
- 多重比较校正：Holm-Bonferroni
- 报告格式：中位数（IQR）、p 值、效应量 r、95% CI

### 6.2 定性分析
- 开放题与访谈转录进行主题分析
- 至少 2 名编码者独立编码
- 计算 Cohen's kappa，分歧协商后形成最终 codebook
- 将主题映射到 RQ1-RQ4

---

## 7. 论文图表规划（可直接落图）

- Figure 1：实验流程图（招募-培训-四单元执行-问卷-访谈）
- Figure 2：配对散点 + 箱线图（Simple 与 Complex 分面展示时间、动作数）
- Figure 3：质量指标图（Precision/Recall/F1、建议可执行性）
- Figure 4：行为漏斗图（按 simple/complex 分组：发现风险→查看证据→采用建议→导出）
- Figure 5：桑基图（Baseline 手动流程 vs System 查询驱动流程）
- Figure 6：复杂度敏感性图（simple->complex 的性能变化斜率，Baseline vs System）
- Table 1：参与者信息
- Table 2：主结果统计（中位数、IQR、p、效应量）
- Table 3：访谈主题与代表性引语

---

## 8. 成功标准（建议预注册）

若满足以下条件，可支持“系统显著提升”的主张：
- 时间指标下降 >= 25%
- 操作数下降 >= 35%
- 风险识别 F1 提升 >= 0.10
- NASA-TLX 下降 >= 0.8 分
- 在复杂素材上至少 2 项指标显著优于 Baseline
- 至少 2 项主指标达到 p < 0.05 且效应量为中等及以上

---

## 9. 执行清单（落地）

- [ ] 准备两份素材（Simple/Complex），并完成专家难度校准
- [ ] 完成日志埋点与导出接口
- [ ] 完成问卷页面与素材后微访谈页面
- [ ] 小规模预试验（n=2）验证时长与日志完整性
- [ ] 正式招募 18 人并按 4 组顺序方案分配
- [ ] 按预定统计脚本出图与出表

---

## 10. 伦理与合规

- 明确告知录屏/日志采集范围与用途
- 允许参与者中途退出
- 数据去标识化（participant_id 替代姓名）
- 数据仅用于研究目的并在论文中聚合呈现

---

该方案参考了 UIST 论文中常见的 mixed-methods 评估范式，强调：  
（1）可重复的客观行为数据、（2）可统计的主观量表、（3）可解释的访谈主题三线合一。  
这样能更稳地支撑论文中的“有效 + 可解释 + 可泛化”叙事。
