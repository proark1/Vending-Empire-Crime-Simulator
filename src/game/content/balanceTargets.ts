export interface MilestoneBalanceTarget {
  evidence: string;
  id: string;
  targetWindow: string;
  title: string;
  tuningRisk: string;
}

export const milestoneBalanceTargets: MilestoneBalanceTarget[] = [
  {
    id: "starter_repaired",
    title: "Starter machine repaired",
    targetWindow: "2-4 min",
    evidence: "Rusty Starter is repaired and ready to place.",
    tuningRisk: "If this drags, the opening feels like admin instead of a route."
  },
  {
    id: "first_contract_paid",
    title: "First contract paid",
    targetWindow: "5-8 min",
    evidence: "Foam & Fold soda promise completes from stocked product.",
    tuningRisk: "If this pays too late, the economy reads as broken."
  },
  {
    id: "starter_control",
    title: "Starter district controlled",
    targetWindow: "15-25 min",
    evidence: "Three starter machines are stocked or holding revenue.",
    tuningRisk: "Too fast skips territory pressure; too slow hides expansion."
  },
  {
    id: "first_rival_response",
    title: "First rival response",
    targetWindow: "12-22 min",
    evidence: "Rival pressure creates an alarm, operation, undercut, or route task.",
    tuningRisk: "If rivals wait too long, the crime layer feels cosmetic."
  },
  {
    id: "iron_yard_open",
    title: "Iron Yard opened",
    targetWindow: "25-40 min",
    evidence: "Iron Yard is scouted, requirements are met, and setup is paid.",
    tuningRisk: "This is the first proof that machines are territory."
  },
  {
    id: "first_employee_value",
    title: "First crew value",
    targetWindow: "30-45 min",
    evidence: "A hired employee completes restock, collection, repair, scout, guard, or management work.",
    tuningRisk: "Automation should reduce chores while preserving route risk."
  },
  {
    id: "inspection_resolved",
    title: "First inspection resolved",
    targetWindow: "35-55 min",
    evidence: "The player resolves an inspection through permit, fine, or bribe.",
    tuningRisk: "Law pressure must feel consequential without becoming random punishment."
  },
  {
    id: "ending_direction",
    title: "Ending direction visible",
    targetWindow: "60-90 min",
    evidence: "Endgame scoring clearly points toward one path.",
    tuningRisk: "The late game needs a readable ambition before final execution."
  }
];
