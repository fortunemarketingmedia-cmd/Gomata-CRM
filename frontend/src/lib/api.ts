export class ApiError extends Error { constructor(message:string, public status:number, public data:any) { super(message); } }

export async function api<T>(path:string, options:RequestInit = {}):Promise<T> {
  const response = await fetch(`/api${path}`, { ...options, credentials:'include', headers:{ 'Content-Type':'application/json', ...(options.headers || {}) } });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data?.error || 'Request failed', response.status, data);
  return data as T;
}

export const fmtDate = (value:string) => new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value.length===10?`${value}T00:00:00`:value));
export const fmtDateTime = (value:string) => new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
export const toLocalInput = (date = new Date()) => { const d = new Date(date.getTime()-date.getTimezoneOffset()*60000); return d.toISOString().slice(0,16); };

