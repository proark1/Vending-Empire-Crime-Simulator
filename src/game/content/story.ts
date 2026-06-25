export interface StoryMissionArc {
  id: string;
  title: string;
  districtId: string;
  beats: string[];
  reward: string;
}

export interface EndgamePath {
  id: string;
  title: string;
  condition: string;
  consequence: string;
}

export interface NpcRoleDefinition {
  id: string;
  title: string;
  function: string;
}

export const npcRoles: NpcRoleDefinition[] = [
  { id: "supplier", title: "Supplier", function: "Posts stock deals, shortages, and risky bulk offers." },
  { id: "fixer", title: "Fixer", function: "Finds grey placements, bribe routes, and quiet cleanup options." },
  { id: "landlord", title: "Landlord", function: "Controls rent, placement rights, and contract friction." },
  { id: "rival_boss", title: "Rival Boss", function: "Escalates faction tactics when territory shifts." },
  { id: "mechanic", title: "Mechanic", function: "Unlocks machine models, repairs, and garage upgrades." },
  { id: "driver", title: "Driver", function: "Runs vehicle jobs and escape routes when conflict hits." },
  { id: "guard_contact", title: "Security Contact", function: "Handles base watch, machine defense, and retaliation warnings." },
  { id: "inspector", title: "Inspector", function: "Turns heat into inspections, fines, and stock seizures." },
  { id: "lawyer", title: "Corporate Lawyer", function: "Applies legal pressure and contract lockouts." },
  { id: "informant", title: "Street Informant", function: "Reveals ambush zones, rival scouts, and high-demand events." }
];

export const storyMissionArcs: StoryMissionArc[] = [
  {
    id: "starter_takeover",
    title: "Cinderblock Row Takeover",
    districtId: "starter_suburb",
    beats: ["Repair Rusty Starter", "Place Foam & Fold", "Stock first route", "Answer Redline undercut", "Control three machines"],
    reward: "Iron Yard scouting and expansion cash"
  },
  {
    id: "yard_leverage",
    title: "Iron Yard Leverage",
    districtId: "industrial_yards",
    beats: ["Open Freight Depot", "Serve worker rush", "Survive route ambush", "Hire first guard or runner", "Claim the dock route"],
    reward: "Bulk supplier pricing and armored machine access"
  },
  {
    id: "downtown_contracts",
    title: "Downtown Paper Trail",
    districtId: "downtown_loop",
    beats: ["Win a legal placement", "Beat corporate undercuts", "Handle an inspection chain", "Negotiate an office tower route"],
    reward: "Luxury vendors and cleaner public reputation"
  },
  {
    id: "neon_afterhours",
    title: "Neon Afterhours",
    districtId: "neon_quarter",
    beats: ["Unlock grey supplier stock", "Protect midnight machines", "Choose legal or hidden product mix", "Break a black-market vendor route"],
    reward: "Discreet machine models and high-risk fictional products"
  },
  {
    id: "old_town_war",
    title: "Old Town War",
    districtId: "old_town",
    beats: ["Find the former partner", "Defend the garage", "Flip rival locations", "Force an ending branch"],
    reward: "Citywide control decision"
  }
];

export const endgamePaths: EndgamePath[] = [
  {
    id: "legit_empire",
    title: "Legit Empire",
    condition: "High public reputation, low heat, legal placements dominate.",
    consequence: "Vendetta Vending becomes a real citywide corporation."
  },
  {
    id: "syndicate",
    title: "Syndicate",
    condition: "High street reputation, controlled districts, repeated grey-market wins.",
    consequence: "The city treats every vending machine like a territorial flag."
  },
  {
    id: "collapse",
    title: "Collapse",
    condition: "Heat, missed defenses, and unpaid crew spiral together.",
    consequence: "Raids, betrayal, and rival pressure tear the route apart."
  },
  {
    id: "kingmaker",
    title: "Kingmaker",
    condition: "Ally with one faction while weakening the rest.",
    consequence: "The player controls the city indirectly through vending proxies."
  },
  {
    id: "exit_plan",
    title: "Exit Plan",
    condition: "Build high valuation, stabilize heat, and cash out before the final war.",
    consequence: "The empire sells, the machines stay, and the player vanishes."
  }
];
