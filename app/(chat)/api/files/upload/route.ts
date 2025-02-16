import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/app/(auth)/auth';

// 1. Allowed MIME types
const acceptedMimeTypes = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // xlsx
  'text/csv',
];

// 2. Zod validation (max 10 MB, must be accepted type)
const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 10 * 1024 * 1024, {
      message: 'File size must be <= 10MB',
    })
    .refine((file) => acceptedMimeTypes.includes(file.type), {
      message: `File type not allowed. Allowed: ${acceptedMimeTypes.join(', ')}`,
    }),
});

export async function POST(request: Request) {
  // Optional auth if you only allow logged-in users
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Must be multipart/form-data
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }

  // Validate with Zod
  const parsed = FileSchema.safeParse({ file });
  if (!parsed.success) {
    const errors = parsed.error.errors.map((e) => e.message).join('; ');
    return NextResponse.json({ error: errors }, { status: 400 });
  }

  try {
    // Convert the File to an ArrayBuffer for uploading
    const fileBuffer = await file.arrayBuffer();
    // We'll use the File's original name from the client
    const filename = file.name;

    // Upload to Vercel Blob (or S3, etc.)
    // The returned data typically has { url, size, uploaded }, no "name" property.
    const data = await put(filename, fileBuffer, { access: 'public' });

    return NextResponse.json({
      url: data.url,      // valid from put() result
      pathname: filename, // use the original client file name
      contentType: file.type,
    });
  } catch (err) {
    console.error('Upload failed:', err);
    return NextResponse.json({ error: 'Upload error' }, { status: 500 });
  }
}
