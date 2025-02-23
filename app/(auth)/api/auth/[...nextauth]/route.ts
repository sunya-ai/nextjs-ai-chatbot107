import NextAuth from 'next-auth';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Define authOptions with CredentialsProvider
const authOptions = {
  providers: [
    {
      id: 'credentials',
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const [userRecord] = await db.select().from(user).where(eq(user.email, credentials.email));
        if (userRecord && userRecord.password === credentials.password) { // Note: In production, hash passwords with bcrypt-ts!
          return { id: userRecord.id, name: '', email: userRecord.email }; // Name field not in original schema, so default to empty
        }
        return null;
      },
    },
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/auth/signin' }, // Optional: Customize sign-in page if needed
};

// Export NextAuth handlers for App Router
export { default as GET } from 'next-auth';
export { default as POST } from 'next-auth';

// Configure NextAuth with authOptions for the Route
export const config = {
  api: {
    bodyParser: false,
  },
};
