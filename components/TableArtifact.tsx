// components/TableArtifact.tsx
'use client';

import { HotTable } from '@handsontable/react';
import 'handsontable/dist/handsontable.full.min.css';

export const TableArtifact = ({ content }: { content: string }) => {
  let data;
  try {
    data = JSON.parse(content); // Expecting a 2D array like [["Date", "Type"], ["2025-01-01", "Solar"]]
    if (!Array.isArray(data) || !data.every(row => Array.isArray(row))) {
      throw new Error('Invalid table data');
    }
  } catch (error) {
    console.error('Error parsing table content:', error);
    return <div className="text-red-500">Error: Invalid table data</div>;
  }

  return (
    <div className="p-4">
      <HotTable
        data={data}
        colHeaders={true}
        rowHeaders={true}
        stretchH="all"
        height="auto"
        width="100%"
        licenseKey="non-commercial-and-evaluation" // For non-commercial use
        className="text-sm"
      />
    </div>
  );
};
