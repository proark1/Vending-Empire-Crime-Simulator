export type QuestUnlockRequirement =
  | { kind: "starter_complete" }
  | { districtId: string; kind: "district_unlocked" }
  | { kind: "supplier_unlocked"; supplierId: string }
  | { assetId: string; kind: "empire_asset"; level: number }
  | { kind: "always" };

export type QuestStepRequirement =
  | { kind: "choice_made" }
  | { kind: "supplier_loyalty"; supplierId: string; value: number }
  | { kind: "supplier_deal"; supplierId: string }
  | { assetId: string; kind: "empire_asset"; level: number }
  | { kind: "inspection_resolved" }
  | { kind: "grey_stock_sourced" }
  | { kind: "custom_product" }
  | { kind: "rival_operation_resolved" }
  | { kind: "old_town_machine" }
  | { kind: "major_raid_resolved" }
  | { kind: "ending_executed" }
  | { kind: "all_campaign_chains_complete" };

export interface NarrativeQuestChoiceDefinition {
  effect: "public_reputation" | "street_reputation" | "supplier_loyalty" | "shell_cover" | "rival_truce";
  id: string;
  label: string;
  response: string;
}

export interface NarrativeQuestStepDefinition {
  description: string;
  id: string;
  requirement: QuestStepRequirement;
  rewardMoney: number;
  title: string;
}

export interface NarrativeQuestDefinition {
  choices: NarrativeQuestChoiceDefinition[];
  description: string;
  factionId?: string;
  giverId: string;
  giverName: string;
  id: string;
  openingLine: string;
  steps: NarrativeQuestStepDefinition[];
  title: string;
  type: "main" | "side" | "faction";
  unlockRequirement: QuestUnlockRequirement;
}

export const narrativeQuestDefinitions: NarrativeQuestDefinition[] = [
  {
    id: "supplier_blackbook",
    title: "The Supplier Blackbook",
    type: "side",
    giverId: "supplier",
    giverName: "Backdoor Supplier",
    description: "Turn the starter supplier into a relationship with loyalty, negotiated deals, and unlock-gated stock.",
    unlockRequirement: { kind: "starter_complete" },
    openingLine: "You are buying like a hobbyist. Bring volume, pick terms, and I can open the blackbook.",
    choices: [
      {
        id: "supplier_clean_terms",
        label: "Clean terms",
        response: "Fine. Clean paperwork, smaller discount, fewer surprises.",
        effect: "public_reputation"
      },
      {
        id: "supplier_street_terms",
        label: "Street terms",
        response: "Then do not complain when the cheap pallet has teeth.",
        effect: "supplier_loyalty"
      }
    ],
    steps: [
      {
        id: "supplier_pitch",
        title: "Choose the terms",
        description: "Answer the supplier's opening offer.",
        requirement: { kind: "choice_made" },
        rewardMoney: 20
      },
      {
        id: "supplier_volume",
        title: "Earn supplier loyalty",
        description: "Raise Backdoor Wholesale loyalty to 35.",
        requirement: { kind: "supplier_loyalty", supplierId: "backdoor_wholesale", value: 35 },
        rewardMoney: 55
      },
      {
        id: "supplier_pipeline",
        title: "Negotiate a live deal",
        description: "Close any active Backdoor Wholesale supplier deal.",
        requirement: { kind: "supplier_deal", supplierId: "backdoor_wholesale" },
        rewardMoney: 75
      }
    ]
  },
  {
    id: "paper_city",
    title: "Paper City",
    type: "main",
    giverId: "office_clerk",
    giverName: "Office Clerk",
    description: "Build front businesses and shell companies into a real long-term cover structure.",
    unlockRequirement: { kind: "starter_complete" },
    openingLine: "You can own machines or you can own paper. Paper is what survives audits.",
    choices: [
      {
        id: "paper_legit_books",
        label: "Legit books",
        response: "Good. Keep the story boring and the filings boringer.",
        effect: "public_reputation"
      },
      {
        id: "paper_layered_shells",
        label: "Layered shells",
        response: "That buys time, not innocence. Spend the time well.",
        effect: "shell_cover"
      }
    ],
    steps: [
      {
        id: "paper_strategy",
        title: "Pick the paper trail",
        description: "Choose how the office should structure the empire.",
        requirement: { kind: "choice_made" },
        rewardMoney: 25
      },
      {
        id: "paper_front",
        title: "Open a front",
        description: "Upgrade Front Businesses to level 1.",
        requirement: { assetId: "front_business", kind: "empire_asset", level: 1 },
        rewardMoney: 80
      },
      {
        id: "paper_shell",
        title: "Layer the shell",
        description: "Upgrade Shell Companies to level 1.",
        requirement: { assetId: "shell_company", kind: "empire_asset", level: 1 },
        rewardMoney: 105
      }
    ]
  },
  {
    id: "redline_sitdown",
    title: "Redline Sitdown",
    type: "faction",
    giverId: "rival_boss_redline",
    giverName: "Redline Boss",
    factionId: "rival_redline",
    description: "A faction storyline built around negotiation, pressure, and visible rival operations.",
    unlockRequirement: { kind: "starter_complete" },
    openingLine: "Your machines are loud. Make them useful to me, or make them scarce.",
    choices: [
      {
        id: "redline_truce",
        label: "Offer a truce",
        response: "Temporary. Do not mistake a pause for forgiveness.",
        effect: "rival_truce"
      },
      {
        id: "redline_threat",
        label: "Push back",
        response: "Good. At least this will be honest.",
        effect: "street_reputation"
      }
    ],
    steps: [
      {
        id: "redline_terms",
        title: "Set the tone",
        description: "Choose truce or pressure in the sitdown.",
        requirement: { kind: "choice_made" },
        rewardMoney: 30
      },
      {
        id: "redline_operation",
        title: "Answer an operation",
        description: "Resolve any visible rival operation.",
        requirement: { kind: "rival_operation_resolved" },
        rewardMoney: 90
      }
    ]
  },
  {
    id: "downtown_audit_trail",
    title: "Downtown Audit Trail",
    type: "main",
    giverId: "lawyer",
    giverName: "Corporate Lawyer",
    description: "Turn Downtown pressure into a paper trail strong enough to survive inspections and corporate undercuts.",
    unlockRequirement: { districtId: "downtown_loop", kind: "district_unlocked" },
    openingLine: "Downtown does not fear crime. Downtown fears messy documentation.",
    choices: [
      {
        id: "downtown_clean_lobby",
        label: "Clean lobby",
        response: "Good. We make the machines look inevitable, not suspicious.",
        effect: "public_reputation"
      },
      {
        id: "downtown_shell_lobby",
        label: "Shell lobby",
        response: "Then the paperwork gets deeper. Deep enough to lose an inspector in.",
        effect: "shell_cover"
      }
    ],
    steps: [
      {
        id: "downtown_audit_strategy",
        title: "Pick the audit posture",
        description: "Choose whether Downtown is a clean expansion or a layered shell.",
        requirement: { kind: "choice_made" },
        rewardMoney: 40
      },
      {
        id: "downtown_audit_resolution",
        title: "Answer the inspector",
        description: "Resolve any law inspection after the Downtown audit trail opens.",
        requirement: { kind: "inspection_resolved" },
        rewardMoney: 120
      }
    ]
  },
  {
    id: "neon_private_label",
    title: "Neon Private Label",
    type: "side",
    giverId: "grey_supplier",
    giverName: "Night Broker",
    description: "Build a fictional afterhours product identity around grey stock, custom packaging, and supplier risk.",
    unlockRequirement: { districtId: "neon_quarter", kind: "district_unlocked" },
    openingLine: "Neon buys stories first. Product second. Label the story right and the shelf sells itself.",
    choices: [
      {
        id: "neon_public_label",
        label: "Clean label",
        response: "A polite lie. Customers love those.",
        effect: "public_reputation"
      },
      {
        id: "neon_street_label",
        label: "Street label",
        response: "Then make it look like a dare without making it evidence.",
        effect: "street_reputation"
      }
    ],
    steps: [
      {
        id: "neon_label_direction",
        title: "Choose the label signal",
        description: "Decide how loud the afterhours shelf should look.",
        requirement: { kind: "choice_made" },
        rewardMoney: 35
      },
      {
        id: "neon_label_stock",
        title: "Source the shelf rumor",
        description: "Carry, store, or stock fictional grey goods.",
        requirement: { kind: "grey_stock_sourced" },
        rewardMoney: 90
      },
      {
        id: "neon_label_package",
        title: "Package the rumor",
        description: "Create a custom product package in the lab.",
        requirement: { kind: "custom_product" },
        rewardMoney: 125
      }
    ]
  },
  {
    id: "marlow_old_map",
    title: "Marlow's Old Map",
    type: "faction",
    giverId: "rival_boss_marlow",
    giverName: "Elias Marlow",
    factionId: "rival_marlow",
    description: "A former partner storyline about old routes, visible operations, and forcing a final citywide choice.",
    unlockRequirement: { districtId: "old_town", kind: "district_unlocked" },
    openingLine: "You are walking routes I drew before you knew how to count quarters.",
    choices: [
      {
        id: "marlow_buyout",
        label: "Offer buyout",
        response: "You still think money is the wound. Interesting.",
        effect: "public_reputation"
      },
      {
        id: "marlow_burn_map",
        label: "Burn the map",
        response: "There it is. The part of you I helped build.",
        effect: "street_reputation"
      }
    ],
    steps: [
      {
        id: "marlow_terms",
        title: "Settle the old terms",
        description: "Choose whether Marlow is a buyout target or a street problem.",
        requirement: { kind: "choice_made" },
        rewardMoney: 50
      },
      {
        id: "marlow_operation",
        title: "Break the old route",
        description: "Resolve any visible rival operation.",
        requirement: { kind: "rival_operation_resolved" },
        rewardMoney: 130
      },
      {
        id: "marlow_flag",
        title: "Replace the marker",
        description: "Own a machine in Old Town.",
        requirement: { kind: "old_town_machine" },
        rewardMoney: 170
      }
    ]
  },
  {
    id: "final_board",
    title: "The Final Board",
    type: "main",
    giverId: "fixer",
    giverName: "The Fixer",
    description: "Final ending execution chain: finish arcs, survive pressure, and execute an ending path.",
    unlockRequirement: { assetId: "regional_office", kind: "empire_asset", level: 1 },
    openingLine: "You are not choosing a vibe. You are choosing who owns tomorrow morning.",
    choices: [
      {
        id: "final_clean_exit",
        label: "Clean exit",
        response: "Then keep heat down and make the buyer believe the story.",
        effect: "public_reputation"
      },
      {
        id: "final_city_grip",
        label: "City grip",
        response: "Then stop asking who approves. Start asking who can stop you.",
        effect: "street_reputation"
      }
    ],
    steps: [
      {
        id: "final_choice",
        title: "Name the endgame",
        description: "Tell the fixer what kind of ending you are aiming for.",
        requirement: { kind: "choice_made" },
        rewardMoney: 45
      },
      {
        id: "final_campaigns",
        title: "Close the city arcs",
        description: "Complete every campaign chain.",
        requirement: { kind: "all_campaign_chains_complete" },
        rewardMoney: 140
      },
      {
        id: "final_raid",
        title: "Survive the big pressure",
        description: "Resolve a major raid before executing the ending.",
        requirement: { kind: "major_raid_resolved" },
        rewardMoney: 160
      },
      {
        id: "final_execute",
        title: "Execute the ending",
        description: "Lock in any available ending path.",
        requirement: { kind: "ending_executed" },
        rewardMoney: 250
      }
    ]
  }
];
