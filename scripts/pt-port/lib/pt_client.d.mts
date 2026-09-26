// Type declarations for pt_client.mjs (PT client path resolution).

export const PT_CLIENT_DEFAULT: string;
export const PT_SOURCE_DEFAULT: string;
export const PT_SERVER_DEFAULT: string;
export function ptClientDir(): string;
export function ptSourceDir(): string;
export function ptServerDir(): string;
export function ptClientPath(rel: string): string;
export function ptClientExists(rel: string): boolean;
export function ptServerPath(rel: string): string;
export function ptServerExists(rel: string): boolean;
