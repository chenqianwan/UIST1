# 面向 UIST 的 Related Work 方向与关键词检索指导

基于当前项目「合同星座」（Contract Constellation）：**合同条款的可视化图编辑 + AI 建议（删除/修订/补充）+ 多维布局控制 + 视觉-文本协同**，整理与 UIST 投稿相关的 Related Work 查找方向及检索关键词，便于系统检索 ACM DL、Google Scholar、dblp 等。

---

## 一、项目可强调的贡献角度（对应要找的 related work）

| 项目能力 | 可对应的 UIST 研究角度 | 需要对的 Related Work 类型 |
|----------|------------------------|-----------------------------|
| 合同/条款的**节点-连线图**编辑 | 结构化文档的可视化、图编辑界面 | 文档/法律文本的可视化、node-link 编辑、hierarchical document UI |
| **AI 建议**（delete/revise/add_clause）+ 用户逐条或批量采纳 | 混合主导（mixed-initiative）、AI 辅助编辑、建议系统 | Writing assistants, suggestion UI, human-in-the-loop editing |
| **风险等级 + 建议原因/置信度** 展示 | 不确定性/风险可视化、可解释建议 | Uncertainty visualization, explainable AI in UI, confidence display |
| **多维布局控制**（Semantic / Risk / Time Pull） | 用户控制的布局与视图变换 | Interactive layout, dimension sliders, reconfigurable views |
| **子树批量/递归操作**（一键递归修改） | 层级结构上的批量交互 | Hierarchical selection, bulk operations on trees/graphs |
| **视觉操作 ↔ 文本修订** 的闭环（规划中） | 可视化与文本的双向同步、可追溯编辑 | Visual-text co-editing, patch generation, edit traceability |

据此，Related Work 应覆盖：**可视化文档/合同 + 图/层级编辑 + AI 辅助写作/建议 + 风险与可解释性 + 交互式布局 + 批量/层级操作**。

---

## 二、按主题的 Related Work 方向与检索词

### 2.1 文档/合同的结构化与可视化

- **方向**：法律/合同文本的结构可视化、条款关系图、层级文档的图形表示。
- **英文关键词**（可组合检索）  
  - `contract visualization`  
  - `legal document structure`  
  - `clause relationship graph`  
  - `document structure visualization`  
  - `hierarchical document editor`  
  - `structured document editing`  
- **可顺藤摸瓜的会议/期刊**：JURIX、ICAIL、Legal AI 相关 workshop；CHI/IUI 中 document visualization。

---

### 2.2 图/节点-连线编辑与混合主导（AI + 用户）

- **方向**：图编辑界面、节点-边交互、AI 建议与用户操作结合。
- **英文关键词**  
  - `node-link diagram editor`  
  - `graph-based editing`  
  - `mixed-initiative interface`  
  - `AI-assisted editing`  
  - `suggestion interface`  
  - `human-in-the-loop document editing`  
- **补充**：UIST/CHI 中 “writing assistant”“collaborative editing”“suggestion” 常与 mixed-initiative 一起出现。

---

### 2.3 写作辅助与建议系统（含法律/专业文本）

- **方向**：写作辅助、改写建议、补全、以及法律/合同领域的建议系统。
- **英文关键词**  
  - `writing assistant`  
  - `text revision suggestion`  
  - `sentence completion`  
  - `legal clause recommendation`  
  - `contract clause suggestion`  
  - `document revision support`  
- **可顺藤摸瓜**：CHI、IUI、EMNLP/ACL 中 writing support、legal NLP 结合 HCI 的论文。

---

### 2.4 不确定性/风险与可解释性在界面中的呈现

- **方向**：建议的置信度、风险等级、解释性说明在 UI 中的设计。
- **英文关键词**  
  - `uncertainty visualization`  
  - `confidence display`  
  - `explainable AI interface`  
  - `risk visualization`  
  - `AI explanation in user interface`  
  - `trust and transparency in AI systems`  
- **UIST/CHI**：搜索 “explainable”“uncertainty”“confidence” + “interface” 或 “visualization”。

---

### 2.5 交互式布局与多维视图控制

- **方向**：用户通过滑块/控件调整布局、按语义/风险/时间等维度重组视图。
- **英文关键词**  
  - `interactive layout`  
  - `user-controlled layout`  
  - `dimension-based visualization`  
  - `reconfigurable view`  
  - `focus+context`  
  - `semantic layout`  
- **可顺藤摸瓜**：InfoVis、TVCG、UIST 中 layout、graph layout、interactive visualization。

---

### 2.6 层级/树与批量操作

- **方向**：树或图上的选区、批量应用、递归操作。
- **英文关键词**  
  - `hierarchical selection`  
  - `bulk operations on tree`  
  - `graph selection and batch edit`  
  - `recursive apply`  
  - `subtree operations`  
- **可顺藤摸瓜**：文件/大纲编辑器、IDE、图形编辑工具中的 “bulk edit”“hierarchical”。

---

### 2.7 视觉编辑与文本/修订的同步与追溯

- **方向**：可视化操作生成文本 patch、修订历史、可审计的编辑轨迹。
- **英文关键词**  
  - `visual to text sync`  
  - `edit traceability`  
  - `patch generation from interaction`  
  - `document revision history`  
  - `visual-text co-editing`  
- **可顺藤摸瓜**：CHI、DocEng、UIST 中 document editing、versioning、collaborative editing。

---

## 三、推荐检索组合（直接可用的查询示例）

以下可直接用于 **Google Scholar / ACM Digital Library / dblp**（按需微调）：

1. **合同/法律 + 可视化**  
   `contract visualization` OR `legal document structure` OR `clause graph`

2. **图编辑 + 建议/辅助**  
   `graph editor` AND (`suggestion` OR `recommendation` OR `assisted`)

3. **混合主导 + 写作/编辑**  
   `mixed-initiative` AND (`writing` OR `editing` OR `document`)

4. **可解释 + 界面**  
   `explainable AI` AND (`interface` OR `visualization` OR `user`)

5. **不确定性/置信度 + 界面**  
   `uncertainty visualization` OR `confidence display` interface

6. **交互式布局**  
   `interactive layout` AND (`document` OR `graph` OR `node-link`)

7. **层级批量操作**  
   `hierarchical` AND (`bulk` OR `batch` OR `selection`) edit

8. **UIST/CHI 定向**（在 ACM 或 Scholar 中限定 venue）  
   `writing assistant` OR `suggestion interface` OR `document visualization`  
   再在结果中筛选：UIST, CHI, IUI, VIS, TVCG。

---

## 四、建议检索的会议/期刊（与 UIST 同生态）

- **UIST**（首要）  
- **CHI**：HCI、写作辅助、可解释性、文档交互  
- **IUI**：智能界面、建议系统、用户与 AI 协同  
- **VIS / InfoVis / EuroVis**：图布局、不确定性可视化、交互式视图  
- **TVCG**：可视化与交互  
- **DocEng**：文档结构与编辑  
- **JURIX / ICAIL**：法律文档与合同（若强调领域）

检索时可在 ACM DL 或 dblp 中按 “Proceedings of UIST” 或 “CHI” 等过滤，再结合上面关键词缩小范围。

---

## 五、使用建议

1. **先按主题扫一遍**：用第二节每个子类的关键词各做 1–2 次检索，快速筛出 20–30 篇与「文档/图编辑 + 建议 + 可视化」最相关的论文。  
2. **再按引用扩展**：从 UIST/CHI 近 5 年的 2–3 篇最相关论文的 Related Work 和参考文献中挖同类工作。  
3. **写 Related Work 时**：按「文档/合同可视化 → 图编辑与建议 → 可解释与风险展示 → 布局与批量操作 → 视觉-文本同步」的叙事线组织，每块 1–3 篇代表性工作，并明确与本文的对比（差异与补充）。

按上述方向和关键词，可以系统覆盖与当前项目面向 UIST 所需的 Related Work。
