import type { Metadata, Viewport } from "next";
import "./globals.css";
import { VybeBackendProvider } from "@/components/providers/VybeBackendProvider";
import { ThemeSync } from "@/components/providers/ThemeSync";

export const metadata: Metadata = {
  title: "VYBE — Meet. Match. VYBE.",
  description:
    "VYBE — secure teen video matching, discovery, friends, stories, groups, and private chat.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#05070c" },
    { media: "(prefers-color-scheme: light)", color: "#EEF7FF" },
  ],
};

const themeBoot = `(()=>{try{const saved=localStorage.getItem('vybe-theme')||'system';const light=saved==='light'||(saved==='system'&&matchMedia('(prefers-color-scheme: light)').matches);const theme=light?'light':'dark';document.documentElement.dataset.theme=theme;document.documentElement.dataset.themePreference=saved;document.documentElement.style.colorScheme=theme;}catch{document.documentElement.dataset.theme='dark';document.documentElement.style.colorScheme='dark';}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        <VybeBackendProvider>
          <ThemeSync>{children}</ThemeSync>
        </VybeBackendProvider>
      </body>
    </html>
  );
}
