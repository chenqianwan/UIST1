import type { TemplateItem } from './types';

export const NODE_LIBRARY: TemplateItem[] = [
  {
    id: 'tpl-payment',
    label: 'Standard Payment Terms',
    description: 'Clear payment milestones and timelines with low execution risk',
    type: 'financial',
    riskLevel: 'none',
    timePhase: 'execution',
    content: 'Party A shall pay the corresponding milestone fee within 10 business days after acceptance.',
    satellites: [
      {
        label: 'Initial Payment',
        content: 'Initial payment is due upon contract signing.',
        timePhase: 'pre_sign',
        references: ['tpl-ip', 'tpl-confidentiality'],
        details: [{ label: 'Payment Proof', content: 'Bank transfer receipt serves as proof of initial payment.', timePhase: 'execution' }],
      },
      {
        label: 'Acceptance Payment',
        content: 'Second-stage payment is due after acceptance is approved.',
        timePhase: 'acceptance',
        references: ['tpl-acceptance'],
      },
      {
        label: 'Final Payment',
        content: 'Remaining balance is due after the warranty period ends.',
        timePhase: 'post_termination',
        references: ['tpl-liability'],
      },
    ],
  },
  {
    id: 'tpl-ip',
    label: 'Intellectual Property Ownership',
    description: 'Deliverable ownership is clear, but infringement boundaries need refinement',
    type: 'asset',
    riskLevel: 'low',
    timePhase: 'effective',
    content: 'All deliverables and derivative outcomes of this project are owned by Party A.',
    actions: [
      {
        id: 'tpl-ip::add-1',
        type: 'add_clause',
        status: 'pending',
        reason: 'Define open-source and third-party component attribution to avoid ownership disputes.',
        supplementDraft:
          'Supplement: Party B shall provide a component inventory (including open-source licenses and third-party restrictions) before final acceptance.',
        confidence: 0.79,
      },
      {
        id: 'tpl-ip::revise-1',
        type: 'revise',
        status: 'pending',
        reason: 'Narrow ownership wording so scope and transfer boundaries are explicit.',
        replacementText:
          'Revision: Deliverables developed specifically for this project shall be owned by Party A; pre-existing tools and reusable modules remain Party B property unless separately transferred in writing.',
        confidence: 0.74,
      },
      {
        id: 'tpl-ip::add-2',
        type: 'add_clause',
        status: 'pending',
        reason: 'Add a handover checklist so IP evidence and source archive are verifiable.',
        supplementDraft:
          'Supplement: Before final acceptance, Party B shall deliver source archive hash list, authorship statement, and third-party notice file as part of IP handover checklist.',
        confidence: 0.71,
      },
    ],
    satellites: [
      {
        label: 'Background IP',
        content: 'Party B retains pre-existing background intellectual property rights.',
        timePhase: 'effective',
        references: ['tpl-confidentiality'],
        details: [
          {
            label: 'License Scope',
            content: 'Background IP grants a non-exclusive license for this project only.',
            timePhase: 'execution',
            references: ['tpl-payment'],
          },
        ],
      },
      {
        label: 'Infringement Warranty',
        content: 'Party B assumes indemnification responsibility for infringement risk.',
        timePhase: 'post_termination',
        references: ['tpl-liability', 'tpl-termination'],
      },
    ],
  },
  {
    id: 'tpl-confidentiality',
    label: 'Mutual Confidentiality Obligation',
    description: 'Covers confidentiality duration and disclosure exceptions with controllable risk',
    type: 'obligation',
    riskLevel: 'none',
    timePhase: 'effective',
    content: 'Both parties shall maintain ongoing confidentiality for trade secrets learned during collaboration.',
    satellites: [
      {
        label: 'Confidentiality Period',
        content: 'Confidentiality obligations continue for the agreed period after termination.',
        timePhase: 'post_termination',
        references: ['tpl-termination'],
      },
      {
        label: 'Disclosure Exceptions',
        content: 'Legally mandated disclosure scenarios are treated as exceptions.',
        timePhase: 'execution',
        references: ['tpl-liability'],
      },
    ],
  },
  {
    id: 'tpl-acceptance',
    label: 'Acceptance Criteria Clause',
    description: 'Acceptance criteria are not sufficiently quantifiable; dispute risk is high',
    type: 'obligation',
    riskLevel: 'high',
    timePhase: 'acceptance',
    content: 'Party A shall conduct acceptance after delivery; specific criteria require joint confirmation.',
    actions: [
      {
        id: 'tpl-acceptance::add-1',
        type: 'add_clause',
        status: 'pending',
        reason: 'Add measurable KPIs to reduce acceptance ambiguity.',
        supplementDraft:
          'Supplement: Appendix A shall define objective KPIs, pass/fail thresholds, and evidence formats for each deliverable item.',
        confidence: 0.83,
      },
      {
        id: 'tpl-acceptance::revise-1',
        type: 'revise',
        status: 'pending',
        reason: 'Clarify who confirms acceptance and how exceptions are resolved.',
        replacementText:
          'Revision: Acceptance shall be confirmed by designated reviewers from both parties, and disputed items must enter a documented remediation cycle within 3 business days.',
        confidence: 0.78,
      },
    ],
    satellites: [
      {
        label: 'Defect Remediation',
        content: 'Party B shall complete defect remediation within a reasonable timeframe.',
        timePhase: 'acceptance',
        references: ['tpl-payment'],
      },
      {
        label: 'Re-Validation Process',
        content: 'If re-validation fails, another remediation cycle must begin.',
        timePhase: 'acceptance',
        references: ['tpl-liability'],
        details: [
          {
            label: 'Re-Validation SLA',
            content: 'Provide re-validation feedback within 3 business days after each remediation.',
            timePhase: 'acceptance',
            references: ['tpl-payment'],
          },
        ],
      },
    ],
  },
  {
    id: 'tpl-liability',
    label: 'Liability and Indemnification',
    description: 'Liability cap and exemption boundaries still leave interpretation room',
    type: 'risk',
    riskLevel: 'medium',
    timePhase: 'execution',
    content: 'Direct losses caused by Party B breach shall be compensated within the liability cap.',
    actions: [
      {
        id: 'tpl-liability::delete-1',
        type: 'delete',
        status: 'pending',
        reason:
          'Current liability sentence partially conflicts with the master indemnity section and should be removed to avoid contradictory cap calculations.',
        confidence: 0.75,
      },
    ],
    satellites: [
      {
        label: 'Liability Cap',
        content: 'Compensation cap is based on total contract value.',
        timePhase: 'execution',
        references: ['tpl-payment'],
      },
      {
        label: 'Exemption Clause',
        content: 'Losses caused by force majeure may be partially exempted.',
        timePhase: 'execution',
        references: ['tpl-termination'],
      },
    ],
  },
  {
    id: 'tpl-termination',
    label: 'Unilateral Termination Right',
    description: 'Trigger conditions are ambiguous, creating high dispute and risk potential',
    type: 'risk',
    riskLevel: 'high',
    timePhase: 'termination',
    content: 'Either party may unilaterally terminate for material breach, but quantitative standards are undefined.',
    actions: [
      {
        id: 'tpl-termination::revise-1',
        type: 'revise',
        status: 'pending',
        reason:
          'High risk here requires precise redrafting rather than deletion, because termination rights are mandatory for enforceability.',
        replacementText:
          'Revision: "Material breach" means uncured breach lasting more than 15 business days after written notice; termination requires board-level written approval and settlement checklist completion.',
        confidence: 0.9,
      },
      {
        id: 'tpl-termination::add-1',
        type: 'add_clause',
        status: 'pending',
        reason: 'Add an evidence-retention clause to reduce post-termination dispute cost.',
        supplementDraft:
          'Supplement: Within 5 business days after termination, both parties shall archive evidence files and sign a joint evidence index for settlement.',
        confidence: 0.72,
      },
    ],
    satellites: [
      {
        label: 'Notice Period',
        content: 'A written notice must be issued at least 7 days before termination.',
        timePhase: 'termination',
        references: ['tpl-confidentiality'],
      },
      {
        label: 'Loss Settlement',
        content: 'Both parties shall complete settlement within 15 days after termination.',
        timePhase: 'post_termination',
        references: ['tpl-liability'],
        details: [
          {
            label: 'Settlement Basis',
            content: 'Settlement is based on completed milestones and acceptable deliverables.',
            timePhase: 'post_termination',
            references: ['tpl-payment'],
          },
        ],
      },
    ],
  },
  {
    id: 'tpl-demo-risk-ladder',
    label: '[DEMO] Risk Ladder Path',
    description: 'Fixed chain demo: none -> low -> medium -> high -> none',
    type: 'risk',
    riskLevel: 'none',
    timePhase: 'execution',
    content: 'Dedicated demo template that builds a deterministic 5-node risk ladder chain.',
  },
];
