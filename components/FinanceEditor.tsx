'use client';

import { useState, useEffect, useCallback } from 'react';
import { HotTable } from '@handsontable/react';
import { registerAllModules } from 'handsontable/registry';
import 'handsontable/dist/handsontable.full.min.css';
import { Button } from '@/components/ui/button';
import { useSession } from 'next-auth/react';
import { put } from '@vercel/blob';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { inferDomains } from '@/lib/ai/tools/infer-domains';
import { createDocument, updateDocument } from '@/lib/db/queries';
import { GeistSans } from 'geist/font/sans';

// Register all Handsontable modules
registerAllModules();

const font = GeistSans;

interface FinanceEditorProps {
  initialData: any;
  documentId: string | null;
  onSave: (id: string) => void;
  onDataChange: (data: any) => void;
}

export default function FinanceEditor({ initialData, documentId, onSave, onDataChange }: FinanceEditorProps) {
  const { data: session } = useSession();
  const { theme } = useTheme();
  const [data, setData] = useState<any[][]>(initialData || [['Date', 'Deal Type', 'Amount'], ['2025-02-23', 'Solar M&A', 1000000]]);
  const [isSaving, setIsSaving] = useState(false);
  const [companyLogos, setCompanyLogos] = useState<Record<string, string>>({});

  const handleChange = useCallback((changes: any, source: string) => {
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
  }, [data, onDataChange]);

  const updateCompanyLogos = async (data: any[][]) => {
    const companies = [];
    for (let row of data.slice(1)) { // Skip headers
      if (row[1] && typeof row[1] === 'string') { // Assuming 'Deal Type' column contains company names
        companies.push(row[1].split(' ')[0]); // Extract first word as company name (e.g., "Solar" from "Solar M&A")
      }
    }
    const uniqueCompanies = [...new Set(companies.filter(Boolean))];
    if (uniqueCompanies.length > 0) {
      const logos = await inferDomains(uniqueCompanies);
      setCompanyLogos(logos);
    }
  };

  useEffect(() => {
    setData(initialData || [['Date', 'Deal Type', 'Amount'], ['2025-02-23', 'Solar M&A', 1000000]]);
    if (initialData) {
      updateCompanyLogos(initialData);
    }
  }, [initialData]);

  const saveSpreadsheet = async () => {
    if (!session?.user?.id) return;

    setIsSaving(true);
    try {
      const documentData = {
        title: `Energy Spreadsheet - ${new Date().toISOString().split('T')[0]}`,
        content: JSON.stringify(data),
        kind: 'sheet' as const,
        userId: session.user.id,
      };

      let newDocumentId: string;
      if (documentId) {
        await updateDocument({ id: documentId, ...documentData });
        newDocumentId = documentId;
      } else {
        const result = await createDocument(documentData);
        newDocumentId = result[0].id;
      }

      // Optional: Upload to Vercel Blob for file storage
      const blobData = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const fileName = `${newDocumentId}.json`;
      const { url } = await put(fileName, blobData, { access: 'private' });
      console.log('Spreadsheet saved to Vercel Blob:', url);

      onSave(newDocumentId);
    } catch (error) {
      console.error('Failed to save spreadsheet:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const renderCell = (row: number, col: number, prop: string | number, value: any, cellProperties: any) => {
    if (row === 0) { // Headers
      return { className: 'htCenter htMiddle font-bold text-zinc-900 dark:text-zinc-100' };
    }
    if (col === 1 && value && typeof value === 'string' && companyLogos[value.split(' ')[0]]) { // Deal Type column with logos
      cellProperties.renderer = (instance: any, td: HTMLElement, row: number, col: number, prop: string | number, value: any) => {
        td.innerHTML = `<div class="flex items-center gap-2"><span>${value}</span><img src="${companyLogos[value.split(' ')[0]]}" alt="${value}" class="h-4 w-4 rounded-full" /></div>`;
        td.className = 'htLeft htMiddle text-zinc-900 dark:text-zinc-100';
      };
    } else {
      cellProperties.className = 'htLeft htMiddle text-zinc-900 dark:text-zinc-100';
    }
    return cellProperties;
  };

  return (
    <div className={cn('p-2', font.className)}>
      <HotTable
        data={data}
        colHeaders={true}
        rowHeaders={true}
        height={400}
        width="100%"
        licenseKey="non-commercial-and-evaluation" // Replace with commercial license for production
        afterChange={handleChange}
        cells={(row, col, prop) => renderCell(row, col, prop, data[row]?.[col], {})}
        className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900"
      />
      <Button
        onClick={saveSpreadsheet}
        disabled={isSaving}
        className="mt-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700"
      >
        {isSaving ? 'Saving...' : 'Save Spreadsheet'}
      </Button>
    </div>
  );
}
