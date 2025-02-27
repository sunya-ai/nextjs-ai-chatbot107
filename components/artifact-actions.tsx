// components/artifact-actions.tsx
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import {
  artifactDefinitions,
  UIArtifact,
  ArtifactDefinition,
  ArtifactAction, // Import ArtifactAction explicitly
} from './artifact';
import { Dispatch, memo, SetStateAction, useState } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Import CustomMessage for type consistency (optional, if needed for metadata)
import { CustomMessage } from '@/lib/types';

interface ArtifactActionsProps<K extends string, M = any> {
  artifact: UIArtifact;
  handleVersionChange: (type: 'next' | 'prev' | 'toggle' | 'latest') => void;
  currentVersionIndex: number;
  isCurrentVersion: boolean;
  mode: 'edit' | 'diff';
  metadata: M;
  setMetadata: Dispatch<SetStateAction<M>>;
}

function PureArtifactActions<K extends string, M>({
  artifact,
  handleVersionChange,
  currentVersionIndex,
  isCurrentVersion,
  mode,
  metadata,
  setMetadata,
}: ArtifactActionsProps<K, M>) {
  const [isLoading, setIsLoading] = useState(false);

  const artifactDefinition = artifactDefinitions.find(
    (definition: ArtifactDefinition) => definition.kind === artifact.kind,
  );

  if (!artifactDefinition) {
    throw new Error('Artifact definition not found!');
  }

  const actionContext = {
    content: artifact.content,
    handleVersionChange,
    currentVersionIndex,
    isCurrentVersion,
    mode,
    metadata,
    setMetadata,
  };

  return (
    <div className="flex flex-row gap-1">
      {artifactDefinition.actions.map((action: ArtifactAction) => (
        <Tooltip key={action.description}>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              className={cn('h-fit dark:hover:bg-zinc-700', {
                'p-2': !action.label,
                'py-1.5 px-2': action.label,
              })}
              onClick={async () => {
                setIsLoading(true);
                try {
                  await Promise.resolve(action.onClick(actionContext));
                } catch (error) {
                  toast.error('Failed to execute action');
                } finally {
                  setIsLoading(false);
                }
              }}
              disabled={
                isLoading || artifact.status === 'streaming'
                  ? true
                  : action.isDisabled
                  ? action.isDisabled(actionContext)
                  : false
              }
            >
              {action.icon}
              {action.label}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{action.description}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export const ArtifactActions = memo(
  PureArtifactActions,
  (prevProps, nextProps) => {
    if (prevProps.artifact.status !== nextProps.artifact.status) return false;
    if (prevProps.currentVersionIndex !== nextProps.currentVersionIndex) return false;
    if (prevProps.isCurrentVersion !== nextProps.isCurrentVersion) return false;
    if (prevProps.artifact.content !== nextProps.artifact.content) return false;
    return true;
  },
);
