const INVESTOR_TARGET_MAP = {
  telcos: {
    focus: 'Distribution, payments, and user acquisition scale.',
    targets: [
      { name: 'Airtel Zambia', value: 'Mobile money distribution and co-marketing.' },
      { name: 'MTN Zambia', value: 'Transaction volume growth and data-driven rewards.' },
    ],
    partnershipAngle: 'Co-branded earning journeys that drive MoMo volume and retention.',
  },
  banks: {
    focus: 'Settlement, liquidity management, and fintech integration.',
    targets: [
      { name: 'Zanaco', value: 'Settlement rails and liquidity partnership.' },
      { name: 'Stanbic Bank Zambia', value: 'Treasury line and enterprise settlement.' },
      { name: 'First Capital Bank Zambia', value: 'Liquidity support for payout stabilization.' },
    ],
    partnershipAngle: 'Lower-cost settlement, faster payout cycles, and transparent float management.',
  },
  localVentureCapital: {
    focus: 'Early-stage capital with local market insight.',
    targets: [
      { name: 'Zambian fintech investors', value: 'Seed capital and governance alignment.' },
      { name: 'SADC angel investors', value: 'Regional expansion support and follow-on capital.' },
    ],
    partnershipAngle: 'Scalable fintech infrastructure with disciplined unit economics.',
  },
  corporatePartners: {
    focus: 'Revenue partnerships and alternative distribution channels.',
    targets: [
      { name: 'Betting companies', value: 'Reward-based engagement and payout routing.' },
      { name: 'E-commerce platforms', value: 'Purchase-driven earning and cashback flows.' },
      { name: 'Fintech startups', value: 'Cross-platform wallet growth and mutual revenue.' },
    ],
    partnershipAngle: 'Shared customer journeys that monetize engagement and loyalty.',
  },
};

const getInvestorTargetMap = () => ({
  ...INVESTOR_TARGET_MAP,
});

const scoreInvestorFit = (investorType, metrics = {}) => {
  const scale = metrics.activeUsers ? Math.min(metrics.activeUsers / 100000, 1) : 0.4;
  const revenueMomentum = metrics.revenueGrowthRate ? Math.min(metrics.revenueGrowthRate / 30, 1) : 0.3;
  const liquidityStrength = metrics.liquidityRatio ? Math.min(metrics.liquidityRatio / 1.2, 1) : 0.4;

  const weight = investorType === 'telcos'
    ? (scale * 0.5 + revenueMomentum * 0.3 + liquidityStrength * 0.2)
    : investorType === 'banks'
      ? (liquidityStrength * 0.5 + revenueMomentum * 0.3 + scale * 0.2)
      : investorType === 'localVentureCapital'
        ? (revenueMomentum * 0.5 + scale * 0.3 + liquidityStrength * 0.2)
        : (scale * 0.4 + revenueMomentum * 0.4 + liquidityStrength * 0.2);

  return Math.round(weight * 100);
};

module.exports = {
  INVESTOR_TARGET_MAP,
  getInvestorTargetMap,
  scoreInvestorFit,
};
