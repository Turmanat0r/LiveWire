import { describe, expect, it } from 'vitest';
import { EMPTY_FORM, formProblem, registrationArgs, type RegistrationForm } from './form';

const SOLO: RegistrationForm = {
  ...EMPTY_FORM,
  fullName: 'Daniel Turman',
  phone: '406-555-0100',
  emergencyName: 'Shore Contact',
  emergencyPhone: '(406) 555-0199',
  resident: true,
  handle: 'Salty Bedrock Perch',
};

const TEAM: RegistrationForm = {
  ...SOLO,
  division: 'team',
  partnerName: 'Pat Partner',
  partnerResident: false,
  partnerHandle: 'Soggy Granite Walleye',
};

const IDS = { entryId: 'e1', captainId: 'a1', partnerId: 'a2' };

describe('the registration form', () => {
  it('can be sent once everything is answered', () => {
    expect(formProblem(SOLO)).toBeNull();
    expect(formProblem(TEAM)).toBeNull();
  });

  it('says what is missing first', () => {
    expect(formProblem(EMPTY_FORM)).toBe('Enter your first and last name.');
    expect(formProblem({ ...SOLO, phone: '555-0100' })).toMatch(/area code/);
    expect(formProblem({ ...SOLO, emergencyPhone: '' })).toMatch(/emergency contact/);
    expect(formProblem({ ...SOLO, emergencyPhone: '4065550100' })).toMatch(/someone else/);
    expect(formProblem({ ...SOLO, resident: null })).toMatch(/Montana resident/);
  });

  it('asks a team for two different people', () => {
    expect(formProblem({ ...TEAM, partnerName: '' })).toMatch(/partner’s first and last name/);
    expect(formProblem({ ...TEAM, partnerName: '  daniel   TURMAN ' })).toBe(
      'A team needs two different people.',
    );
    expect(formProblem({ ...TEAM, partnerPhone: '406 555 0100' })).toMatch(/two different phone/);
    expect(formProblem({ ...TEAM, partnerPhone: '555' })).toMatch(/looks incomplete/);
    expect(formProblem({ ...TEAM, partnerResident: null })).toMatch(
      /partner is a Montana resident/,
    );
  });

  it('sends a solo entry with no partner, and a team with one', () => {
    const solo = registrationArgs(SOLO, IDS, 'event');
    expect(solo).toMatchObject({ p_entry_id: 'e1', p_event_id: 'event', p_division: 'solo' });
    expect(solo['p_captain']).toMatchObject({
      id: 'a1',
      fullName: 'Daniel Turman',
      resident: true,
    });
    expect(solo).not.toHaveProperty('p_partner');

    const team = registrationArgs(TEAM, IDS, 'event');
    expect(team['p_partner']).toMatchObject({ id: 'a2', fullName: 'Pat Partner', resident: false });
  });
});
