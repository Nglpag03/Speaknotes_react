// NOTE: <StrictMode> intentionally omitted — it breaks Supabase Realtime
// channel reuse (see PROJECT notes).
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);