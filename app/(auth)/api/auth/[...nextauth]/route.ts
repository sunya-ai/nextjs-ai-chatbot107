import NextAuth from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
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

// Create a handler using NextAuth with the config
const handler = NextAuth(authOptions);

// Export GET and POST handlers for Next.js App Router
export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
