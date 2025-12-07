import {describe, expect, it} from 'vitest';
import {createSchemaFromValue, inferSchemaFromValue} from './json-schema-utils';

describe('inferSchemaFromValue', () => {
  describe('primitive types', () => {
    it('should infer schema for null', () => {
      const result = inferSchemaFromValue(null);
      expect(result).toEqual({type: 'null'});
    });

    it('should infer schema for string', () => {
      const result = inferSchemaFromValue('hello');
      expect(result).toEqual({type: 'string'});
    });

    it('should infer schema for empty string', () => {
      const result = inferSchemaFromValue('');
      expect(result).toEqual({type: 'string'});
    });

    it('should infer schema for integer', () => {
      const result = inferSchemaFromValue(42);
      expect(result).toEqual({type: 'integer'});
    });

    it('should infer schema for zero', () => {
      const result = inferSchemaFromValue(0);
      expect(result).toEqual({type: 'integer'});
    });

    it('should infer schema for negative integer', () => {
      const result = inferSchemaFromValue(-100);
      expect(result).toEqual({type: 'integer'});
    });

    it('should infer schema for float', () => {
      const result = inferSchemaFromValue(3.14);
      expect(result).toEqual({type: 'number'});
    });

    it('should infer schema for negative float', () => {
      const result = inferSchemaFromValue(-2.5);
      expect(result).toEqual({type: 'number'});
    });

    it('should infer schema for boolean true', () => {
      const result = inferSchemaFromValue(true);
      expect(result).toEqual({type: 'boolean'});
    });

    it('should infer schema for boolean false', () => {
      const result = inferSchemaFromValue(false);
      expect(result).toEqual({type: 'boolean'});
    });

    it('should handle undefined by returning empty schema', () => {
      const result = inferSchemaFromValue(undefined);
      expect(result).toEqual({});
    });
  });

  describe('arrays', () => {
    it('should infer schema for empty array', () => {
      const result = inferSchemaFromValue([]);
      expect(result).toEqual({
        type: 'array',
        items: {},
      });
    });

    it('should infer schema for array of strings', () => {
      const result = inferSchemaFromValue(['a', 'b', 'c']);
      expect(result).toEqual({
        type: 'array',
        items: {type: 'string'},
      });
    });

    it('should infer schema for array of integers', () => {
      const result = inferSchemaFromValue([1, 2, 3]);
      expect(result).toEqual({
        type: 'array',
        items: {type: 'integer'},
      });
    });

    it('should infer schema for array of floats', () => {
      const result = inferSchemaFromValue([1.5, 2.5, 3.5]);
      expect(result).toEqual({
        type: 'array',
        items: {type: 'number'},
      });
    });

    it('should infer schema for array of booleans', () => {
      const result = inferSchemaFromValue([true, false]);
      expect(result).toEqual({
        type: 'array',
        items: {type: 'boolean'},
      });
    });

    it('should infer schema from first item only', () => {
      // Mixed types - takes schema from first item
      const result = inferSchemaFromValue([42, 'hello', true]);
      expect(result).toEqual({
        type: 'array',
        items: {type: 'integer'},
      });
    });

    it('should infer schema for array of objects', () => {
      const result = inferSchemaFromValue([
        {name: 'John', age: 30},
        {name: 'Jane', age: 25},
      ]);
      expect(result).toEqual({
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: {type: 'string'},
            age: {type: 'integer'},
          },
          required: ['name', 'age'],
        },
      });
    });

    it('should infer schema for nested arrays', () => {
      const result = inferSchemaFromValue([
        [1, 2],
        [3, 4],
      ]);
      expect(result).toEqual({
        type: 'array',
        items: {
          type: 'array',
          items: {type: 'integer'},
        },
      });
    });
  });

  describe('objects', () => {
    it('should infer schema for empty object', () => {
      const result = inferSchemaFromValue({});
      expect(result).toEqual({
        type: 'object',
        properties: {},
      });
    });

    it('should infer schema for simple object', () => {
      const result = inferSchemaFromValue({
        name: 'John',
        age: 30,
      });
      expect(result).toEqual({
        type: 'object',
        properties: {
          name: {type: 'string'},
          age: {type: 'integer'},
        },
        required: ['name', 'age'],
      });
    });

    it('should infer schema for object with all primitive types', () => {
      const result = inferSchemaFromValue({
        str: 'hello',
        int: 42,
        float: 3.14,
        bool: true,
        nil: null,
      });
      expect(result).toEqual({
        type: 'object',
        properties: {
          str: {type: 'string'},
          int: {type: 'integer'},
          float: {type: 'number'},
          bool: {type: 'boolean'},
          nil: {type: 'null'},
        },
        required: ['str', 'int', 'float', 'bool', 'nil'],
      });
    });

    it('should infer schema for nested objects', () => {
      const result = inferSchemaFromValue({
        user: {
          name: 'John',
          contact: {
            email: 'john@example.com',
            phone: '123-456-7890',
          },
        },
      });
      expect(result).toEqual({
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: {type: 'string'},
              contact: {
                type: 'object',
                properties: {
                  email: {type: 'string'},
                  phone: {type: 'string'},
                },
                required: ['email', 'phone'],
              },
            },
            required: ['name', 'contact'],
          },
        },
        required: ['user'],
      });
    });

    it('should infer schema for object with array property', () => {
      const result = inferSchemaFromValue({
        name: 'John',
        tags: ['developer', 'javascript'],
      });
      expect(result).toEqual({
        type: 'object',
        properties: {
          name: {type: 'string'},
          tags: {
            type: 'array',
            items: {type: 'string'},
          },
        },
        required: ['name', 'tags'],
      });
    });
  });

  describe('complex nested structures', () => {
    it('should handle deeply nested structures', () => {
      const value = {
        name: 'John',
        age: 30,
        isActive: true,
        score: 98.5,
        tags: ['developer', 'javascript'],
        address: {
          city: 'New York',
          zip: 10001,
        },
        projects: [
          {
            name: 'Project A',
            completed: true,
          },
        ],
      };

      const result = inferSchemaFromValue(value);

      expect(result).toEqual({
        type: 'object',
        properties: {
          name: {type: 'string'},
          age: {type: 'integer'},
          isActive: {type: 'boolean'},
          score: {type: 'number'},
          tags: {
            type: 'array',
            items: {type: 'string'},
          },
          address: {
            type: 'object',
            properties: {
              city: {type: 'string'},
              zip: {type: 'integer'},
            },
            required: ['city', 'zip'],
          },
          projects: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: {type: 'string'},
                completed: {type: 'boolean'},
              },
              required: ['name', 'completed'],
            },
          },
        },
        required: ['name', 'age', 'isActive', 'score', 'tags', 'address', 'projects'],
      });
    });
  });
});

describe('createSchemaFromValue', () => {
  it('should create schema with default draft-07 $schema', () => {
    const result = createSchemaFromValue({name: 'John'});
    expect(result).toEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        name: {type: 'string'},
      },
      required: ['name'],
    });
  });

  it('should create schema with draft-04', () => {
    const result = createSchemaFromValue({name: 'John'}, 'draft-04');
    expect(result).toHaveProperty('$schema', 'http://json-schema.org/draft-04/schema#');
  });

  it('should create schema with draft-06', () => {
    const result = createSchemaFromValue({name: 'John'}, 'draft-06');
    expect(result).toHaveProperty('$schema', 'http://json-schema.org/draft-06/schema#');
  });

  it('should create schema with draft-07', () => {
    const result = createSchemaFromValue({name: 'John'}, 'draft-07');
    expect(result).toHaveProperty('$schema', 'http://json-schema.org/draft-07/schema#');
  });

  it('should create schema with 2019-09', () => {
    const result = createSchemaFromValue({name: 'John'}, '2019-09');
    expect(result).toHaveProperty('$schema', 'https://json-schema.org/draft/2019-09/schema');
  });

  it('should create schema with 2020-12', () => {
    const result = createSchemaFromValue({name: 'John'}, '2020-12');
    expect(result).toHaveProperty('$schema', 'https://json-schema.org/draft/2020-12/schema');
  });

  it('should include inferred schema properties', () => {
    const result = createSchemaFromValue({
      name: 'John',
      age: 30,
      tags: ['developer'],
    });

    expect(result).toMatchObject({
      type: 'object',
      properties: {
        name: {type: 'string'},
        age: {type: 'integer'},
        tags: {
          type: 'array',
          items: {type: 'string'},
        },
      },
      required: ['name', 'age', 'tags'],
    });
  });

  it('should handle primitive values', () => {
    expect(createSchemaFromValue('hello')).toEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'string',
    });

    expect(createSchemaFromValue(42)).toEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'integer',
    });

    expect(createSchemaFromValue(true)).toEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'boolean',
    });

    expect(createSchemaFromValue(null)).toEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'null',
    });
  });

  it('should handle arrays', () => {
    const result = createSchemaFromValue([1, 2, 3]);
    expect(result).toEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'array',
      items: {type: 'integer'},
    });
  });
});

