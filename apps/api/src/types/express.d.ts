declare global {
  namespace Express {
    interface Request {
      requestId: string;
      currentUser?: import("@novamall/shared").AuthUser;
    }
  }
}

export {};
