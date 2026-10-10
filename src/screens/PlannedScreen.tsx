import { Link } from 'react-router';
import type { Screen } from '../app/screens';
import { MILESTONES } from '../app/milestones';
import { Card } from '../ui/Card';
import { Page } from '../ui/Page';

/** A screen whose address and place in the app exist, but whose stage has not been built. */
export function PlannedScreen({ screen }: { readonly screen: Screen }) {
  return (
    <Page title={screen.title}>
      <p>{screen.summary}</p>
      <Card tone="notice">
        <p>
          {screen.milestone
            ? `Arrives in stage ${screen.milestone}: ${MILESTONES[screen.milestone] ?? ''}.`
            : 'Not scheduled yet.'}
        </p>
        <p>
          <Link to="/">Back to every screen</Link>
        </p>
      </Card>
    </Page>
  );
}
