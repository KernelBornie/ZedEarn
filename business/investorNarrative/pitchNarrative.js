const { buildNarrative } = require('./storyBuilder');
const {
  investorPositioning,
  buildInvestmentAsk,
  buildInvestorReadinessSnapshot,
} = require('./zambiaInvestorPositioning');

const narrativeCore = {
  openingStory: `Zambia’s youth face persistent unemployment and a shrinking formal job market. Digital income exists, but it is fragmented across low-trust platforms, short-term gigs, and ad-hoc payments. At the same time, mobile money adoption has become the country’s most reliable financial rail, with Airtel Money and MTN MoMo powering daily transactions for millions. The gap is clear: there is no trusted, structured system that converts digital activity into consistent earnings, while keeping payouts reliable and compliant.`,
  solutionStory: `ZedEarn is a structured digital earning and payments ecosystem that connects user activity directly to real revenue streams through partnerships, advertising, and fintech integrations. Users earn through verified tasks, partner engagements, and premium VIP opportunities while receiving payouts through familiar mobile money channels. ZedEarn routes each transaction through the most efficient providers, creates predictable payout cycles, and builds user trust with transparent earnings histories and reliable settlement.`,
  whyNow: `Zambia is at the exact inflection point to scale this model. Mobile money penetration is accelerating, smartphone access is growing in both urban and peri-urban areas, and the informal digital economy is expanding faster than traditional employment. The market is actively seeking alternative income streams, and regulators increasingly support fintech solutions that create traceable, compliant income channels.`,
  revenueStory: `ZedEarn’s revenue is designed to be simple and defensible for investors. Partner commissions convert user activity into direct revenue. Advertising monetization funds core earning opportunities. VIP subscriptions unlock premium earning lanes and predictable monthly income. Transaction routing margins compound with volume as ZedEarn optimizes payouts across payment providers. This mix creates diversified income with clear scalability as transaction volume grows.`,
  defensibility: `${investorPositioning.marketPosition} ${investorPositioning.valueProposition} Defensibility is reinforced through a proprietary routing engine, a treasury AI that protects liquidity, compounding partner network effects, and user lock-in driven by earnings history and VIP access.`,
  investmentAsk: buildInvestmentAsk(),
};

const buildPitchNarrative = (metrics = {}) => buildNarrative(narrativeCore, metrics);

const buildNarrativePackage = (metrics = {}) => ({
  narrative: buildPitchNarrative(metrics),
  readiness: buildInvestorReadinessSnapshot(metrics),
  positioning: investorPositioning,
});

module.exports = {
  narrativeCore,
  buildPitchNarrative,
  buildNarrativePackage,
};
