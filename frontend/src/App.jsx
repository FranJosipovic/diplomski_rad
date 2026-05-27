import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import KontrolaSesije from './pages/KontrolaSesije.jsx';
import PovijestSesija from './pages/PovijestSesija.jsx';
import UsporedbaSeija from './pages/UsporedbaSeija.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sesija" element={<KontrolaSesije />} />
          <Route path="/povijest" element={<PovijestSesija />} />
          <Route path="/usporedba" element={<UsporedbaSeija />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
