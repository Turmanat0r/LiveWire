import { useRegisterSW } from 'virtual:pwa-register/react';
import './UpdatePrompt.css';

/**
 * A new version has been downloaded in the background. Say so and let the
 * angler choose the moment, rather than reloading the page under somebody
 * halfway through filing a fish.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error: unknown) {
      console.error('The offline copy could not be set up', error);
    },
  });

  if (!needRefresh) return null;
  return (
    <div className="update-prompt" role="status">
      <p>A newer version of LiveWire is ready.</p>
      <div className="update-prompt__actions">
        <button
          type="button"
          className="update-prompt__go"
          onClick={() => {
            void updateServiceWorker(true);
          }}
        >
          Update now
        </button>
        <button
          type="button"
          className="update-prompt__later"
          onClick={() => {
            setNeedRefresh(false);
          }}
        >
          Later
        </button>
      </div>
    </div>
  );
}
