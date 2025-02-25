// components/ChartArtifact.tsx
'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

export const ChartArtifact = ({ content }: { content: string }) => {
  let data;
  try {
    data = JSON.parse(content); // Expecting [{x: "2025-01-01", y: 100}, ...]
    if (!Array.isArray(data) || !data.every(item => 'x' in item && 'y' in item)) {
      throw new Error('Invalid chart data');
    }
  } catch (error) {
    console.error('Error parsing chart content:', error);
    return <div className="text-red-500">Error: Invalid chart data</div>;
  }

  return (
    <div className="p-4">
      <LineChart width={500} height={300} data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="x" stroke="#333" />
        <YAxis stroke="#333" />
        <Tooltip />
        <Line type="monotone" dataKey="y" stroke="#8884d8" />
      </LineChart>
    </div>
  );
};
