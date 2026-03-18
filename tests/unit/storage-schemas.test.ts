import { describe, it, expect } from 'vitest';
import {
  roundSchema,
  resultSchema,
  userSchema,
  createRoundInputSchema,
  updateRoundInputSchema,
  submitResultInputSchema,
  createUserInputSchema,
} from '../../src/shared/schemas.js';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';

describe('roundSchema', () => {
  const validRound = {
    id: validUuid,
    name: 'Sprint 1 QA',
    description: null,
    status: 'active',
    createdByEmail: 'alice@example.com',
    createdByName: 'Alice',
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
  };

  it('accepts a valid round', () => {
    expect(roundSchema.parse(validRound)).toEqual(validRound);
  });

  it('accepts a round with description and completedAt', () => {
    const round = { ...validRound, description: 'Desc', completedAt: '2026-01-02T00:00:00.000Z' };
    expect(roundSchema.parse(round)).toEqual(round);
  });

  it('rejects invalid status', () => {
    expect(() => roundSchema.parse({ ...validRound, status: 'pending' })).toThrow();
  });

  it('rejects invalid uuid', () => {
    expect(() => roundSchema.parse({ ...validRound, id: 'not-a-uuid' })).toThrow();
  });

  it('rejects invalid email', () => {
    expect(() => roundSchema.parse({ ...validRound, createdByEmail: 'bad' })).toThrow();
  });
});

describe('resultSchema', () => {
  const validResult = {
    id: validUuid,
    roundId: validUuid,
    testId: 'auth-001',
    status: 'pass',
    testerName: 'Bob',
    testerEmail: 'bob@example.com',
    description: null,
    severity: null,
    commitHash: null,
    issueUrl: null,
    issueNumber: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('accepts a valid result', () => {
    expect(resultSchema.parse(validResult)).toEqual(validResult);
  });

  it('accepts result with all optional fields populated', () => {
    const result = {
      ...validResult,
      description: 'Login failed',
      severity: 'blocker',
      commitHash: 'abc123',
      issueUrl: 'https://github.com/org/repo/issues/1',
      issueNumber: 1,
    };
    expect(resultSchema.parse(result)).toEqual(result);
  });

  it('rejects invalid status', () => {
    expect(() => resultSchema.parse({ ...validResult, status: 'unknown' })).toThrow();
  });

  it('rejects invalid severity', () => {
    expect(() => resultSchema.parse({ ...validResult, severity: 'critical' })).toThrow();
  });
});

describe('userSchema', () => {
  const validUser = {
    id: validUuid,
    email: 'alice@example.com',
    name: 'Alice',
    tokenHash: 'hash123',
    role: 'tester',
    invitedBy: 'admin@example.com',
    revoked: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('accepts a valid user', () => {
    expect(userSchema.parse(validUser)).toEqual(validUser);
  });

  it('accepts admin role', () => {
    expect(userSchema.parse({ ...validUser, role: 'admin' })).toEqual({ ...validUser, role: 'admin' });
  });

  it('rejects invalid role', () => {
    expect(() => userSchema.parse({ ...validUser, role: 'superadmin' })).toThrow();
  });

  it('rejects invalid email', () => {
    expect(() => userSchema.parse({ ...validUser, email: 'not-email' })).toThrow();
  });
});

describe('createRoundInputSchema', () => {
  it('accepts valid input', () => {
    const input = { name: 'Round 1', createdByEmail: 'a@b.com', createdByName: 'A' };
    expect(createRoundInputSchema.parse(input)).toEqual(input);
  });

  it('accepts optional description', () => {
    const input = { name: 'Round 1', description: 'Desc', createdByEmail: 'a@b.com', createdByName: 'A' };
    expect(createRoundInputSchema.parse(input)).toEqual(input);
  });

  it('rejects missing name', () => {
    expect(() => createRoundInputSchema.parse({ createdByEmail: 'a@b.com', createdByName: 'A' })).toThrow();
  });

  it('rejects empty name', () => {
    expect(() => createRoundInputSchema.parse({ name: '', createdByEmail: 'a@b.com', createdByName: 'A' })).toThrow();
  });
});

describe('updateRoundInputSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    expect(updateRoundInputSchema.parse({})).toEqual({});
  });

  it('accepts partial updates', () => {
    expect(updateRoundInputSchema.parse({ name: 'New name' })).toEqual({ name: 'New name' });
    expect(updateRoundInputSchema.parse({ status: 'completed' })).toEqual({ status: 'completed' });
  });

  it('rejects invalid status', () => {
    expect(() => updateRoundInputSchema.parse({ status: 'deleted' })).toThrow();
  });
});

describe('submitResultInputSchema', () => {
  it('accepts valid input', () => {
    const input = { testId: 'auth-001', status: 'pass', testerName: 'Bob', testerEmail: 'bob@b.com' };
    expect(submitResultInputSchema.parse(input)).toEqual(input);
  });

  it('rejects missing required fields', () => {
    expect(() => submitResultInputSchema.parse({ testId: 'auth-001' })).toThrow();
  });

  it('rejects empty testId', () => {
    expect(() => submitResultInputSchema.parse({ testId: '', status: 'pass', testerName: 'B', testerEmail: 'b@b.com' })).toThrow();
  });
});

describe('createUserInputSchema', () => {
  it('accepts valid input with default role', () => {
    const input = { email: 'a@b.com', name: 'A', tokenHash: 'hash', invitedBy: 'admin@b.com' };
    const parsed = createUserInputSchema.parse(input);
    expect(parsed.role).toBe('tester');
  });

  it('accepts explicit role', () => {
    const input = { email: 'a@b.com', name: 'A', tokenHash: 'hash', role: 'admin', invitedBy: 'admin@b.com' };
    expect(createUserInputSchema.parse(input).role).toBe('admin');
  });

  it('rejects missing tokenHash', () => {
    expect(() => createUserInputSchema.parse({ email: 'a@b.com', name: 'A', invitedBy: 'admin@b.com' })).toThrow();
  });
});
