import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { I18nProvider } from "@/lib/i18n";
import { TelegramWebAppProvider } from "@/components/telegram-webapp";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Telegram Bot Admin · Scheduled Messages",
  description: "Admin panel for managing a Telegram broadcast bot — admins, channels, broadcasts and scheduled messages.",
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <I18nProvider>
            <TelegramWebAppProvider>
              {children}
            </TelegramWebAppProvider>
            <Toaster />
            <Sonner
              position="top-right"
              richColors
              closeButton
              toastOptions={{
                style: {
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  boxShadow: "0 10px 30px -10px rgba(16, 185, 129, 0.15), 0 4px 12px -4px rgba(0,0,0,0.08)",
                },
                classNames: {
                  toast: "group toast_fancy",
                },
              }}
            />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
