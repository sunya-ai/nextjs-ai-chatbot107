import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/app/(auth)/auth';

// Import the AI SDK
import { streamText } from 'ai';
import { google } from '@ai-sdk/google';
import type { GoogleGenerativeAIProviderMetadata } from '@ai-sdk/google';

// 1. Create your Gemini model for analysis
const geminiAnalysisModel = google('models/gemini-2.0-flash', {
  useSearchGrounding: true,
});

/**
 * Allowed MIME types for docx, xlsx, csv, pdf, plus images
 */
const acceptedMimeTypes = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // xlsx
  'text/csv',                                                                // csv
];

/**
 * Zod validation:
 * - Max 10 MB
 * - Must be in acceptedMimeTypes
 */
const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 10 * 1024 * 1024, {
      message: 'File size should be less than 10MB',
    })
    .refine((file) => acceptedMimeTypes.includes(file.type), {
      message: `Unsupported file type. Allowed: ${acceptedMimeTypes.join(', ')}`,
    }),
});

export async function POST(request: Request) {
  // 1. Auth check
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Must be multipart/form-data
  if (request.body === null) {
    return new Response('Request body is empty', { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as Blob;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // 3. Validate file
    const validatedFile = FileSchema.safeParse({ file });
    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(', ');
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // 4. Convert Blob to Buffer/ArrayBuffer for storing and AI processing
    const filename = (formData.get('file') as File).name;
    const fileBuffer = await file.arrayBuffer();

    // 5. Store the file in Vercel Blob
    const data = await put(filename, fileBuffer, {
      access: 'public',
    });
    // e.g. data has { url, name, size, uploaded, etc. }

    // 6. (Optional) Pass the raw file data to Gemini for analysis
    //    This "analysis" might not be very meaningful unless you parse text from PDF/docx etc.
    //    But let's show how you'd pass the file buffer:

    const geminiResponse = await runGeminiAnalysis(fileBuffer, file.type);

    // 7. Return the result as JSON
    return NextResponse.json({
      ...data, // { url, name, size, etc. from the blob put() call }
      pathname: data.name,
      contentType: file.type,
      geminiAnalysis: geminiResponse, // The text from Gemini
    });
  } catch (error) {
    console.error('Upload/Gemini error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 },
    );
  }
}

/**
 * Calls the Gemini model with the raw file data if you want to attempt analysis.
 * In practice, for docx/pdfs, you'd want to parse or convert them to text first.
 */
async function runGeminiAnalysis(fileBuffer: ArrayBuffer, mimeType: string) {
  try {
    // Prepare "messageContent" with a "file" part
    // You might have some text-based user query too, but here's a minimal example:
    const messageContent = [
      {
        type: 'file',
        data: fileBuffer,   // raw bytes
        mimeType: mimeType, // e.g. 'application/pdf', 'image/png'
      },
    ];

    // We'll do a minimal system instruction. Modify as needed.
    const { text, providerMetadata } = await streamText({
      model: geminiAnalysisModel,
      system: 'Analyze this uploaded file content. Return any recognized text or summary if possible.',
      messages: [
        {
          role: 'user',
          content: messageContent,
        },
      ],
    });

    // Log search grounding metadata (if any)
    const meta = providerMetadata?.google as GoogleGenerativeAIProviderMetadata | undefined;
    if (meta?.groundingMetadata) {
      console.log('Gemini grounding:', JSON.stringify(meta.groundingMetadata, null, 2));
    }

    return text; // This is Gemini's "analysis" text
  } catch (error) {
    console.error('Gemini file analysis failed:', error);
    return '(Analysis failed or not supported)';
  }
}
