import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const supabase = getSupabaseAdmin();

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const { email, password } = credentials;

        const { data: user, error } = await supabase
          .from("users")
          .select("*")
          .eq("email", email)
          .single();

        if (error || !user || user.password !== password) return null;

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
        };
      }
    })
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.email = token.email;
      session.user.role = token.role;
      return session;
    }
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  debug: true,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };