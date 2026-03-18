import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { corsMiddleware } from '../../../src/server/middleware/cors.js';

function mockReq(method: string, origin?: string): Partial<Request> {
  return {
    method,
    headers: origin ? { origin } : {},
  };
}

function mockRes(): Partial<Response> & { headers: Record<string, string>; statusCode: number } {
  const res = {
    headers: {} as Record<string, string>,
    statusCode: 200,
    setHeader(key: string, value: string) {
      res.headers[key] = value;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    end: vi.fn(),
  };
  return res as unknown as Partial<Response> & {
    headers: Record<string, string>;
    statusCode: number;
  };
}

describe('corsMiddleware', () => {
  const middleware = corsMiddleware(['http://localhost:3000', 'https://example.com']);

  it('sets CORS headers for allowed origin', () => {
    const req = mockReq('POST', 'http://localhost:3000');
    const res = mockRes();
    const next = vi.fn();

    middleware(req as Request, res as unknown as Response, next as NextFunction);

    expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
    expect(res.headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    expect(res.headers['Access-Control-Allow-Headers']).toBe('Content-Type');
    expect(next).toHaveBeenCalled();
  });

  it('responds 204 for OPTIONS preflight with allowed origin', () => {
    const req = mockReq('OPTIONS', 'https://example.com');
    const res = mockRes();
    const next = vi.fn();

    middleware(req as Request, res as unknown as Response, next as NextFunction);

    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://example.com');
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects OPTIONS preflight with disallowed origin', () => {
    const req = mockReq('OPTIONS', 'http://evil.com');
    const res = mockRes();
    const next = vi.fn();

    middleware(req as Request, res as unknown as Response, next as NextFunction);

    expect(res.statusCode).toBe(403);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('does not set CORS headers for disallowed origin on non-OPTIONS', () => {
    const req = mockReq('POST', 'http://evil.com');
    const res = mockRes();
    const next = vi.fn();

    middleware(req as Request, res as unknown as Response, next as NextFunction);

    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('does not set CORS headers when no origin header', () => {
    const req = mockReq('POST');
    const res = mockRes();
    const next = vi.fn();

    middleware(req as Request, res as unknown as Response, next as NextFunction);

    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});
