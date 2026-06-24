import type { Product, ProductId } from "../core/types";

export const products: Record<ProductId, Product> = {
  soda: {
    id: "soda",
    name: "Corner Soda",
    category: "drink",
    cost: 2,
    basePrice: 5,
    size: 1,
    demand: 1.05,
    heat: 0,
    legality: 0,
    demandTags: ["commuter", "laundry", "night"],
    description: "Cheap fizz with broad appeal."
  },
  chips: {
    id: "chips",
    name: "Salt Stack Chips",
    category: "snack",
    cost: 1,
    basePrice: 4,
    size: 1,
    demand: 0.9,
    heat: 0,
    legality: 0,
    demandTags: ["student", "laundry", "arcade"],
    description: "Low-cost filler stock."
  },
  energy: {
    id: "energy",
    name: "Turbo Cola",
    category: "drink",
    cost: 4,
    basePrice: 9,
    size: 1,
    demand: 1.2,
    heat: 0.2,
    legality: 0,
    demandTags: ["gym", "commuter", "night"],
    description: "High-margin late-day fuel."
  },
  mystery_capsules: {
    id: "mystery_capsules",
    name: "Mystery Capsules",
    category: "fictional-grey",
    cost: 7,
    basePrice: 16,
    size: 1,
    demand: 1.35,
    heat: 1.4,
    legality: 1,
    demandTags: ["arcade", "night"],
    description: "A fictional grey-market novelty that draws attention."
  }
};
