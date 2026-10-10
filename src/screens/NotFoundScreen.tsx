import { Link } from 'react-router';
import { Page } from '../ui/Page';

export function NotFoundScreen() {
  return (
    <Page title="Not found">
      <p>There is no screen at this address.</p>
      <p>
        <Link to="/">Go to the home screen</Link>
      </p>
    </Page>
  );
}
