import type { Request } from "express";

export function regenerateSession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => {
      if (error !== undefined) {
        reject(toError(error));
        return;
      }
      resolve();
    });
  });
}

export function saveSession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.save((error) => {
      if (error !== undefined) {
        reject(toError(error));
        return;
      }
      resolve();
    });
  });
}

export function destroySession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.destroy((error) => {
      if (error !== undefined) {
        reject(toError(error));
        return;
      }
      resolve();
    });
  });
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
