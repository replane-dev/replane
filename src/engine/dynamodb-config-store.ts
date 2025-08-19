import {
  ConditionalCheckFailedException,
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocument, type NativeAttributeValue} from '@aws-sdk/lib-dynamodb';
import {ConflictError, type Config, type ConfigStore, type ConfigStoreGetOptions} from './core/config-store';

export interface DynamoDBConfigStoreOptions {
  tableName: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class DynamoDBConfigStore implements ConfigStore {
  private readonly rawClient: DynamoDBClient;
  private readonly client: DynamoDBDocument;
  constructor(private readonly options: DynamoDBConfigStoreOptions) {
    const dynamoDBClient = new DynamoDBClient({
      region: options.region,
      endpoint: options.endpoint,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
    const documentClient = DynamoDBDocument.from(dynamoDBClient);

    this.rawClient = dynamoDBClient;
    this.client = documentClient;
  }

  async createTableIfNotExists() {
    const RETRIES_COUNT = 10;
    for (let attempt = 0; attempt <= RETRIES_COUNT; attempt++) {
      const result = await this.createTableIfNotExistsOnce();
      if (!result.needRetry) {
        return;
      }
    }

    throw new Error(
      `Failed to create DynamoDB table ${this.options.tableName} after ${RETRIES_COUNT} attempts. Please check your DynamoDB setup.`,
    );
  }

  private async createTableIfNotExistsOnce(): Promise<{needRetry: boolean}> {
    // check if exists
    const tableExists = await this.rawClient.send(new DescribeTableCommand({TableName: this.options.tableName})).then(
      () => true,
      error => {
        if (error.name === 'ResourceNotFoundException') {
          return false;
        }
        throw error;
      },
    );

    if (tableExists) {
      // check that table has the correct attributes
      const tableDescription = await this.rawClient.send(new DescribeTableCommand({TableName: this.options.tableName}));
      const attributeNames = tableDescription.Table?.AttributeDefinitions?.map(attr => attr.AttributeName) || [];
      if (!attributeNames.includes('name')) {
        throw new Error(
          `DynamoDB table ${this.options.tableName} exists but does not have the required 'name' attribute. Please recreate the table with the correct schema.`,
        );
      }

      return {needRetry: false};
    }

    try {
      await this.rawClient.send(
        new CreateTableCommand({
          TableName: this.options.tableName,
          KeySchema: [{AttributeName: 'name', KeyType: 'HASH'}],
          AttributeDefinitions: [{AttributeName: 'name', AttributeType: 'S'}],
          ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1,
          },
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'ResourceInUseException') {
        return {needRetry: true};
      }
      throw error;
    }

    return {needRetry: false};
  }

  async getAll(): Promise<Config[]> {
    const configs: Config[] = [];

    let lastEvaluatedKey: Record<string, NativeAttributeValue> | undefined;

    while (true) {
      const result = await this.client.scan({
        TableName: this.options.tableName,
        ExclusiveStartKey: lastEvaluatedKey,
      });

      lastEvaluatedKey = result.LastEvaluatedKey;

      const items = (result.Items ?? []) as Config[];
      configs.push(...items);
      if (lastEvaluatedKey === undefined) {
        break;
      }
    }

    return configs;
  }

  async get(name: string, options: ConfigStoreGetOptions = {consistent: true}): Promise<Config | undefined> {
    const result = await this.client.get({
      TableName: this.options.tableName,
      Key: {
        name,
      },
      ConsistentRead: options.consistent,
    });

    return result.Item as Config;
  }

  async put(config: Config): Promise<void> {
    try {
      await this.client.put({
        TableName: this.options.tableName,
        Item: config,
        ...getConcurrencyCondition(config.version),
      });
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new ConflictError(
          `Concurrency error while trying to update config ${config.name}: expected version ${config.version - 1}`,
          {cause: error},
        );
      }

      throw error;
    }
  }
}

function getConcurrencyCondition(nextVersion: number) {
  if (nextVersion === 1) {
    return {
      ConditionExpression: 'attribute_not_exists(#version)',
      ExpressionAttributeNames: {'#version': 'version'},
    };
  }

  return {
    ConditionExpression: '#version = :version',
    ExpressionAttributeNames: {'#version': 'version'},
    ExpressionAttributeValues: {':version': nextVersion - 1},
  };
}
