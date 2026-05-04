const FUNDING_STAGES = [
  {
    stage: 'Seed',
    focus: 'Product hardening, regulatory alignment, pilot expansion in Lusaka and Copperbelt.',
    capitalUse: 'Compliance, onboarding, and partner integrations.',
    outcome: 'Validate unit economics and prove repeatable revenue per active user.',
  },
  {
    stage: 'Growth',
    focus: 'Scale acquisition, deepen mobile money rails, expand VIP and partner revenue.',
    capitalUse: 'Distribution partnerships, data infrastructure, treasury buffer growth.',
    outcome: 'Sustain margin-positive growth across Zambia and key SADC corridors.',
  },
  {
    stage: 'Scale',
    focus: 'Regional expansion, enterprise deals, and treasury automation at scale.',
    capitalUse: 'Cross-border settlement, risk automation, and corporate channel expansion.',
    outcome: 'Dominant digital earnings ecosystem with diversified revenue streams.',
  },
];

const CAPITAL_USE_BREAKDOWN = {
  productAndRisk: '30% - routing, treasury AI, fraud controls, and payout optimization.',
  growthAndDistribution: '30% - telco, bank, and corporate distribution partnerships.',
  liquidityBuffer: '20% - predictive liquidity reserves and settlement coverage.',
  operationsAndCompliance: '20% - compliance, support, and operational resilience.',
};

const investorPositioning = {
  marketPosition: 'ZedEarn sits at the intersection of digital income, payments, and trust—turning fragmented earning activity into a single, monetizable financial stream.',
  valueProposition: 'ZedEarn converts everyday user activity into consistent revenue streams via partner commissions, ad monetization, VIP upgrades, and transaction routing margins.',
  defensibility: [
    'Proprietary routing engine that optimizes payout cost and speed.',
    'Treasury AI that predicts and prevents liquidity stress before it surfaces.',
    'Partner network effects across telcos, banks, and merchants.',
    'User lock-in through earnings history, VIP tiers, and trust-based payouts.',
  ],
  timingSignals: [
    'Zambia’s mobile money infrastructure is now deeply embedded in daily life.',
    'Smartphone adoption is accelerating in youth and peri-urban markets.',
    'Informal digital income channels are rising without a trusted aggregator.',
    'Economic pressure is driving demand for alternative income paths.',
  ],
};

const buildInvestmentAsk = () => {
  const stages = FUNDING_STAGES.map((stage) => {
    return `${stage.stage}: ${stage.focus} Capital use: ${stage.capitalUse} Outcome: ${stage.outcome}`;
  }).join(' ');

  const capitalUse = Object.values(CAPITAL_USE_BREAKDOWN).join(' ');

  return `ZedEarn is raising capital across three stages to move from proof to scale. ${stages} The capital will be deployed with discipline to protect liquidity and build predictable revenue. Capital allocation will follow: ${capitalUse} ROI is driven by margin-positive routing, rising VIP conversions, and compounding partner revenue, targeting a multi-year payback window with strong upside once transaction volume scales.`;
};

const buildInvestorReadinessSnapshot = (metrics = {}) => {
  const readinessInputs = [
    metrics.activeUsers,
    metrics.monthlyRevenue,
    metrics.partnerCount,
    metrics.revenueGrowthRate,
    metrics.liquidityRatio,
  ].filter((value) => value !== null && value !== undefined);

  const completeness = readinessInputs.length / 5;
  const momentum = metrics.revenueGrowthRate ? Math.min(metrics.revenueGrowthRate / 40, 1) : 0.3;
  const liquidityDiscipline = metrics.liquidityRatio ? Math.min(metrics.liquidityRatio / 1.5, 1) : 0.4;

  const score = Math.round((completeness * 0.4 + momentum * 0.3 + liquidityDiscipline * 0.3) * 100);

  return {
    score,
    summary: score >= 75
      ? 'Investor readiness is strong with clear traction and disciplined liquidity.'
      : score >= 55
        ? 'Investor readiness is moderate; strengthen metrics and liquidity buffers.'
        : 'Investor readiness is early-stage; focus on traction proof and stability.',
  };
};

module.exports = {
  investorPositioning,
  FUNDING_STAGES,
  CAPITAL_USE_BREAKDOWN,
  buildInvestmentAsk,
  buildInvestorReadinessSnapshot,
};
