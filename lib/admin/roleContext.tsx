'use client';

import { createContext, useContext } from 'react';
import type { PanelRole } from '@/lib/admin/roles';

/** The signed-in user's panel role (set by AdminShell). UI hints only — the API and RLS decide. */
export const PanelRoleContext = createContext<PanelRole | null>(null);
export const usePanelRole = () => useContext(PanelRoleContext);
