import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Meeting, Minutes, TranscriptRow } from './types';

export function exportMinutesPdf(meeting: Meeting, minutes: Minutes): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 50;
  let y = margin;

  // --- HEADER SECTION ---
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  doc.text('Republic of the Philippines', pageWidth / 2, y, { align: 'center' });
  y += 16;

  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text('Cagayan State University', pageWidth / 2, y, { align: 'center' });
  y += 18;

  doc.setFont('times', 'italic');
  doc.setFontSize(13);
  doc.text('CARIG CAMPUS', pageWidth / 2, y, { align: 'center' });
  y += 14;

  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  doc.text('Carig Sur, Tuguegarao City', pageWidth / 2, y, { align: 'center' });
  y += 12;
  doc.text('Tel. No. (078) 304 - 0818', pageWidth / 2, y, { align: 'center' });
  y += 20;

  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.text('COLLEGE OF INFORMATION AND COMPUTING SCIENCES', pageWidth / 2, y, { align: 'center' });
  y += 30;

  // Divider line
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;

  doc.setFontSize(12);
  doc.text('MINUTES OF THE MEETING', pageWidth / 2, y, { align: 'center' });
  y += 28;

  // --- MEETING DETAILS SECTION ---
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  
  const startX = margin + 10;
  const colonX = margin + 100;
  const valueX = margin + 115;
  
  const content = minutes.content as any; // Cast to any if your types haven't been updated yet

  doc.setFont('times', 'bold');
  doc.text('Reference No.', startX, y);
  doc.setFont('times', 'normal');
  doc.text(':', colonX, y);
  doc.text(content.reference_no || meeting.id, valueX, y);
  y += 16;

  doc.setFont('times', 'bold');
  doc.text('Date', startX, y);
  doc.setFont('times', 'normal');
  doc.text(':', colonX, y);
  doc.text(content.date || new Date(meeting.created_at).toLocaleDateString(), valueX, y);
  y += 16;

  doc.setFont('times', 'bold');
  doc.text('Venue', startX, y);
  doc.setFont('times', 'normal');
  doc.text(':', colonX, y);
  doc.text(content.venue || 'N/A', valueX, y);
  y += 16;

  doc.setFont('times', 'bold');
  doc.text('Time Started', startX, y);
  doc.setFont('times', 'normal');
  doc.text(':', colonX, y);
  doc.text(content.time_started || 'N/A', valueX, y);
  y += 16;

  doc.setFont('times', 'bold');
  doc.text('Time Ended', startX, y);
  doc.setFont('times', 'normal');
  doc.text(':', colonX, y);
  doc.text(content.time_ended || 'N/A', valueX, y);
  y += 24;

  // Agenda
  doc.setFont('times', 'bold');
  doc.text('Agenda', startX, y);
  doc.setFont('times', 'normal');
  doc.text(':', colonX, y);
  const agendaStartX = valueX;
  if (content.agenda && content.agenda.length > 0) {
    content.agenda.forEach((item: string, index: number) => {
      const bullet = `\u2022 ${item}`;
      const lines = doc.splitTextToSize(bullet, pageWidth - margin - valueX);
      doc.text(lines, index === 0 ? agendaStartX : agendaStartX, y);
      y += lines.length * 14;
    });
  } else {
    doc.text('No agenda recorded.', valueX, y);
    y += 16;
  }
  y += 8;

  // Present
  doc.setFont('times', 'bold');
  doc.text('Present', startX, y);
  doc.setFont('times', 'normal');
  doc.text(':', colonX, y);
  if (content.present && content.present.length > 0) {
    content.present.forEach((item: string, index: number) => {
      doc.text(`${index + 1}. ${item}`, valueX, y);
      y += 14;
    });
  } else {
    doc.text('No attendees recorded.', valueX, y);
    y += 16;
  }
  y += 16;

  // --- TABLE SECTION ---
  // If we are too close to the bottom, add a new page
  if (y > pageHeight - 150) {
    doc.addPage();
    y = margin;
  }

  const tableBody = (content.table_data || []).map((row: any) => [
    row.agenda_no || '',
    row.activities || '',
    row.raised_by || '',
    row.action || ''
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Agenda No.', 'Activities/Issues/Concerns', 'Raised by', 'Answer to the Issue/Action to be taken']],
    body: tableBody,
    theme: 'grid',
    styles: {
      font: 'times',
      fontSize: 9,
      cellPadding: 6,
      lineColor: [0, 0, 0],
      lineWidth: 1,
    },
    headStyles: {
      fillColor: [255, 255, 255], // White background
      textColor: [0, 0, 0],       // Black text
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 160 },
      2: { cellWidth: 110 },
      3: { cellWidth: 'auto' },
    },
    margin: { left: margin, right: margin },
  });

  // Save the PDF
  doc.save(`minutes-${meeting.id}.pdf`);
}

export function exportTranscriptPdf(meeting: Meeting, rows: TranscriptRow[]): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;

  doc.setFont('times', 'normal');
  doc.setFontSize(18);
  doc.text(`Transcript — ${meeting.title ?? meeting.id}`, margin, margin);
  
  doc.setFontSize(10);
  doc.text(`Meeting code: ${meeting.id}`, margin, margin + 18);

  autoTable(doc, {
    startY: margin + 34,
    head: [['Time', 'Speaker', 'Text']],
    body: rows.map((r) => [
      new Date(r.created_at).toLocaleTimeString(),
      r.full_name || 'Guest',
      r.content,
    ]),
    margin: { left: margin, right: margin },
    styles: { font: 'times', fontSize: 9, cellWidth: 'wrap' },
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 100 },
      2: { cellWidth: 'auto' },
    },
  });

  doc.save(`transcript-${meeting.id}.pdf`);
}