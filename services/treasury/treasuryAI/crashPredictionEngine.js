const {
  createLearningState,
  recordSnapshot,
  learnPatterns,
} = require('./liquidityLearningModel');
const {
  evaluateEarlyWarnings,
  detectAnomalies,
  scoreAnomalies,
} = require('./anomalyDetectionCore');

const HARD_RULES = [
  'Never allow unchecked payout growth.',
  'Always maintain predictive liquidity buffer.',
  'Always prioritize survival over expansion.',
  'Never scale fundraising without stable unit economics.',
];

const mapRiskLevel = (score) => {
  if (score >= 0.75) return 'critical';
  if (score >= 0.55) return 'high';
  if (score >= 0.35) return 'medium';
  return 'low';
};

const estimateTimeToRisk = (metrics, riskLevel) => {
  if (riskLevel === 'low') return '30+ days';
  if (riskLevel === 'medium') return metrics.liquidityRatio ? '14-21 days' : '21-30 days';
  if (riskLevel === 'high') return '7-14 days';
  return '0-7 days';
};

const buildRecommendedActions = (riskLevel, warnings) => {
  const actions = [
    'Reduce payout speed during peak outflows.',
    'Activate batching mode for withdrawals.',
    'Tighten VIP reward exposure and eligibility.',
    'Increase verification strictness for high-risk withdrawals.',
    'Reroute transactions through lower-cost providers.',
  ];

  if (riskLevel === 'low') {
    return ['Monitor liquidity buffers and keep payout routing optimized.'];
  }

  if (riskLevel === 'medium') {
    return ['Increase liquidity buffer allocation.', ...actions.slice(0, 3)];
  }

  if (riskLevel === 'high') {
    return ['Freeze non-essential growth spend.', ...actions];
  }

  return ['Pause aggressive payouts and enforce survival mode.', ...actions];
};

const evaluateHardRules = (metrics, baselines) => {
  const breaches = [];

  if (metrics.payoutVelocity && metrics.revenueInflowRate) {
    if (metrics.payoutVelocity > metrics.revenueInflowRate * 1.2) {
      breaches.push('Unchecked payout growth');
    }
  }

  if (metrics.liquidityRatio && metrics.liquidityRatio < 1) {
    breaches.push('Liquidity buffer below safe threshold');
  }

  if (metrics.unitEconomicsStable === false) {
    breaches.push('Unit economics are unstable');
  }

  if (baselines.revenueInflowRate && metrics.revenueInflowRate < baselines.revenueInflowRate * 0.7) {
    breaches.push('Revenue inflow declining fast');
  }

  return breaches;
};

const predictTreasuryCrash = (metrics, history = []) => {
  const learningState = createLearningState(history);
  const updatedState = recordSnapshot(learningState, metrics);
  const baselines = updatedState.baselines;
  const patterns = learnPatterns(updatedState);

  const warnings = evaluateEarlyWarnings(metrics, baselines);
  const anomalies = detectAnomalies(metrics, baselines, patterns);
  const riskScore = scoreAnomalies(anomalies, warnings);

  const riskLevel = mapRiskLevel(riskScore);
  const timeToRiskEvent = estimateTimeToRisk(metrics, riskLevel);
  const contributingFactors = [
    ...warnings,
    ...anomalies.map((anomaly) => anomaly.detail),
  ];

  return {
    riskLevel,
    timeToRiskEvent,
    contributingFactors,
    recommendedActions: buildRecommendedActions(riskLevel, warnings),
    hardRuleBreaches: evaluateHardRules(metrics, baselines),
  };
};

const buildAdminInsights = ({ metrics, history = [], fundraisingPipeline = [], investorReadiness = {} }) => {
  const prediction = predictTreasuryCrash(metrics, history);
  const pipelineValue = fundraisingPipeline.reduce((sum, deal) => sum + (deal.expectedInvestment || 0), 0);
  const averageCloseProbability = fundraisingPipeline.length
    ? fundraisingPipeline.reduce((sum, deal) => sum + (deal.probability || 0), 0) / fundraisingPipeline.length
    : 0;

  const revenueStabilityIndex = metrics.partnerRevenueVolatility
    ? Math.max(0, 1 - metrics.partnerRevenueVolatility)
    : 0.6;

  const ltvGrowthRate = metrics.ltvGrowthRate || 0;
  const sustainabilityScore = Math.round((
    (metrics.liquidityRatio || 1) * 25 +
    revenueStabilityIndex * 35 +
    (prediction.riskLevel === 'low' ? 40 : prediction.riskLevel === 'medium' ? 25 : 10)
  ));

  return {
    investorReadinessScore: investorReadiness.score || null,
    fundraisingPipelineStatus: {
      totalPipelineValue: pipelineValue,
      weightedCloseProbability: Number(averageCloseProbability.toFixed(2)),
      activeDeals: fundraisingPipeline.length,
    },
    liquidityCrashProbability: prediction.riskLevel,
    revenueStabilityIndex: Number(revenueStabilityIndex.toFixed(2)),
    ltvGrowthRate,
    systemSustainabilityScore: Math.min(sustainabilityScore, 100),
    hardFinancialRules: HARD_RULES,
  };
};

const integrateFinancialSignals = ({ metrics, history = [], fundraisingPipeline = [], investorReadiness = {} }) => ({
  prediction: predictTreasuryCrash(metrics, history),
  adminInsights: buildAdminInsights({ metrics, history, fundraisingPipeline, investorReadiness }),
});

module.exports = {
  HARD_RULES,
  predictTreasuryCrash,
  buildAdminInsights,
  integrateFinancialSignals,
};
