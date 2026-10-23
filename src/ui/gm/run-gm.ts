import type { Content } from '../../engine/model';
import { GmExpiredError, type ActionResult } from '../../game/api';
import type { GmContext } from '../GmWindow';
import { SYNTH_ERROR_MESSAGE, SYNTH_RETRY_MESSAGE, synthMessage } from '../messages';

/**
 * Runs a GM edit through `sync.action` and returns the line to show: `done` when the server applied it,
 * a retry hint when sync was busy or the save conflicted, null when the GM token expired (the window
 * then goes back to its login form).
 */
export async function runGmAction(
  ctx: GmContext,
  run: () => Promise<ActionResult | null>,
  done: string,
  content: Content,
): Promise<{ ok: boolean; message: string | null }> {
  try {
    const result = await run();
    if (!result) return { ok: false, message: SYNTH_RETRY_MESSAGE };
    if (result.kind === 'gm') return { ok: true, message: done };
    return { ok: false, message: synthMessage(result, content) };
  } catch (e) {
    if (e instanceof GmExpiredError) {
      ctx.onExpired();
      return { ok: false, message: null };
    }
    return { ok: false, message: SYNTH_ERROR_MESSAGE };
  }
}
