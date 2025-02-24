import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { ArtifactKind } from '@/components/artifact';
import {
  deleteDocumentsByIdAfterTimestamp,
  getDocumentsById,
  saveDocument,
} from '@/lib/db/queries';
import { Document } from '@/lib/db/schema';

// Type for the request body in POST
interface DocumentRequestBody {
  content: string;
  title: string;
  kind: ArtifactKind;
}

// Type for the PATCH request body
interface PatchRequestBody {
  timestamp: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const session = await auth();

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const documents = await getDocumentsById({ id });

    if (!documents.length) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    const [document] = documents;

    if (document.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(documents, { status: 200 });
  } catch (error) {
    console.error('Failed to fetch documents:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: DocumentRequestBody = await request.json();
    const { content, title, kind } = body;

    if (!content || !title || !kind) {
      return NextResponse.json({ error: 'Missing required fields (content, title, kind)' }, { status: 400 });
    }

    const document = await saveDocument({
      id, // Optional ID for updates, handled by lib/db/queries.ts
      content,
      title,
      kind,
      userId: session.user.id,
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    console.error('Failed to save document:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const session = await auth();

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: PatchRequestBody = await request.json();
    const { timestamp } = body;

    if (!timestamp) {
      return NextResponse.json({ error: 'Missing timestamp' }, { status: 400 });
    }

    const documents = await getDocumentsById({ id });

    if (!documents.length) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    const [document] = documents;

    if (document.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await deleteDocumentsByIdAfterTimestamp({
      id,
      timestamp: new Date(timestamp),
    });

    return NextResponse.json({ message: 'Deleted' }, { status: 200 });
  } catch (error) {
    console.error('Failed to delete documents:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
