import { DataStreamWriter, tool } from 'ai';
import { Session } from 'next-auth';
import { z } from 'zod';
import { getDocumentById, saveDocument } from '@/lib/db/queries';
import { documentHandlersByArtifactKind } from '@/lib/artifacts/server';
import { ArtifactKind } from '@/components/artifact'; // Assuming this import is correct from previous fixes

interface UpdateDocumentProps {
  session: Session;
  dataStream: DataStreamWriter;
}

export const updateDocument = ({ session, dataStream }: UpdateDocumentProps) =>
  tool({
    description: 'Update a document with the given description.',
    parameters: z.object({
      id: z.string().describe('The ID of the document to update'),
      description: z
        .string()
        .describe('The description of changes that need to be made'),
    }),
    execute: async ({ id, description }) => {
      console.log('[tools] Updating document artifact, ID:', id, 'description:', description);
      const document = await getDocumentById({ id });

      if (!document) {
        console.error('[tools] Document not found for ID:', id);
        return {
          error: 'Document not found',
        };
      }

      console.log('[tools] Clearing document content for ID:', id);
      dataStream.writeData({
        type: 'clear',
        content: document.title,
      });

      const documentHandler = documentHandlersByArtifactKind.find(
        (documentHandlerByArtifactKind) =>
          documentHandlerByArtifactKind.kind === document.kind,
      );

      if (!documentHandler) {
        console.error('[tools] No document handler found for kind:', document.kind);
        throw new Error(`No document handler found for kind: ${document.kind}`);
      }

      try {
        console.log('[tools] Executing document handler for update, ID:', id);
        await documentHandler.onUpdateDocument({
          document,
          description,
          dataStream,
          session,
        });
        console.log('[tools] Document handler executed for update, ID:', id);
      } catch (error) {
        console.error('[tools] Error in document handler for update, ID:', id, error instanceof Error ? error.message : String(error));
        throw error;
      }

      console.log('[tools] Finishing document update for ID:', id);
      dataStream.writeData({ type: 'finish', content: '' });

      console.log('[tools] Saving updated document to DB, ID:', id);
      await saveDocument({
        id,
        title: document.title,
        kind: document.kind as ArtifactKind,
        content: '', // Clear or update based on handler
        userId: session.user?.id || '',
        fileUrl: document.fileUrl ?? undefined, // Convert null to undefined
      });

      return {
        id,
        title: document.title,
        kind: document.kind as ArtifactKind,
        content: 'The document has been updated successfully.',
      };
    },
  });
