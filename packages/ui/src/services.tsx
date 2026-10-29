import type { MusicSource, Storage } from '@breeze/core';
import { createContext, type ReactNode, useContext } from 'react';

export interface Services {
  source: MusicSource;
  storage: Storage;
}

const ServicesCtx = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesCtx.Provider value={services}>{children}</ServicesCtx.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesCtx);
  if (!services) throw new Error('useServices must be used inside <ServicesProvider>');
  return services;
}
