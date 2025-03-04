'use client';

import React, { memo, useEffect, useState, useMemo } from 'react';
import { HotTable } from '@handsontable/react';
import Handsontable from 'handsontable';
import { parse, unparse } from 'papaparse';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import axios from 'axios'; // For Clearbit API

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
  const [logoMap, setLogoMap] = useState<{ [key: string]: string | null }>({});

  useEffect(() => {
    setSpreadsheetData(parseData);
    // Load logos for companies in the first column
    const loadLogos = async () => {
      const companies = parseData.map(row => row[0]).filter(Boolean);
      const newLogos: { [key: string]: string | null } = {}; // Add proper type here
      for (const company of new Set(companies)) {
        if (!logoMap[company]) {
          try {
            const domain = company.toLowerCase().replace(' ', '') + '.com';
            const response = await axios.get(`https://logo.clearbit.com/${domain}`, { responseType: 'blob' });
            newLogos[company] = URL.createObjectURL(response.data);
          } catch (error) {
            console.error(`Failed to fetch logo for ${company}:`, error);
            newLogos[company] = null; // Default or no logo
          }
        }
      }
      setLogoMap(prev => ({ ...prev, ...newLogos }));
    };
    if (isCurrentVersion) loadLogos();
  }, [parseData, logoMap, isCurrentVersion]);

  // Use a more generic any[] type for changes to avoid type errors
  const handleSpreadsheetUpdate = (changes: any[] | null) => {
    if (changes && changes.length > 0) {
      // Create a deep copy of the current spreadsheet data
      const newData = JSON.parse(JSON.stringify(spreadsheetData));
      
      // Apply each change to the corresponding position in the data
      changes.forEach((change) => {
        if (Array.isArray(change) && change.length >= 4) {
          const [row, col, , newValue] = change;
          // Handle both numeric and string column identifiers
          const colIndex = typeof col === 'string' ? parseInt(col, 10) : col;
          // Update the value at the specified position
          if (newData[row]) {
            newData[row][colIndex] = newValue;
          }
        }
      });
      
      setSpreadsheetData(newData);
      const csvContent = unparse(newData);
      saveContent(csvContent, true); // Debounced save
    }
  };

  const columns = Array.from({ length: MIN_COLS }, (_, i) => ({
    data: i.toString(),
    title: String.fromCharCode(65 + i),
    width: 120,
    renderer: i === 0 ? logoRenderer : undefined, // Custom renderer for first column (logos)
  }));

  // Add proper typing for the renderer
  const logoRenderer = (
    instance: Handsontable, 
    td: HTMLTableCellElement, 
    row: number, 
    col: number, 
    prop: string | number, 
    value: any, 
    cellProperties: Handsontable.CellProperties
  ) => {
    if (col === 0 && value) { // First column for company names
      const logo = logoMap[value] || null;
      if (logo) {
        td.innerHTML = `<img src="${logo}" alt="${value} Logo" style="height: 20px; width: 20px;" /> ${value}`;
      } else {
        td.innerHTML = value; // Fallback to text
      }
    } else {
      td.innerHTML = value || '';
    }
    return td;
  };

  return (
    <div className={cn('p-4', theme === 'dark' ? 'dark:bg-muted' : 'bg-background')}>
      {status === 'streaming' && (
        <div className="text-muted-foreground mb-2">Streaming spreadsheet...</div>
      )}
      <HotTable
        data={spreadsheetData}
        columns={columns}
        colHeaders={true}
        rowHeaders={true}
        filters={true}
        dropdownMenu={true}
        manualColumnMove={true}
        licenseKey="non-commercial-and-evaluation"
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
