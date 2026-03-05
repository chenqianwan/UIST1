# Contract Constellation — 工作流与算法设计说明

本文档面向「更高级别 Agent」，用于理解当前系统的工作流、数据模型与已有逻辑，并据此补充或替换为正式的**算法设计**（含输入输出、约束与可扩展点）。  
**代码主入口**：`src/ContractConstellation.tsx`（单文件 React 组件 + 内联 Hook）。

---

## 1. 项目与产品目标

- **产品名称**：Contract Constellation（合同星座）
- **目标**：以**力导向图（Constellation）**形式可视化**主合同 + 条款/子条款**的层级与关系，对条款进行**风险分级**，并提供** AI 建议**与**导出**能力，便于用户审查与修订合同结构。
- **技术栈**：React + TypeScript，Framer Motion 动画，Tailwind CSS，Vite 单页构建；画布为 SVG（760×620 逻辑坐标），力导向在 `requestAnimationFrame` 中每帧更新。

---

## 2. 领域与数据模型（精确定义）

### 2.1 类型与枚举

| 类型 / 枚举 | 取值 | 含义 |
|-------------|------|------|
| `NodeKind` | `'root' \| 'main' \| 'sub'` | 节点层级：根 / 主条款 / 子条款（支持嵌套） |
| `LinkKind` | `'root-link' \| 'smart-link' \| 'child-link' \| 'detail-link'` | 边类型：根→主条款、主条款间「智能关联」、主→子、子→子 |
| `RiskLevel` | `'none' \| 'low' \| 'medium' \| 'high'` | 条款风险等级，决定节点颜色与图例 |

### 2.2 图节点 `GraphNode`

```ts
interface GraphNode {
  id: string;           // 唯一 ID，主节点 node_${timestamp}，子节点 sub_ 前缀
  label: string;        // 展示名称（如 "Standard Payment Terms"）
  type: NodeKind;
  color: string;        // 由 riskLevel 映射的 hex 颜色
  x, y: number;        // 画布坐标（力导向更新）
  vx, vy: number;      // 速度（力导向用）
  r: number;           // 显示半径（root=30, main=18, sub=10 或 7）
  content: string;     // 条款正文（用于右侧详情与导出）
  riskLevel: RiskLevel;
  templateId?: string;  // 来源于哪条 NODE_LIBRARY 模板
  parentId?: string;   // 仅 sub 有，指向直接父节点 id
}
```

### 2.3 图边 `GraphLink`

```ts
interface GraphLink {
  source: string;  // 节点 id
  target: string;  // 节点 id
  type: LinkKind;
}
```

### 2.4 模板与层级结构（右侧「节点库」）

- **模板** `TemplateItem`：来自常量 `NODE_LIBRARY`，包含 `id, label, description, type, riskLevel, content`，以及可选的 **satellites**（子条款数组）。
- **子条款** `TemplateSubItem`：`label, content`，以及可选的 **details**（再一层子项）。
- **层级映射**：  
  - 1 个 template → 1 个 **main** 节点 + 若干 **sub**（satellites + satellites[].details）。
- 当前 **main** 与 **root** 之间固定建一条 `root-link`；**main↔main** 由「智能关联」算法生成若干 `smart-link`（见下）；**main→sub** 为 `child-link` 或 `detail-link`。

---

## 3. 用户工作流（端到端）

### 3.1 从节点库拖拽添加条款

1. 用户从右侧 **Node Library** 拖拽一条模板（如 "Standard Payment Terms"）到画布。
2. **Drop 事件**：根据落点 `(x,y)` 调用 `addNodeFromTemplate(template, x, y)`。
3. **生成内容**：
   - 新建 1 个 **main** 节点（位置 `(x,y)`），并建 **root → main** 的 `root-link`。
   - 为该 main 找 **smart-link** 目标（见 4.2）。
   - 根据 `template.satellites` 生成 **sub** 节点（围绕 main 初始角度分布），并建 **main → sub** 的 `child-link`。
   - 根据每个 sub 的 `details[0]` 生成 **sub** 节点（沿上级 sub 方向外扩），并建 **sub → sub** 的 `detail-link`。
4. 该 template 的 `id` 加入 `usedTemplateIds`，节点库中不再显示该条。

### 3.2 选中与焦点（BFS 出度展开）

1. 用户**点击**画布上某节点 → `selectedNodeId` 设为该节点 id。
2. **focusDepthMap**：从 `selectedNodeId` 出发做 **BFS（仅沿有向边 source→target 出度）**，得到每个可达节点的 `depth`（0=选中节点自身，1=直接后继，2=再后继…）。
3. **incomingNodeIds**：所有满足 `link.target === selectedNodeId` 的 `link.source` 集合（指向当前选中节点的前驱）。
4. **展示逻辑**：
   - **节点**：根据 `depth` 与是否在 `incomingNodeIds` 计算 `nodeTone`（亮度/不透明度）；`depth` 越大或越远，越暗；选中节点与入边前驱高亮。
   - **边**：与 `focusDepthMap`、`revealStage` 结合决定是否显示及粗细；选中节点的**出边**有动画强调。
   - **标签**：`shouldShowLabel` 对 **非叶子** 与 **叶子** 条件不同；叶子仅在 `depth <= 1` 且 `revealStage === 2` 或选中时显示，导致 **depth≥2 的叶子** 默认不显示文字（见已知问题）。

### 3.3 拖拽移动与删除

1. **拖拽**：非 root 节点可 `pointerdown` 开始拖拽；`pointermove` 更新节点位置（`updateNodePosition`），并检测是否悬停在「Drop Here」垃圾桶区域。
2. **放下**：`pointerup` 时若在垃圾桶上则调用 `endNodeDrag(true)`：
   - **sub**：仅删除该 sub 及其后继，主条款保留。
   - **main**：删除整棵子树并从 `usedTemplateIds` 移除对应 template。
3. **删除实现**：`removeNodeCascade(nodeId)` 从该节点起递归删除所有「父节点已被删」的节点与相关边。

### 3.4 AI 建议与「应用」

1. 当 `selectedNodeId` 指向非 root 且 `riskLevel !== 'none'` 时，右侧展示 **AI Suggestion** 区块。
2. **当前实现**：`getAiSuggestion(node)` 为**纯规则/占位**：按 `riskLevel` 返回固定 `title / reason / replacement` 文案，**无真实 NLP/LLM 调用**。
3. 用户点击 **Apply AI Suggestion**：用 `replacement` 调用 `markNodeAsMitigated(nodeId, content)`，将该节点 `content` 更新、`riskLevel` 置为 `'none'`、`color` 置为无风险色，并记录 `lastAppliedNodeId` 用于 UI 提示。

### 3.5 导出合同

1. 用户点击 **Export Contract**。
2. **当前实现**：`handleExportContract` 构建 `exportPayload`（`generatedAt`, `clauses[]`, `links`），**仅 `console.info` 模拟成功**，无文件下载或后端上传；`clauses` 为除 root 外所有节点的 `id, label, type, riskLevel, content, parentId`。

---

## 4. 已有算法与逻辑（可被替换/扩展）

### 4.1 力导向布局（Galaxy Engine）

- **位置**：`useGalaxyEngine` 内 `useEffect` 中 `requestAnimationFrame(tick)`。
- **每帧步骤**：
  1. **斥力**：节点两两之间（距离 < 420 时）施加反比于距离平方的斥力；**根节点**与**正在拖拽的节点**不参与斥力。
  2. **弹簧**：每条边视为弹簧，目标长度与刚度依 `LinkKind` 不同：
     - `root-link`: 长度 `rootLen`，刚度 `rootSpring`
     - `smart-link`: `smartLen`, `smartSpring`
     - `child-link`: `childLen`, `childSpring`
     - `detail-link`: `detailLen`, `detailSpring`
  3. **向心力**：所有非 root、非拖拽节点受到指向画布中心的弱力（`centerPull`）。
  4. **根固定**：root 每帧被重置到 `(width/2, height/2)`，速度置 0。
  5. **边界**：节点坐标 clamp 到 `[margin, width-margin]` × `[margin, height-margin]`。
- **参数（当前硬编码）**：  
  `repulsion=7600`, `damping=0.88`, `centerPull=0.0036`；  
  `rootSpring=0.02`, `smartSpring=0.06`, `childSpring=0.12`, `detailSpring=0.14`；  
  `spreadFactor` 依节点数分段（≤12 / ≤22 / 其他），再乘到各 `*Len` 上（如 `rootLen = 188 * spreadFactor` 等）。

**算法设计可扩展点**：目标长度与刚度公式、斥力/向心力的衰减与阈值、是否按层级或风险差异化刚度、初始布局（避免重叠）、是否支持「钉住」部分节点等。

### 4.2 智能关联（Smart-Link）目标选择

- **触发**：在 `addNodeFromTemplate` 中，新建 main 节点后。
- **逻辑**：
  - 从**当前图中所有非 root 的 main 节点**中，计算与**新 main** 的欧氏距离 `distance(node, newNode)`。
  - 按距离升序排序，取前 2 个，且仅保留距离 **< 260** 的节点。
  - 为这 0~2 个节点分别建一条 **newMain → 该节点** 的 `smart-link`（有向）。
- **含义**：与「空间上接近」的已有主条款自动建关联，便于表达条款间的语义或结构邻近；当前**仅基于几何距离**，无语义/文本参与。

**算法设计可扩展点**：基于条款文本相似度、关键词、或用户配置的规则（如同类型 template 必连）；数量与距离阈值参数化；是否双向、是否带权重等。

### 4.3 焦点 BFS 与可见性

- **BFS**：从 `selectedNodeId` 出发，沿 `links` 中 `link.source === current` 的 `link.target` 做广度优先，得到 `focusDepthMap: Map<nodeId, depth>`。
- **用途**：节点/边的透明度、标签显隐、线条粗细与动画，均与 `depth` 和 `incomingNodeIds` 绑定。

**算法设计可扩展点**：入边/出边权重、最大深度截断、与「重要性」或「风险」结合的展示策略；第三级（depth≥2）叶子标签当前被隐藏，可改为按 depth 或节点类型放宽 `shouldShowLabel`。

### 4.4 节点高光弧（视觉）

- 非 root 节点用内联 SVG 绘制「气泡」样式：主圆 + 柔光 + 内环 + 淡弧 + **高光弧**。
- **高光弧**：长度与 dashoffset 由 `getNodeHighlightParams(nodeId, arcR)` 用 **nodeId 的种子随机** 在区间内生成（长度 ∈ [当前等效长度, 圆周的 1/3]，位置在右下方），使每个节点高光略有差异且稳定。

此处为纯视觉，一般不作为「业务算法」扩展；若需可改为与风险或类型挂钩。

---

## 5. 当前占位 / 硬编码（需算法或配置替代）

| 项目 | 现状 | 建议算法/设计方向 |
|------|------|-------------------|
| **结构抽取** | 当前无独立上游结构阶段 | 新增 Stage A：先稳定输出结构节点（`id/content/type/parentId/timePhase`） |
| **风险等级** | 模板与节点来自 `NODE_LIBRARY` 的静态 `riskLevel`，无运行时评估 | Stage B 风险推理：输入结构节点+上下文，输出 `RiskLevel` + 解释 + 证据 |
| **AI 建议** | `getAiSuggestion(node)` 按 `riskLevel` 返回固定文案 | Stage B 建议生成：策略约束下输出 `actions[]` + `confidence` |
| **智能关联** | 仅几何距离 < 260 的最近 2 个 main | 语义相似度、共现、或规则（类型/关键词）；数量与阈值可配置 |
| **导出** | 仅内存对象 + console，无文件/API | 导出格式（JSON/Markdown/Word）、模板、可选异步上传与版本 |
| **模板库** | 固定 `NODE_LIBRARY` 数组 | 从配置/后端加载；支持用户自定义模板与层级深度 |

---

## 6. 输入输出摘要（供算法设计对接）

### 6.1 力导向布局

- **输入**：当前 `nodes`（含 x,y,vx,vy,r,id,type）、`links`（source, target, type）、画布 `width, height`、是否正在拖拽某节点。
- **输出**：更新后的 `nodes`（x,y,vx,vy 每帧变化）。
- **约束**：root 固定中心；节点不超出边界；拖拽节点不受力。

### 6.2 智能关联（添加 main 时）

- **输入**：新 main 节点（含 x,y）、现有所有 main 节点列表（含 x,y,id）。
- **输出**：0~N 个目标 main 的 id 列表（用于创建 smart-link）。
- **当前约束**：N≤2，且仅考虑距离 < 260；可改为基于语义或配置。

### 6.3 上游两阶段接口（推荐）

- **Stage A 输入**：`original_contract_text`
- **Stage A 输出**：`nodes_stage_a[]`（仅结构字段：`id,label,content,type,parentId,timePhase`）
- **Stage A 约束**：`content` 逐字复制原文；层级树完整；ID 唯一
- **Stage B 输入**：`nodes_stage_a[] + original_contract_text`
- **Stage B 输出**：`nodes_enriched[]`（补全 `references/riskLevel/actions`，动作结构直接给前端消费）
- **Stage B 约束**：不得改写 Stage A 的结构字段；`delete` 与 `revise/add_clause` 互斥；`add_clause` 至少提供 `supplementDraft`
- **后处理**：引用合法性过滤、字段不可变校验

### 6.4 导出

- **输入**：当前 `nodes`（除 root）、`links`、时间戳。
- **输出**：结构化的合同表示（如 JSON/MD）或文件流；可增加模板与版本字段。

---

## 7. 文件与关键符号索引

| 文件 | 关键内容 |
|------|----------|
| `src/ContractConstellation.tsx` | 全量 UI + `useGalaxyEngine`（力导向、增删节点、smart-link）、`getAiSuggestion`、BFS `focusDepthMap`、`shouldShowLabel`、导出 payload 构建 |
| `static/*.svg` | 节点气泡样式（现已在组件内用内联 SVG + 渐变 defs 复刻，随机高光） |
| `NODE_LIBRARY` | 模板列表（id, label, description, type, riskLevel, content, satellites[]） |

---

## 8. 已知行为与可选改进

- **第三级（及更深）叶子**：因 `shouldShowLabel` 对叶子要求 `depth <= 1`，其标签默认不显示；可放宽为 `depth <= 2` 或按需配置。
- **子条款 details**：当前每个 sub 只取 `details[0]` 生成 1 个 sub 节点；若模板有多 detail，需扩展生成与边逻辑。
- **性能**：节点/边较多时，每帧全量斥力 + 全边弹簧可能成为瓶颈；可考虑空间划分或 LOD。

---

本文档描述了「当前工作流」与「已有算法及占位」，便于更高级别 Agent 在此基础上添加或替换为正式的**算法设计**（接口、复杂度、参数与扩展点）。  
若需对某一块做更细的接口级设计（如「智能关联 API」或「风险评估 API」），可在此文档下新增对应小节或单独算法规格文件。
