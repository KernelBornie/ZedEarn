const OUTREACH_STEPS = [
  {
    stage: 'Awareness',
    objective: 'Introduce ZedEarn and the Zambia fintech opportunity.',
  },
  {
    stage: 'Value Pitch',
    objective: 'Explain the earnings ecosystem and revenue model.',
  },
  {
    stage: 'Data Proof',
    objective: 'Share traction metrics, payout reliability, and unit economics.',
  },
  {
    stage: 'Pilot Proposal',
    objective: 'Offer a scoped partnership or co-branded pilot.',
  },
  {
    stage: 'Revenue Share Negotiation',
    objective: 'Align on commercial terms and operational KPIs.',
  },
  {
    stage: 'Deal Closing',
    objective: 'Finalize commitments, timelines, and governance.',
  },
];

const buildOutreachSequence = ({ investorType, metrics = {} }) => {
  const tractionLine = metrics.activeUsers
    ? `We currently serve ${new Intl.NumberFormat('en-ZM').format(metrics.activeUsers)} active earners with consistent payout cycles.`
    : 'We have strong early traction with repeat earning behavior and reliable payouts.';

  return OUTREACH_STEPS.map((step) => {
    let message = `${step.objective} ${tractionLine}`;

    if (investorType === 'telcos' && step.stage === 'Value Pitch') {
      message += ' We can drive incremental MoMo volume, data usage, and churn reduction through co-branded earning journeys.';
    }

    if (investorType === 'banks' && step.stage === 'Value Pitch') {
      message += ' ZedEarn strengthens settlement predictability and float visibility with disciplined routing.';
    }

    if (investorType === 'localVentureCapital' && step.stage === 'Value Pitch') {
      message += ' The business scales with transaction volume and has diversified revenue sources.';
    }

    return {
      stage: step.stage,
      message,
    };
  });
};

module.exports = {
  OUTREACH_STEPS,
  buildOutreachSequence,
};
