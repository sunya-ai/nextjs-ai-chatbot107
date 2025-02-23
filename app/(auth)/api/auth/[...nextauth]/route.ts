import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: { email: { label: 'Email', type: 'text' }, password: { label: 'Password', type: 'password' } },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const [userRecord] = await db.select().from(user).where(eq(user.email, credentials.email));
        if (userRecord && userRecord.password === credentials.password) { // Note: In production, hash passwords with bcrypt-ts!
          return { id: userRecord.id, name: '', email: userRecord.email }; // Name field not in original schema, so default to empty
        }
        return null;
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/auth/signin' }, // Optional: Customize sign-in page if needed
};

export default NextAuth(authOptions);
