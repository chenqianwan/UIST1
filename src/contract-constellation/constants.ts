import type { TemplateItem } from './types';

/**
 * 备份说明：
 * 1. 房屋租赁合同 (Residential Lease) - 2026-02-26 (严格按照原文 17 条一级条款及所有子项全量展开)
 * 2. 简单信托 (Declaration of Trust) - 2026-02-26 (24条完整条款)
 * 3. 合作开发专利协议 (Patent Development) - 2026-02-26 (严格三级树状结构)
 */

export const LEASE_TEMPLATES: TemplateItem[] = [
  {
    id: 'tpl-lease-1',
    label: '第一条 租赁房屋基本情况',
    description: '房屋坐落、面积、用途及权属状况',
    type: 'obligation',
    riskLevel: 'none',
    timePhase: 'pre_sign',
    content: '1.1 坐落与面积。1.2 权属状况。1.3 装修情况。1.4 附属设施。',
    satellites: [
      { label: '1.1 坐落与面积', content: '南山区桂湾片区二单元前海卓越金融中心（一期）8 号楼 1001-*******，建筑面积：5平方米。', timePhase: 'effective' },
      { label: '1.2 权属状况', content: '权利人为深圳市前海风尚行物业管理有限公司，持有0193818号证书。', timePhase: 'effective' },
      { label: '1.3 装修情况', content: '已装修（具体见附件二）。', timePhase: 'effective' },
      { label: '1.4 附属设施', content: '详见附件三《房屋交付确认书》。', timePhase: 'effective' }
    ]
  },
  {
    id: 'tpl-lease-2',
    label: '第二条 租赁期限',
    description: '租赁起止日期及免租期约定',
    type: 'obligation',
    riskLevel: 'none',
    timePhase: 'execution',
    content: '2.1 租赁期限。2.2 免租期。',
    satellites: [
      { label: '2.1 租赁期限', content: '自 2025 年 12 月 1 日至 2026 年 11 月 30 日止,共计 1 年。', timePhase: 'execution' },
      { label: '2.2 免租期', content: '乙方不享有免租期，自交付之日起计算租金。', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-lease-3',
    label: '第三条 租金',
    description: '租金标准、支付时间及方式',
    type: 'financial',
    riskLevel: 'low',
    timePhase: 'execution',
    content: '3.1 租金总额。3.2 支付时间。3.3 支付方式。3.4 调价限制。',
    actions: [
      {
        id: 'tpl-lease-3::revise-1',
        type: 'revise',
        status: 'pending',
        reason: '租金标准（250元/5平米）远低于市场均价，可能导致税务合规审查。',
        suggestionText: '建议：在合同中明确该租金是否包含特定补贴或属于关联交易定价。',
        confidence: 0.85
      }
    ],
    satellites: [
      { label: '3.1 租金总额', content: '月租金总额为人民币 250 元（大写：贰佰伍拾元整）。', timePhase: 'execution' },
      { label: '3.2 支付时间', content: '租金按月支付，乙方应当于每月日前向甲方支付。', timePhase: 'execution' },
      { label: '3.3 支付方式', content: '以银行转账方式支付至甲方指定账户。', timePhase: 'execution' },
      { label: '3.4 调价限制', content: '合同期内，甲方不得单方面提高租金。', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-lease-4',
    label: '第四条 租赁押金',
    description: '押金数额、支付及退还条件',
    type: 'financial',
    riskLevel: 'none',
    timePhase: 'execution',
    content: '4.1 押金支付。4.2 押金退还。',
    satellites: [
      { label: '4.1 押金支付', content: '签署后5日内支付押金。', timePhase: 'execution' },
      { 
        id: 'sub-4.2',
        label: '4.2 押金退还', 
        content: '租赁期满或解除后5日内，满足条件后无息退还。', 
        timePhase: 'post_termination',
        details: [
          { label: '4.2(1) 无损坏', content: '乙方未对租赁房屋造成损坏或已经修复。', timePhase: 'post_termination' },
          { label: '4.2(2) 已交还', content: '按照约定方式将房屋及设施交还甲方。', timePhase: 'post_termination' },
          { label: '4.2(3) 工商迁移', content: '已将工商注册地址迁移并办理完毕手续。', timePhase: 'post_termination' }
        ]
      }
    ]
  },
  {
    id: 'tpl-lease-5',
    label: '第五条 其他费用',
    description: '税费及公用事业费用承担',
    type: 'financial',
    riskLevel: 'none',
    timePhase: 'execution',
    content: '5.1 甲方税费。5.2 乙方杂费。5.3 缴费要求。',
    satellites: [
      { label: '5.1 甲方税费', content: '甲方负责支付法律规定的房屋租赁相关税费。', timePhase: 'execution' },
      { 
        id: 'sub-5.2',
        label: '5.2 乙方杂费', 
        content: '水、电、燃气、物业管理、网络等费用由乙方承担。', 
        timePhase: 'execution',
        details: [
          { label: '水费标准', content: '随公用事业单位调整。', timePhase: 'execution' },
          { label: '电费标准', content: '随公用事业单位调整。', timePhase: 'execution' },
          { label: '物业费标准', content: '随物业服务企业调整。', timePhase: 'execution' }
        ]
      },
      { label: '5.3 滞纳金', content: '逾期缴纳产生的滞纳金、违约金由乙方承担。', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-lease-6',
    label: '第六条 房屋的交付与验收',
    description: '交付时间、标准及确认书签署',
    type: 'obligation',
    riskLevel: 'none',
    timePhase: 'execution',
    content: '6.1 交付时间。6.2 验收确认。6.3 特别确认。',
    satellites: [
      { label: '6.1 交付时间', content: '甲方应于 2025 年 12 月 1 日前将房屋交付给乙方。', timePhase: 'execution' },
      { label: '6.2 验收确认', content: '双方应当共同签署《房屋交付确认书》完成交付。', timePhase: 'execution' },
      { label: '6.3 特别确认', content: '未签署确认书但乙方已进场装修的，视为交付已完成。', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-lease-7',
    label: '第七条 装饰装修',
    description: '装修许可及限制',
    type: 'obligation',
    riskLevel: 'low',
    timePhase: 'execution',
    content: '7.1 装修限制。',
    satellites: [
      { label: '7.1 装修限制', content: '甲方不同意乙方对租赁房屋进行装饰装修。', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-lease-8',
    label: '第八条 房屋使用及维护',
    description: '合理使用、维修责任及紧急维修',
    type: 'obligation',
    riskLevel: 'medium',
    timePhase: 'execution',
    content: '8.1 租赁用途。8.2 维修责任。8.3 紧急维修。',
    satellites: [
      { label: '8.1 租赁用途', content: '正常、合理使用房屋，未经同意不得擅自改变用途。', timePhase: 'execution' },
      { 
        id: 'sub-8.2',
        label: '8.2 维修分工', 
        content: '甲方负责正常损坏，乙方负责不当使用损坏。', 
        timePhase: 'execution',
        actions: [{
          id: 'lease-8.2::add',
          type: 'add_clause',
          status: 'pending',
          reason: '缺乏“紧急情况”的具体定义，易产生代为维修费用争议。',
          supplementDraft: '补充：紧急情况指漏水、断电、影响结构安全等需24小时内处理的情形。',
          confidence: 0.82
        }],
        details: [
          { label: '甲方维修', content: '接到通知后5日内进行维修。', timePhase: 'execution' },
          { label: '乙方代修', content: '甲方逾期或紧急情况，乙方可代修并由甲方承担费用。', timePhase: 'execution' },
          { label: '乙方负责', content: '故意或使用不当损坏由乙方负责维修。', timePhase: 'execution' }
        ]
      },
      { label: '8.3 紧急进入', content: '紧急情况下甲方可在协助下进入维修，由此造成的损失应补偿。', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-lease-9',
    label: '第九条 转租、续租及优先权',
    description: '禁止转租、续租申请及优先购买权',
    type: 'obligation',
    riskLevel: 'medium',
    timePhase: 'execution',
    content: '9.1 转租。9.2 续租。9.3 优先权。',
    satellites: [
      { 
        label: '9.1 转租限制', 
        content: '乙方不得转租。', 
        timePhase: 'execution',
        actions: [{
          id: 'lease-9.1::revise',
          type: 'revise',
          status: 'pending',
          reason: '绝对禁止转租限制了企业业务调整的灵活性。',
          suggestionText: '建议：修改为“未经甲方书面同意不得转租，但甲方不得无理拒绝关联公司的转租申请”。',
          confidence: 0.88
        }]
      },
      { label: '9.2 续租约定', content: '期满前30日提出书面申请，同等条件下享有优先续租权。', timePhase: 'execution' },
      { label: '9.3 优先权', content: '出售房屋应提前通知，乙方在同等条件下享有优先购买权。', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-lease-10',
    label: '第十条 房屋返还',
    description: '返还时间、遗留物处理及交验',
    type: 'risk',
    riskLevel: 'high',
    timePhase: 'post_termination',
    content: '10.1 返还时限。10.2 遗留物处置。10.3 交验确认。',
    satellites: [
      { label: '10.1 返还时限', content: '合同解除或届满后3日内及时清空搬离。', timePhase: 'post_termination' },
      { 
        label: '10.2 遗留物处置', 
        content: '返还后遗留物品视为放弃所有权，甲方有权作为废弃物处理。', 
        timePhase: 'post_termination',
        actions: [{
          id: 'lease-10.2::revise',
          type: 'revise',
          status: 'pending',
          reason: '直接视为废弃物处理可能侵犯承租人财产权。',
          suggestionText: '建议：增加“甲方应限期取回，逾期则代为保管30日，费用由乙方承担”的约定。',
          confidence: 0.92
        }]
      },
      { label: '10.3 交验确认', content: '双方应当在《房屋交还确认书》中签字或盖章。', timePhase: 'post_termination' }
    ]
  },
  {
    id: 'tpl-lease-11',
    label: '第十一条 合同的解除',
    description: '协商、单方及共同解除情形',
    type: 'risk',
    riskLevel: 'medium',
    timePhase: 'execution',
    content: '11.1 协商解除。11.2 甲方单方解除。11.3 乙方单方解除。11.4 共同解除。11.5 解除生效。',
    satellites: [
      { label: '11.1 协商一致', content: '经甲乙双方协商一致，可以解除本合同。', timePhase: 'execution' },
      { 
        id: 'sub-11.2',
        label: '11.2 甲方解除', 
        content: '乙方违约时甲方有权单方解除。', 
        timePhase: 'execution',
        details: [
          { label: '11.2(1) 逾期支付', content: '不支付租金或费用达 30日。', timePhase: 'execution' },
          { label: '11.2(2) 拒绝签署', content: '无正当理由拒绝签署《房屋交付确认书》。', timePhase: 'execution' },
          { label: '11.2(3) 擅自拆改', content: '擅自拆改变动房屋主体结构。', timePhase: 'execution' },
          { label: '11.2(4) 改变用途', content: '擅自改变租赁房屋用途。', timePhase: 'execution' },
          { label: '11.2(5) 擅自转租', content: '擅自将租赁房屋转租给第三人。', timePhase: 'execution' },
          { label: '11.2(6) 违法活动', content: '利用租赁房屋从事违法活动。', timePhase: 'execution' }
        ]
      },
      { 
        id: 'sub-11.3',
        label: '11.3 乙方解除', 
        content: '甲方违约时乙方有权单方解除。', 
        timePhase: 'execution',
        details: [
          { label: '11.3(1) 逾期交付', content: '未按约定时间交付租赁房屋达 7 日。', timePhase: 'execution' },
          { label: '11.3(2) 权属瑕疵', content: '无权出租或房屋危及乙方安全或健康。', timePhase: 'execution' },
          { label: '11.3(3) 不修不缴', content: '不承担维修义务或不缴纳应由甲方承担的费用。', timePhase: 'execution' }
        ]
      },
      { 
        id: 'sub-11.4',
        label: '11.4 共同解除', 
        content: '不可抗力或政策原因导致解除。', 
        timePhase: 'execution',
        details: [
          { label: '11.4(1) 征收拆除', content: '因社会公共利益被依法征收征用拆除。', timePhase: 'execution' },
          { label: '11.4(2) 不可抗力', content: '因地震、火灾等不可抗力致使房屋毁损灭失。', timePhase: 'execution' },
          { label: '11.4(3) 抵押处分', content: '签约时已告知抵押风险，现被处分。', timePhase: 'execution' }
        ]
      },
      { label: '11.5 解除生效', content: '送达《解除合同通知书》时本合同解除。', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-lease-12',
    label: '第十二条 违约责任',
    description: '甲方与乙方的违约金及赔偿约定',
    type: 'risk',
    riskLevel: 'high',
    timePhase: 'execution',
    content: '12.1 甲方违约责任。12.2 乙方违约责任。',
    satellites: [
      { 
        id: 'sub-12.1',
        label: '12.1 甲方违约', 
        content: '甲方存在违约行为时的责任承担。', 
        timePhase: 'execution',
        details: [
          { label: '12.1(1) 解除赔偿', content: '退回押金租金，并支付月租金标准违约金。', timePhase: 'execution' },
          { label: '12.1(2) 逾期交付', content: '每日按日租金两倍支付违约金，最高两倍月租。', timePhase: 'execution' },
          { label: '12.1(3) 提前解除', content: '提前30日通知，支付两倍月租违约金。', timePhase: 'execution' }
        ]
      },
      { 
        id: 'sub-12.2',
        label: '12.2 乙方违约', 
        content: '乙方存在违约行为时的责任承担。', 
        timePhase: 'execution',
        details: [
          { label: '12.2(1) 解除违约金', content: '按合同月租金金额的标准支付违约金。', timePhase: 'execution' },
          { label: '12.2(2) 逾期缴费', content: '宽限期满后，每日按日租金两倍支付违约金。', timePhase: 'execution' },
          { label: '12.2(3) 提前解约', content: '提前30日通知，支付两倍月租违约金。', timePhase: 'execution' },
          { label: '12.2(4) 逾期搬离', content: '每日按日租金两倍支付违约金。', timePhase: 'execution' },
          { label: '12.2(5) 擅自改造', content: '恢复原状并赔偿损失。', timePhase: 'execution' }
        ]
      }
    ]
  },
  {
    id: 'tpl-lease-13',
    label: '第十三条 特别条款',
    description: '安全管理责任书签署要求',
    type: 'obligation',
    riskLevel: 'none',
    timePhase: 'execution',
    content: '13.1 安全责任书。',
    satellites: [
      { label: '13.1 安全责任书', content: '甲乙双方应签订《深圳市房屋租赁安全管理责任书》。', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-lease-14',
    label: '第十四条 通知和送达',
    description: '送达地址、方式及生效约定',
    type: 'obligation',
    riskLevel: 'none',
    timePhase: 'execution',
    content: '14.1 送达方式。14.2 无法送达处理。',
    satellites: [
      { label: '14.1 送达方式', content: '约定以邮寄、电子邮件、微信、短信方式发送通知。', timePhase: 'execution' },
      { label: '14.2 无法送达处理', content: '无法送达时，向租赁房屋所在地发送的通知视为有效送达。', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-lease-15',
    label: '第十五条 争议解决',
    description: '协商、调解及仲裁约定',
    type: 'risk',
    riskLevel: 'none',
    timePhase: 'post_termination',
    content: '15.1 争议解决方式。15.2 条款独立性。',
    satellites: [
      { label: '15.1 争议解决', content: '协商不成向深圳国际仲裁院申请仲裁。', timePhase: 'post_termination' },
      { label: '15.2 条款独立性', content: '争议解决条款独立存在，不受合同变更、解除等影响。', timePhase: 'post_termination' }
    ]
  },
  {
    id: 'tpl-lease-16',
    label: '第十六条 合同的变更',
    description: '变更程序及补充协议效力',
    type: 'obligation',
    riskLevel: 'none',
    timePhase: 'execution',
    content: '16.1 变更程序。',
    satellites: [
      { label: '16.1 变更程序', content: '需双方协商一致并签订补充协议。', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-lease-17',
    label: '第十七条 合同签署、登记备案',
    description: '生效、份数及备案要求',
    type: 'obligation',
    riskLevel: 'none',
    timePhase: 'effective',
    content: '17.1 生效份数。17.2 附件效力。17.3 登记备案。',
    satellites: [
      { label: '17.1 生效份数', content: '自签署之日起生效，一式叁份。', timePhase: 'effective' },
      { label: '17.2 附件效力', content: '附件为有效组成部分，具有同等法律效力。', timePhase: 'effective' },
      { label: '17.3 登记备案', content: '签署后 10 日内办理登记备案手续。', timePhase: 'effective' }
    ]
  }
];

export const TRUST_TEMPLATES: TemplateItem[] = [
  {
    id: 'tpl-trust-1',
    label: '1. Interpretation',
    description: 'Definitions and rules of construction',
    type: 'obligation',
    riskLevel: 'low',
    timePhase: 'pre_sign',
    content: '1.1 Definitions for Act, Beneficiaries, Trust Period, etc. 1.2 Interpretation rules.',
    satellites: [
      {
        id: 'sub-1.1',
        label: '1.1 Definitions',
        content: 'Core legal definitions used throughout the deed.',
        timePhase: 'effective',
        details: [
          { label: 'Act', content: 'Trusts Act (as revised) of the Cayman Islands.', timePhase: 'effective' },
          { label: 'Beneficiaries (a)', content: 'Persons listed in Schedule 1.', timePhase: 'effective' },
          { label: 'Beneficiaries (b)', content: 'Persons added under Clause 9.', timePhase: 'effective' },
          { label: 'Charity', content: 'Trust established exclusively for charitable purposes.', timePhase: 'effective' },
          { 
            label: 'Children (Risk)', 
            content: 'Excludes illegitimate children or issue.', 
            timePhase: 'effective',
            actions: [{
              id: 'trust-1.1-children::revise',
              type: 'revise',
              status: 'pending',
              reason: 'The definition of "Children" explicitly excludes illegitimate children, which may be discriminatory.',
              suggestionText: 'Revision: "Children" shall mean children of any person whether or not born in wedlock.',
              confidence: 0.95
            }]
          },
          { label: 'Trust Period (a)', content: '150th anniversary of the date of this Trust.', timePhase: 'effective' },
          { label: 'Trust Period (b)', content: 'Earlier date appointed by Trustees with PC consent.', timePhase: 'effective' }
        ]
      },
      {
        id: 'sub-1.2',
        label: '1.2 Interpretation Rules',
        content: 'Singular/plural, gender, and heading rules.',
        timePhase: 'effective'
      }
    ]
  },
  {
    id: 'tpl-trust-2',
    label: '2. Declaration of Trust',
    description: 'Original and Additional Property',
    type: 'obligation',
    riskLevel: 'none',
    timePhase: 'effective',
    content: 'Trustees shall hold the Trust Fund on the trusts and provisions contained in this Deed.',
    satellites: [
      { label: '2.1 Trust Fund', content: 'Trustees hold the Trust Fund subject to terms of this Deed.', timePhase: 'effective' },
      { label: '2.2 Additions', content: 'Liberty to accept or disclaim additions to the Trust Fund.', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-trust-3',
    label: '3. Trusts of Income and Capital',
    description: 'Distribution and accumulation',
    type: 'financial',
    riskLevel: 'medium',
    timePhase: 'execution',
    content: '3(a) Pay or apply Trust Fund for Beneficiaries. 3(b) Power to accumulate income.',
    satellites: [
      { 
        label: '3(a) Distribution', 
        content: 'Pay or apply funds for the benefit of Beneficiaries with PC consent.', 
        timePhase: 'execution',
        actions: [{
          id: 'trust-3.a::revise',
          type: 'revise',
          status: 'pending',
          reason: 'Prior written consent of PC for ANY distribution may delay urgent support.',
          suggestionText: 'Revision: Trustees may make emergency distributions up to $50,000 without prior consent.',
          confidence: 0.82
        }]
      },
      { label: '3(b) Accumulation', content: 'Power to accumulate income and add to capital.', timePhase: 'execution' },
      { label: '3(c) Current Year', content: 'Apply accumulated income as if it were current year income.', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-trust-4',
    label: '4. Powers of Appointment',
    description: 'Appointment and Advancement',
    type: 'obligation',
    riskLevel: 'medium',
    timePhase: 'execution',
    content: '4.1 Discretionary appointment by Protective Committee. 4.8 Maintenance and advancement.',
    satellites: [
      { label: '4.1 PC Appointment', content: 'PC may appoint capital/income by declaration.', timePhase: 'execution' },
      { label: '4.2 New Trusts', content: 'PC may instruct Trustees to hold fund on new trusts.', timePhase: 'execution' },
      { label: '4.6 Other Trusts', content: 'Transfer to trustees of any other trust for Beneficiaries.', timePhase: 'execution' },
      { label: '4.8 Advancement', content: 'PC may instruct Trustee to pay for maintenance or benefit.', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-trust-8',
    label: '8. Power to Exclude',
    description: 'Exclude Beneficiaries and Disclaimer',
    type: 'obligation',
    riskLevel: 'medium',
    timePhase: 'execution',
    content: '8.1 PC may declare that persons shall cease to be Beneficiaries.',
    satellites: [
      { label: '8.1(a) Wholly Exclude', content: 'Wholly excluded from future benefit.', timePhase: 'execution' },
      { label: '8.1(b) Cease Beneficiary', content: 'Shall cease to be a Beneficiary.', timePhase: 'execution' },
      { label: '8.2 Disclaimer', content: 'Beneficiary may revocably or irrevocably disclaim interest.', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-trust-11',
    label: '11. Exercise of Powers',
    description: 'Expedience for the benefit of Beneficiaries',
    type: 'obligation',
    riskLevel: 'none',
    timePhase: 'execution',
    content: '11.1 Expedience. 11.2 Management questions. 11.4 Majority vote.',
    satellites: [
      { label: '11.1 Expedience', content: 'Benefit of any one or more without considering others.', timePhase: 'execution' },
      { label: '11.2 Doubtful Matters', content: 'Power to determine all questions of management/administration.', timePhase: 'execution' },
      { label: '11.4 Majority Vote', content: 'Trustees shall act and make decisions by majority vote.', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-trust-13',
    label: '13. Appointment of Trustees',
    description: 'New or Additional Trustees',
    type: 'obligation',
    riskLevel: 'medium',
    timePhase: 'execution',
    content: '13.1 Number of Trustees (1-4). 13.2 PC power to appoint.',
    satellites: [
      { label: '13.1 Trustee Limits', content: 'Number shall not exceed four nor be less than one.', timePhase: 'effective' },
      { label: '13.2 PC Power', content: 'PC may appoint new Individual or Company as Trustee.', timePhase: 'execution' },
      { label: '13.4 Withdrawal', content: 'Trustee may withdraw by giving 1 month notice.', timePhase: 'execution' },
      { label: '13.5 Removal', content: 'PC has power by 1 month notice to remove any Trustee.', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-trust-17',
    label: '17. The Protective Committee',
    description: 'Membership and resignation',
    type: 'obligation',
    riskLevel: 'medium',
    timePhase: 'execution',
    content: '17.1 First member is Original Protector. Max 5 members.',
    satellites: [
      { label: '17.1 First Member', content: 'Original Protector is the first member.', timePhase: 'effective' },
      { label: '17.2 Acceptance', content: 'Appointment subject to written acceptance to Trustees.', timePhase: 'execution' },
      { label: '17.4 Max Members', content: 'There shall not be more than five (5) members.', timePhase: 'effective' },
      { label: '17.6 Resignation', content: 'PC Member may resign by written notice; effective after 30 days.', timePhase: 'execution' },
      { label: '17.7 Majority', content: 'PC shall act by a majority of at least three-fourth.', timePhase: 'execution' },
      { 
        label: '17.9 Removal (Risk)', 
        content: 'Ceases if no reply for more than 90 days.', 
        timePhase: 'execution',
        actions: [{
          id: 'trust-17.9-removal::revise',
          type: 'revise',
          status: 'pending',
          reason: '90-day silence for removal is too long for active management.',
          suggestionText: 'Revision: Reduce the non-reply period to 30 days after formal reminders.',
          confidence: 0.80
        }]
      }
    ]
  },
  {
    id: 'tpl-trust-21',
    label: '21. Proper Law and Forum',
    description: 'Proper Law and Forum for Administration',
    type: 'obligation',
    riskLevel: 'none',
    timePhase: 'effective',
    content: '21.1 Cayman Islands law. 21.3 Change of Law.',
    satellites: [
      { label: '21.1 Proper Law', content: 'Governed by and construed in accordance with Cayman Islands law.', timePhase: 'effective' },
      { label: '21.2 Global Admin', content: 'Power to carry on administration in any jurisdiction.', timePhase: 'execution' },
      { label: '21.3 Change of Law', content: 'Trustees may declare change of Proper Law with PC consent.', timePhase: 'execution' },
      { label: '21.5 Change of Forum', content: 'Trustees may declare change of forum with PC consent.', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-trust-22',
    label: '22. Power to Amend',
    description: 'PC Power to Amend the Deed',
    type: 'risk',
    riskLevel: 'high',
    timePhase: 'execution',
    content: 'PC power to amend, add, or delete any provisions.',
    satellites: [
      {
        id: 'sub-22.1',
        label: '22.1 Amendment Power',
        content: 'PC power to amend, add, or delete any or all provisions.',
        timePhase: 'execution',
        actions: [{
          id: 'trust-22.1-amend::revise',
          type: 'revise',
          status: 'pending',
          reason: 'Sole power to amend by PC without check is a high governance risk.',
          suggestionText: 'Revision: Amendments affecting beneficiary rights require Trustee consent.',
          confidence: 0.90
        }]
      },
      { label: '22.2 Beneficiary Power', content: 'If no PC, Beneficiaries have power to amend by deed.', timePhase: 'execution' }
    ]
  }
];

export const PATENT_TEMPLATES: TemplateItem[] = [
  {
    id: 'tpl-patent-1',
    label: '1. Definitions',
    description: 'Patents, Application Rights, and License Rights',
    type: 'obligation',
    riskLevel: 'none',
    timePhase: 'pre_sign',
    content: '1.1 Patents produced during the main contract. 1.2 Right to apply for patents. 1.3 Patent right (exclusive exploit). 1.4 Patent license right.',
    satellites: [
      { label: '1.1 Patents Scope', content: 'Patents only produced during the validation period of the main contract.', timePhase: 'effective' },
      { label: '1.2 Application Right', content: 'Right to submit application to national departments.', timePhase: 'effective' },
      { label: '1.3 Patent Right', content: 'Exclusive right (invention, utility model, design) granted by national department.', timePhase: 'effective' },
      { label: '1.4 License Right', content: 'Right to exploit technology/product in specified regions/period.', timePhase: 'effective' }
    ]
  },
  {
    id: 'tpl-patent-2',
    label: '2. Ownership Division',
    description: 'Ownership of application rights and patent rights',
    type: 'obligation',
    riskLevel: 'medium',
    timePhase: 'execution',
    content: 'Division of ownerships decided in accordance with ways agreed by both parties.',
    satellites: [
      {
        id: 'sub-2.1',
        label: '2.1 Owned by Party A',
        content: 'Conditions where Party A owns the rights.',
        timePhase: 'execution',
        details: [
          { label: '2.1(a) A Idea & Self-dev', content: 'Original idea from A and realized by self-development of A.', timePhase: 'execution' },
          { label: '2.1(b) Joint Idea & A Dev', content: 'Original idea from discussion; A completes tech development.', timePhase: 'execution' },
          { label: '2.1(c) B Idea & A Dev', content: 'Original idea from B, but A completes the tech development.', timePhase: 'execution' },
          { label: '2.1(d) B Suggestion & A Dev', content: 'B provided suggestions/drawings, but A completes development.', timePhase: 'execution' },
          { label: '2.1(e) B Inaction Fallback', content: 'B fails to apply within 2 months after reminder; A gains full right.', timePhase: 'execution' },
          { label: '2.1(f) B Breach Penalty', content: 'B applies in own name or assigns without authorization; A owns all.', timePhase: 'execution' },
          { label: '2.1(g) B Non-cooperation', content: 'B does not cooperate with A to finish application; A owns all.', timePhase: 'execution' }
        ]
      },
      {
        id: 'sub-2.2',
        label: '2.2 Owned by Party B',
        content: 'B provides tech/drawings and A has not participated in improvement.',
        timePhase: 'execution'
      },
      {
        id: 'sub-2.3',
        label: '2.3 Joint Ownership',
        content: 'Conditions where rights are jointly owned.',
        timePhase: 'execution',
        details: [
          { label: '2.3(a) B Draft & A Improvement', content: 'B provides draft; A modifies and completes technical carrier.', timePhase: 'execution' },
          { label: '2.3(b) B 3D & A Revision', content: 'B provides 3D drawing; A modifies and completes technical carrier.', timePhase: 'execution' },
          { label: '2.3(c) B Inaction Joint', content: 'B fails to apply within 2 months after reminder; becomes joint ownership.', timePhase: 'execution' }
        ]
      },
      {
        id: 'sub-2.4',
        label: '2.4 Acquisition via Fees',
        content: 'B can acquire rights by paying royalties or buyout fees.',
        timePhase: 'financial',
        details: [
          { label: 'One-time Royalties', content: 'B pays $23,000 to A in one-time payment.', timePhase: 'financial' },
          { label: 'Single Patent Buyout', content: 'Invention $2,100; Utility $2,220; Design $1,250.', timePhase: 'financial' },
          { label: 'Amortization', content: 'B pays $1,200 each unit to Party A.', timePhase: 'financial' },
          { label: 'Sales Target 1', content: '25,000 units sold within 2 years -> Pay $2,000.', timePhase: 'financial' },
          { label: 'Sales Target 2', content: '$4,000 total sales within 2 years -> Pay $4,000.', timePhase: 'financial' }
        ]
      },
      {
        id: 'sub-2.5',
        label: '2.5 Third Party Rights',
        content: 'Requirements for third party acquisition (joint approval).',
        timePhase: 'execution'
      }
    ]
  },
  {
    id: 'tpl-patent-3',
    label: '3. Patent License Right',
    description: 'Special provisions for exploitation after granting',
    type: 'obligation',
    riskLevel: 'low',
    timePhase: 'execution',
    content: '3.1 License after grant to Party A. 3.2 License after grant to Party B. 3.3 Third party non-free license.',
    satellites: [
      {
        id: 'sub-3.1',
        label: '3.1 License from A',
        content: 'B\'s exploitation rights after A is granted the patent.',
        timePhase: 'execution',
        details: [
          { label: '3.1-1 Priority Use', content: 'B continues use within original scope if already making/using.', timePhase: 'execution' },
          { label: '3.1-2 Free Exploitation', content: 'Party B can exploit patent for free.', timePhase: 'execution' },
          { label: '3.1-3 Non-free License', content: 'B pays licensing fees (Invention $25k, Utility $7k, Design $2k).', timePhase: 'financial' }
        ]
      },
      {
        id: 'sub-3.2',
        label: '3.2 License from B',
        content: 'A\'s exploitation rights after B is granted the patent.',
        timePhase: 'execution',
        details: [
          { label: '3.2-1 Priority Use', content: 'Party A has priority right of exploitation.', timePhase: 'execution' },
          { label: '3.2-2 Free Exploitation', content: 'Party A has free right of exploitation.', timePhase: 'execution' },
          { label: '3.2-3 Non-free License', content: 'A pays licensing fees (Invention $5k, Utility $125k, Design $4k).', timePhase: 'financial' }
        ]
      },
      {
        id: 'sub-3.3',
        label: '3.3 Third Party License',
        content: 'Conditions for third party to obtain non-free license (joint approval).',
        timePhase: 'execution'
      }
    ]
  },
  {
    id: 'tpl-patent-4',
    label: '4. Responsibility',
    description: 'Compensation and termination for agreement violation',
    type: 'risk',
    riskLevel: 'high',
    timePhase: 'execution',
    content: '4.1 $500,000 reimbursement for breach. 4.2 Loss from infringement/invalidity. 4.3 Termination rights.',
    satellites: [
      { label: '4.1 Penalty Fee', content: 'Breaching party reimburses $500,000 plus direct/indirect losses.', timePhase: 'financial' },
      { label: '4.2 Infringement Loss', content: 'Patentee bears loss if patent is infringed or identified as invalid.', timePhase: 'post_termination' },
      { label: '4.3 Termination Right', content: 'Right to terminate this agreement and main contract immediately.', timePhase: 'execution' }
    ]
  },
  {
    id: 'tpl-patent-5',
    label: '5. Other Provisions',
    description: 'Validation period, disputes, and versions',
    type: 'obligation',
    riskLevel: 'none',
    timePhase: 'post_termination',
    content: '5.1 Same validation as main contract. 5.2 Supplementary agreements and court of jurisdiction. 5.3 Duplicate versions (Chinese/English).',
    satellites: [
      { label: '5.1 Validation', content: 'Survival of patent protection obligation after termination.', timePhase: 'post_termination' },
      { label: '5.2 Dispute Resolution', content: 'Submitted to the people\'s court and governed by PRC laws.', timePhase: 'post_termination' },
      { label: '5.3 Language Priority', content: 'Chinese version prevails in case of conflict.', timePhase: 'effective' }
    ]
  }
];

export const NODE_LIBRARY: TemplateItem[] = LEASE_TEMPLATES;
