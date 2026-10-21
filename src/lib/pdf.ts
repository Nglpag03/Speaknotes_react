import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Meeting, Minutes, TranscriptRow } from './types';

export function exportMinutesPdf(meeting: Meeting, minutes: Minutes): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  let y = margin;

  doc.setFontSize(18);
  doc.text(minutes.content.title || meeting.title || 'Meeting minutes', margin, y);
  y += 24;

  doc.setFontSize(10);
  doc.text(`Meeting code: ${meeting.id}`, margin, y);
  y += 14;
  doc.text(`Generated: ${new Date(minutes.created_at).toLocaleString()}`, margin, y);
  y += 20;

  doc.setFontSize(12);
  doc.text('Summary', margin, y);
  y += 16;
  doc.setFontSize(10);
  const summaryLines = doc.splitTextToSize(minutes.content.summary, 515);
  doc.text(summaryLines, margin, y);
  y += summaryLines.length * 12 + 12;

  if (minutes.content.decisions.length) {
    doc.setFontSize(12);
    doc.text('Decisions', margin, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['#', 'Decision']],
      body: minutes.content.decisions.map((d, i) => [String(i + 1), d]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  }

  if (minutes.content.action_items.length) {
    doc.setFontSize(12);
    doc.text('Action items', margin, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Owner', 'Task', 'Due']],
      body: minutes.content.action_items.map((a) => [a.owner, a.task, a.due ?? '']),
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  }

  if (minutes.content.attendees.length) {
    doc.setFontSize(12);
    doc.text('Attendees', margin, y);
    y += 16;
    doc.setFontSize(10);
    doc.text(minutes.content.attendees.join(', '), margin, y);
  }

  doc.save(`minutes-${meeting.id}.pdf`);
}

export function exportTranscriptPdf(meeting: Meeting, rows: TranscriptRow[]): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;

  doc.setFontSize(18);
  doc.text(`Transcript — ${meeting.title ?? meeting.id}`, margin, margin);
  doc.setFontSize(10);
  doc.text(`Meeting code: ${meeting.id}`, margin, margin + 18);

  autoTable(doc, {
    startY: margin + 34,
    head: [['Time', 'Speaker', 'Text']],
    body: rows.map((r) => [
      new Date(r.created_at).toLocaleTimeString(),
      r.full_name,
      r.content,
    ]),
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellWidth: 'wrap' },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 100 },
      2: { cellWidth: 'auto' },
    },
  });

  doc.save(`transcript-${meeting.id}.pdf`);
}