import {describe, expect, it} from 'vitest';
import {
  chunkArray,
  getDaysAgo,
  isValidJsonSchema,
  mapConcurrently,
  normalizeEmail,
  trimEnd,
  unique,
  validateAgainstJsonSchema,
  wait,
} from './utils';

describe('chunkArray', () => {
  it('should chunk an array of numbers into smaller arrays of the specified size', () => {
    const array = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const chunkSize = 3;
    const expectedChunks = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];

    const result = chunkArray(array, chunkSize);

    expect(result).toEqual(expectedChunks);
  });

  it('should handle array lengths not perfectly divisible by chunk size', () => {
    const array = [1, 2, 3, 4, 5, 6, 7, 8];
    const chunkSize = 3;
    const expectedChunks = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8],
    ];

    const result = chunkArray(array, chunkSize);

    expect(result).toEqual(expectedChunks);
  });

  it('should return a single chunk if chunk size is larger than array length', () => {
    const array = [1, 2, 3];
    const chunkSize = 5;
    const expectedChunks = [[1, 2, 3]];

    const result = chunkArray(array, chunkSize);

    expect(result).toEqual(expectedChunks);
  });

  it('should return an empty array if the input array is empty', () => {
    const array: number[] = [];
    const chunkSize = 3;
    const expectedChunks: number[][] = [];

    const result = chunkArray(array, chunkSize);

    expect(result).toEqual(expectedChunks);
  });

  it('should return an array of single-element arrays if chunk size is 1', () => {
    const array = [1, 2, 3, 4];
    const chunkSize = 1;
    const expectedChunks = [[1], [2], [3], [4]];

    const result = chunkArray(array, chunkSize);

    expect(result).toEqual(expectedChunks);
  });

  it('should work with arrays of different data types', () => {
    const array = ['a', 'b', 'c', 'd', 'e'];
    const chunkSize = 2;
    const expectedChunks = [['a', 'b'], ['c', 'd'], ['e']];

    const result = chunkArray(array, chunkSize);

    expect(result).toEqual(expectedChunks);
  });

  it('should throw an error if chunk size is 0', () => {
    const array = [1, 2, 3];
    const chunkSize = 0;

    expect(() => chunkArray(array, chunkSize)).toThrow('Chunk size must be greater than 0');
  });

  it('should throw an error if chunk size is negative', () => {
    const array = [1, 2, 3];
    const chunkSize = -2;

    expect(() => chunkArray(array, chunkSize)).toThrow('Chunk size must be greater than 0');
  });

  it('should return a single chunk if array length is equal to chunk size', () => {
    const array = [1, 2, 3];
    const chunkSize = 3;
    const expectedChunks = [[1, 2, 3]];

    const result = chunkArray(array, chunkSize);

    expect(result).toEqual(expectedChunks);
  });

  it('should handle large arrays', () => {
    const largeArray = Array.from({length: 1000}, (_, i) => i + 1);
    const chunkSize = 100;
    const expectedNumberOfChunks = 10;

    const result = chunkArray(largeArray, chunkSize);

    expect(result).toHaveLength(expectedNumberOfChunks);
    expect(result[0]).toHaveLength(chunkSize);
    expect(result[result.length - 1]).toHaveLength(chunkSize);
    expect(result[0][0]).toBe(1);
    expect(result[expectedNumberOfChunks - 1][chunkSize - 1]).toBe(1000);
  });
});

describe('unique', () => {
  it('should return an array with unique elements', () => {
    const array = [1, 2, 2, 3, 4, 4, 5];
    const expectedUnique = [1, 2, 3, 4, 5];

    const result = unique(array);

    expect(result).toEqual(expectedUnique);
  });

  it('should return an empty array when input is empty', () => {
    const array: number[] = [];
    const expectedUnique: number[] = [];

    const result = unique(array);

    expect(result).toEqual(expectedUnique);
  });

  it('should handle arrays with all unique elements', () => {
    const array = [1, 2, 3, 4, 5];
    const expectedUnique = [1, 2, 3, 4, 5];

    const result = unique(array);

    expect(result).toEqual(expectedUnique);
  });
});

describe('validateAgainstJsonSchema', () => {
  it('returns ok=true for valid object', () => {
    const schema = {
      type: 'object',
      properties: {
        id: {type: 'string'},
        count: {type: 'number'},
      },
      required: ['id'],
      additionalProperties: false,
    } as const;

    const res = validateAgainstJsonSchema({id: 'a1', count: 2}, schema);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toEqual({id: 'a1', count: 2});
    }
  });

  it('returns ok=false with readable errors for invalid object', () => {
    const schema = {
      type: 'object',
      properties: {
        id: {type: 'string'},
        count: {type: 'number'},
      },
      required: ['id'],
      additionalProperties: false,
    } as const;

    const res = validateAgainstJsonSchema({count: 'nope'}, schema);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.join(' ')).toMatch(/id|required/);
    }
  });

  it('validates using draft-04 when $schema specifies it', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-04/schema#',
      type: 'object',
      properties: {
        name: {type: 'string'},
        age: {type: 'integer', minimum: 0},
      },
      required: ['name'],
    };

    const validData = {name: 'Alice', age: 30};
    const invalidData = {age: 30}; // missing required 'name'

    const validRes = validateAgainstJsonSchema(validData, schema);
    expect(validRes.ok).toBe(true);

    const invalidRes = validateAgainstJsonSchema(invalidData, schema);
    expect(invalidRes.ok).toBe(false);
  });

  it('validates using draft-07 with const keyword', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        role: {const: 'admin'},
      },
      required: ['role'],
    };

    const validData = {role: 'admin'};
    const invalidData = {role: 'user'};

    const validRes = validateAgainstJsonSchema(validData, schema);
    expect(validRes.ok).toBe(true);

    const invalidRes = validateAgainstJsonSchema(invalidData, schema);
    expect(invalidRes.ok).toBe(false);
  });

  it('validates using 2019-09 schema', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2019-09/schema',
      type: 'object',
      properties: {
        email: {type: 'string', format: 'email'},
      },
    };

    const validData = {email: 'user@example.com'};
    const invalidData = {email: 'not-an-email'};

    const validRes = validateAgainstJsonSchema(validData, schema);
    expect(validRes.ok).toBe(true);

    const invalidRes = validateAgainstJsonSchema(invalidData, schema);
    expect(invalidRes.ok).toBe(false);
  });

  it('validates using 2020-12 schema', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        url: {type: 'string', format: 'uri'},
      },
    };

    const validData = {url: 'https://example.com'};
    const invalidData = {url: 'not a url'};

    const validRes = validateAgainstJsonSchema(validData, schema);
    expect(validRes.ok).toBe(true);

    const invalidRes = validateAgainstJsonSchema(invalidData, schema);
    expect(invalidRes.ok).toBe(false);
  });

  it('rejects draft-04 data violating minimum constraint', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-04/schema#',
      type: 'object',
      properties: {
        age: {type: 'integer', minimum: 18},
      },
    };

    const invalidData = {age: 15};
    const res = validateAgainstJsonSchema(invalidData, schema);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.join(' ')).toMatch(/>=|18/);
    }
  });

  it('rejects draft-04 data violating pattern constraint', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-04/schema#',
      type: 'object',
      properties: {
        code: {type: 'string', pattern: '^[A-Z]{3}$'},
      },
    };

    const invalidData = {code: 'abc'}; // lowercase instead of uppercase
    const res = validateAgainstJsonSchema(invalidData, schema);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.join(' ')).toMatch(/pattern/i);
    }
  });

  it('rejects draft-06 data violating const constraint', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      type: 'object',
      properties: {
        status: {const: 'active'},
      },
    };

    const invalidData = {status: 'inactive'};
    const res = validateAgainstJsonSchema(invalidData, schema);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.join(' ')).toMatch(/equal|active/);
    }
  });

  it('rejects draft-07 data violating if-then-else logic', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        country: {type: 'string'},
        postalCode: {type: 'string'},
      },
      if: {
        properties: {country: {const: 'US'}},
      },
      then: {
        properties: {
          postalCode: {pattern: '^[0-9]{5}$'},
        },
        required: ['postalCode'],
      },
    };

    const invalidData = {country: 'US', postalCode: 'ABC'}; // Invalid US postal code
    const res = validateAgainstJsonSchema(invalidData, schema);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.length).toBeGreaterThan(0);
    }
  });

  it('rejects draft-07 data with invalid email format', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        email: {type: 'string', format: 'email'},
      },
    };

    const invalidData = {email: 'not-valid-email'};
    const res = validateAgainstJsonSchema(invalidData, schema);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.join(' ')).toMatch(/email/);
    }
  });

  it('rejects 2019-09 data with invalid date-time format', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2019-09/schema',
      type: 'object',
      properties: {
        timestamp: {type: 'string', format: 'date-time'},
      },
    };

    const invalidData = {timestamp: '2023-13-45T99:99:99Z'}; // Invalid date
    const res = validateAgainstJsonSchema(invalidData, schema);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.join(' ')).toMatch(/date-time/);
    }
  });

  it('rejects 2020-12 data violating minLength and maxLength', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        username: {type: 'string', minLength: 3, maxLength: 10},
      },
    };

    const tooShort = {username: 'ab'};
    const tooLong = {username: 'thisusernameistoolong'};

    const shortRes = validateAgainstJsonSchema(tooShort, schema);
    expect(shortRes.ok).toBe(false);
    if (!shortRes.ok) {
      expect(shortRes.errors.join(' ')).toMatch(/3|characters|longer/);
    }

    const longRes = validateAgainstJsonSchema(tooLong, schema);
    expect(longRes.ok).toBe(false);
    if (!longRes.ok) {
      expect(longRes.errors.join(' ')).toMatch(/10|characters|longer/);
    }
  });

  it('rejects data violating array constraints', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: {type: 'string'},
          minItems: 1,
          maxItems: 3,
          uniqueItems: true,
        },
      },
    };

    const emptyArray = {tags: []};
    const tooManyItems = {tags: ['a', 'b', 'c', 'd']};
    const duplicateItems = {tags: ['a', 'b', 'a']};
    const wrongType = {tags: ['a', 123, 'c']};

    const emptyRes = validateAgainstJsonSchema(emptyArray, schema);
    expect(emptyRes.ok).toBe(false);
    if (!emptyRes.ok) {
      expect(emptyRes.errors.join(' ')).toMatch(/1|item/);
    }

    const tooManyRes = validateAgainstJsonSchema(tooManyItems, schema);
    expect(tooManyRes.ok).toBe(false);
    if (!tooManyRes.ok) {
      expect(tooManyRes.errors.join(' ')).toMatch(/3|items/);
    }

    const duplicateRes = validateAgainstJsonSchema(duplicateItems, schema);
    expect(duplicateRes.ok).toBe(false);
    if (!duplicateRes.ok) {
      expect(duplicateRes.errors.join(' ')).toMatch(/unique|duplicate/);
    }

    const wrongTypeRes = validateAgainstJsonSchema(wrongType, schema);
    expect(wrongTypeRes.ok).toBe(false);
    if (!wrongTypeRes.ok) {
      expect(wrongTypeRes.errors.join(' ')).toMatch(/string/);
    }
  });

  it('rejects data with missing required fields', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        firstName: {type: 'string'},
        lastName: {type: 'string'},
        email: {type: 'string', format: 'email'},
      },
      required: ['firstName', 'lastName', 'email'],
    };

    const incompleteData = {firstName: 'John'};
    const res = validateAgainstJsonSchema(incompleteData, schema);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.join(' ')).toMatch(/lastName|email|required/i);
    }
  });

  it('rejects data with additional properties when not allowed', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        id: {type: 'number'},
        name: {type: 'string'},
      },
      additionalProperties: false,
    };

    const dataWithExtra = {id: 1, name: 'Test', extra: 'field'};
    const res = validateAgainstJsonSchema(dataWithExtra, schema);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.join(' ')).toMatch(/additional|extra/);
    }
  });

  it('rejects data violating enum constraint', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        color: {type: 'string', enum: ['red', 'green', 'blue']},
      },
    };

    const invalidData = {color: 'yellow'};
    const res = validateAgainstJsonSchema(invalidData, schema);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.join(' ')).toMatch(/equal|allowed/);
    }
  });

  it('rejects nested object validation failures', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            profile: {
              type: 'object',
              properties: {
                age: {type: 'integer', minimum: 0},
              },
              required: ['age'],
            },
          },
          required: ['profile'],
        },
      },
    };

    const invalidNestedData = {
      user: {
        profile: {
          age: -5, // negative age
        },
      },
    };

    const res = validateAgainstJsonSchema(invalidNestedData, schema);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.join(' ')).toMatch(/>=|0/);
    }
  });

  it('rejects data with wrong type', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        count: {type: 'number'},
        active: {type: 'boolean'},
        tags: {type: 'array'},
      },
    };

    const wrongTypes = {
      count: 'not a number',
      active: 'not a boolean',
      tags: 'not an array',
    };

    const res = validateAgainstJsonSchema(wrongTypes, schema);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.join(' ')).toMatch(/number|boolean|array/);
    }
  });

  it('rejects draft-06 data violating exclusiveMinimum/Maximum', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      type: 'object',
      properties: {
        score: {
          type: 'number',
          exclusiveMinimum: 0,
          exclusiveMaximum: 100,
        },
      },
    };

    const atMin = {score: 0};
    const atMax = {score: 100};
    const belowMin = {score: -1};
    const aboveMax = {score: 101};

    // At boundaries should fail (exclusive)
    const minRes = validateAgainstJsonSchema(atMin, schema);
    expect(minRes.ok).toBe(false);

    const maxRes = validateAgainstJsonSchema(atMax, schema);
    expect(maxRes.ok).toBe(false);

    // Outside boundaries should fail
    const belowRes = validateAgainstJsonSchema(belowMin, schema);
    expect(belowRes.ok).toBe(false);

    const aboveRes = validateAgainstJsonSchema(aboveMax, schema);
    expect(aboveRes.ok).toBe(false);

    // Within boundaries should pass
    const validRes = validateAgainstJsonSchema({score: 50}, schema);
    expect(validRes.ok).toBe(true);
  });
});

describe('isValidJsonSchema', () => {
  it('returns true for a valid simple schema', () => {
    expect(isValidJsonSchema({type: 'string'})).toBe(true);
  });

  it('returns true for boolean schemas', () => {
    expect(isValidJsonSchema(true)).toBe(true);
    expect(isValidJsonSchema(false)).toBe(true);
  });

  it('returns false for non-object/non-boolean (except null handled by caller)', () => {
    expect(isValidJsonSchema(123 as unknown)).toBe(false);
    expect(isValidJsonSchema('str' as unknown)).toBe(false);
  });

  it('honors $schema draft-07: schema with const is valid', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {role: {const: 'admin'}},
    } as const;

    expect(isValidJsonSchema(schema)).toBe(true);
  });

  it('honors $schema draft-04: valid draft-04 schema is accepted', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-04/schema#',
      type: 'object',
      properties: {name: {type: 'string'}},
      required: ['name'],
    } as const;

    // Now draft-04 is supported via ajv-draft-04
    expect(isValidJsonSchema(schema)).toBe(true);
  });

  it('validates draft-04 schema structure (meta-schema validation)', () => {
    // Note: Meta-schema validation checks if the schema is structurally valid,
    // not if keywords are appropriate for the draft version
    const schema = {
      $schema: 'http://json-schema.org/draft-04/schema#',
      type: 'object',
      properties: {role: {enum: ['admin', 'user']}}, // enum is valid in draft-04
    } as const;

    expect(isValidJsonSchema(schema)).toBe(true);
  });

  it('supports draft-06 schemas with const keyword', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      type: 'object',
      properties: {role: {const: 'admin'}}, // 'const' was added in draft-06
    } as const;

    expect(isValidJsonSchema(schema)).toBe(true);
  });

  it('supports 2019-09 schemas', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2019-09/schema',
      type: 'object',
      properties: {name: {type: 'string'}},
    } as const;

    expect(isValidJsonSchema(schema)).toBe(true);
  });

  it('supports 2020-12 schemas', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {name: {type: 'string'}},
    } as const;

    expect(isValidJsonSchema(schema)).toBe(true);
  });

  it('accepts schema with unknown keywords when strict mode is disabled', () => {
    const schema = {
      type: 'object',
      customKeyword: 'this is allowed with strict: false',
    };

    // With strict: false, unknown keywords are allowed
    expect(isValidJsonSchema(schema)).toBe(true);
  });

  it('rejects schema with invalid type value', () => {
    const schema = {
      type: 'invalidType', // not a valid JSON Schema type
    };

    expect(isValidJsonSchema(schema)).toBe(false);
  });

  it('rejects draft-04 schema with invalid additionalItems usage', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-04/schema#',
      type: 'array',
      items: [{type: 'string'}],
      additionalItems: 'invalid', // should be boolean or object
    };

    expect(isValidJsonSchema(schema)).toBe(false);
  });

  it('rejects draft-07 schema with malformed if-then-else', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      if: {type: 'string'},
      then: 'invalid', // should be a schema object
    };

    expect(isValidJsonSchema(schema)).toBe(false);
  });

  it('rejects 2019-09 schema with invalid dependentSchemas', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2019-09/schema',
      type: 'object',
      dependentSchemas: 'invalid', // should be an object
    };

    expect(isValidJsonSchema(schema)).toBe(false);
  });
});

describe('normalizeUserEmail', () => {
  it('trims whitespace and lowercases the email', () => {
    const input = '  Alice.Smith+Dev@Example.COM  ';
    const normalized = normalizeEmail(input);
    expect(normalized).toBe('alice.smith+dev@example.com');
  });

  it('is idempotent', () => {
    const input = 'User+Test@Example.com';
    const once = normalizeEmail(input);
    const twice = normalizeEmail(once);
    expect(twice).toBe(once);
  });

  it('handles empty string', () => {
    expect(normalizeEmail('')).toBe('');
  });
});

describe('trimEnd', () => {
  it('should remove a single trailing character', () => {
    const result = trimEnd('hello,', ',');

    expect(result).toBe('hello');
  });

  it('should remove multiple trailing characters', () => {
    const result = trimEnd('test!!!', '!');

    expect(result).toBe('test');
  });

  it('should not change the string if the character is not at the end', () => {
    const result = trimEnd('hello, world', ',');

    expect(result).toBe('hello, world');
  });

  it('should return the original string if it does not end with the character', () => {
    const result = trimEnd('abc', 'd');

    expect(result).toBe('abc');
  });

  it('should return an empty string if the input string is empty', () => {
    const result = trimEnd('', 'a');

    expect(result).toBe('');
  });

  it('should return an empty string if the string consists only of the characters to be trimmed', () => {
    const result = trimEnd('////', '/');

    expect(result).toBe('');
  });

  it('should handle a multi-character string for trimming', () => {
    const result = trimEnd('start-end-end', '-end');

    expect(result).toBe('start');
  });

  it('should handle overlapping patterns correctly', () => {
    const result = trimEnd('ababab', 'ab');

    expect(result).toBe('');
  });

  it('should handle non-overlapping but repeated patterns', () => {
    const result = trimEnd('test-abc-abc', '-abc');

    expect(result).toBe('test');
  });

  it('should not enter an infinite loop or change the string if the trim character is an empty string', () => {
    expect(() => trimEnd('hello', '')).toThrow();
  });

  it('should correctly trim trailing whitespace', () => {
    const result = trimEnd('some value  ', ' ');

    expect(result).toBe('some value');
  });

  it('should handle special characters and symbols', () => {
    const result = trimEnd('data$$$', '$$');

    expect(result).toBe('data$');
  });

  it('should handle a mix of characters where only the end is trimmed', () => {
    const result = trimEnd('path/to/file/', '/');

    expect(result).toBe('path/to/file');
  });
});

describe('getDaysAgo', () => {
  it('should return the date exactly 5 days ago', () => {
    const today = new Date('2023-10-10T00:00:00Z');
    const expectedDate = new Date('2023-10-05T00:00:00Z');

    const result = getDaysAgo(today, 5);

    expect(result.toISOString()).toBe(expectedDate.toISOString());
  });

  it('should return the date exactly 1 day ago', () => {
    const today = new Date('2023-10-10T00:00:00Z');
    const expectedDate = new Date('2023-10-09T00:00:00Z');

    const result = getDaysAgo(today, 1);

    expect(result.toISOString()).toBe(expectedDate.toISOString());
  });

  it('should handle a case where the input date is in the past', () => {
    const today = new Date('2023-10-10T00:00:00Z');
    const expectedDate = new Date('2022-10-13T00:00:00Z');

    const result = getDaysAgo(today, 362);

    expect(result.toISOString()).toBe(expectedDate.toISOString());
  });
});

describe('mapConcurrently', () => {
  it('should preserve result order even with varying delays', async () => {
    const items = [1, 2, 3, 4, 5];
    const delays = [30, 10, 25, 5, 15];

    const result = await mapConcurrently<number, number>({
      items,
      concurrencyLimit: 2,
      map: async x => {
        await wait(delays[x - 1]);
        return x * 10;
      },
    });

    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it('should not exceed the specified concurrency limit', async () => {
    const items = Array.from({length: 12}, (_, i) => i + 1);
    const concurrencyLimit = 3;
    let running = 0;
    let maxRunning = 0;

    await mapConcurrently<number, number>({
      items,
      concurrencyLimit,
      map: async x => {
        running++;
        if (running > maxRunning) maxRunning = running;
        // simulate work
        await wait(20);
        running--;
        return x;
      },
    });

    expect(maxRunning).toBeLessThanOrEqual(concurrencyLimit);
  });

  it('should work serially when concurrencyLimit = 1', async () => {
    const items = [1, 2, 3, 4];
    let running = 0;
    let maxRunning = 0;

    const result = await mapConcurrently<number, number>({
      items,
      concurrencyLimit: 1,
      map: async x => {
        running++;
        if (running > maxRunning) maxRunning = running;
        await wait(5);
        running--;
        return x * 2;
      },
    });

    expect(maxRunning).toBe(1);
    expect(result).toEqual([2, 4, 6, 8]);
  });

  it('should allow full parallelism when concurrencyLimit >= items.length', async () => {
    const items = [1, 2, 3, 4];
    const concurrencyLimit = 10;
    let running = 0;
    let maxRunning = 0;

    const result = await mapConcurrently<number, number>({
      items,
      concurrencyLimit,
      map: async x => {
        running++;
        if (running > maxRunning) maxRunning = running;
        await wait(15);
        running--;
        return x * x;
      },
    });

    expect(maxRunning).toBe(items.length);
    expect(result).toEqual([1, 4, 9, 16]);
  });

  it('should throw on first error (fail fast) and avoid starting many more tasks', async () => {
    const items = Array.from({length: 20}, (_, i) => i);
    const concurrencyLimit = 4;
    let started = 0;

    await expect(
      mapConcurrently<number, number>({
        items,
        concurrencyLimit,
        map: async x => {
          started++;
          // cause an early failure
          if (x === 2) {
            await wait(5);
            throw new Error('boom');
          }
          await wait(20);
          return x;
        },
      }),
    ).rejects.toThrow('boom');

    // We can’t guarantee an exact number, but we expect we didn’t kick off *all* 20.
    expect(started).toBeLessThan(items.length);
  });

  it('should return an empty array for empty input', async () => {
    const items: number[] = [];

    const result = await mapConcurrently<number, number>({
      items,
      concurrencyLimit: 3,
      map: async x => x,
    });

    expect(result).toEqual([]);
  });

  it('should throw if concurrencyLimit <= 0', async () => {
    const items = [1, 2, 3];

    await expect(
      mapConcurrently<number, number>({
        items,
        concurrencyLimit: 0,
        map: async x => x,
      }),
    ).rejects.toThrow(/greater than 0/i);

    await expect(
      mapConcurrently<number, number>({
        items,
        concurrencyLimit: -2,
        map: async x => x,
      }),
    ).rejects.toThrow(/greater than 0/i);
  });
});
