/// <reference types="vite/client" />

declare module 'qrcode/lib/browser.js' {
  import QRCode from 'qrcode';
  export default QRCode;
}

declare module 'lucide-react/dist/esm/icons/*.js' {
  import type { LucideIcon } from 'lucide-react';
  const icon: LucideIcon;
  export default icon;
}
