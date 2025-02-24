// components/FinanceEditor.tsx
'use client';

import { useState, useEffect, useCallback, useTransition, useMemo } from 'react'; // Added useMemo
import { HotTable } from '@handsontable/react';
import { registerAllModules } from 'handsontable/registry';
import 'handsontable/dist/handsontable.full.min.css';
import { Button } from '@/components/ui/button';
import { useSession } from 'next-auth/react';
import { put } from '@vercel/blob';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { parse, unparse } from 'papaparse';
import { createDocumentAction, updateDocumentAction } from '@/app/(chat)/actions';
import { GeistSans } from 'geist/font/sans';

// Register all Handsontable modules
registerAllModules();

const font = GeistSans;

export default function FinanceEditor({
  initialData,
  documentId,
  onSave,
  onDataChange,
}: {
  initialData: any[];
  documentId?: string;
  onSave: (newDocumentId: string) => void;
  onDataChange: (data: any) => void;
}) {
  const { data: session } = useSession();
  const { theme } = useTheme();
  const [data, setData] = useState<any[][]>(initialData || [['Date', 'Deal Type', 'Amount'], ['2025-02-23', 'Solar M&A', 1000000]]);
  const [isSaving, setIsSaving] = useState(false);
  const [companyLogos, setCompanyLogos] = useState<Record<string, string>>({});
  const [_, startTransition] = useTransition();

  const parseData = useMemo(() => {
    if (!initialData || initialData.length === 0) return [['Date', 'Deal Type', 'Amount'], ['2025-02-23', 'Solar M&A', 1000000]];
    const result = parse<string[]>(unparse(initialData), { skipEmptyLines: true, header: true });
    return result.data.map(row => Object.values(row)) || [['Date', 'Deal Type', 'Amount'], ['2025-02-23', 'Solar M&A', 1000000]];
  }, [initialData]);

  useEffect(() => {
    setData(parseData);
    updateCompanyLogos(parseData);
  }, [parseData]);

  const updateCompanyLogos = useCallback(async (data: any[][]) => {
    const companies = [];
    for (let row of data.slice(1)) { // Skip headers
      if (row[1] && typeof row[1] === 'string') { // Assuming 'Deal Type' column contains company names
        companies.push(row[1].split(' ')[0]); // Extract first word as company name (e.g., "Solar" from "Solar M&A")
      }
    }
    const uniqueCompanies = [...new Set(companies.filter(Boolean))];
    if (uniqueCompanies.length > 0) {
      const logos = await inferDomains(uniqueCompanies); // Assume this exists in lib/ai/tools/infer-domains.ts
      setCompanyLogos(logos);
    }
  }, []);

  const columns = useMemo(() => [
    { data: 0, title: 'Date', width: 150 },
    { data: 1, title: 'Deal Type', width: 150, renderer: (instance: any, td: HTMLElement, row: number, col: number, prop: string | number, value: any) => {
      const company = value?.split(' ')[0];
      td.innerHTML = `<div class="flex items-center gap-2"><span>${value || ''}</span>${company && companyLogos[company] ? `<img src="${companyLogos[company]}" alt="${company}" class="h-4 w-4 rounded-full" />` : ''}</div>`;
      td.className = 'htLeft htMiddle text-zinc-900 dark:text-zinc-100';
      if (row === 0) td.className += ' htHeader';
    }},
    { data: 2, title: 'Amount', width: 150, type: 'numeric', numericFormat: { pattern: '$0,0.00' } },
  ], [companyLogos]);

  const handleDataChange = useCallback((changes: any, source: string) => {
    if (source === 'edit' || source === 'paste') {
      const newData = [...data];
      changes.forEach(([row, col, oldValue, newValue]: any) => {
        newData[row] = [...(newData[row] || [])];
        newData[row][col] = newValue;
      });
      setData(newData);
      onDataChange(newData);
      updateCompanyLogos(newData);
    }
  }, [data, onDataChange, updateCompanyLogos]);

  const saveSpreadsheet = async () => {
    if (!session?.user?.id) return;

    setIsSaving(true);
    try {
      const documentData = {
        title: `Finance Spreadsheet - ${new Date().toISOString().split('T')[0]}`,
        content: unparse(data),
        kind: 'finance' as const,
        userId: session.user.id,
      };

      let newDocumentId: string;
      if (documentId) { // Fixed: Removed invalid reference to currentVersionIndex
        await updateDocumentAction({ id: documentId, ...documentData });
        newDocumentId = documentId;
      } else {
        const result = await createDocumentAction(documentData);
        newDocumentId = result.id; // Adjust based on your Server Action return type
      }

      // Save to Vercel Blob
      const blobData = new Blob([unparse(data)], { type: 'text/csv' });
      const fileName = `${newDocumentId}.csv`;
      const { url } = await put(fileName, blobData, { access: 'private' });
      console.log('Spreadsheet saved to Vercel Blob:', url);

      onSave(newDocumentId);
    } catch (error) {
      console.error('Failed to save spreadsheet:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={cn('p-2', font.className)}>
      <HotTable
        data={data}
        columns={columns}
        colHeaders={true}
        rowHeaders={true}
        height={500}
        width="100%"
        licenseKey="non-commercial-and-evaluation" // Replace with commercial license for production
        afterChange={handleDataChange}
        className={cn('border border-zinc-200 dark:border-zinc-800 rounded-lg', theme === 'dark' ? 'bg-zinc-900 text-zinc-100' : 'bg-white text-zinc-900')}
      />
      <Button
        onClick={() => startTransition(saveSpreadsheet)}
        disabled={isSaving}
        className={cn('mt-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700', { 'opacity-50 cursor-not-allowed': isSaving })}
      >
        {isSaving ? 'Saving...' : 'Save Spreadsheet'}
      </Button>
    </div>
  );
}
