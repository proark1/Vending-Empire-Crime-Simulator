export interface DesignPillar {
  id: string;
  title: string;
  promise: string;
  designChecks: string[];
}

export interface StoryMissionArc {
  id: string;
  title: string;
  districtId: string;
  beats: string[];
  missionChain: StoryMissionObjective[];
  reward: string;
}

export type StoryMissionRequirement =
  | "starter_mission_complete"
  | "district_scouted"
  | "district_unlocked"
  | "district_machine"
  | "hire_guard_or_runner"
  | "legal_placement"
  | "inspection_resolved"
  | "grey_stock_sourced"
  | "custom_product"
  | "rival_operation_disrupted"
  | "old_town_machine";

export interface StoryMissionObjective {
  id: string;
  title: string;
  description: string;
  requirement: StoryMissionRequirement;
  rewardMoney: number;
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

export const gameDesignPillars: DesignPillar[] = [
  {
    id: "vending_logistics",
    title: "Vending logistics",
    promise: "Money comes from real route work: stock, placement, repairs, cash collection, vehicles, and crew coverage.",
    designChecks: ["Every profitable machine creates a route obligation.", "Automation should reduce chores without deleting risk.", "Dashboard tasks should point to the next practical stop."]
  },
  {
    id: "territory_control",
    title: "Machines as territory",
    promise: "Each machine is a public claim on a district, not just a passive income object.",
    designChecks: ["District pressure should react to player and rival machines.", "Rivals should contest profitable or symbolic stops.", "Expansion should require money, reputation, and local leverage."]
  },
  {
    id: "crime_tradeoffs",
    title: "Crime tradeoffs",
    promise: "Illegal and grey choices pay faster, but convert convenience into heat, inspections, confiscation, and retaliation.",
    designChecks: ["Clean play must be viable but slower.", "Risky placement must have clear upsides and visible consequences.", "Heat should decay, but bad choices should stack if ignored."]
  },
  {
    id: "rival_escalation",
    title: "Rival escalation",
    promise: "Different rival archetypes pressure the player in different ways as the route becomes valuable.",
    designChecks: ["Corporate rivals use law and money.", "Street crews use sabotage and local pressure.", "Black-market rivals punish grey demand success."]
  }
];

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
    missionChain: [
      {
        id: "starter_three_profitable",
        title: "Lock down Cinderblock Row",
        description: "Own three profitable starter machines to prove the route can carry itself.",
        requirement: "starter_mission_complete",
        rewardMoney: 0
      }
    ],
    reward: "Iron Yard scouting and expansion cash"
  },
  {
    id: "yard_leverage",
    title: "Iron Yard Leverage",
    districtId: "industrial_yards",
    beats: ["Open Freight Depot", "Serve worker rush", "Survive route ambush", "Hire first guard or runner", "Claim the dock route"],
    missionChain: [
      {
        id: "yard_scout",
        title: "Map the loading yards",
        description: "Scout Iron Yard so the dock pads and setup terms are visible.",
        requirement: "district_scouted",
        rewardMoney: 20
      },
      {
        id: "yard_open",
        title: "Open the freight route",
        description: "Pay the setup and unlock Iron Yard for placements.",
        requirement: "district_unlocked",
        rewardMoney: 35
      },
      {
        id: "yard_muscle",
        title: "Put muscle on the route",
        description: "Place a machine in Iron Yard and hire a guard or runner to cover the run.",
        requirement: "hire_guard_or_runner",
        rewardMoney: 55
      }
    ],
    reward: "Bulk supplier pricing and armored machine access"
  },
  {
    id: "downtown_contracts",
    title: "Downtown Paper Trail",
    districtId: "downtown_loop",
    beats: ["Win a legal placement", "Beat corporate undercuts", "Handle an inspection chain", "Negotiate an office tower route"],
    missionChain: [
      {
        id: "downtown_scout",
        title: "Read the paper trail",
        description: "Scout Downtown Loop to expose the clean placement pads.",
        requirement: "district_scouted",
        rewardMoney: 25
      },
      {
        id: "downtown_legal",
        title: "Win a legal lobby",
        description: "Install a legal-contract machine in Downtown Loop.",
        requirement: "legal_placement",
        rewardMoney: 70
      },
      {
        id: "downtown_inspection",
        title: "Pass the audit",
        description: "Resolve an inspection after the downtown paper trail starts.",
        requirement: "inspection_resolved",
        rewardMoney: 85
      }
    ],
    reward: "Luxury vendors and cleaner public reputation"
  },
  {
    id: "neon_afterhours",
    title: "Neon Afterhours",
    districtId: "neon_quarter",
    beats: ["Unlock grey supplier stock", "Protect midnight machines", "Choose legal or hidden product mix", "Break a black-market vendor route"],
    missionChain: [
      {
        id: "neon_scout",
        title: "Find the afterhours pads",
        description: "Scout Neon Quarter to locate the late-night route.",
        requirement: "district_scouted",
        rewardMoney: 30
      },
      {
        id: "neon_grey_stock",
        title: "Source the fiction-only grey shelf",
        description: "Carry or store fictional grey stock for the Neon route.",
        requirement: "grey_stock_sourced",
        rewardMoney: 55
      },
      {
        id: "neon_brand_choice",
        title: "Package the afterhours brand",
        description: "Use the product lab to create a custom package for any eligible product.",
        requirement: "custom_product",
        rewardMoney: 80
      }
    ],
    reward: "Discreet machine models and high-risk fictional products"
  },
  {
    id: "old_town_war",
    title: "Old Town War",
    districtId: "old_town",
    beats: ["Find the former partner", "Defend the garage", "Flip rival locations", "Force an ending branch"],
    missionChain: [
      {
        id: "old_town_scout",
        title: "Find the former partner",
        description: "Scout Old Town to expose the final rival route.",
        requirement: "district_scouted",
        rewardMoney: 35
      },
      {
        id: "old_town_pressure",
        title: "Break a visible operation",
        description: "Disrupt, expose, or negotiate down an active rival operation.",
        requirement: "rival_operation_disrupted",
        rewardMoney: 90
      },
      {
        id: "old_town_claim",
        title: "Plant a final flag",
        description: "Own a machine in Old Town to unlock ending pressure.",
        requirement: "old_town_machine",
        rewardMoney: 120
      }
    ],
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
