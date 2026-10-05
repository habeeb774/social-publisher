import type { Metadata, Viewport } from "next";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/shell.css";
import "./styles/features.css";
import "./comment-enhancements.css";

export const metadata: Metadata = { title: { default: "Social Publisher", template: "%s · Social Publisher" }, description: "منصة جدولة ونشر وإدارة المحتوى الاجتماعي", applicationName: "Social Publisher" };
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F7F8FA" }, { media: "(prefers-color-scheme: dark)", color: "#090B10" }] };

// Applies the saved theme before first paint to avoid a light/dark flash.
const themeScript = `try{var t=localStorage.getItem("sp-theme");document.documentElement.dataset.theme=(t==="dark"||t==="light"||t==="system")?t:"system";var d=localStorage.getItem("sp-density");if(d)document.documentElement.dataset.density=d}catch(e){document.documentElement.dataset.theme="system"}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl" data-theme="system" suppressHydrationWarning>
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;500;600;700&display=swap" />
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
    </head>
    <body>{children}</body>
  </html>;
}
