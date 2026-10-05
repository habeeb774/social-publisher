import "./globals.css";
import "./content-ops.css";
import "./comments.css";
import "./comment-enhancements.css";
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ar" dir="rtl"><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap" /></head><body>{children}</body></html>; }
