# UIST 2026 Paper Outline Draft

## Working Title Candidates

1. **Contract Constellation: Visual-Text Co-Editing for AI-Assisted Contract Review**
2. **Contract Constellation: Traceable Human-AI Co-Editing for Contract Analysis and Revision**
3. **From Clause Graphs to Auditable Revisions: A Visual-Text Interface for Contract Review**

## Paper Positioning

- **投稿类型**：UIST system paper / intelligent interactive system
- **一句话主张**：把合同从线性文本转成可交互的条款图，并把 AI 建议、人工确认、文本修订和审计链路接起来，可以让用户在高风险专业文本场景中更高效、更可控地完成审查与修订。
- **不要过度宣称**：这篇论文不是“自动替代律师”，而是“为高风险文档审查提供可视、可控、可追溯的人机协作基础设施”。
- **核心叙事关键词**：visual-text co-editing, human-in-the-loop, traceability, grounded suggestions, auditable AI editing

## Recommended Story Arc

1. 先讲问题：合同审查是长文、层级深、跨条款引用多，线性文档和普通聊天式 AI 很难支持“理解结构 + 做决定 + 落文本”。
2. 再讲缺口：现有写作辅助系统常停留在局部文本建议，缺少结构化外化、批量交互、以及从界面操作到最终文本的可追溯闭环。
3. 然后讲方法：`Contract Constellation` 通过条款图、风险与建议、递归操作、多维布局、视觉到文本同步，把“看懂问题”和“执行修订”连接起来。
4. 最后讲证据：通过与常规工作流对比的用户研究，证明系统在效率、质量、认知负担与信任校准上有优势，并结合日志和访谈解释收益机制。

## Suggested Collaboration Split

### 法律同学更适合主导

- 领域动机中的法律专业背景与真实痛点表述
- 法律审查流程、风险类型、修订合理性标准
- 法律相关 `related work`
- 材料设计中的合同内容有效性与专家评分口径
- 结果讨论里法律场景意义与边界

### CS 这边更适合主导

- 系统 framing：为什么这是一个 `interactive intelligent system`
- 交互设计：图表示、焦点机制、建议交互、批量操作、多维视图
- 方法实现：数据表示、事件模型、visual-to-text pipeline、traceability 机制
- 实验工程：baseline 实现、日志埋点、指标定义、统计分析、图表生成
- discussion 中对 HCI / UIST 的 design implications

### 最容易并行写作的章节

- 法律同学先写：`related work`、领域背景、风险定义、材料合法性与专家评价口径
- 计算机同学先写：`System Overview`、`Interaction Design`、`Traceable Visual-to-Text Pipeline`、`Evaluation`
- 最后一起合：`Introduction`、`Results`、`Discussion`

## Full Outline

## 1. Abstract

### 1.1 必须覆盖的四句话

- 背景问题：合同审查任务复杂、跨条款依赖强、AI 建议难以被可靠采纳。
- 系统方法：提出一个将条款图可视化、风险建议、人工确认和可追溯文本修订结合起来的交互系统。
- 评估方式：用 `within-subject` 用户研究，对比 baseline 与系统条件，在 simple/complex 合同材料上测时间、质量、主观量表和机制日志。
- 主要发现：先留占位，等数据出来后写成 2 到 3 个定量结果 + 1 个定性洞察。

### 1.2 Abstract 写作提醒

- 摘要里一定要出现 `human-in-the-loop` 和 `traceable`。
- 不要把摘要写成“法律 NLP”论文摘要；重点应放在交互系统与用户收益。

## 2. Introduction

### 2.1 Problem Setting

- 合同审查不是单点改写，而是需要在长文本中发现风险、理解层级关系、检查引用、决定是否修改、再把修改稳定落回文本。
- 传统 PDF/Word 流程把这些任务割裂开来。
- 纯聊天式 AI 可能给出建议，但不擅长帮助用户理解结构、比较影响范围、或维护审计链路。

### 2.2 Gap in Existing Tools

- 文本写作助手通常面向局部段落修订，不强调跨段依赖与结构外化。
- 可视分析系统常帮助“看”，但未必帮助“改”。
- 现有 AI 工具往往缺少从建议到最终文本的可追溯控制机制。

### 2.3 Our Approach

- 引出 `Contract Constellation`。
- 一句话系统描述建议：
  - “A visual-text co-editing system that represents contracts as clause graphs, surfaces grounded risk-aware suggestions, supports scoped human actions, and compiles these actions into auditable contract revisions.”

### 2.4 Contributions

- 贡献 1：提出一个面向高风险专业文本审查的 `visual-text co-editing` 交互框架。
- 贡献 2：实现一组关键交互机制，包括条款图表示、建议驱动操作、递归子树编辑、多维重布局、以及视觉操作到文本修订的可追溯映射。
- 贡献 3：通过用户研究表明该系统相较 baseline 在效率、质量、认知负担或信任校准上带来收益，并揭示哪些交互机制最关键。

### 2.5 Figure Placement

- `Figure 1` 放 introduction 末尾，给出系统总览图。

## 3. Motivation and Design Goals

这一节建议写成“设计目标”而不是“需求分析”，除非你们后面真的有成型的 formative study。

### 3.1 Why Contract Review Is Hard

- 长文本、深层级、交叉引用、风险点分散。
- 审查过程既需要全局结构理解，也需要局部措辞判断。
- 用户需要对 AI 建议保持校验，而不能盲信。

### 3.2 Design Goals

- `DG1` 外化结构：把线性合同转成可浏览、可选择、可比较的条款结构视图。
- `DG2` Ground suggestions：建议必须附着于具体条款、风险、理由或证据，而不是悬浮的全局回答。
- `DG3` Keep humans in control：高风险动作要由用户显式确认，且支持局部与批量两种粒度。
- `DG4` Preserve traceability：每次界面操作都能映射到文本修订和审计记录。
- `DG5` Support complex tasks：在复杂合同里帮助用户更快定位重点，并降低无效操作和切换成本。

### 3.3 Transition to System

- 用一小段承上启下：下面介绍系统如何把这些目标落到界面、算法流水线与审计机制中。

## 4. System Overview

这一节对应方法图，讲端到端 pipeline，但不要写得像纯工程文档。

### 4.1 Workflow

- Stage A：合同结构化解析
- Stage B：关系、风险与建议生成
- Stage C：交互式图上审查与操作
- Stage D：视觉操作转结构化变更
- Stage E：确定性编译与受约束终稿生成
- Stage F：导出与审计

#### CS 写作要点

- 这里建议直接配一张单图，把 `Text -> Structured Clauses -> Clause Graph -> User Actions -> Normalized Diff -> Final Text` 串起来。
- 每个 stage 都写 `input / output / why this stage exists`，避免只写功能名。
- 重点不是模型多强，而是为什么要把“结构化、交互、编译、定稿”拆层，从而提升可控性与可追溯性。

#### 每个 Stage 建议写法

- `Stage A`：
  - 输入：原始合同文本
  - 输出：稳定的条款树表示 `nodes_stage_a`
  - 作用：把线性文本变成后续交互和推理共享的结构底座
- `Stage B`：
  - 输入：结构化条款 + 全文上下文
  - 输出：引用关系、风险等级、动作建议
  - 作用：把“识别问题”转成“可执行动作”
- `Stage C`：
  - 输入：图和建议
  - 输出：用户确认的视觉操作事件
  - 作用：让用户在结构视图中做选择，而不是在长文里来回跳转
- `Stage D`：
  - 输入：事件流 + 当前树
  - 输出：`normalized_diff`
  - 作用：把 UI 动作压缩成稳定、可重放的净变更集
- `Stage E`：
  - 输入：`normalized_diff + draft_v1`
  - 输出：最终文本和 `change_report`
  - 作用：限制模型越权改写，保证终稿与操作链路一致
- `Stage F`：
  - 输入：终稿与日志
  - 输出：导出文本、审计记录、研究指标
  - 作用：支持用户交付，也支持论文评估

### 4.2 Core Representation

- `nodes`：条款及子条款
- `links`：层级、引用、补充或语义关联
- `actions`：`delete / revise / add_clause`
- `event log / diff / patch log`：用于追踪从操作到终稿的链路

#### CS 这里要补成“小数据模型”小节

- `GraphNode`
  - `id, label, content, type, parentId`
  - `riskLevel`
  - 可选：`timePhase, references, evidenceSpans`
- `GraphLink`
  - `source, target, relationType`
  - 区分层级边和推理边
- `Action`
  - `type`
  - `reason`
  - `suggestionText / supplementDraft`
  - `confidence`
- `Event`
  - `actor`
  - `nodeId`
  - `actionType`
  - `before / after`
  - `ts`
- `DiffOp`
  - `add / delete / revise`
  - `opId`
  - `targetNode`
  - `suppressedBy`

#### 为什么这段要写细

- UIST 审稿人会关心系统是不是有清晰的中间表示，而不是一堆 ad hoc UI state。
- 你们这篇的技术可信度很大程度来自“表示层清楚、状态流清楚、动作边界清楚”。

### 4.3 System Claim

- 这一节最后要明确说出：系统不只是一个可视化器，也不只是一个 AI 写作助手，而是一个把“理解、决策、执行、验证”串起来的交互系统。

#### 可直接放在正文里的 claim 句式

- “Our system treats contract review as a structured co-editing task rather than a sequence of isolated text prompts.”
- “Instead of directly rewriting contracts end-to-end, the system externalizes intermediate structure, exposes action scopes to users, and compiles accepted actions into auditable text revisions.”
- “This design shifts AI assistance from unconstrained generation toward inspectable and reversible interaction.”

### 4.4 Implementation Notes

- 前端：React + TypeScript + SVG workspace
- 交互状态：节点选择、拖拽、递归修改、导出、布局控制
- 后端或推理层：结构抽取、风险与动作生成、终稿映射
- 运行时日志：所有关键交互写入统一事件格式

### 4.5 What to Avoid in Writing

- 不要把这一节写成 API 文档。
- 不要展开过多 prompt engineering 细节，除非它直接服务于交互设计。
- 不要把视觉效果本身写成贡献，重点是视觉如何支持决策与执行。

## 5. Interaction Design

这一节是整篇论文最像 UIST 的部分，要重点写交互细节和用户可感知机制。

### 5.1 Clause Graph Workspace

- 根节点、主条款、子条款构成合同星座。
- 风险等级通过颜色编码。
- 选中节点后显示局部关系与上下文。
- 解释为什么图视图比线性滚动更适合发现依赖和风险传播。

#### 建议补的细节

- 画布中央是合同整体结构，不是仅仅把条款“排成图”，而是把层级、依赖和风险放进同一个交互空间。
- `root/main/sub` 的分层让用户同时看到全局结构和局部细节。
- 可以说明主任务是“定位高风险节点、理解其上下文、决定是否修改、观察影响范围”。

### 5.2 Focus and Context

- 节点选择、关系高亮、BFS 焦点扩散。
- 说明它如何帮助用户在复杂关系中保持上下文，而不丢掉整体结构。

#### CS 角度可写成机制贡献

- 选中一个节点后，不是简单高亮，而是按照图距离逐层衰减地展示上下文。
- 这种 `focus+context` 机制减少了复杂图中的视觉噪音，同时保留了足够多的可解释结构。
- 如果你愿意把这节写得更技术一些，可以明确说：
  - 出边用于展开潜在影响范围
  - 入边用于显示依赖来源
  - 叶子节点标签与显示策略服务于复杂图降噪

### 5.3 Grounded Suggestion Panel

- 每个有风险节点展示删除、修订、补充条款等动作。
- 写清楚：建议不只是“文案替换”，而是面向操作的 action design。
- 如果后续会补证据片段、置信度或原因，这里要预留位置。

#### 这一节很关键

- 这里最好明确“建议对象”和“建议作用域”。
- 比如：
  - 删除针对当前节点及其子树
  - 修订针对当前节点文本
  - 补充条款针对当前节点的局部扩展
- 作用域清楚，是这套系统与普通聊天改写最大的区别之一。
- 如果审稿时被问“为什么不用 inline suggestion”，答案就在这里：
  - 你们的任务不是单段润色，而是结构化决策与后续编译。

### 5.4 Scoped Bulk Editing

- 单条执行与一键递归修改。
- 强调这是层级结构上的 scoped automation，而不是无边界自动改写。
- 这是非常值得强调的交互贡献点。

#### 这里建议写成独立小贡献

- 许多 AI 编辑工具只支持单点建议采纳，你们支持对子树范围做受控批量操作。
- 递归修改的关键不只是“快”，而是：
  - 用户仍然知道作用范围
  - 删除优先于后续修订
  - 被祖先删除覆盖的后代操作会被抑制
- 这部分可以和第 6 节的 `normalization` 呼应，说明 UI 设计与后端编译是一致的。

### 5.5 Reconfigurable Views

- `Semantic Pull / Risk Pull / Time Pull`
- 解释其研究价值：不是好看，而是帮助用户按不同分析目标重组同一合同空间。

#### 这一节可补的研究理由

- `Semantic Pull` 支持按内容接近性聚类，帮助发现语义相近但位置分散的条款
- `Risk Pull` 支持用户先处理高风险区域
- `Time Pull` 支持从合同生命周期角度理解条款分布
- 更重要的是，这三个视图不是切页面，而是对同一对象空间进行连续重参数化，这个说法会更像 HCI/VA 论文

### 5.6 Export and Review Handoff

- 用户操作最终汇总为可导出的合同修订结果。
- 可以简要提到管理员看板/行为日志，但不要让它抢主线。

#### 这一节的 CS 落点

- 用户不是停在图里，系统最终要产出可交付文本
- 图上的每一次确认动作都能回流到导出结果
- 这让可视分析不再是“读图”，而是“读图后可执行”

### 5.7 Figure 2 Storyboard

- `A`：全局合同星座视图
- `B`：选中节点后的焦点上下文
- `C`：右侧 grounded suggestion panel
- `D`：递归修改确认框
- `E`：导出或审计视图

### 5.8 CS 写作提醒

- 每个交互小节都尽量回答三个问题：
  - 用户在这里做什么
  - 系统如何约束或支持这个动作
  - 这个机制为什么优于线性文档或聊天界面

## 6. Traceable Visual-to-Text Pipeline

这一节写“系统背后的智能与约束机制”，是对第 5 节交互层的补充。

### 6.1 Structure Pass

- 从原始合同提取结构化条款节点。
- 强调 `lossless extraction` 与层级稳定性。

#### CS 需要补的重点

- 为什么先做结构抽取，而不是直接全文生成建议
- 结构层如何成为 UI、推理、日志、终稿生成的共同锚点
- 即使这部分具体法律规则不展开，CS 也要强调“stable intermediate representation”

### 6.2 Risk and Action Pass

- 在固定结构上补全风险、引用和建议动作。
- 强调策略约束，而不是自由生成。

#### 可以具体到这些点

- 风险与动作不是同一个任务，动作生成受策略约束
- `delete` 与 `revise/add_clause` 互斥
- `none` 风险不应产生动作
- 所有引用必须指向已有节点
- 这些约束是系统可靠性的一部分，不只是实现细节

### 6.3 Event-First Change Compilation

- 用户和系统动作先写入结构化事件。
- 使用 tree diff、normalization 和 compile pass 生成净变更集。
- 这是“可审计”论点的技术基础。

#### 建议扩写成 3 个小段

- `Event logging`
  - 记录谁在什么时候对哪个节点做了什么动作
- `Normalization`
  - 祖先删除覆盖后代修改
  - 多次 revise 保留最终写入
  - 新增后删除可抵消
- `Deterministic compile`
  - 先程序化得到 `draft_v1`
  - 再做受约束定稿

#### 这一段其实是方法贡献核心

- 很多系统论文只写“用户接受建议后更新文本”，你们这里的优势是有中间层可解释、有冲突归并规则、能回放、能审计。

### 6.4 Controlled Finalization

- 最终文本生成受 `normalized_diff` 约束。
- 不允许越权新增义务或脱离操作链路的自由改写。

#### 推荐写法

- 这节不要强调“LLM 帮我们润色”
- 要强调“模型只能在授权边界内完成映射与最小必要修复”
- 这能回应高风险场景里最常见的担忧：系统是否会 silently rewrite important clauses

### 6.5 Why This Matters

- 用一段短讨论说明：对于高风险文档场景，交互可控性与可追溯性是系统可用性的核心，而不是附属功能。

### 6.6 Failure Cases and Safeguards

- 结构抽取错误会如何影响后续阶段
- 风险判断不稳定时如何保守处理
- 批量操作如何避免连带误修改
- 定稿阶段如何限制越权生成

### 6.7 Figure 3 Storyboard

- `A` 原始文本
- `B` 结构化节点
- `C` enriched graph with actions
- `D` user event log
- `E` normalized diff
- `F` final text + change report

## 7. Evaluation

这一节先按你们现有实验计划搭骨架，等数据齐了再填结果。

### 7.1 Research Questions

- `RQ1` 效率：系统是否降低完成任务时间与交互成本？
- `RQ2` 质量：系统是否提升风险识别与修订质量？
- `RQ3` 认知与信任：系统是否降低认知负担并提升可校准信任？
- `RQ4` 机制：哪些交互机制带来了收益？

### 7.2 Study Design

- `within-subject`
- 条件：Baseline vs System
- 材料：Simple vs Complex
- 参与者：18 人
- 反平衡策略：AB/BA 与材料顺序平衡

#### CS 需要写清楚的控制变量

- 两种条件下材料难度保持一致
- 培训时长一致
- 时间限制一致
- 输出要求一致
- 如果 baseline 含通用问答工具或文档工具，需要把其功能边界写清楚，避免被质疑对比不公平

### 7.3 Tasks and Procedure

- 培训
- 四个任务单元
- 问卷
- 半结构访谈

#### 这节可补成投稿口径

- 培训阶段让参与者完成一次短练习，确保理解界面与目标
- 正式任务要求：
  - 识别风险条款
  - 给出建议或修改
  - 形成可导出结果
- 每个任务单元记录起止时间、操作事件与导出结果
- 问卷和访谈放在所有任务完成后，减少中途打断

### 7.4 Measures

- 客观：TCT、总操作数、无效操作、回退、TFF、TFA、Precision/Recall/F1、建议可执行性
- 主观：NASA-TLX、系统质量、信息质量、满意度、信任与可解释性、未来使用意愿
- 机制：证据查看率、建议采纳率、编辑后采纳率、验证行为比例、切屏次数

#### 指标定义建议单独成表

- `TCT`：从任务开始到提交导出的总时长
- `TFF`：首次识别一个有效风险的时间
- `TFA`：首次完成一个有效改动的时间
- `Verification Action Ratio`：查看证据、回看上下文、二次编辑等行为占总动作的比例
- `Accept Rate`：建议被直接采纳的比例
- `Edit-before-accept Rate`：建议被修改后再采纳的比例

#### 为什么这一节要写细

- 评审通常会质疑“你测到的到底是什么”
- 只列指标名不够，最好提前在方法里说明操作化定义

### 7.5 Analysis Plan

- Wilcoxon signed-rank
- 复杂度敏感性分析
- Holm-Bonferroni
- 主题分析 + 双编码

#### 可进一步补充

- 每个指标报告中位数和 IQR
- 显著性之外报告效应量
- 对 simple / complex 分开分析，再看 complexity delta
- 日志分析可以补一个行为漏斗或状态转移图
- 定性部分要和 RQ 对齐，而不是只堆访谈引语

### 7.6 What to Show in Paper

- 不要把所有指标都塞正文。
- 正文优先放：
  - 时间与操作成本
  - 风险识别/修订质量
  - NASA-TLX / trust
  - 机制日志或行为漏斗
- 其余放附录。

### 7.7 Threats to Validity

- 参与者法律背景差异
- baseline 熟悉度差异
- 材料规模有限
- 短时实验与长期真实使用之间的差距
- 专家评分的一致性问题

### 7.8 CS 负责的附录素材

- 日志事件表
- 指标计算公式
- 任务说明截图
- 图表生成脚本与统计表模板

## 8. Results

这节现在先写成结果槽位，后面按数据填。

### 8.1 Efficiency

- 系统是否更快完成 simple / complex 任务
- 是否减少总操作数和无效操作
- 是否更快到达首次有效发现和首次有效修改

### 8.2 Quality

- 风险识别命中情况
- 修订建议可执行性评分
- 复杂合同上的质量保持能力

### 8.3 Cognitive Load and Trust

- NASA-TLX
- 主观质量与可解释性
- 用户是否更愿意采用系统建议

### 8.4 Mechanism Findings

- 哪些功能最常被用到
- 证据/建议/递归操作的采用模式
- 复杂合同中多维布局是否更关键

### 8.5 Qualitative Themes

- 例如：
  - 图视图帮助建立全局心智模型
  - 建议必须可校验才敢用
  - 批量操作在复杂任务中节省大量时间
  - 用户希望保留最终决定权

## 9. Discussion

### 9.1 What the Results Mean

- 不是单纯“AI 更强”，而是“结构化交互 + 受约束智能 + 可追溯执行”共同带来收益。

### 9.2 Design Implications

- 高风险领域中的 AI 界面要支持可见结构，而不只是对话。
- 自动化应该有清晰边界和作用域。
- 审计链路应被设计进交互，而不是事后补丁。

### 9.3 Generalization Beyond Contracts

- 可扩展到政策审阅、合规文档、医疗或财务等高风险专业文本。

## 10. Limitations and Future Work

- 当前系统的法律领域边界和材料覆盖范围有限。
- 用户群体规模有限，且可能以熟悉数字工具的参与者为主。
- LLM 风险判断与建议质量仍受模型能力影响。
- 当前研究主要检验任务表现与体验，尚未覆盖长期部署与真实组织协作场景。

## 11. Conclusion

- 用 1 段收束：总结提出了什么系统、解决了什么问题、为什么对 UIST/HCI 社区重要。

## Suggested Figures and Tables

### Main Figures

- `Figure 1`：系统方法总览图
- `Figure 2`：界面总览与关键交互标注
- `Figure 3`：视觉到文本的 traceability pipeline
- `Figure 4`：时间/操作数结果图
- `Figure 5`：质量或行为机制图

### Main Tables

- `Table 1`：参与者信息
- `Table 2`：主要统计结果
- `Table 3`：定性主题与代表引语

## Writing Order Recommendation

1. 先写 `Introduction`
2. 再写 `System Overview + Interaction Design`
3. 然后写 `Evaluation` 方法
4. 等数据稳定后补 `Results`
5. 最后收 `Abstract / Discussion / Conclusion`

## Immediate Next Drafts

- `intro_draft.md`：先把问题、gap、贡献三段写出来
- `system_draft.md`：把第 4、5、6 节扩成正文
- `evaluation_draft.md`：把实验设计先写成可投稿版本

## CS Immediate TODOs

- 先把 `System Overview` 写成 2.5 到 3 页的正文初稿
- 单独整理一个 `data_model_and_pipeline.md`，把节点、动作、事件、diff 说清楚
- 单独整理一个 `figure_storyboard.md`，先把 Figure 1 到 Figure 3 讲清楚
- 单独整理一个 `evaluation_metrics_spec.md`，统一每个指标的操作化定义
- 等用户研究数据稳定后，再产出 `results_skeleton.md`

