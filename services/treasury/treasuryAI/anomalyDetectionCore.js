const evaluateEarlyWarnings = (metrics, baselines) => {
  const warnings = [];

  if (metrics.payoutVelocity && metrics.revenueInflowRate) {
    if (metrics.payoutVelocity > metrics.revenueInflowRate * 1.15) {
      warnings.push('Payout growth is exceeding revenue inflow.');
    }
  }

  if (metrics.liquidityRatio && baselines.liquidityRatio) {
    if (metrics.liquidityRatio < baselines.liquidityRatio * 0.85) {
      warnings.push('Liquidity ratio has dropped below baseline.');
    }
  }

  if (metrics.withdrawalClusterScore && metrics.withdrawalClusterScore > 0.7) {
    warnings.push('Abnormal withdrawal clustering detected.');
  }

  if (metrics.vipPayoutExposure && baselines.vipPayoutExposure) {
    if (metrics.vipPayoutExposure > baselines.vipPayoutExposure * 1.3) {
      warnings.push('VIP liabilities are exceeding safe thresholds.');
    }
  }

  return warnings;
};

const detectAnomalies = (metrics, baselines, patterns = {}) => {
  const anomalies = [];

  if (baselines.payoutVelocity && metrics.payoutVelocity > baselines.payoutVelocity * 1.4) {
    anomalies.push({ factor: 'payoutVelocity', severity: 0.7, detail: 'Withdrawal velocity spike.' });
  }

  if (baselines.revenueInflowRate && metrics.revenueInflowRate < baselines.revenueInflowRate * 0.75) {
    anomalies.push({ factor: 'revenueInflowRate', severity: 0.6, detail: 'Revenue inflow declined.' });
  }

  if (baselines.liquidityRatio && metrics.liquidityRatio < baselines.liquidityRatio * 0.8) {
    anomalies.push({ factor: 'liquidityRatio', severity: 0.8, detail: 'Liquidity ratio compression.' });
  }

  if (metrics.fraudRiskScore && metrics.fraudRiskScore > 0.7) {
    anomalies.push({ factor: 'fraudRiskScore', severity: 0.5, detail: 'Elevated fraud risk score.' });
  }

  if (metrics.partnerRevenueVolatility && metrics.partnerRevenueVolatility > 0.6) {
    anomalies.push({ factor: 'partnerRevenueVolatility', severity: 0.4, detail: 'Partner revenue volatility rising.' });
  }

  if (patterns.liquidityTrend && patterns.liquidityTrend < -10) {
    anomalies.push({ factor: 'liquidityTrend', severity: 0.5, detail: 'Liquidity is trending downward.' });
  }

  return anomalies;
};

const scoreAnomalies = (anomalies, warnings) => {
  const anomalyScore = anomalies.reduce((sum, anomaly) => sum + anomaly.severity, 0);
  const warningScore = warnings.length * 0.15;
  return Math.min(anomalyScore + warningScore, 1);
};

module.exports = {
  evaluateEarlyWarnings,
  detectAnomalies,
  scoreAnomalies,
};
