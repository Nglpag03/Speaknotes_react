// src/components/FormalMinutes.tsx
import type { Meeting, Minutes } from '../lib/types'

export function FormalMinutes({ meeting, minutes }: { meeting: Meeting; minutes: Minutes }) {
  const c = minutes.content as any;

  return (
    <div style={{
      backgroundColor: '#ffffff',
      padding: '40px',
      borderRadius: '8px',
      border: '1px solid #e2e5e1',
      fontFamily: '"Times New Roman", Times, serif',
      color: '#000',
      maxWidth: '1000px',
      margin: '0 auto'
    }}>
      
      {/* HEADER */}
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <div style={{ fontSize: '14px', marginBottom: '4px' }}>Republic of the Philippines</div>
        <div style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'Georgia, serif', marginBottom: '4px' }}>
          Cagayan State University
        </div>
        <div style={{ fontSize: '16px', fontStyle: 'italic', marginBottom: '4px' }}>CARIG CAMPUS</div>
        <div style={{ fontSize: '12px' }}>Carig Sur, Tuguegarao City</div>
        <div style={{ fontSize: '12px', marginBottom: '15px' }}>Tel. No. (078) 304 - 0818</div>
        
        <div style={{ 
          fontSize: '16px', 
          fontWeight: 'bold', 
          textTransform: 'uppercase', 
          letterSpacing: '1px',
          borderTop: '2px solid #000',
          borderBottom: '2px solid #000',
          padding: '8px 0',
          display: 'inline-block',
          minWidth: '80%'
        }}>
          College of Information and Computing Sciences
        </div>
        
        <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '25px', marginBottom: '20px' }}>
          MINUTES OF THE MEETING
        </div>
      </div>

      {/* METADATA */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 10px 1fr' }}>
          <strong>Reference No.</strong><span>:</span><span>{meeting.id}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 10px 1fr' }}>
          <strong>Date</strong><span>:</span><span>{c.date || new Date(meeting.created_at).toLocaleDateString()}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 10px 1fr' }}>
          <strong>Venue</strong><span>:</span><span>{c.venue || 'N/A'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 10px 1fr' }}>
          <strong>Time Started</strong>
          <span>:</span>
          <span>
            {c.time_started && c.time_started !== 'N/A' 
              ? c.time_started 
              : new Date(meeting.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '130px 10px 1fr' }}>
          <strong>Time Ended</strong>
          <span>:</span>
          <span>
            {c.time_ended && c.time_ended !== 'N/A' 
              ? c.time_ended 
              : (meeting.ended_at 
                  ? new Date(meeting.ended_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) 
                  : 'N/A')}
          </span>
        </div>
      </div>

      {/* AGENDA */}
      <div style={{ display: 'grid', gridTemplateColumns: '130px 10px 1fr', fontSize: '14px', marginBottom: '20px' }}>
        <strong>Agenda</strong><span>:</span>
        <div>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {c.agenda?.map((item: string, i: number) => <li key={i}>{item}</li>)}
            {(!c.agenda || c.agenda.length === 0) && <li>No agenda recorded.</li>}
          </ul>
        </div>
      </div>

      {/* PRESENT */}
      <div style={{ display: 'grid', gridTemplateColumns: '130px 10px 1fr', fontSize: '14px', marginBottom: '30px' }}>
        <strong>Present</strong><span>:</span>
        <div>
          <ol style={{ margin: 0, paddingLeft: '20px' }}>
            {c.present?.map((person: string, i: number) => <li key={i}>{person}</li>)}
            {(!c.present || c.present.length === 0) && <li>No attendees recorded.</li>}
          </ol>
        </div>
      </div>

      {/* TABLE */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #000', padding: '8px', width: '12%', textAlign: 'center' }}>Agenda No.</th>
            <th style={{ border: '1px solid #000', padding: '8px', width: '35%', textAlign: 'center' }}>Activities/Issues/Concerns</th>
            <th style={{ border: '1px solid #000', padding: '8px', width: '20%', textAlign: 'center' }}>Raised by</th>
            <th style={{ border: '1px solid #000', padding: '8px', width: '33%', textAlign: 'center' }}>Answer to the Issue/Action to be taken</th>
          </tr>
        </thead>
        <tbody>
          {c.table_data?.map((row: any, i: number) => (
            <tr key={i}>
              <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>{row.agenda_no}</td>
              <td style={{ border: '1px solid #000', padding: '8px' }}>{row.activities}</td>
              <td style={{ border: '1px solid #000', padding: '8px' }}>{row.raised_by}</td>
              <td style={{ border: '1px solid #000', padding: '8px' }}>{row.action}</td>
            </tr>
          ))}
          {(!c.table_data || c.table_data.length === 0) && (
            <tr>
              <td colSpan={4} style={{ border: '1px solid #000', padding: '16px', textAlign: 'center', color: '#666' }}>
                No meeting items recorded.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}