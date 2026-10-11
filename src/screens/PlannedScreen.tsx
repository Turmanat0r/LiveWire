import type { Screen } from '../app/screens';
import { MILESTONES } from '../app/milestones';
import { Page } from '../ui/Page';

/** A screen whose address and place in the app exist, but whose stage has not been built. */
export function PlannedScreen({ screen }: { readonly screen: Screen }) {
  return (
    <Page title={screen.title}>
      <p>{screen.summary}</p>
      <p>
        {screen.milestone
          ? `Arrives in stage ${String(screen.milestone)}: ${MILESTONES[screen.milestone] ?? ''}.`
          : 'Not scheduled yet.'}
      </p>
    </Page>
  );
}
