import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/auth" replace />} />
        <Route path="/auth" element={<div>Auth (todo)</div>} />
        <Route path="/home" element={<div>Home (todo)</div>} />
        <Route path="/host/:code" element={<div>Host meeting (todo)</div>} />
        <Route path="/join/:code" element={<div>Joined meeting (todo)</div>} />
        <Route path="*" element={<div>Not found</div>} />
      </Routes>
    </BrowserRouter>
  );
}