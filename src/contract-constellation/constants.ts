import type { TemplateItem } from './types';

export const NODE_LIBRARY: TemplateItem[] = [
  {
    id: 'tpl-payment',
    label: 'Standard Payment Terms',
    description: 'Clear payment milestones and timelines with low execution risk',
    type: 'financial',
    riskLevel: 'none',
    content: 'Party A shall pay the corresponding milestone fee within 10 business days after acceptance.',
    satellites: [
      {
        label: 'Initial Payment',
        content: 'Initial payment is due upon contract signing.',
        details: [{ label: 'Payment Proof', content: 'Bank transfer receipt serves as proof of initial payment.' }],
      },
      { label: 'Acceptance Payment', content: 'Second-stage payment is due after acceptance is approved.' },
      { label: 'Final Payment', content: 'Remaining balance is due after the warranty period ends.' },
    ],
  },
  {
    id: 'tpl-ip',
    label: 'Intellectual Property Ownership',
    description: 'Deliverable ownership is clear, but infringement boundaries need refinement',
    type: 'asset',
    riskLevel: 'low',
    content: 'All deliverables and derivative outcomes of this project are owned by Party A.',
    satellites: [
      {
        label: 'Background IP',
        content: 'Party B retains pre-existing background intellectual property rights.',
        details: [{ label: 'License Scope', content: 'Background IP grants a non-exclusive license for this project only.' }],
      },
      { label: 'Infringement Warranty', content: 'Party B assumes indemnification responsibility for infringement risk.' },
    ],
  },
  {
    id: 'tpl-confidentiality',
    label: 'Mutual Confidentiality Obligation',
    description: 'Covers confidentiality duration and disclosure exceptions with controllable risk',
    type: 'obligation',
    riskLevel: 'none',
    content: 'Both parties shall maintain ongoing confidentiality for trade secrets learned during collaboration.',
    satellites: [
      { label: 'Confidentiality Period', content: 'Confidentiality obligations continue for the agreed period after termination.' },
      { label: 'Disclosure Exceptions', content: 'Legally mandated disclosure scenarios are treated as exceptions.' },
    ],
  },
  {
    id: 'tpl-acceptance',
    label: 'Acceptance Criteria Clause',
    description: 'Acceptance criteria are not sufficiently quantifiable; dispute risk is medium',
    type: 'obligation',
    riskLevel: 'medium',
    content: 'Party A shall conduct acceptance after delivery; specific criteria require joint confirmation.',
    satellites: [
      { label: 'Defect Remediation', content: 'Party B shall complete defect remediation within a reasonable timeframe.' },
      {
        label: 'Re-Validation Process',
        content: 'If re-validation fails, another remediation cycle must begin.',
        details: [{ label: 'Re-Validation SLA', content: 'Provide re-validation feedback within 3 business days after each remediation.' }],
      },
    ],
  },
  {
    id: 'tpl-liability',
    label: 'Liability and Indemnification',
    description: 'Liability cap and exemption boundaries still leave interpretation room',
    type: 'risk',
    riskLevel: 'medium',
    content: 'Direct losses caused by Party B breach shall be compensated within the liability cap.',
    satellites: [
      { label: 'Liability Cap', content: 'Compensation cap is based on total contract value.' },
      { label: 'Exemption Clause', content: 'Losses caused by force majeure may be partially exempted.' },
    ],
  },
  {
    id: 'tpl-termination',
    label: 'Unilateral Termination Right',
    description: 'Trigger conditions are ambiguous, creating high dispute and risk potential',
    type: 'risk',
    riskLevel: 'high',
    content: 'Either party may unilaterally terminate for material breach, but quantitative standards are undefined.',
    satellites: [
      { label: 'Notice Period', content: 'A written notice must be issued at least 7 days before termination.' },
      {
        label: 'Loss Settlement',
        content: 'Both parties shall complete settlement within 15 days after termination.',
        details: [{ label: 'Settlement Basis', content: 'Settlement is based on completed milestones and acceptable deliverables.' }],
      },
    ],
  },
];
