import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ScrollToTop } from '@/components/ScrollToTop'
import LandingPage from '@/pages/LandingPage'
import ComoFuncionaPage from '@/pages/ComoFuncionaPage'
import IntegracionesPage from '@/pages/IntegracionesPage'
import PreciosPage from '@/pages/PreciosPage'
import ContactoPage from '@/pages/ContactoPage'
import TerminosPage from '@/pages/TerminosPage'
import PrivacidadPage from '@/pages/PrivacidadPage'

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/como-funciona" element={<ComoFuncionaPage />} />
        <Route path="/integraciones" element={<IntegracionesPage />} />
        <Route path="/precios" element={<PreciosPage />} />
        <Route path="/contacto" element={<ContactoPage />} />
        <Route path="/terminos" element={<TerminosPage />} />
        <Route path="/privacidad" element={<PrivacidadPage />} />
        {/* Rutas futuras (multipage): /casos-de-uso */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
