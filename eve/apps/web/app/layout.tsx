import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { AuthDisplayPreHydrationHead } from "@/components/auth/auth-display";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const title = "Agent Blueprint";
const description = "Agent Blueprint's skills as a hosted agent, from idea to a reviewed pull request.";
const ogImage = {
  alt: title,
  height: 630,
  url: "/eve-chat-template-og.png",
  width: 1200,
};

function resolveMetadataBase() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL;

  if (!configuredUrl) {
    return new URL("http://localhost:3000");
  }

  return new URL(configuredUrl.startsWith("http") ? configuredUrl : `https://${configuredUrl}`);
}

// The site's two faces, from the one committed copy under public/gate-assets/fonts/ (the gate
// page loads the same files with @font-face): Archivo, variable in weight and width, for text,
// and Azeret Mono for labels and code. Both SIL Open Font License, the text beside the files.
const archivo = localFont({
  src: "../public/gate-assets/fonts/archivo-latin-var.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  style: "normal",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});

const azeretMono = localFont({
  src: "../public/gate-assets/fonts/azeret-mono-latin-var.woff2",
  variable: "--font-azeret",
  weight: "100 900",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title,
  description,
  applicationName: title,
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title,
    description,
    images: [ogImage],
    siteName: title,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [ogImage],
  },
};

// Light by default; the top bar's toggle stores a choice under "ab-theme" (ThemeToggle).
const themeScript = `
(() => {
  let theme = "light";
  try {
    const stored = window.localStorage.getItem("ab-theme");
    if (stored === "dark" || stored === "light") theme = stored;
  } catch {}
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  root.style.colorScheme = theme;
})();
`;

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html
      className={`${archivo.variable} ${azeretMono.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} id="theme-init" />
        <AuthDisplayPreHydrationHead />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
