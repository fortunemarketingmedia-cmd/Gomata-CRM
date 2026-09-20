import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { User } from '../types';

type AuthValue = { user:User|null; loading:boolean; login:(email:string,password:string)=>Promise<void>; logout:()=>Promise<void>; refresh:()=>Promise<void> };
const AuthContext = createContext<AuthValue|null>(null);
export function AuthProvider({children}:{children:ReactNode}) {
  const [user,setUser]=useState<User|null>(null); const [loading,setLoading]=useState(true);
  const refresh=async()=>{try{const r=await api<{user:User}>('/auth/me');setUser(r.user)}catch{setUser(null)}finally{setLoading(false)}};
  useEffect(()=>{void refresh()},[]);
  const login=async(email:string,password:string)=>{const r=await api<{user:User}>('/auth/login',{method:'POST',body:JSON.stringify({email,password})});setUser(r.user)};
  const logout=async()=>{await api('/auth/logout',{method:'POST'});setUser(null)};
  return <AuthContext.Provider value={{user,loading,login,logout,refresh}}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>{const ctx=useContext(AuthContext);if(!ctx)throw new Error('AuthProvider missing');return ctx};

