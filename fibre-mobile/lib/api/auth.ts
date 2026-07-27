import { apiFetch } from './client';
import type { LoginResponse, User } from '../utils/types';

// ── Auth API ──────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/api/users/login/', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register(
  email: string,
  password: string,
  full_name: string,
  role: 'ENGINEER' | 'SUBADMIN' = 'ENGINEER'
): Promise<User> {
  return apiFetch<User>('/api/users/', {
    method: 'POST',
    body: JSON.stringify({ email, password, full_name, role }),
  });
}

export async function getEngineers(): Promise<User[]> {
  return apiFetch<User[]>('/api/users/engineers/');
}

export async function removeUser(userId: string): Promise<void> {
  return apiFetch(`/api/users/${userId}/`, { method: 'DELETE' });
}
