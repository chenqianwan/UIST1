# LLM-Driven Contract Visual-Text Co-Editing Pipeline (for Banana Flowchart)

## 1) 文档目的

本说明用于交给上游协作方（Banana）生成一张**学术风格、UIST 取向**的流程图，描述我们未来系统的完整链路：

- 输入原始合同文本
- 通过 LLM 生成网状条款关系与修改建议
- 在可视化界面中进行交互式编辑
- 将视觉操作与文本修订双向同步
- 输出可追溯的合同修订结果与评估信号

本文档强调：

- 工程上可落地（与当前项目兼容）
- 研究上可发表（human-in-the-loop + explainability + traceability）

---

## 2) 当前工程基础（可直接复用）

当前前端已有以下能力，可作为未来全流程的中间层：

- 图结构编辑：`root/main/sub/leaf` 节点层级 + 多种 link 类型
- 风险维度可视分析：风险颜色、risk pull
- 语义维度可视分析：semantic pull（Python embedding 优先，内置向量兜底）
- 建议交互：Delete / Revise / Add Supplement 动作流
- 用户操作闭环：拖拽增删、选中查看、应用建议、导出 payload

这意味着未来接入 LLM 时，不需要重写 UI，只需要补齐：

1. 合同解析/结构化接口  
2. 建议生成接口  
3. 视觉动作与文本 patch 的双向同步层

---

## 3) 目标端到端流程（系统视角）

### Stage A. Contract Ingestion & Parsing

输入：

- 原始合同文档（txt/md/docx/pdf 转文本）
- 可选元数据（合同类型、法域、业务场景）

处理：

- 文本清洗与分段（clause/sentence/span）
- 结构切分（条款编号、层级、引用关系）

输出（结构化）：

- `Clause[]`（id, title, content, parent, references, section）

### Stage B. LLM Graph Construction

输入：

- `Clause[]`

处理：

- 生成节点类型与层级映射（main/sub/leaf）
- 推断关系边（依赖、冲突、补充、引用、流程先后）
- 生成每个节点的风险估计与解释片段

输出：

- `GraphNode[]`, `GraphLink[]`
- `riskLevel`, `riskReason`, `evidenceSpans`

### Stage C. LLM Suggestion Generation

输入：

- 节点内容 + 邻域上下文 + 风险解释

处理：

- 生成动作建议（delete / revise / add_clause）
- 生成可执行文本草案（replacement/supplement）
- 生成置信度与理由

输出：

- `actionType`, `actionReason`, `suggestionText`, `supplementDraft`, `confidence`

### Stage D. Interactive Visual Co-Editing (Human-in-the-Loop)

输入：

- 图 + 建议

交互：

- 用户在可视界面拖拽、筛选、聚类观察
- 用户对节点执行动作：Apply Revision / Add Supplement / Delete

输出：

- 一系列用户确认的视觉操作事件（event log）

### Stage E. Visual-to-Text Synchronization

输入：

- 视觉事件流 + 原始条款文本

处理：

- 将图操作转换为文本 patch（insert/replace/remove）
- 进行一致性校验（引用编号、交叉引用、冲突检查）
- 生成修订版合同草案

输出：

- `RevisedContract`
- `PatchLog`（可审计）

### Stage F. Verification & Export

处理：

- 规则校验（格式、完整性、关键条款覆盖）
- 可选 LLM 二次审查（self-critique / adversarial prompt）
- 质量评分（风险下降、冲突减少、可读性变化）

输出：

- 最终导出（JSON + 可读文本）
- 实验指标与可视化日志（供研究评估）

---

## 4) 视觉-文本协同的核心机制（研究价值重点）

建议 Banana 在图中突出以下“创新环”：

1. **Bidirectional Loop**：Text -> Graph -> User Action -> Text Patch -> Graph Refresh  
2. **Grounded Suggestions**：每条建议都附 evidence span 与 reason  
3. **Human Confirmation Gate**：高风险动作必须人工确认，不允许黑盒自动落地  
4. **Traceability**：每次视觉操作映射到可回放 patch log

这四点非常符合 UIST 对“可交互智能系统”的偏好：可解释、可控、可复现、可评估。

---

## 5) 推荐数据契约（给工程与图都能看懂）

### 5.1 Node

- `id`
- `label`
- `content`
- `type` (`root/main/sub/leaf`)
- `riskLevel` (`none/low/medium/high`)
- `actionType` (`delete/revise/add_clause`)
- `actionReason`
- `suggestionText`
- `supplementDraft`
- `confidence`
- `evidenceSpans` (text offsets)

### 5.2 Edge

- `source`, `target`
- `relationType` (`depends_on/conflicts_with/refines/references/temporal`)
- `weight`
- `explain`

### 5.3 Event Log (for co-editing)

- `eventId`, `timestamp`, `userId`
- `nodeId`, `actionType`
- `beforeText`, `afterText`
- `accepted/rejected`
- `reason`

---

## 6) Banana 流程图生成要求（可直接粘贴）

> 你是一个 HCI/UIST 风格学术图生成助手。  
> 请基于以下系统流程生成一张**单页流程图**（非商业宣传风），用于论文方法图（method overview）。  
> 
> 要求：
> - 风格：academic, clean, minimal, high information density
> - 结构：从左到右主流程 + 底部反馈回路
> - 分区：Stage A~F 六段，使用 subtle panel 分组
> - 节点样式：圆角矩形，统一线宽，轻阴影或无阴影
> - 颜色：低饱和蓝灰主色 + 单一强调色（青绿或橙）表示 human confirmation gate
> - 连线：实线表示主数据流，虚线表示反馈/重计算流
> - 标注：每段包含 Input / Process / Output 的小标签
> - 特别突出：  
>   1) Text->Graph->Action->Patch->Graph 的双向闭环  
>   2) Explainability（evidence spans）  
>   3) Human-in-the-loop gate  
>   4) Traceability（PatchLog）
> - 字体与版式：论文友好（避免花哨图标），注释可读
> - 输出：SVG + PNG 两份

可视流程语义如下（按顺序）：

1. Contract Ingestion & Parsing  
2. LLM Graph Construction  
3. LLM Suggestion Generation  
4. Interactive Visual Co-Editing  
5. Visual-to-Text Synchronization  
6. Verification & Export  

并添加一个从 Stage 6 返回 Stage 2/3 的 evaluation-driven iteration loop。

---

## 7) UIST 取向的图面建议（给 Banana 的审美约束）

- 少用拟物图标，多用结构表达
- 强调系统分层与信息流向，不强调品牌视觉
- 把“交互点”和“自动化点”明确区分
- 把“用户决策门”画得清楚（这是论文说服力关键）
- 图中术语与正文术语一致（避免同义混用）

---

## 8) 你可以附带给 Banana 的一句话

请按“UIST method figure”标准输出：可解释、可复现、可读性优先，不要 marketing 风格。

