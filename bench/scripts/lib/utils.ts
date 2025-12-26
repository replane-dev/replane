import type {
  Config,
  ConfigBase,
  ConfigVariant,
  Override,
} from "@replanejs/admin";

// Random string generator
function randomString(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Random integer between min and max (inclusive)
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Random boolean
function randomBool(): boolean {
  return Math.random() > 0.5;
}

/**
 * Pick a random element from an array
 * @param array - Array to pick from
 * @returns A random element from the array
 * @throws Error if array is empty
 */
export function pickRandom<T>(array: T[]): T {
  if (array.length === 0) {
    throw new Error("Cannot pick from empty array");
  }
  return array[Math.floor(Math.random() * array.length)];
}

// Generate a random config value (various types for realism)
function randomValue(): unknown {
  const valueType = randomInt(0, 4);
  switch (valueType) {
    case 0:
      return randomBool(); // boolean
    case 1:
      return randomInt(0, 1000); // number
    case 2:
      return `value_${randomString(8)}`; // string
    case 3:
      return {
        key: randomString(6),
        enabled: randomBool(),
        count: randomInt(1, 100),
      }; // object
    case 4:
      return [randomString(4), randomString(4), randomString(4)]; // array
    default:
      return randomBool();
  }
}

// Generate random overrides
function randomOverrides(): Override[] {
  const count = randomInt(0, 3);
  const overrides: Override[] = [];

  for (let i = 0; i < count; i++) {
    overrides.push({
      name: `override_${randomString(6)}`,
      conditions: [
        {
          operator: "equals",
          property: `user.${randomString(4)}`,
          value: { type: "literal", value: randomString(8) },
        },
      ],
      value: randomValue(),
    });
  }

  return overrides;
}

// Generate a random ConfigBase
function randomConfigBase(): ConfigBase {
  return {
    value: randomValue(),
    schema: null,
    overrides: randomOverrides(),
  };
}

// Generate a random ConfigVariant for an environment
function randomConfigVariant(environmentId: string): ConfigVariant {
  return {
    environmentId,
    value: randomValue(),
    schema: null,
    overrides: randomOverrides(),
    useBaseSchema: true,
  };
}

/**
 * Generate a random Config for benchmarking
 * @param envIds - Array of environment IDs to create variants for
 * @returns A random Config object
 */
export function randomConfig(envIds: string[]): Config {
  const now = new Date().toISOString();

  return {
    id: `cfg_${randomString(12)}`,
    name: `config_${randomString(8)}`,
    description: `Benchmark config ${randomString(6)}`,
    version: 1,
    base: randomConfigBase(),
    variants: envIds.map((envId) => randomConfigVariant(envId)),
    editors: [],
    createdAt: now,
    updatedAt: now,
  };
}
