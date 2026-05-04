const CLOSE_STRATEGY = {
  telcos: {
    emphasis: ['User acquisition lift', 'Transaction volume growth', 'Co-branded distribution'],
    nextActions: ['Draft MoU for co-marketing', 'Define payout routing KPIs', 'Pilot launch timeline'],
  },
  banks: {
    emphasis: ['Liquidity discipline', 'Settlement volume', 'Fee reduction'],
    nextActions: ['Treasury risk review', 'Settlement API alignment', 'Liquidity buffer agreement'],
  },
  localVentureCapital: {
    emphasis: ['Growth velocity', 'Scalability', 'LTV expansion'],
    nextActions: ['Data room access', 'Unit economics validation', 'Follow-on capital roadmap'],
  },
  corporatePartners: {
    emphasis: ['Revenue synergy', 'Cross-platform engagement', 'Operational integration'],
    nextActions: ['Joint revenue modeling', 'Operational pilot scope', 'Commercial terms alignment'],
  },
};

const createDealTracker = ({ investorName, investorType }) => ({
  investorName,
  investorType,
  stage: 'Awareness',
  probability: 0.2,
  expectedInvestment: null,
  revenueSynergyValue: null,
  lastUpdated: new Date().toISOString(),
});

const updateDealStage = (deal, stage, updates = {}) => ({
  ...deal,
  stage,
  probability: updates.probability ?? deal.probability,
  expectedInvestment: updates.expectedInvestment ?? deal.expectedInvestment,
  revenueSynergyValue: updates.revenueSynergyValue ?? deal.revenueSynergyValue,
  lastUpdated: new Date().toISOString(),
});

const closeInvestorDeal = (investorType, context = {}) => {
  const strategy = CLOSE_STRATEGY[investorType] || CLOSE_STRATEGY.localVentureCapital;
  const emphasis = strategy.emphasis;
  const closingPlan = strategy.nextActions;

  return {
    investorType,
    emphasis,
    closingPlan,
    proposedTerms: context.proposedTerms || 'Align on revenue share, pilot KPIs, and governance checkpoints.',
    successCriteria: context.successCriteria || 'Confirmed commitment with defined commercial and operational milestones.',
  };
};

const estimateRevenueSynergy = ({ transactionVolume, partnerMargin }) => {
  if (!transactionVolume || !partnerMargin) return null;
  return Math.round(transactionVolume * partnerMargin);
};

module.exports = {
  CLOSE_STRATEGY,
  createDealTracker,
  updateDealStage,
  closeInvestorDeal,
  estimateRevenueSynergy,
};
