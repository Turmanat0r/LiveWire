// The species tournaments are actually run for, grouped so the list stays
// scannable on a phone: the old app's list. Each length is a plausibility
// ceiling, not a record: it sits comfortably above any real fish, so an
// obvious mis-entry (a 300″ walleye, a length typed into the wrong box) gets
// flagged for the director. Anything not here is typed in by hand.
export const SPECIES_PRESETS: readonly {
  readonly group: string;
  readonly items: readonly { readonly name: string; readonly inches: number }[];
}[] = [
  {
    group: 'Bass',
    items: [
      { name: 'Largemouth Bass', inches: 32 },
      { name: 'Smallmouth Bass', inches: 30 },
      { name: 'Spotted Bass', inches: 28 },
      { name: 'Striped Bass', inches: 60 },
      { name: 'White Bass', inches: 24 },
    ],
  },
  {
    group: 'Walleye & pike',
    items: [
      { name: 'Walleye', inches: 36 },
      { name: 'Sauger', inches: 32 },
      { name: 'Northern Pike', inches: 56 },
      { name: 'Muskellunge', inches: 66 },
    ],
  },
  {
    group: 'Panfish',
    items: [
      { name: 'Yellow Perch', inches: 22 },
      { name: 'Black Crappie', inches: 22 },
      { name: 'White Crappie', inches: 22 },
      { name: 'Bluegill', inches: 18 },
    ],
  },
  {
    group: 'Catfish',
    items: [
      { name: 'Channel Catfish', inches: 56 },
      { name: 'Blue Catfish', inches: 66 },
      { name: 'Flathead Catfish', inches: 62 },
    ],
  },
  {
    group: 'Trout & salmon',
    items: [
      { name: 'Rainbow Trout', inches: 48 },
      { name: 'Brown Trout', inches: 48 },
      { name: 'Brook Trout', inches: 34 },
      { name: 'Lake Trout', inches: 56 },
      { name: 'Chinook Salmon', inches: 60 },
    ],
  },
  {
    group: 'Inshore saltwater',
    items: [
      { name: 'Redfish', inches: 60 },
      { name: 'Speckled Trout', inches: 40 },
      { name: 'Flounder', inches: 40 },
      { name: 'Snook', inches: 56 },
      { name: 'Sheepshead', inches: 30 },
    ],
  },
];

export function presetCeiling(name: string): number | null {
  for (const g of SPECIES_PRESETS) {
    const hit = g.items.find((i) => i.name === name);
    if (hit) return hit.inches;
  }
  return null;
}
