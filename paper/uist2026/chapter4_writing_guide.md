# Chapter 4 Writing Guide

## Purpose

This note is for writing `Chapter 4: System Overview` of the UIST paper from the CS perspective.

The goal of Chapter 4 is **not** to list features or APIs. The goal is to make reviewers understand:

- what the system is
- what shared intermediate representations it uses
- how user interaction connects to downstream revision
- why this is an interactive intelligent system rather than a visualization demo or a chat-based writing tool

This file is intentionally structured as a writing aid:

- what each subsection should accomplish
- what details must appear
- short example paragraphs
- citation slots to fill later

## Recommended Role of Chapter 4

Chapter 4 should answer the question:

**"What is the system, end to end?"**

It should prepare the reader for:

- `Chapter 5`, which explains how users interact with the system
- `Chapter 6`, which explains how the traceable visual-to-text pipeline works internally

So the tone of this chapter should be:

- system-level
- representation-oriented
- interaction-aware
- technically grounded

It should **not** read like:

- a product demo
- an implementation report
- a list of UI widgets
- a backend API spec

## Recommended Structure

Use the following structure.

1. `4. System Overview`
2. `4.1 Workflow`
3. `4.2 Core Representation`
4. `4.3 System Claim`
5. `4.4 Implementation Notes`

If needed, add a very short final subsection:

6. `4.5 What Chapter 5 and 6 Cover`

This is optional, and only useful if the transitions feel abrupt.

---

## 4. System Overview

### Writing Goal

Open the chapter by defining the system in one coherent paragraph.

This opening should make three points immediately:

- the system is for contract review
- it combines visual structure, AI suggestions, and text revision
- it uses explicit intermediate states rather than opaque end-to-end rewriting

### Must Cover

- `Contract Constellation` is an interactive visual-text co-editing system
- the input is a linear contract
- the system turns it into a structured clause graph
- the graph is enriched with risks, references, and candidate actions
- users inspect and manipulate the graph
- accepted actions are compiled into auditable contract revisions

### Avoid

- too many implementation details in the first paragraph
- discussion of evaluation results
- too many adjectives like "powerful", "novel", "intuitive"

### Example Paragraph

```md
Contract Constellation is an interactive visual-text co-editing system for contract review. Rather than treating contracts as flat documents to be searched, scrolled, or rewritten through isolated prompts, the system transforms a contract into a structured clause graph, augments the graph with risks and candidate actions, allows users to inspect and manipulate clauses in a visual workspace, and compiles accepted actions into auditable text revisions. This design frames contract review as a structured co-editing workflow in which AI assistance is exposed through explicit intermediate states rather than opaque end-to-end generation.
```

### Citation Need

Usually this opening needs **few or no citations**, unless you want one framing citation for:

- mixed-initiative interaction
- human-in-the-loop AI editing

### Citation Slots To Consider

- 1 citation on mixed-initiative systems
- 1 citation on AI-assisted writing/editing interfaces

### Search Keywords

- `mixed-initiative interface UIST CHI`
- `human-in-the-loop writing assistant CHI`
- `AI-assisted editing interface UIST`

---

## 4.1 Workflow

### Writing Goal

Explain the end-to-end system as a sequence of stages.

This subsection should make the pipeline feel principled, not accidental.

The key message is:

**the system separates structure extraction, enrichment, interaction, normalization, and text realization into explicit stages**

### Must Cover

- `Stage A`: structure extraction
- `Stage B`: risk/reference/action enrichment
- `Stage C`: visual interaction
- `Stage D`: event-to-diff normalization
- `Stage E`: deterministic compile plus constrained finalization
- `Stage F`: export plus audit artifacts

For each stage, mention:

- input
- output
- why the stage exists

### Suggested Emphasis

- Stage boundaries exist to improve controllability and traceability
- users intervene before free-form generation
- the model is used under constraints rather than asked to rewrite the contract directly

### Example Paragraph

```md
Contract Constellation is organized as a multi-stage workflow that separates structure extraction, risk reasoning, user interaction, and text realization into explicit layers. In Stage A, the system parses a raw contract into a stable hierarchical clause representation. In Stage B, the clause structure is enriched with references, risk labels, and candidate actions such as revise, delete, and add_clause. In Stage C, users inspect and manipulate the resulting clause graph in a visual workspace. In Stage D, accepted user operations are translated into structured editing events and normalized into a canonical tree diff. In Stage E, the normalized diff is first deterministically compiled into an intermediate draft and then mapped back to final contract text through a constrained generation step. Finally, in Stage F, the system exports the revised contract together with audit artifacts such as change reports and interaction traces.
```

### Optional Follow-up Paragraph

```md
This staged design allows the system to preserve a stable mapping between interface-level decisions and final document changes. Rather than treating the language model as the sole source of authority, the system uses intermediate representations to separate user intent, structural edits, and final text realization.
```

### Citation Need

Keep citations light here. This subsection is mainly descriptive.

Possible citation needs:

- 1 citation on structured editing pipelines
- 1 citation on traceable or constrained text generation, if you want to frame the design choice

### Citation Slots To Consider

- structured document editing / document engineering
- traceable AI text editing
- constrained generation in high-stakes writing

### Search Keywords

- `structured document editing DocEng`
- `traceable AI text editing`
- `auditable text generation interface`
- `document revision pipeline human in the loop`

---

## 4.2 Core Representation

### Writing Goal

Convince reviewers that the system uses a clean intermediate representation rather than a collection of ad hoc UI states.

This subsection is one of the most important parts of Chapter 4.

### Must Cover

- `Node`
- `Link`
- `Action`
- `Event`
- `DiffOp`

For each object, explain:

- what it represents
- where it appears in the workflow
- why it matters for control or traceability

### Strong Message To Convey

The same structural objects anchor:

- AI enrichment
- visual interaction
- user action capture
- downstream compilation
- export and audit

### Example Paragraph

```md
A key design decision in Contract Constellation is to use explicit intermediate representations throughout the pipeline. Rather than connecting interface components, AI outputs, and export routines through loosely coupled text snippets, the system uses a small set of shared structural objects that persist across stages. This design improves consistency across modules and supports both interpretability and replay.
```

### Example Object-Level Paragraph

```md
The core representation is a graph of contract clauses. Each node represents a clause or sub-clause and stores a unique identifier, a label, clause content, a hierarchical type, and an optional parent reference. Nodes may also carry analytical attributes such as risk level, temporal phase, outgoing references, or evidence-linked metadata. Links represent either structural relations inherited from document hierarchy or analytical relations such as inferred references and dependencies.
```

### Example Closing Sentence

```md
By making nodes, links, actions, events, and diff operations first-class objects, the system turns contract review from an opaque prompt-and-response process into an inspectable state transformation pipeline.
```

### Citation Need

This subsection may benefit from a small number of citations, especially if you want to justify:

- structured document models
- event-based editing histories
- traceable revision systems

### Citation Slots To Consider

- structured document representations
- revision history / provenance / event logs
- editable graphs or node-link representations for structured documents

### Search Keywords

- `structured document model editor`
- `event-based editing history document systems`
- `provenance in interactive systems`
- `visual text co-editing`

---

## 4.3 System Claim

### Writing Goal

State clearly what the system is **not**, and what it **is**.

This is the subsection that should stop reviewers from misclassifying the paper as:

- only a visualization system
- only a legal NLP pipeline
- only a writing assistant

### Must Cover

- not only a visualization
- not only a generic AI writing assistant
- a structured co-editing system
- combines understanding, decision, execution, and validation
- AI assistance is constrained and inspectable

### Recommended Logic

1. Say what categories do **not** fully describe the system.
2. Say what integrated claim better captures it.
3. Explain how this claim differs from prompt-based workflows.

### Example Paragraph

```md
Contract Constellation is not simply a contract visualization tool, nor is it a generic AI writing assistant. Instead, it is an interactive system that integrates structural understanding, user-centered decision making, constrained execution, and traceable output generation into a single workflow. Users do not merely query an AI model for suggestions and manually copy edits back into a document. Instead, they inspect structure, validate candidate actions, operate over explicit scopes, and export revisions through a controlled transformation pipeline.
```

### Example Contrast Sentence

```md
This design shifts AI assistance from unconstrained rewriting toward inspectable, reversible, and accountable interaction.
```

### Citation Need

This subsection may need 1 to 3 strategic citations if you want to contrast with:

- generic writing assistants
- mixed-initiative editing systems
- explainable or controllable AI interfaces

### Citation Slots To Consider

- AI writing assistants
- mixed-initiative editing
- controllable / explainable AI interfaces

### Search Keywords

- `AI writing assistant CHI UIST`
- `mixed-initiative editing interface`
- `controllable AI interface writing`
- `explainable AI interaction design`

---

## 4.4 Implementation Notes

### Writing Goal

Briefly show that the system is real and complete, without turning this section into a software manual.

This subsection should reassure the reviewer that:

- the frontend interaction space is implemented
- the backend pipeline is separated and functional
- runtime logging exists as research infrastructure

### Must Cover

- frontend stack
- interactive workspace implementation
- backend separation between enrichment and downstream revision
- unified event logging / runtime monitoring

### Example Paragraph

```md
The frontend is implemented in React and TypeScript and rendered as an SVG-based interactive workspace. It maintains state for clause nodes, links, layout configuration, suggested actions, and export preparation. The backend separates semantic enrichment from revision compilation: upstream components produce structured clause representations and analytical metadata, while downstream services transform accepted operations into normalized diffs, deterministic intermediate drafts, and constrained final revisions. To support auditability and evaluation, the system also records runtime interaction traces in a unified event schema.
```

### Citation Need

Usually **no citation is required** here unless you mention a named external framework or method.

### Good Practice

- keep this short
- do not include endpoint names
- do not discuss implementation bugs or engineering trade-offs in detail

---

## 4.5 Optional Transition Paragraph

If Chapter 4 feels too abstract, add a short transition at the end:

```md
Chapter 4 describes the system as an end-to-end workflow and a set of shared intermediate representations. We next unpack these ideas from two complementary perspectives: Chapter 5 focuses on the user-facing interaction mechanisms in the visual workspace, while Chapter 6 explains how accepted actions are normalized, compiled, and mapped into auditable text revisions.
```

This is optional, but often useful.

---

## What Chapter 4 Should Not Do

- do not repeat the abstract
- do not preview evaluation results
- do not turn into a related work subsection
- do not enumerate every UI control
- do not spend too much space on prompt wording
- do not describe the system as if the language model is the whole method

## Citation Strategy For Chapter 4

Chapter 4 should use **light but strategic** citations.

Recommended total citation load:

- around `3-6` citations across the whole chapter

That is enough.

If you cite too much here, it will start to overlap with `Related Work`.

### Best Places To Cite

Use citations only when they help justify one of the following:

- mixed-initiative interaction framing
- structured document editing or document models
- traceable or auditable AI editing
- controllable text generation in high-stakes settings

### Best Places To Avoid Citing

- implementation notes
- system-specific data flow
- your own workflow description

---

## Citation Checklist To Fill Later

### Slot A: Mixed-Initiative Framing

Use in:

- `4. System Overview` or `4.3 System Claim`

Why:

- to support the claim that this is a human-in-the-loop interactive system

Keywords:

- `mixed-initiative interface`
- `human-AI co-editing`
- `interactive intelligent systems`

### Slot B: Structured Editing / Shared Representation

Use in:

- `4.1 Workflow` or `4.2 Core Representation`

Why:

- to support the use of stable intermediate representations and structured editing states

Keywords:

- `structured document editing`
- `document engineering revision model`
- `hierarchical document editor`

### Slot C: Traceable Revision / Auditability

Use in:

- `4.1 Workflow`, `4.2 Core Representation`, or `4.3 System Claim`

Why:

- to support claims about replayability, traceability, and constrained revision pipelines

Keywords:

- `edit traceability`
- `auditable AI editing`
- `provenance interactive systems`

### Slot D: Controllable AI Text Revision

Use in:

- `4.3 System Claim`

Why:

- to contrast with unconstrained end-to-end rewriting

Keywords:

- `controllable text generation interface`
- `AI writing support controllability`
- `human oversight text generation`

---

## Suggested Writing Workflow

If writing from scratch, do it in this order:

1. write `4.3 System Claim`
2. write `4.1 Workflow`
3. write `4.2 Core Representation`
4. write `4.4 Implementation Notes`
5. revise the opening of `4. System Overview`

This order is recommended because:

- the claim tells you what to emphasize
- the workflow explains the big picture
- the representation section gives technical credibility
- implementation notes are easy to add last

---

## Project-Specific Materials Already In This Folder

Useful neighboring materials:

- `paper/uist2026/outline_draft.md`
- `paper/uist2026/notes/UIST_Related_Work_与关键词检索指导.md`
- `paper/uist2026/notes/UIST_实验访谈计划_18人_数据导向版.md`
- `paper/uist2026/notes/UIST_实验访谈计划_18人_数据导向版.docx`

These should help with:

- aligning Chapter 4 with the full paper outline
- deciding where Chapter 4 ends and Chapter 5 begins
- finding citation directions without overloading this chapter
- keeping system claims consistent with the evaluation design
