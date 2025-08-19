'use client';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {useState} from 'react';
export function ClientGreeting() {
  const trpc = useTRPC();
  const putConfig = useMutation(trpc.putConfig.mutationOptions());
  const {data} = useSuspenseQuery(trpc.hello.queryOptions({text: 'world'}));

  async function handleSaveConfig() {
    await putConfig.mutateAsync({
      config: {
        name: configName,
        value: configValue,
        version: configVersion,
      },
    });
    setConfigName('');
    setConfigValue('');
    setConfigVersion(1);
  }

  const {data: health} = useSuspenseQuery(trpc.getHealth.queryOptions());
  const {
    data: {names: configNames},
  } = useSuspenseQuery(trpc.getConfigNames.queryOptions());

  const [configName, setConfigName] = useState<string>('');
  const [configValue, setConfigValue] = useState<string>('');
  const [configVersion, setConfigVersion] = useState<number>(1);

  return (
    <div>
      {data.greeting}
      <br />
      health: {health.status}
      <br />
      configs: {configNames.join(', ')}
      <br />
      <input type="text" value={configName} onChange={e => setConfigName(e.target.value)} placeholder="Config Name" />
      <input
        type="text"
        value={configValue}
        onChange={e => setConfigValue(e.target.value)}
        placeholder="Config Value"
      />
      <input
        type="number"
        value={configVersion}
        onChange={e => setConfigVersion(Number(e.target.value))}
        placeholder="Config Version"
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
