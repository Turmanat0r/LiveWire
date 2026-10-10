import type { NonEmptyArray, Random } from './types';

// Every angler gets a handle at registration: the name they razz each other
// under. Real names stay on everything official; the handle is for banter, and
// it is the only name the rest of the field ever sees.

// prettier-ignore
const TITLES: NonEmptyArray<string> = ['Captain', 'Sir', 'Doc', 'Lord', 'Deputy', 'The Right Honorable', 'Reverend', 'Professor', 'Colonel', 'General', 'Chief', 'The Notorious', 'Commodore', 'Warden', 'Judge', 'Ambassador', 'Marshal', 'Baron', 'The Honorable', 'Detective', 'Sergeant', 'Governor'];
// prettier-ignore
const ADJECTIVES: NonEmptyArray<string> = ['Sneaky', 'Grumpy', 'Wobbly', 'Feral', 'Rogue', 'Salty', 'Lucky', 'Reckless', 'Soggy', 'Rowdy', 'Chaotic', 'Stubborn', 'Slippery', 'Mighty', 'Legendary', 'Wandering', 'Cranky', 'Jolly', 'Sly', 'Sedimental', 'Fossilized', 'Petrified', 'Igneous', 'Molten', 'Weathered', 'Unbothered', 'Overqualified', 'Suspiciously Calm', 'Feisty', 'Ornery', 'Restless', 'Waterlogged', 'Windburnt', 'Overcaffeinated', 'Unlicensed', 'Self-Appointed', 'Undeterred', 'Bewildered', 'Vengeful', 'Nocturnal', 'Barnacled', 'Crusty', 'Formerly Respectable', 'Mildly Feral', 'Certified', 'Unsupervised'];
// prettier-ignore
const GEOLOGY: NonEmptyArray<string> = ['Granite', 'Boulder', 'Shale', 'Basalt', 'Quartz', 'Obsidian', 'Bedrock', 'Canyon', 'Ridge', 'Fossil', 'Pyrite', 'Slate', 'Gravel', 'Cobble', 'Talus', 'Moraine', 'Feldspar', 'Schist', 'Limestone', 'Sediment', 'Cliffside', 'Riverstone', 'Mica', 'Sandstone', 'Dolomite', 'Gneiss', 'Magma', 'Silt', 'Chert', 'Alluvium', 'Bluff', 'Outcrop', 'Scree', 'Tundra', 'Permafrost', 'Butte', 'Mesa', 'Glacier', 'Tectonic', 'Sedimentary'];
// prettier-ignore
const FISH: NonEmptyArray<string> = ['Walleye', 'Bass', 'Pike', 'Catfish', 'Perch', 'Sturgeon', 'Trout', 'Muskie', 'Crappie', 'Carp', 'Gar', 'Herring', 'Salmon', 'Bluegill', 'Sucker', 'Chub', 'Minnow', 'Grayling', 'Kokanee', 'Ling', 'Sunfish', 'Northern', 'Burbot', 'Whitefish', 'Shiner', 'Darter', 'Bullhead', 'Smallmouth', 'Largemouth', 'Cisco', 'Goldeye', 'Sauger', 'Redhorse'];
// prettier-ignore
const SUFFIXES: NonEmptyArray<string> = ['McFin', 'Esq.', 'Jr.', 'the Third', 'of the Ponds', 'of Canyon Ferry', 'the Relentless', 'the Unbothered', 'the Elder', 'the Persistent', 'the Undefeated (Probably)', 'the Overpacked', 'of the Silos', 'the Sunburnt', 'the Overprepared', 'the Chronically Early', 'the Reigning Champion (Self-Declared)', 'the Well-Anchored', 'the Suspiciously Confident', 'the Locally Feared', 'of Third Place', 'the Bait-Rich', 'the Underfunded', 'the Overinsured'];
// prettier-ignore
const BAIT: NonEmptyArray<string> = ['Spinnerbait', 'Crankbait', 'Jerkbait', 'Chatterbait', 'Wacky Rig', 'Drop Shot', 'Jig', 'Spoon', 'Swimbait', 'Topwater', 'Bobber', 'Nightcrawler', 'Leech', 'Rooster Tail', 'Rapala', 'Powerbait', 'Treble Hook', 'Gulp Minnow', 'Rubber Worm', 'Buzzbait'];
// prettier-ignore
const WATERS: NonEmptyArray<string> = ['Canyon Ferry', 'Yellowstone', 'Missouri River', 'Bitterroot', 'Clark Fork', 'Flathead Lake', 'Hauser Lake', 'Holter Lake', 'Madison River', 'Gallatin River', 'Big Hole River', 'Fort Peck', 'Georgetown Lake', 'Hebgen Lake', 'Noxon Reservoir', 'Smith River', 'Blackfoot River', 'Rock Creek', 'Beaverhead', 'Tongue River', 'Ruby River'];
// prettier-ignore
const FAST_FOOD: NonEmptyArray<string> = ['Whopper', 'Big Mac', 'McNugget', 'Baconator', 'Frosty', 'Crunchwrap', 'Gordita', 'Chalupa', 'Doritos Locos', 'Waffle Fry', 'McFlurry', 'Drive-Thru', 'Value Meal', 'Extra Crispy', 'Biggie Size', 'Dollar Menu', 'Curly Fry', 'Footlong', 'Spicy Chicken Sandwich', 'Junior Bacon'];

function pick<T>(list: NonEmptyArray<T>, random: Random): T {
  return list[Math.floor(random() * list.length)] ?? list[0];
}

export function generateHandle(random: Random = Math.random): string {
  const p = (list: NonEmptyArray<string>) => pick(list, random);
  switch (Math.floor(random() * 8)) {
    case 0:
      return [p(ADJECTIVES), p(GEOLOGY), p(FISH)].join(' ');
    case 1:
      return [p(FISH), p(SUFFIXES)].join(' ');
    case 2:
      return [p(TITLES), p(ADJECTIVES), p(FISH)].join(' ');
    case 3:
      return [p(GEOLOGY), p(FISH), p(SUFFIXES)].join(' ');
    case 4:
      return [p(BAIT), p(FISH)].join(' ');
    case 5:
      return [p(WATERS), p(FISH)].join(' ');
    case 6:
      return [p(FAST_FOOD), p(FISH)].join(' ');
    default: {
      const flavour = pick([BAIT, WATERS, FAST_FOOD, GEOLOGY] as const, random);
      return [p(TITLES), p(flavour), p(FISH), p(SUFFIXES)].join(' ');
    }
  }
}

/**
 * A handle nobody on the roster has, ignoring case. Rerolls off a collision,
 * and numbers one if the rolls keep landing on taken names. The database's
 * unique index has the final say.
 */
export function uniqueHandle(taken: Iterable<string>, random: Random = Math.random): string {
  const used = new Set([...taken].map((h) => h.toLowerCase()));
  for (let i = 0; i < 40; i++) {
    const h = generateHandle(random);
    if (!used.has(h.toLowerCase())) return h;
  }
  const base = generateHandle(random);
  for (let n = 2; n < 500; n++) {
    const h = `${base} ${n}`;
    if (!used.has(h.toLowerCase())) return h;
  }
  return `${base} ${Math.floor(random() * 1e6).toString(36)}`;
}
