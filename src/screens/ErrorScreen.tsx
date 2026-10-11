import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Page } from '../ui/Page';

/**
 * Anything that throws while drawing a screen lands here instead of leaving a
 * blank page. The message is meant to be screenshotted and sent to the
 * director, so it says what broke in plain words.
 */
export function ErrorScreen() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${String(error.status)} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';
  return (
    <Page title="Something went wrong">
      <p>LiveWire hit a problem drawing this screen. Anything you had already filed is safe.</p>
      <p>
        Take a screenshot of this and send it to the director:
        <br />
        <code>{detail}</code>
      </p>
      <p>
        <a href="/">Reload the app</a>
      </p>
    </Page>
  );
}
