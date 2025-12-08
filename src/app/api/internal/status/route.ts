import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {getEngineSingleton} from '@/engine/engine-singleton';
import {NextResponse} from 'next/server';

export async function GET() {
  const engine = await getEngineSingleton();
  const status = await engine.useCases.getStatus(GLOBAL_CONTEXT, {});
  return NextResponse.json(status);
}
