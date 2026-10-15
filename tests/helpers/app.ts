import request from 'supertest';
import { createApp } from '@backend/app';

export const app = createApp();
export const api = () => request(app);
export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
