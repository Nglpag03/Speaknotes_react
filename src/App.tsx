import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './pages/AppLayout';
import Auth from './pages/Auth';
import Home from './pages/Home';
import HostMeeting from './pages/HostMeeting';
import JoinedMeeting from './pages/JoinedMeeting';
import Meetings from './pages/Meetings';
import MeetingDetail from './pages/MeetingDetail';
import Settings from './pages/Settings';
import ResetPassword from './pages/ResetPassword';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/auth" replace />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/host/:code" element={<HostMeeting />} />
        <Route path="/join/:code" element={<JoinedMeeting />} />

        <Route element={<AppLayout />}>
          <Route path="/home" element={<Home />} />
          <Route path="/meetings" element={<Meetings />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/meeting/:code" element={<MeetingDetail />} />
        </Route>

        <Route path="*" element={<div>Not found</div>} />
      </Routes>
    </BrowserRouter>
  );
}