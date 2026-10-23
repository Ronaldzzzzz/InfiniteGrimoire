import type { Content } from '../engine/model';
import type { ActionResult } from '../game/api';
import { SYNTH_ERROR_MESSAGE, SYNTH_RETRY_MESSAGE, synthMessage } from './messages';

/** Runs a server action and turns its outcome into the line shown under the buttons. */
export async function runAction(
  run: () => Promise<ActionResult | null>,
  content: Content,
): Promise<{ result: ActionResult | null; message: string }> {
  try {
    const result = await run();
    return { result, message: result ? synthMessage(result, content) : SYNTH_RETRY_MESSAGE };
  } catch {
    return { result: null, message: SYNTH_ERROR_MESSAGE };
  }
}
