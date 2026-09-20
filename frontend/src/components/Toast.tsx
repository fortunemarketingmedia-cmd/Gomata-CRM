import { createContext, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, X, AlertCircle, BellRing } from '../icons';

type ToastOptions={persistent?:boolean;key?:string;onDismiss?:()=>void};
type Toast={id:string;message:string;kind:'success'|'error'|'reminder';persistent:boolean;onDismiss?:()=>void};
type ToastContext={show:(message:string,kind?:'success'|'error'|'reminder',options?:ToastOptions)=>void};
const C=createContext<ToastContext|null>(null);

export function ToastProvider({children}:{children:ReactNode}){
  const[items,setItems]=useState<Toast[]>([]);
  const dismiss=(id:string,notify=true)=>setItems(current=>{const item=current.find(value=>value.id===id);if(notify)item?.onDismiss?.();return current.filter(value=>value.id!==id)});
  const show=(message:string,kind:'success'|'error'|'reminder'='success',options:ToastOptions={})=>{
    const id=options.key||`${Date.now()}-${Math.random()}`;
    setItems(current=>current.some(item=>item.id===id)?current:[...current,{id,message,kind,persistent:Boolean(options.persistent),onDismiss:options.onDismiss}]);
    if(!options.persistent)setTimeout(()=>dismiss(id,false),4000);
  };
  return <C.Provider value={{show}}>{children}<div className="toast-stack">{items.map(item=><div key={item.id} className={`toast ${item.kind}`}>{item.kind==='error'?<AlertCircle/>:item.kind==='reminder'?<BellRing/>:<CheckCircle2/>}<span>{item.message}</span><button onClick={()=>dismiss(item.id)} aria-label="Dismiss notification"><X size={16}/></button></div>)}</div></C.Provider>;
}

export const useToast=()=>useContext(C)!;
