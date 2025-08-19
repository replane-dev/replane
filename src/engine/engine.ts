import {createGetConfigNamesUseCase} from './core/use-cases/get-config-names-use-case';
import {createGetHealthUseCase} from './core/use-cases/get-health-use-case';
import {createPutConfigUseCase} from './core/use-cases/put-config-use-case';
import {DynamoDBConfigStore} from './dynamodb-config-store';

export interface EngineOptions {}

export async function createEngine(options: EngineOptions) {
  const configStore = new DynamoDBConfigStore({
    region: 'us-east-1',
    tableName: 'configs',
    endpoint: 'http://localhost:8000',
    accessKeyId: 'fake',
    secretAccessKey: 'fake',
  });

  await configStore.createTableIfNotExists();

  const useCases = {
    getHealth: createGetHealthUseCase(),
    getConfigNames: createGetConfigNamesUseCase({
      configStore,
    }),
    putConfig: createPutConfigUseCase({
      configStore,
    }),
  };

  return {
    useCases,
  };
}

export type Engine = ReturnType<typeof createEngine>;
