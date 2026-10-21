import type { ConnStatus } from '../game/sync';
import { SAVE_ERROR_MESSAGE } from './messages';

/** Non-blocking: the game keeps running underneath. */
export function SaveErrorBanner({ status }: { status: ConnStatus }) {
  if (status !== 'error') return null;
  return (
    <div className="save-error-banner" role="alert">
      {SAVE_ERROR_MESSAGE}
    </div>
  );
}
