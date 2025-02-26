'use client';

import React, { memo, useEffect, useState } from 'react';
import { HotTable } from '@handsontable/react';
import Handsontable from 'handsontable';
import { parse, unparse } from 'papaparse';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

type SheetEditorProps = {
  content: string;
  saveContent: (content: string, isCurrentVersion: boolean) => void;
  status: string;
  isCurrentVersion: boolean;
  currentVersionIndex: number;
};

const MIN_ROWS = 50;
const MIN_COLS = 26;

const PureSpreadsheetEditor = ({
  content,
  saveContent,
  status,
  isCurrentVersion,
}: SheetEditorProps) => {
  const { theme } = useTheme();

  const parseData = useMemo(() => {
    if (!content) return Array(MIN_ROWS).fill(Array(MIN_COLS).fill(''));
    const result = parse<string[]>(content, { skipEmptyLines: true });

    const paddedData = result.data.map((row) => {
      const paddedRow = [...row];
      while (paddedRow.length < MIN_COLS) {
        paddedRow.push('');
      }
      return paddedRow;
    });

    while (paddedData.length < MIN_ROWS) {
      paddedData.push(Array(MIN_COLS).fill(''));
    }

    return paddedData;
  }, [content]);

  const [spreadsheetData, setSpreadsheetData] = useState<any[][]>(parseData);

  useEffect(() => {
    setSpreadsheetData(parseData);
  }, [parseData]);

  const handleSpreadsheetUpdate = (changes: any) => {
    if (changes) {
      const newData = changes.map(c => c[3]); // Extract new values
      setSpreadsheetData(newData);
      const csvContent = unparse(newData);
      saveContent(csvContent, true); // Debounced save
    }
  };

  const columns = Array.from({ length: MIN_COLS }, (_, i) => ({
    data: i.toString(),
    title: String.fromCharCode(65 + i),
    width: 120,
  }));

  return (
    <div className={cn('p-4', theme === 'dark' ? 'dark:bg-muted' : 'bg-background')}>
      {status === 'streaming' && (
        <div className="text-muted-foreground mb-2">Streaming spreadsheet...</div>
      )}
      <HotTable
        data={spreadsheetData}
        colHeaders={true}
        rowHeaders={true}
        filters={true}
        dropdownMenu={true}
        manualColumnSort={true}
        formulas={true}
        licenseKey="non-commercial-and-evaluation" // Use your license or non-commercial key
        height={400}
        width="100%"
        afterChange={(changes, source) => {
          if (source === 'edit' && isCurrentVersion) {
            handleSpreadsheetUpdate(changes);
          }
        }}
        className={cn('border dark:border-zinc-700 border-zinc-200 rounded-lg', {
          'bg-muted-foreground/20 animate-pulse': !content && status !== 'streaming',
        })}
      />
    </div>
  );
};

function areEqual(prevProps: SheetEditorProps, nextProps: SheetEditorProps) {
  return (
    prevProps.currentVersionIndex === nextProps.currentVersionIndex &&
    prevProps.isCurrentVersion === nextProps.isCurrentVersion &&
    !(prevProps.status === 'streaming' && nextProps.status === 'streaming') &&
    prevProps.content === nextProps.content &&
    prevProps.saveContent === nextProps.saveContent
  );
}

export const SpreadsheetEditor = memo(PureSpreadsheetEditor, areEqual);
