# Contract Constellation — Algorithm Guidance Brief (for Gemini)

## 1. 目的

这份文档用于让 Gemini 产出“可直接实现”的算法指导，而不是泛泛建议。  
目标是支持未来链路：

1. 读取合同文本  
2. LLM 生成网状条款关系与修改建议  
3. 前端可视化协同编辑  
4. 视觉操作与文本 patch 双向同步  
5. 输出可审计的修订结果与评估指标

---

## 2. 当前工程上下文（Gemini 必须遵守）

### 2.1 前端现状（已存在）

- React + TypeScript 可视图编辑
- 节点层级：`root/main/sub`
- 维度控制：`Semantic Pull`、`Risk Pull`
- 建议动作：`delete / revise / add_clause`
- Python embedding 服务优先，前端内置向量兜底

### 2.2 关键代码位置（用于落地）

- `src/contract-constellation/ContractConstellation.tsx`
- `src/contract-constellation/useGalaxyEngine.ts`
- `src/contract-constellation/GraphCanvas.tsx`
- `src/contract-constellation/SidePanel.tsx`
- `src/contract-constellation/semanticEmbedding.ts`
- `python/semantic_embed_server.py`

### 2.3 设计原则

- 不推翻现有 UI 交互骨架，只做算法层增强
- 每个算法必须给出：输入、输出、复杂度、失败降级
- 所有自动建议必须可解释（evidence + reason + confidence）
- 高风险动作必须有人类确认（human gate）

---

## 3. 需要 Gemini 输出的“交付物格式”

请 Gemini 按以下结构输出，而不是只给结论：

1. **System Overview**（模块图 + 数据流）
2. **Algorithm Specs**（每个模块有 I/O 和伪代码）
3. **API Contracts**（请求响应 JSON schema）
4. **Fallback Strategy**（服务不可用时如何退化）
5. **Evaluation Plan**（离线指标 + 在线交互指标）
6. **Incremental Rollout Plan**（P0/P1/P2）
7. **Risk & Failure Modes**（含监控字段）

---

## 4. 算法模块任务清单（Gemini 要逐项回答）

## A. Clause Parsing & Structuring

输入：
- 原始合同文本（可能包含编号和层级）

输出：
- `Clause[]`：`id, title, content, parentId, section, refs[]`

要求：
- 先给 rule-based baseline，再给 LLM-enhanced 版本
- 明确如何处理跨段引用、缺失编号、长句切分

## B. Graph Construction

输入：
- `Clause[]`

输出：
- `GraphNode[]`, `GraphLink[]`
- `relationType`（至少支持：`references, depends_on, conflicts_with, refines, temporal`）

要求：
- 给出边权重计算策略（rule + semantic hybrid）
- 说明如何去噪、去环、避免图过密

## C. Risk Estimation

输入：
- clause 文本 + 邻域信息

输出：
- `riskLevel` + `riskScore` + `riskReason` + `evidenceSpans`

要求：
- 明确标注模型不确定性传播方式
- 保证 no-risk 节点默认无建议（与现有产品规则一致）

## D. Action Suggestion

输入：
- 节点风险 + 内容 + 邻域约束

输出：
- `actionType`（delete/revise/add_clause）
- `suggestionText` / `supplementDraft`
- `actionReason`, `confidence`

要求：
- 解释 action 与 risk 的关系是“相关非绑定”
- 给出动作选择器（policy）伪代码

## E. Visual-to-Text Patch Compiler

输入：
- 用户在图上的动作事件流

输出：
- 文本 patch（insert/replace/remove）
- `PatchLog`（可回放）

要求：
- 给出冲突合并策略（多节点同时改）
- 给出引用一致性修复策略（编号更新）

## F. Verification & Scoring

输入：
- 原始合同 + 修订合同 + patch log

输出：
- 一致性/完整性/风险变化评分
- 失败项列表（blocking vs warning）

要求：
- 至少给 6 个可计算指标（含交互效率指标）

---

## 5. 统一数据契约（Gemini 应沿用）

```ts
type RiskLevel = 'none' | 'low' | 'medium' | 'high';
type ActionType = 'delete' | 'revise' | 'add_clause';

interface GraphNode {
  id: string;
  label: string;
  content: string;
  type: 'root' | 'main' | 'sub';
  riskLevel: RiskLevel;
  riskScore?: number;        // 0~1
  riskReason?: string;
  evidenceSpans?: Array<{ start: number; end: number; text: string }>;
  actionType?: ActionType;
  actionReason?: string;
  suggestionText?: string;
  supplementDraft?: string;
  confidence?: number;       // 0~1
}

interface GraphLink {
  source: string;
  target: string;
  relationType: 'references' | 'depends_on' | 'conflicts_with' | 'refines' | 'temporal';
  weight: number;            // 0~1
  explain?: string;
}
```

---

## 6. 评估指标要求（Gemini 输出必须覆盖）

请 Gemini 至少覆盖以下指标并给定义：

- **Graph Quality**
  - Edge precision/recall（人工标注基准）
  - Density control（避免过密）
- **Risk Module**
  - Macro-F1（riskLevel）
  - Calibration error（confidence 可信度）
- **Suggestion Module**
  - Acceptance rate（用户采纳率）
  - Edit distance reduction（用户手改负担下降）
- **Co-Editing UX**
  - Time-to-resolution（单风险闭环时间）
  - Interaction count per resolved issue

---

## 7. 迭代路线（Gemini 需要给到工程分期）

- **P0（2-3 周）**：规则 + embedding 混合图构建，动作建议可用，patch log 可导出
- **P1（3-5 周）**：LLM 风险解释与 evidence span，动作 policy 学习化
- **P2（>5 周）**：在线学习 + 人机协同优化 + 论文级评估

每个阶段必须给：

- 可验收的最小结果
- 风险点
- 回滚方案

---

## 8. 可直接贴给 Gemini 的提示词（建议）

你现在是“交互智能系统算法架构师”。  
请基于下面项目约束，输出一份“可实现”的算法指导文档，而不是概念综述。

约束：
1) 前端已有可视化图编辑（root/main/sub），不要推翻 UI。  
2) 需要从合同文本自动生成图关系与修改建议。  
3) 需要支持 visual-to-text 的双向协同编辑。  
4) 建议需可解释（reason + evidence + confidence）。  
5) 高风险动作必须 human confirmation。  
6) no-risk 节点默认不显示建议。  

输出结构必须为：
- System Overview
- Module Specs (A~F, each with I/O, pseudo-code, complexity, fallback)
- API Contracts (JSON schema)
- Evaluation Plan (offline + online)
- Rollout Plan (P0/P1/P2 with acceptance criteria)
- Risk & Monitoring

风格要求：
- 学术化、工程可执行、避免空泛描述
- 尽量给 deterministic baseline + LLM-enhanced variant
- 每个模块附“失败时怎么退化”

---

## 9. 交付使用建议

- 先让 Gemini 输出 v1（偏全局）
- 再让 Gemini 针对单模块二次细化（例如只细化 E: Patch Compiler）
- 最后让 Gemini 输出“按当前代码目录的改造清单”（文件级变更计划）

