'use client';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {useState} from 'react';

export function ConfigList() {
  const trpc = useTRPC();
  const createConfig = useMutation(trpc.createConfig.mutationOptions());
  const {data} = useSuspenseQuery(trpc.hello.queryOptions({text: 'world'}));

  async function handleSaveConfig() {
    await createConfig.mutateAsync({
      config: {
        name: configName,
        value: configValue,
      },
    });
    setConfigName('');
    setConfigValue('');
  }

  const {data: health} = useSuspenseQuery(trpc.getHealth.queryOptions());
  const {
    data: {configs},
  } = useSuspenseQuery(trpc.getConfigList.queryOptions());

  const [configName, setConfigName] = useState<string>('');
  const [configValue, setConfigValue] = useState<string>('');

  return (
    <div>
      {data.greeting}
      <br />
      health: {JSON.stringify(health)}
      <br />
      configs: {configs.map(config => config.name).join(', ')}
      <br />
      <input type="text" value={configName} onChange={e => setConfigName(e.target.value)} placeholder="Config Name" />
      <input
        type="text"
        value={configValue}
        onChange={e => setConfigValue(e.target.value)}
        placeholder="Config Value"
      />
      <button
        onClick={async () => {
          await handleSaveConfig();
        }}
      >
        Save Config
      </button>
    </div>
  );
}
