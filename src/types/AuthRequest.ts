import { Request } from "express";

export interface JwtUserPayload {
  discordId: string;
  username: string;
  role?: string;
}

export interface AuthRequest extends Request {
  user?: JwtUserPayload;
}