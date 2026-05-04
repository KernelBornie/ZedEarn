const METRIC_KEYS = [
  'payoutVelocity',
  'revenueInflowRate',
  'liquidityRatio',
  'userGrowthRate',
  'vipPayoutExposure',
  'fraudRiskScore',
  'partnerRevenueVolatility',
];

const computeBaselines = (history) => {
  if (!history.length) {
    return METRIC_KEYS.reduce((acc, key) => ({ ...acc, [key]: null }), {});
  }

  const totals = history.reduce((acc, snapshot) => {
    METRIC_KEYS.forEach((key) => {
      acc[key] += snapshot[key] || 0;
    });
    return acc;
  }, METRIC_KEYS.reduce((acc, key) => ({ ...acc, [key]: 0 }), {}));

  return METRIC_KEYS.reduce((acc, key) => {
    acc[key] = totals[key] / history.length;
    return acc;
  }, {});
};

const detectTrend = (history, key) => {
  if (history.length < 2) return 0;
  const recent = history.slice(-5);
  const first = recent[0][key] || 0;
  const last = recent[recent.length - 1][key] || 0;
  if (first === 0) return 0;
  return ((last - first) / first) * 100;
};

const createLearningState = (history = []) => ({
  history: [...history],
  baselines: computeBaselines(history),
});

const recordSnapshot = (state, snapshot) => {
  const updatedHistory = [...state.history, snapshot];
  return {
    history: updatedHistory,
    baselines: computeBaselines(updatedHistory),
  };
};

const learnPatterns = (state) => ({
  payoutVelocityTrend: detectTrend(state.history, 'payoutVelocity'),
  revenueInflowTrend: detectTrend(state.history, 'revenueInflowRate'),
  liquidityTrend: detectTrend(state.history, 'liquidityRatio'),
  fraudRiskTrend: detectTrend(state.history, 'fraudRiskScore'),
  vipExposureTrend: detectTrend(state.history, 'vipPayoutExposure'),
});

module.exports = {
  METRIC_KEYS,
  computeBaselines,
  createLearningState,
  recordSnapshot,
  learnPatterns,
};
