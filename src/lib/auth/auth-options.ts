import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { writeAudit } from "@/lib/audit/log";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { consumeLimit } from "@/lib/rate-limit/limiter";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLocaleLowerCase("en-US");
        const password = String(credentials?.password ?? "");
        const env = getEnv();
        const limit = await consumeLimit(`login:${email || "blank"}`, env.LOGIN_RATE_LIMIT, env.RATE_LIMIT_WINDOW_SECONDS);
        if (!limit.ok || !email || !password) return null;
        const user = await prisma.adminUser.findUnique({ where: { email } });
        const matches = await verifyPassword(password, user?.passwordHash ?? null);
        if (!user || !user.isActive || !matches) {
          await writeAudit({
            actorType: "ADMIN",
            actorId: user?.id,
            action: "auth.login_failed",
            entityType: "AdminUser",
            entityId: user?.id,
            result: "failure",
          });
          return null;
        }
        await writeAudit({
          actorType: "ADMIN",
          actorId: user.id,
          action: "auth.login",
          entityType: "AdminUser",
          entityId: user.id,
          result: "success",
        });
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? "");
        session.user.role = token.role as typeof session.user.role;
        session.user.email = session.user.email ?? String(token.email ?? "");
        session.user.name = session.user.name ?? "";
      }
      return session;
    },
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
