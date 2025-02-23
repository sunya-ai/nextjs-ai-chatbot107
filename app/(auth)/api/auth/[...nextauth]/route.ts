import NextAuth, { NextAuthOptions } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Define authOptions with proper NextAuthOptions type
const authOptions: NextAuthOptions = {
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

// Create a typed handler using NextAuth
const handler = NextAuth(authOptions);

// Export GET and POST handlers with proper typing for Next.js App Router
export async function GET(request: NextRequest): Promise<NextResponse> {
  return await handler(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return await handler(request);
}

// Optional: Add config for Route if needed (e.g., body parser)
export const config = {
  api: {
    bodyParser: false, // Ensure NextAuth handles request bodies correctly
  },
};
