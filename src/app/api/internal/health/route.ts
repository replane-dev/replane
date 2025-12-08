import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {getEngineSingleton} from '@/engine/engine-singleton';
import {NextResponse} from 'next/server';

export async function GET() {
  const engine = await getEngineSingleton();
  const health = await engine.useCases.getHealth(GLOBAL_CONTEXT, {});
  return NextResponse.json(health);
}
