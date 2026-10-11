import type { Failure } from '../data/remote';

/**
 * What to tell an angler when the server could not be asked, or said no.
 * `needsSignal` names the thing that could not wait for the outbox:
 * "Registering", "Bringing your entry over".
 */
export function failureText(failure: Failure, needsSignal: string): string {
  switch (failure.kind) {
    case 'offline':
      return `No signal. ${needsSignal} needs signal, so try again where you have it.`;
    case 'unavailable':
      return 'The tournament server is busy. Try again in a minute.';
    case 'signed-out':
      return 'This phone needs to sign in again. Try once more.';
    case 'refused':
      return failure.detail || 'The tournament server said no.';
  }
}
