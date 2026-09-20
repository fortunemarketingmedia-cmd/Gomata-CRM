import type { LeadType } from '../types';
export function StatusBadge({type}:{type:LeadType}) { return <span className={`status-badge ${type.toLowerCase()}`}><i/>{type[0]+type.slice(1).toLowerCase()}</span> }

