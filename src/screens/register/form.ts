// The registration form's rules, checked on the phone so the angler hears
// about a missing field at once. The database checks every one again and has
// the final word (supabase/migrations: check_registrant, register_entry).
import type { Json } from '../../data/remote';
import { isCompletePhone, normalizePhone } from '../../domain/identity';

export interface RegistrationForm {
  readonly fullName: string;
  readonly phone: string;
  readonly emergencyName: string;
  readonly emergencyPhone: string;
  /** Unanswered until the angler picks one: this count goes to the state. */
  readonly resident: boolean | null;
  readonly division: 'solo' | 'team';
  readonly partnerName: string;
  readonly partnerPhone: string;
  readonly partnerResident: boolean | null;
  readonly bigFish: boolean;
  readonly handle: string;
  readonly partnerHandle: string;
}

export const EMPTY_FORM: RegistrationForm = {
  fullName: '',
  phone: '',
  emergencyName: '',
  emergencyPhone: '',
  resident: null,
  division: 'solo',
  partnerName: '',
  partnerPhone: '',
  partnerResident: null,
  bigFish: false,
  handle: '',
  partnerHandle: '',
};

/** A name as the database compares names (private.name_key): case and spacing ignored. */
function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The first thing wrong with the form, in words, or null when it can be sent. */
export function formProblem(f: RegistrationForm): string | null {
  if (!f.fullName.trim()) return 'Enter your first and last name.';
  if (!isCompletePhone(f.phone)) return 'Enter your phone number, area code included.';
  if (!f.emergencyName.trim() || !isCompletePhone(f.emergencyPhone)) {
    return 'Enter an emergency contact with a complete phone number.';
  }
  if (normalizePhone(f.emergencyPhone) === normalizePhone(f.phone)) {
    return 'Your emergency contact needs to be someone else, not your own number.';
  }
  if (f.resident === null)
    return 'Say whether you are a Montana resident. The state asks for the count.';
  if (f.division === 'team') {
    if (!f.partnerName.trim()) return 'Enter your partner’s first and last name.';
    if (nameKey(f.partnerName) === nameKey(f.fullName)) return 'A team needs two different people.';
    if (f.partnerPhone.trim()) {
      if (!isCompletePhone(f.partnerPhone)) {
        return 'Your partner’s phone number looks incomplete. Include the area code, or leave it blank.';
      }
      if (normalizePhone(f.partnerPhone) === normalizePhone(f.phone)) {
        return 'A team needs two different phone numbers, or leave your partner’s blank.';
      }
    }
    if (f.partnerResident === null) return 'Say whether your partner is a Montana resident.';
  }
  if (!f.handle.trim() || (f.division === 'team' && !f.partnerHandle.trim())) {
    return 'Every angler needs a handle. Roll one.';
  }
  return null;
}

export interface RegistrationIds {
  readonly entryId: string;
  readonly captainId: string;
  readonly partnerId: string;
}

/** register_entry's arguments. The ids are made once per form, so a retry files once. */
export function registrationArgs(
  f: RegistrationForm,
  ids: RegistrationIds,
  eventId: string,
): Record<string, Json> {
  const captain = {
    id: ids.captainId,
    fullName: f.fullName.trim(),
    phone: f.phone.trim(),
    handle: f.handle.trim(),
    bigFish: f.bigFish,
    resident: f.resident,
    emergencyName: f.emergencyName.trim(),
    emergencyPhone: f.emergencyPhone.trim(),
  };
  const args: Record<string, Json> = {
    p_entry_id: ids.entryId,
    p_event_id: eventId,
    p_division: f.division,
    p_captain: captain,
  };
  if (f.division === 'team') {
    args['p_partner'] = {
      id: ids.partnerId,
      fullName: f.partnerName.trim(),
      phone: f.partnerPhone.trim(),
      handle: f.partnerHandle.trim(),
      bigFish: f.bigFish,
      resident: f.partnerResident,
    };
  }
  return args;
}
