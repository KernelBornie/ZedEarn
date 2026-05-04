const DEFAULT_METRICS = {
  activeUsers: null,
  monthlyRevenue: null,
  monthlyPayouts: null,
  transactionVolume: null,
  partnerCount: null,
  retentionRate: null,
  ltvGrowthRate: null,
  revenueGrowthRate: null,
  liquidityRatio: null,
};

const formatNumber = (value) => {
  if (value === null || value === undefined) return 'N/A';
  return new Intl.NumberFormat('en-ZM').format(value);
};

const formatPercent = (value) => {
  if (value === null || value === undefined) return 'N/A';
  return `${Number(value).toFixed(1)}%`;
};

const formatMetricsSnapshot = (metrics) => {
  const snapshot = {
    ...DEFAULT_METRICS,
    ...metrics,
  };

  return [
    `Active users: ${formatNumber(snapshot.activeUsers)}`,
    `Monthly revenue: ZMW ${formatNumber(snapshot.monthlyRevenue)}`,
    `Monthly payouts: ZMW ${formatNumber(snapshot.monthlyPayouts)}`,
    `Transaction volume: ZMW ${formatNumber(snapshot.transactionVolume)}`,
    `Partner count: ${formatNumber(snapshot.partnerCount)}`,
    `Retention rate: ${formatPercent(snapshot.retentionRate)}`,
    `LTV growth rate: ${formatPercent(snapshot.ltvGrowthRate)}`,
    `Revenue growth rate: ${formatPercent(snapshot.revenueGrowthRate)}`,
    `Liquidity ratio: ${formatNumber(snapshot.liquidityRatio)}`,
  ].join('\n');
};

const buildNarrativeSections = (sections, metrics = {}) => {
  const metricsSnapshot = formatMetricsSnapshot(metrics);

  return [
    {
      title: 'Opening Story: The Problem in Zambia',
      body: sections.openingStory,
    },
    {
      title: 'ZedEarn Solution Story',
      body: sections.solutionStory,
    },
    {
      title: 'Why Now: Timing in Zambia',
      body: sections.whyNow,
    },
    {
      title: 'Revenue Story',
      body: sections.revenueStory,
    },
    {
      title: 'Defensibility',
      body: sections.defensibility,
    },
    {
      title: 'Traction & Financial Signals',
      body: metricsSnapshot,
    },
    {
      title: 'Investment Ask',
      body: sections.investmentAsk,
    },
  ];
};

const buildNarrative = (sections, metrics = {}) => {
  const narrativeSections = buildNarrativeSections(sections, metrics);

  return narrativeSections
    .map((section) => `## ${section.title}\n${section.body}`)
    .join('\n\n');
};

module.exports = {
  buildNarrative,
  buildNarrativeSections,
  formatMetricsSnapshot,
};
