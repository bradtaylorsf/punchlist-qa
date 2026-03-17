import type { Tester, TestRound } from '../../shared/types.js';

export interface StorageAdapter {
  initialize(): Promise<void>;
  close(): Promise<void>;
  getTesters(): Promise<Tester[]>;
  addTester(tester: Tester): Promise<void>;
  revokeTester(email: string): Promise<void>;
  saveTestRound(round: TestRound): Promise<void>;
  getTestRounds(): Promise<TestRound[]>;
}
